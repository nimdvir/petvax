import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { CertificateSnapshot } from "@/lib/certificates/data";
import { formSchemaSchema } from "@/lib/forms/schema";
import { renderSubmissionPdf, type SubmissionPdfConsent } from "@/lib/submissions/pdf";
import { sha256Hex } from "@/lib/tokens";
import { formatDate, formatNyDateTime, utcToNyParts } from "@/lib/time";
import { renderSoapArchivePdf } from "@/lib/soap/archive-pdf";

type Db = SupabaseClient<Database>;

/**
 * Google Drive archive. PetVax Office posts each PDF to a small Google Apps Script web app
 * (integrations/google-drive-archive.gs) that runs as petvaxnyc@gmail.com and writes into the
 * shared "PetVax" folder: one subfolder per record type and month, plus an index.csv log.
 */
export interface ArchiveConfig {
  url: string;
  secret: string;
}

export function archiveConfigFromEnv(): ArchiveConfig | null {
  const url = process.env.DRIVE_ARCHIVE_URL;
  const secret = process.env.DRIVE_ARCHIVE_SECRET;
  return url && secret ? { url, secret } : null;
}

export const CSV_HEADERS = [
  "Saved at (New York)", "Type", "Record date", "Record number", "Client", "Client email", "Client phone",
  "Pets", "Details", "Status", "File name", "Folder", "Office link", "PDF SHA-256",
] as const;

export interface ArchiveItem {
  kind: "submission" | "certificate" | "soap";
  revisionNo?: number;
  recordId: string;
  folderPath: string[];
  fileName: string;
  pdf: Uint8Array;
  csvRow: string[];
}

/** File and folder names that stay readable and valid on Drive, Mac and Windows. */
export function cleanName(s: string): string {
  return s.replace(/[\\/:*?"<>|#%\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
}

export function lastFirst(first: string, last: string): string {
  return last ? `${last}, ${first}` : first;
}

export type ArchiveResult = { status: "saved"; url: string | null } | { status: "failed" | "not_configured"; error: string };

async function post(item: ArchiveItem, cfg: ArchiveConfig | null): Promise<ArchiveResult> {
  if (!cfg) return { status: "not_configured", error: "Google Drive archive is not set up (DRIVE_ARCHIVE_URL / DRIVE_ARCHIVE_SECRET)." };
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // Apps Script reads the raw body
      body: JSON.stringify({
        secret: cfg.secret,
        folderPath: item.folderPath,
        fileName: item.fileName,
        mimeType: "application/pdf",
        base64: Buffer.from(item.pdf).toString("base64"),
        csvHeaders: CSV_HEADERS,
        csvRow: item.csvRow,
      }),
      redirect: "follow",
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
    if (!res.ok || !body?.ok) return { status: "failed", error: body?.error ?? `HTTP ${res.status}` };
    return { status: "saved", url: body.url ?? null };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

async function send(db: Db, item: ArchiveItem, cfg: ArchiveConfig | null): Promise<ArchiveResult> {
  const result = await post(item, cfg);
  await db.from("drive_archive_log").insert({
    kind: item.kind, record_id: item.recordId, revision_no: item.revisionNo ?? null, file_name: item.fileName, folder: item.folderPath.join(" / "),
    status: result.status, drive_url: result.status === "saved" ? result.url : null,
    error: result.status === "saved" ? null : result.error,
  });
  return result;
}

async function loadLogo() {
  try {
    return { bytes: new Uint8Array(await readFile(path.join(process.cwd(), "public", "logo.jpg"))), type: "jpg" as const };
  } catch {
    return null;
  }
}

const nowNy = () => formatNyDateTime(new Date());

/** Build the archive entry for a form submission: a readable PDF with answers, consent wording and signatures. */
export async function buildSubmissionArchive(db: Db, submissionId: string, siteUrl: string): Promise<ArchiveItem | null> {
  const s = (await db.from("intake_submissions")
    .select("id, status, submitted_at, answers, source, external_id, ip_address, user_agent, pet_ids, owners(first_name, last_name, email, phone), form_versions(version, schema, form_templates(title))")
    .eq("id", submissionId).maybeSingle()).data;
  if (!s) return null;
  const [settings, pets, consents] = await Promise.all([
    db.from("app_settings").select("business_name, certificate_accent_color").eq("id", true).single(),
    s.pet_ids.length ? db.from("pets").select("id, name").in("id", s.pet_ids) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    db.from("signed_consents").select("pet_id, signer_name, signer_relationship, signed_at, consent_text, consent_text_sha256, record_hash, signature_sha256, signature_path").eq("submission_id", s.id),
  ]);
  const petName = new Map((pets.data ?? []).map((p) => [p.id, p.name]));
  const pdfConsents: SubmissionPdfConsent[] = [];
  for (const c of consents.data ?? []) {
    let signature: SubmissionPdfConsent["signature"] = null;
    if (c.signature_path) {
      const f = await db.storage.from("consent-signatures").download(c.signature_path);
      if (f.data) {
        const bytes = new Uint8Array(await f.data.arrayBuffer());
        if (bytes[0] === 0x89) signature = { bytes, type: "png" };
        else if (bytes[0] === 0xff) signature = { bytes, type: "jpg" };
      }
    }
    pdfConsents.push({
      petName: petName.get(c.pet_id) ?? "Pet", signerName: c.signer_name, relationship: c.signer_relationship, signedAt: c.signed_at,
      consentText: c.consent_text, consentSha256: c.consent_text_sha256, recordHash: c.record_hash, signatureSha256: c.signature_sha256, signature,
    });
  }
  const parsed = formSchemaSchema.safeParse(s.form_versions?.schema);
  const formTitle = s.form_versions?.form_templates?.title ?? (s.source === "jotform" ? "Jotform submission" : "PetVax form");
  const pdf = await renderSubmissionPdf({
    submissionId: s.id, formTitle, formVersion: s.form_versions?.version ?? null, submittedAt: s.submitted_at, status: s.status,
    source: s.source, externalId: s.external_id, ipAddress: (s.ip_address as string | null) ?? null, userAgent: s.user_agent,
    business: { name: settings.data?.business_name ?? "PetVax", accent_color: settings.data?.certificate_accent_color ?? "#b91c1c" },
    schema: parsed.success ? parsed.data : null, answers: s.answers as Record<string, unknown>, consents: pdfConsents, logo: await loadLogo(),
  });
  const o = s.owners;
  const client = o ? lastFirst(o.first_name, o.last_name) : "Unknown client";
  const petNames = s.pet_ids.map((id) => petName.get(id)).filter(Boolean) as string[];
  const local = utcToNyParts(s.submitted_at);
  const folderPath = ["Form submissions", local.date.slice(0, 4), local.date.slice(0, 7)];
  const fileName = cleanName(`${local.date} ${local.time.replace(":", "")} - ${client} - ${petNames.join(" & ") || "no pets"} - ${formTitle} (${s.id.slice(0, 8)})`) + ".pdf";
  return {
    kind: "submission", recordId: s.id, folderPath, fileName, pdf,
    csvRow: [
      nowNy(), "Form submission", `${local.date} ${local.time}`, s.id.slice(0, 8), client, o?.email ?? "", o?.phone ?? "",
      petNames.join("; "), `${formTitle}${pdfConsents.length ? `; ${pdfConsents.length} signed consent(s)` : ""}`, s.status.replace(/_/g, " "),
      fileName, folderPath.join("/"), `${siteUrl.replace(/\/$/, "")}/submissions/${s.id}`, sha256Hex(pdf),
    ],
  };
}

/** Build the archive entry for an issued certificate (the stored PDF, unchanged). */
export async function buildCertificateArchive(db: Db, certificateId: string, siteUrl: string): Promise<ArchiveItem | null> {
  const c = (await db.from("certificates").select("id, certificate_number, status, issued_at, pdf_path, snapshot").eq("id", certificateId).maybeSingle()).data;
  if (!c?.pdf_path) return null;
  const f = await db.storage.from("certificates").download(c.pdf_path);
  if (f.error || !f.data) return null;
  const pdf = new Uint8Array(await f.data.arrayBuffer());
  const snap = c.snapshot as unknown as CertificateSnapshot;
  const [first, ...rest] = snap.owner.name.split(" ");
  const client = lastFirst(first ?? "", rest.join(" "));
  const issued = snap.issued_on;
  const folderPath = ["Certificates", issued.slice(0, 4), issued.slice(0, 7)];
  const fileName = cleanName(`${c.certificate_number} - ${snap.pet.name} - ${client} - ${issued}`) + ".pdf";
  return {
    kind: "certificate", recordId: c.id, folderPath, fileName, pdf,
    csvRow: [
      nowNy(), "Vaccine certificate", issued, c.certificate_number, client, snap.owner.email ?? "", snap.owner.phone ?? "",
      `${snap.pet.name} (${snap.pet.species})`,
      snap.vaccinations.map((v) => `${v.vaccine_name} ${formatDate(v.administered_on)}${v.next_due_on ? ` (due ${formatDate(v.next_due_on)})` : ""}`).join("; ") + ` — signed by ${snap.signer.name}`,
      c.status, fileName, folderPath.join("/"), `${siteUrl.replace(/\/$/, "")}/certificates/${c.id}`, sha256Hex(pdf),
    ],
  };
}

/** Archive an immutable finalized or amended SOAP revision, never a mutable draft. */
export async function buildSoapArchive(db: Db, soapNoteId: string, revisionNumber: number, siteUrl: string): Promise<ArchiveItem | null> {
  const rev = (await db.from("soap_note_revisions")
    .select("revision, status, snapshot, edited_at, soap_note_id, edited_by")
    .eq("soap_note_id", soapNoteId).eq("revision", revisionNumber).maybeSingle()).data;
  if (!rev || (rev.status !== "final" && rev.status !== "amended")) return null;
  const snap = rev.snapshot as Record<string, unknown>;
  const encounterId = snap.encounter_id;
  if (typeof encounterId !== "string") return null;
  const encounter = await db.from("encounters")
    .select("id, encounter_date, pets(name,species), owners(first_name,last_name,email,phone), staff_profiles(full_name)")
    .eq("id",encounterId).maybeSingle();
  if (!encounter.data) return null;
  const e = encounter.data;
  const owner = e.owners;
  const client = owner ? lastFirst(owner.first_name,owner.last_name) : "Unknown client";
  const pet = e.pets;
  const petName = pet?.name ?? "Unknown pet";
  const clinician = e.staff_profiles?.full_name ?? "Not recorded";
  const settings = await db.from("app_settings").select("business_name").eq("id",true).maybeSingle();
  const businessName = settings.data?.business_name ?? "PetVax";
  const local = utcToNyParts(rev.edited_at);
  const folderPath = ["SOAP notes",local.date.slice(0,4),local.date.slice(0,7)];
  const fileName = cleanName(`${e.encounter_date} - ${petName} - ${client} - SOAP revision ${rev.revision} - ${soapNoteId.slice(0,8)}`) + ".pdf";
  const pdf = await renderSoapArchivePdf({
    clinic:businessName,pet:petName,species:pet?.species ?? "Not recorded",
    owner:owner ? `${owner.first_name} ${owner.last_name}`.trim() : client,
    clinician,visitDate:e.encounter_date,savedAt:rev.edited_at,revision:rev.revision,
    status:rev.status,note:snap,
  });
  return {
    kind:"soap",recordId:soapNoteId,revisionNo:rev.revision,fileName,folderPath,pdf,
    csvRow:[nowNy(),"SOAP note",e.encounter_date,`${soapNoteId.slice(0,8)}-r${rev.revision}`,
      client,owner?.email ?? "",owner?.phone ?? "",petName,
      `SOAP revision ${rev.revision}; ${clinician}`,rev.status,fileName,folderPath.join("/"),
      `${siteUrl.replace(/\/$/,"")}/visits/${e.id}`,sha256Hex(pdf)],
  };
}
export async function archiveSoap(db: Db, opts: { soapNoteId: string; revisionNumber: number; siteUrl: string; cfg?: ArchiveConfig | null }) {
  const item = await buildSoapArchive(db,opts.soapNoteId,opts.revisionNumber,opts.siteUrl);
  return item ? send(db,item,opts.cfg === undefined ? archiveConfigFromEnv() : opts.cfg) : null;
}

export async function archiveSubmission(db: Db, opts: { submissionId: string; siteUrl: string; cfg?: ArchiveConfig | null }) {
  const item = await buildSubmissionArchive(db, opts.submissionId, opts.siteUrl);
  return item ? send(db, item, opts.cfg === undefined ? archiveConfigFromEnv() : opts.cfg) : null;
}

export async function archiveCertificate(db: Db, opts: { certificateId: string; siteUrl: string; cfg?: ArchiveConfig | null }) {
  const item = await buildCertificateArchive(db, opts.certificateId, opts.siteUrl);
  return item ? send(db, item, opts.cfg === undefined ? archiveConfigFromEnv() : opts.cfg) : null;
}

/** Save anything not yet in Drive (e.g. records created before the archive was set up). Oldest first. */
export async function archiveMissing(db: Db, opts: { siteUrl: string; cfg?: ArchiveConfig | null; limit?: number }) {
  const cfg = opts.cfg === undefined ? archiveConfigFromEnv() : opts.cfg;
  if (!cfg) return { saved: 0, failed: 0, remaining: null as number | null, error: "Google Drive archive is not set up." };
  const saved = (await db.from("drive_archive_log").select("kind, record_id, revision_no").eq("status", "saved")).data ?? [];
  const done = new Set(saved.map((r) => r.kind === "soap"
    ? `soap:${r.record_id}:${r.revision_no}` : `${r.kind}:${r.record_id}`));
  const subs = ((await db.from("intake_submissions").select("id").order("submitted_at")).data ?? []).filter((r) => !done.has(`submission:${r.id}`));
  const certs = ((await db.from("certificates").select("id").not("pdf_path", "is", null).order("issued_at")).data ?? []).filter((r) => !done.has(`certificate:${r.id}`));
  const revisions = (await db.from("soap_note_revisions")
    .select("soap_note_id, revision, status").in("status", ["final", "amended"]).order("edited_at")).data ?? [];
  const pendingSoap = revisions.filter((r) => !done.has(`soap:${r.soap_note_id}:${r.revision}`));
  const todo = [
    ...subs.map((r) => ({kind: "submission" as const,id:r.id,revision:0})),
    ...certs.map((r) => ({kind: "certificate" as const,id:r.id,revision:0})),
    ...pendingSoap.map((r) => ({kind: "soap" as const,id:r.soap_note_id,revision:r.revision}))
  ];
  const batch = todo.slice(0, opts.limit ?? 25);
  let ok = 0, failed = 0;
  for (const item of batch) {
    const r = item.kind === "submission"
      ? await archiveSubmission(db, { submissionId:item.id,siteUrl:opts.siteUrl,cfg })
      : item.kind === "certificate"
      ? await archiveCertificate(db, {certificateId:item.id,siteUrl:opts.siteUrl,cfg})
      : await archiveSoap(db,{soapNoteId:item.id,revisionNumber:item.revision,siteUrl:opts.siteUrl,cfg});
    if (r?.status === "saved") ok++; else failed++;
  }
  return { saved: ok, failed, remaining: todo.length - batch.length, error: null };
}
