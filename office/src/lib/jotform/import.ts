import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { processSubmission } from "@/lib/intake/process";
import { nyLocalToUtc } from "@/lib/time";
import { sha256Hex } from "@/lib/tokens";
import { mapJotformSubmission, type JotformSubmission, type MappedSubmission } from "./map";

type Db = SupabaseClient<Database>;
export type FetchFile = (url: string) => Promise<{ bytes: Uint8Array; contentType: string } | null>;

export interface ReconRow {
  jotformId: string;
  formId: string;
  kind: string;
  submittedAt: string;
  outcome: "imported" | "already_imported" | "would_import" | "failed";
  submissionId?: string;
  status?: string;
  ownerId?: string | null;
  petIds?: string[];
  consents?: number;
  signatureStored?: boolean;
  attachmentsSource: number;
  attachmentsStored: number;
  warnings: string[];
  error?: string;
}

export interface ImportReport {
  runId: string | null;
  dryRun: boolean;
  totals: {
    source: number; imported: number; alreadyImported: number; wouldImport: number; failed: number;
    needsReview: number; consentsCreated: number; signaturesMissing: number; attachmentsSource: number; attachmentsStored: number;
  };
  rows: ReconRow[];
  /** Destination counts re-read from the database after the run. */
  verification?: { submissionsInDb: number; consentsInDb: number; documentsInDb: number; missingFromDb: string[] };
}

function extFor(ct: string, url: string) {
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("pdf")) return "pdf";
  if (ct.includes("svg")) return "svg";
  return (url.split("?")[0].split(".").pop() ?? "bin").slice(0, 5).toLowerCase();
}

async function storeDocument(db: Db, opts: { bytes: Uint8Array; contentType: string; path: string; filename: string; kind: string;
  externalId: string; submissionId: string; ownerId: string | null; petId: string | null }) {
  const up = await db.storage.from("documents").upload(opts.path, opts.bytes, { contentType: opts.contentType, upsert: false });
  if (up.error && !/exists/i.test(up.error.message)) throw new Error(`upload ${opts.filename}: ${up.error.message}`);
  const r = await db.from("documents").upsert({
    bucket: "documents", storage_path: opts.path, filename: opts.filename, kind: opts.kind, mime_type: opts.contentType,
    size_bytes: opts.bytes.length, sha256: sha256Hex(opts.bytes), source: "jotform", external_id: opts.externalId,
    submission_id: opts.submissionId, owner_id: opts.ownerId, pet_id: opts.petId,
  }, { onConflict: "bucket,storage_path" });
  if (r.error) throw new Error(`document ${opts.filename}: ${r.error.message}`);
}

/**
 * Import Jotform submissions. Safe to run repeatedly: each Jotform submission id is imported once.
 * With dryRun, nothing is written; the report shows what would happen.
 */
export async function importJotform(db: Db, submissions: JotformSubmission[], opts: { dryRun: boolean; fetchFile: FetchFile; startedBy?: string }): Promise<ImportReport> {
  const rows: ReconRow[] = [];
  let runId: string | null = null;
  if (!opts.dryRun) {
    const run = await db.from("import_runs").insert({ source: "jotform", dry_run: false, started_by: opts.startedBy ?? "cli" }).select("id").single();
    if (run.error) throw new Error(run.error.message);
    runId = run.data.id;
  }

  // Oldest first so returning-client updates apply in the order they happened.
  const ordered = [...submissions].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const sub of ordered) {
    let m: MappedSubmission;
    try {
      m = mapJotformSubmission(sub, nyLocalToUtc);
    } catch (e) {
      rows.push({ jotformId: sub.id, formId: sub.form_id, kind: "unknown", submittedAt: sub.created_at, outcome: "failed", attachmentsSource: 0, attachmentsStored: 0, warnings: [], error: String(e) });
      continue;
    }
    const base: ReconRow = { jotformId: m.externalId, formId: m.formId, kind: m.kind, submittedAt: m.submittedAt, outcome: "would_import",
      attachmentsSource: m.fileUrls.length + (m.signatureUrl ? 1 : 0), attachmentsStored: 0, warnings: m.warnings };

    const existing = await db.from("intake_submissions").select("id, status, owner_id, pet_ids").eq("source", "jotform").eq("external_id", m.externalId).maybeSingle();
    if (existing.data) {
      const docs = await db.from("documents").select("id", { count: "exact", head: true }).eq("submission_id", existing.data.id);
      const consents = await db.from("signed_consents").select("id", { count: "exact", head: true }).eq("submission_id", existing.data.id);
      rows.push({ ...base, outcome: "already_imported", submissionId: existing.data.id, status: existing.data.status, ownerId: existing.data.owner_id,
        petIds: existing.data.pet_ids, consents: consents.count ?? 0, attachmentsStored: (docs.count ?? 0) + (consents.count ? 1 : 0) });
      continue;
    }
    if (opts.dryRun) { rows.push(base); continue; }

    try {
      // Fetch the signature first; a consent without its signature image is imported but flagged.
      const isConsent = m.kind === "consent";
      const sigFile = m.signatureUrl ? await opts.fetchFile(m.signatureUrl) : null;
      if (m.signatureUrl && !sigFile) m.warnings.push("Signature image could not be downloaded.");
      const consentSig = isConsent && sigFile ? sigFile : null;

      const result = await processSubmission(db, {
        formVersionId: null, formLinkId: null, schema: m.schema,
        consentText: consentSig ? m.consentText : null,
        answers: m.answers,
        signature: consentSig ? { signerName: m.signerName, relationship: "Owner (Jotform)", agreed: m.consentConfirmed, esignAgreed: false, dataUrl: "" } : null,
        signatureImage: consentSig,
        submittedAt: m.submittedAt, source: "jotform", externalId: m.externalId, userAgent: `Jotform form ${m.formId}`,
      });
      const row: ReconRow = { ...base, outcome: result.status === "error" ? "failed" : "imported", submissionId: result.submissionId, status: result.status,
        ownerId: result.ownerId, petIds: result.petIds, consents: result.consentIds.length, signatureStored: !!consentSig && result.consentIds.length > 0,
        error: result.error };
      row.attachmentsStored += row.signatureStored ? 1 : 0;

      // Keep the original submission JSON and every uploaded file.
      const raw = new TextEncoder().encode(JSON.stringify(sub, null, 2));
      await storeDocument(db, { bytes: raw, contentType: "application/json", path: `jotform/${m.externalId}/submission.json`, filename: "submission.json",
        kind: "jotform_raw", externalId: `${m.externalId}:raw`, submissionId: result.submissionId, ownerId: result.ownerId, petId: result.petIds[0] ?? null });
      if (sigFile && !consentSig) {
        // Intake-form certification signature: preserved as a document (it is not a vaccination consent).
        await storeDocument(db, { ...sigFile, path: `jotform/${m.externalId}/signature.${extFor(sigFile.contentType, m.signatureUrl!)}`, filename: "certification-signature",
          kind: "jotform_signature", externalId: `${m.externalId}:signature`, submissionId: result.submissionId, ownerId: result.ownerId, petId: result.petIds[0] ?? null });
        row.attachmentsStored += 1;
      }
      for (const [i, f] of m.fileUrls.entries()) {
        const file = await opts.fetchFile(f.url);
        if (!file) { row.warnings.push(`Could not download ${f.label} (${f.url.split("/").pop()}).`); continue; }
        const name = decodeURIComponent(f.url.split("?")[0].split("/").pop() ?? `file-${i}`).replace(/[^\w.\-]+/g, "_").slice(-80);
        await storeDocument(db, { ...file, path: `jotform/${m.externalId}/${f.questionId}-${i}-${name}`, filename: name,
          kind: /photo/i.test(f.label) ? "pet_photo" : "jotform_attachment", externalId: `${m.externalId}:${f.questionId}:${i}`,
          submissionId: result.submissionId, ownerId: result.ownerId, petId: result.petIds[0] ?? null });
        row.attachmentsStored += 1;
      }
      if (result.ownerId) {
        await db.from("external_ids").upsert({ source: "jotform", external_id: m.externalId, entity_type: "intake_submission", entity_id: result.submissionId });
      }
      rows.push(row);
    } catch (e) {
      rows.push({ ...base, outcome: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  }

  const totals = {
    source: submissions.length,
    imported: rows.filter((r) => r.outcome === "imported").length,
    alreadyImported: rows.filter((r) => r.outcome === "already_imported").length,
    wouldImport: rows.filter((r) => r.outcome === "would_import").length,
    failed: rows.filter((r) => r.outcome === "failed").length,
    needsReview: rows.filter((r) => r.status === "needs_review").length,
    consentsCreated: rows.filter((r) => r.outcome === "imported").reduce((n, r) => n + (r.consents ?? 0), 0),
    signaturesMissing: rows.filter((r) => r.kind === "consent" && r.outcome !== "would_import" && !r.consents).length,
    attachmentsSource: rows.reduce((n, r) => n + r.attachmentsSource, 0),
    attachmentsStored: rows.reduce((n, r) => n + r.attachmentsStored, 0),
  };
  const report: ImportReport = { runId, dryRun: opts.dryRun, totals, rows };

  if (!opts.dryRun) {
    // Independent re-read: every source id must exist in the destination.
    const ids = submissions.map((s) => s.id);
    const inDb = await db.from("intake_submissions").select("id, external_id").eq("source", "jotform").in("external_id", ids);
    const found = new Set((inDb.data ?? []).map((r) => r.external_id));
    const subIds = (inDb.data ?? []).map((r) => r.id);
    const consents = subIds.length ? await db.from("signed_consents").select("id", { count: "exact", head: true }).in("submission_id", subIds) : { count: 0 };
    const docs = subIds.length ? await db.from("documents").select("id", { count: "exact", head: true }).in("submission_id", subIds) : { count: 0 };
    report.verification = { submissionsInDb: found.size, consentsInDb: consents.count ?? 0, documentsInDb: docs.count ?? 0, missingFromDb: ids.filter((id) => !found.has(id)) };
    await db.from("import_runs").update({ finished_at: new Date().toISOString(), stats: totals as unknown as NonNullable<Json>, reconciliation: report as unknown as NonNullable<Json> }).eq("id", runId!);
  }
  return report;
}

export function reportToMarkdown(r: ImportReport): string {
  const t = r.totals;
  const lines = [
    `# Jotform import ${r.dryRun ? "(dry run — nothing written)" : "report"}`,
    "",
    `| | Count |`, `|---|---|`,
    `| Submissions in source | ${t.source} |`,
    `| Imported this run | ${t.imported} |`,
    `| Already imported earlier | ${t.alreadyImported} |`,
    ...(r.dryRun ? [`| Would import | ${t.wouldImport} |`] : []),
    `| Failed | ${t.failed} |`,
    `| Flagged for human review (possible duplicates) | ${t.needsReview} |`,
    `| Signed consents created | ${t.consentsCreated} |`,
    `| Consent forms without a usable signature | ${t.signaturesMissing} |`,
    `| Files in source (signatures + uploads) | ${t.attachmentsSource} |`,
    `| Files stored | ${t.attachmentsStored} |`,
  ];
  if (r.verification) {
    lines.push("", "## Destination check", "", `- Submissions found in PetVax Office: ${r.verification.submissionsInDb} of ${t.source}`,
      `- Signed consents linked: ${r.verification.consentsInDb}`, `- Documents linked: ${r.verification.documentsInDb}`,
      `- Missing: ${r.verification.missingFromDb.length ? r.verification.missingFromDb.join(", ") : "none"}`);
  }
  const issues = r.rows.filter((x) => x.outcome === "failed" || x.warnings.length || x.status === "needs_review");
  if (issues.length) {
    lines.push("", "## Needs attention", "", "| Jotform id | Form | Outcome | Notes |", "|---|---|---|---|");
    for (const x of issues) lines.push(`| ${x.jotformId} | ${x.kind} | ${x.status ?? x.outcome} | ${[x.error, ...x.warnings].filter(Boolean).join("; ").replace(/\|/g, "/")} |`);
  }
  return lines.join("\n") + "\n";
}
