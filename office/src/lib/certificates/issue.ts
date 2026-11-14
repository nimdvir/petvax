import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { sha256Hex } from "@/lib/tokens";
import { buildCertificateDraft, finalizeSnapshot, type CertificateSnapshot, type Readiness } from "./data";
import { renderCertificatePdf, type RenderAssets } from "./pdf";

type Db = SupabaseClient<Database>;

async function loadLogo(): Promise<RenderAssets["logo"]> {
  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "logo.jpg"));
    return { bytes: new Uint8Array(bytes), type: "jpg" };
  } catch {
    return null;
  }
}

async function loadSignature(db: Db, signaturePath: string | null): Promise<RenderAssets["signature"]> {
  if (!signaturePath) return null;
  const res = await db.storage.from("staff-signatures").download(signaturePath);
  if (res.error || !res.data) return null;
  const bytes = new Uint8Array(await res.data.arrayBuffer());
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
  return { bytes, type: isPng ? "png" : "jpg" };
}

export async function renderFromSnapshot(db: Db, snap: CertificateSnapshot): Promise<Uint8Array> {
  return renderCertificatePdf(snap, { logo: await loadLogo(), signature: await loadSignature(db, snap.signer.signature_path) });
}

export type IssueResult =
  | { ok: true; certificateId: string; certificateNumber: string; warnings: string[] }
  | { ok: false; readiness: Readiness; error?: string };

/**
 * Issue a certificate as the signed-in veterinarian. `db` must be the vet's own client so
 * Row Level Security enforces that only a vet can issue, and only in their own name.
 */
export async function issueCertificate(db: Db, opts: { vaccinationIds: string[]; issuerId: string; siteUrl: string }): Promise<IssueResult> {
  const draft = await buildCertificateDraft(db, opts);
  if (draft.readiness.blocking.length) return { ok: false, readiness: draft.readiness };

  const num = await db.rpc("next_certificate_number");
  if (num.error || !num.data) return { ok: false, readiness: draft.readiness, error: num.error?.message ?? "Could not number certificate" };
  const verificationCode = randomBytes(9).toString("hex");
  const issuedAt = new Date();
  const snapshot = finalizeSnapshot(draft, num.data, verificationCode, issuedAt, opts.siteUrl);

  const inserted = await db.from("certificates").insert({
    certificate_number: snapshot.certificate_number,
    verification_code: verificationCode,
    pet_id: draft.petId,
    owner_id: draft.ownerId,
    encounter_id: draft.encounterId,
    issued_by: opts.issuerId,
    issued_at: issuedAt.toISOString(),
    snapshot: snapshot as unknown as NonNullable<Json>,
  }).select("id").single();
  if (inserted.error) return { ok: false, readiness: draft.readiness, error: inserted.error.message };
  const certificateId = inserted.data.id;

  const links = await db.from("certificate_vaccinations").insert(opts.vaccinationIds.map((vaccination_id) => ({ certificate_id: certificateId, vaccination_id })));
  if (links.error) return { ok: false, readiness: draft.readiness, error: links.error.message };

  const stored = await storeCertificatePdf(db, certificateId, draft.petId, snapshot);
  if (!stored.ok) return { ok: false, readiness: draft.readiness, error: `Certificate saved but the PDF could not be stored: ${stored.error}` };
  return { ok: true, certificateId, certificateNumber: snapshot.certificate_number, warnings: draft.readiness.warnings };
}

/** Render and store the PDF for a certificate that does not have one yet (also used to recover from a failed upload). */
export async function storeCertificatePdf(db: Db, certificateId: string, petId: string, snapshot: CertificateSnapshot) {
  const pdf = await renderFromSnapshot(db, snapshot);
  const pdfPath = `${petId}/${snapshot.certificate_number}.pdf`;
  const up = await db.storage.from("certificates").upload(pdfPath, pdf, { contentType: "application/pdf", upsert: false });
  if (up.error && !/exists/i.test(up.error.message)) return { ok: false as const, error: up.error.message };
  const upd = await db.from("certificates").update({ pdf_path: pdfPath, pdf_sha256: sha256Hex(pdf) }).eq("id", certificateId).select("id").single();
  if (upd.error) return { ok: false as const, error: upd.error.message };
  return { ok: true as const, path: pdfPath, bytes: pdf };
}
