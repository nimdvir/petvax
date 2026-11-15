import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { escapeHtml, sendEmail, type EmailConfig, type SendResult } from "@/lib/email";
import { formatDate, formatNyDateTime } from "@/lib/time";
import type { CertificateSnapshot } from "@/lib/certificates/data";
import { formSchemaSchema, type Answers } from "@/lib/forms/schema";
import { extractIntake } from "@/lib/forms/extract";

type Db = SupabaseClient<Database>;

async function notifyAddress(db: Db): Promise<string | null> {
  const s = await db.from("app_settings").select("notify_email").eq("id", true).maybeSingle();
  return s.data?.notify_email ?? null;
}

async function logDelivery(db: Db, row: { to: string; subject: string; result: SendResult; ownerId: string | null; certificateId: string | null }) {
  await db.from("email_deliveries").insert({
    to_email: row.to, subject: row.subject, owner_id: row.ownerId, certificate_id: row.certificateId,
    provider: row.result.provider, status: row.result.status,
    provider_message_id: row.result.status === "sent" ? row.result.messageId : null,
    error: row.result.status === "sent" ? null : row.result.error,
  });
}

/** Email the office a summary of a new form submission (no signature images or full medical answers). */
export async function notifySubmission(db: Db, opts: { submissionId: string; siteUrl: string; cfg?: EmailConfig }) {
  const to = await notifyAddress(db);
  if (!to) return null;
  const sub = (await db.from("intake_submissions")
    .select("id, status, submitted_at, owner_id, pet_ids, answers, processing_error, owners(first_name, last_name, phone, email, address_line1, address_line2, city), form_versions(schema, form_templates(title))")
    .eq("id", opts.submissionId).single()).data;
  if (!sub) return null;
  const pets = sub.pet_ids.length ? (await db.from("pets").select("id, name, species, breed").in("id", sub.pet_ids)).data ?? [] : [];
  // Requested vaccines come from the answers (pets are stored in the same order as they were submitted).
  const requested = new Map<string, string[]>();
  const parsed = formSchemaSchema.safeParse(sub.form_versions?.schema);
  const answers = sub.answers as Answers;
  const extracted = parsed.success ? extractIntake(parsed.data, answers).pets
    : ((answers.pets as Record<string, unknown>[] | undefined) ?? []).map((g) => ({ requested_vaccines: Array.isArray(g.requested_vaccines) ? g.requested_vaccines as string[] : [] }));
  sub.pet_ids.forEach((id, i) => requested.set(id, extracted[i]?.requested_vaccines ?? []));
  const consents = (await db.from("signed_consents").select("id", { count: "exact", head: true }).eq("submission_id", sub.id)).count ?? 0;
  const o = sub.owners;
  const name = o ? `${o.first_name} ${o.last_name}`.trim() : "Unknown client";
  const flag = sub.status === "needs_review" ? " (needs review)" : sub.status === "error" ? " (could not be filed — check Office)" : "";
  const subject = `New PetVax form: ${name}${pets.length ? ` — ${pets.map((p) => p.name).join(", ")}` : ""}${flag}`;
  const petLines = pets.map((p) => {
    const req = requested.get(p.id) ?? [];
    return `${p.name} (${[p.species, p.breed].filter(Boolean).join(", ")})${req.length ? ` — requested: ${req.join(", ")}` : ""}`;
  });
  const lines = [
    `Form: ${sub.form_versions?.form_templates?.title ?? "PetVax form"}`,
    `Received: ${formatNyDateTime(sub.submitted_at)}`,
    `Client: ${name}`,
    o?.phone && `Phone: ${o.phone}`,
    o?.email && `Email: ${o.email}`,
    o && [o.address_line1, o.address_line2, o.city].filter(Boolean).length ? `Address: ${[o.address_line1, o.address_line2, o.city].filter(Boolean).join(", ")}` : null,
    ...petLines.map((l) => `Pet: ${l}`),
    `Signed consents: ${consents}`,
    sub.status === "needs_review" ? "This may be a returning client with changed details — please review the match in Office." : null,
    sub.status === "error" ? "The answers were saved but could not be filed automatically — open it in Office." : null,
  ].filter(Boolean) as string[];
  const link = `${opts.siteUrl.replace(/\/$/, "")}/submissions/${sub.id}`;
  const result = await sendEmail({
    to, subject,
    text: `${lines.join("\n")}\n\nOpen in PetVax Office: ${link}\n`,
    html: `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul><p><a href="${escapeHtml(link)}">Open in PetVax Office</a></p>`,
  }, opts.cfg);
  await logDelivery(db, { to, subject, result, ownerId: sub.owner_id, certificateId: null });
  return result;
}

/** Email the office a copy of a newly issued certificate PDF. */
export async function notifyCertificate(db: Db, opts: { certificateId: string; siteUrl: string; cfg?: EmailConfig }) {
  const to = await notifyAddress(db);
  if (!to) return null;
  const cert = (await db.from("certificates").select("id, owner_id, pdf_path, snapshot").eq("id", opts.certificateId).single()).data;
  if (!cert?.pdf_path) return null;
  const file = await db.storage.from("certificates").download(cert.pdf_path);
  if (file.error || !file.data) return null;
  const snap = cert.snapshot as unknown as CertificateSnapshot;
  const subject = `Certificate ${snap.certificate_number}: ${snap.pet.name} (${snap.owner.name})`;
  const lines = snap.vaccinations.map((v) => `${v.vaccine_name} — given ${formatDate(v.administered_on)}${v.next_due_on ? `, next due ${formatDate(v.next_due_on)}` : ""}`);
  const link = `${opts.siteUrl.replace(/\/$/, "")}/certificates/${cert.id}`;
  const result = await sendEmail({
    to, subject,
    text: `${snap.pet.name} (${snap.owner.name}) — signed by ${snap.signer.name}\n\n${lines.join("\n")}\n\nOpen in PetVax Office: ${link}\n`,
    html: `<p>${escapeHtml(snap.pet.name)} (${escapeHtml(snap.owner.name)}) — signed by ${escapeHtml(snap.signer.name)}</p><ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul><p><a href="${escapeHtml(link)}">Open in PetVax Office</a></p>`,
    attachments: [{ filename: `${snap.certificate_number}-${snap.pet.name.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`, content: new Uint8Array(await file.data.arrayBuffer()) }],
  }, opts.cfg);
  await logDelivery(db, { to, subject, result, ownerId: cert.owner_id, certificateId: cert.id });
  return result;
}
