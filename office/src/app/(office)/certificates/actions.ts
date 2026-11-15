"use server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCertificate } from "@/lib/notify";
import { archiveCertificate } from "@/lib/drive-archive";
import { publicEnv } from "@/lib/env";
import { createQuickCertificate, parseQuickForm } from "@/lib/certificates/quick";
import { requireStaff } from "@/lib/auth";
import { fstr, msg } from "@/lib/fd";
import { escapeHtml, sendEmail } from "@/lib/email";
import { formatDate } from "@/lib/time";
import type { CertificateSnapshot } from "@/lib/certificates/data";

export async function emailCertificate(certificateId: string, fd: FormData) {
  const { supabase, userId } = await requireStaff();
  const page = `/certificates/${certificateId}`;
  const cert = (await supabase.from("certificates").select("*, owners(id, email, first_name)").eq("id", certificateId).single()).data;
  if (!cert || cert.status !== "issued") redirect(msg(page, "error", "Only issued certificates can be sent."));
  const to = cert!.owners?.email;
  if (!to) redirect(msg(page, "error", "This client has no email address on file."));
  if (fstr(fd, "confirm_email") !== to) redirect(msg(page, "error", "Confirm the client's email address before sending."));
  if (!cert!.pdf_path) redirect(msg(page, "error", "The PDF is missing; open it once to regenerate it."));
  const file = await supabase.storage.from("certificates").download(cert!.pdf_path!);
  if (file.error || !file.data) redirect(msg(page, "error", "Could not load the PDF."));
  const snap = cert!.snapshot as unknown as CertificateSnapshot;
  const subject = `${snap.pet.name}'s vaccination certificate from ${snap.business.name}`;
  const lines = snap.vaccinations.map((v) => `${v.vaccine_name} — given ${formatDate(v.administered_on)}${v.next_due_on ? `, next due ${formatDate(v.next_due_on)}` : ""}`);
  const result = await sendEmail({
    to: to!,
    subject,
    text: `Hi ${cert!.owners?.first_name},\n\nAttached is ${snap.pet.name}'s vaccination certificate (${snap.certificate_number}).\n\n${lines.join("\n")}\n\nThank you,\n${snap.business.name}`,
    html: `<p>Hi ${escapeHtml(cert!.owners?.first_name ?? "")},</p><p>Attached is <strong>${escapeHtml(snap.pet.name)}</strong>'s vaccination certificate (${escapeHtml(snap.certificate_number)}).</p><ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul><p>Thank you,<br>${escapeHtml(snap.business.name)}</p>`,
    attachments: [{ filename: `${snap.certificate_number}-${snap.pet.name.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`, content: new Uint8Array(await file.data!.arrayBuffer()) }],
  });
  await supabase.from("email_deliveries").insert({
    certificate_id: certificateId, owner_id: cert!.owner_id, to_email: to!, subject, provider: result.provider,
    provider_message_id: result.status === "sent" ? result.messageId : null, status: result.status,
    error: result.status === "sent" ? null : result.error, sent_by: userId,
  });
  if (result.status !== "sent") redirect(msg(page, "error", `Not sent: ${result.error}`));
  redirect(msg(page, "ok", `Emailed to ${to}.`));
}

export async function voidCertificate(certificateId: string, fd: FormData) {
  const { supabase } = await requireStaff(["vet", "admin"]);
  const reason = fstr(fd, "voided_reason");
  if (!reason) redirect(msg(`/certificates/${certificateId}`, "error", "A reason is required."));
  const r = await supabase.from("certificates").update({ status: "voided", voided_reason: reason }).eq("id", certificateId);
  if (r.error) redirect(msg(`/certificates/${certificateId}`, "error", r.error.message));
  redirect(msg(`/certificates/${certificateId}`, "ok", "Certificate voided. Verification now shows it as void."));
}

export async function createCertificateForPet(petId: string, fd: FormData) {
  const { supabase, userId } = await requireStaff(["vet"]);
  const page = `/certificates/new?pet=${petId}`;
  const result = await createQuickCertificate(supabase, { ...parseQuickForm(petId, fd), issuerId: userId, siteUrl: publicEnv.siteUrl });
  if (!result.ok) {
    // Vaccines were saved but the certificate could not be issued: send the vet to the visit to finish.
    if (result.encounterId) redirect(msg(`/visits/${result.encounterId}`, "error", `Vaccines saved, but the certificate wasn't issued: ${result.problems.join(" ")}`));
    redirect(msg(page, "error", result.problems.join(" ")));
  }
  const certificateId = result.certificateId;
  after(async () => {
    const admin = createAdminClient();
    await notifyCertificate(admin, { certificateId, siteUrl: publicEnv.siteUrl }).catch((e) => console.error("notify failed", e));
    await archiveCertificate(admin, { certificateId, siteUrl: publicEnv.siteUrl }).catch((e) => console.error("drive archive failed", e));
  });
  redirect(msg(`/certificates/${certificateId}`, "ok", `Certificate ${result.certificateNumber} created and signed.`));
}
