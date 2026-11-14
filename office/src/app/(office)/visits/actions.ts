"use server";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { fbool, fdate, fint, fnum, fstr, msg } from "@/lib/fd";
import { addMonths } from "@/lib/time";
import { issueCertificate } from "@/lib/certificates/issue";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/database.types";

type SoapInsert = Database["public"]["Tables"]["soap_notes"]["Insert"];

function soapFromForm(fd: FormData) {
  const bcs = fnum(fd, "body_condition_score");
  return {
    subjective: fstr(fd, "subjective"),
    temperature: fnum(fd, "temperature"),
    temperature_unit: fnum(fd, "temperature") === null ? null : ((fstr(fd, "temperature_unit") ?? "F") as "F" | "C"),
    heart_rate_bpm: fint(fd, "heart_rate_bpm"),
    respiratory_rate_bpm: fint(fd, "respiratory_rate_bpm"),
    weight: fnum(fd, "weight"),
    weight_unit: fnum(fd, "weight") === null ? null : ((fstr(fd, "weight_unit") ?? "lb") as "lb" | "kg"),
    body_condition_score: bcs,
    body_condition_scale: bcs === null ? null : (fint(fd, "body_condition_scale") ?? 9),
    general_appearance: fstr(fd, "general_appearance"),
    exam_findings: fstr(fd, "exam_findings"),
    objective_notes: fstr(fd, "objective_notes"),
    assessment: fstr(fd, "assessment"),
    fit_for_vaccination: fbool(fd, "fit_for_vaccination"),
    plan: fstr(fd, "plan"),
    observed_reactions: fstr(fd, "observed_reactions"),
    follow_up: fstr(fd, "follow_up"),
  } satisfies Partial<SoapInsert>;
}

export async function saveSoap(encounterId: string, fd: FormData) {
  const { supabase, userId } = await requireStaff(["vet", "admin"]);
  const intent = fstr(fd, "intent") ?? "draft";
  const page = `/visits/${encounterId}`;
  const data = soapFromForm(fd);
  const existing = await supabase.from("soap_notes").select("id, status").eq("encounter_id", encounterId).maybeSingle();
  let error: string | null = null;
  if (!existing.data) {
    const r = await supabase.from("soap_notes").insert({
      ...data, encounter_id: encounterId, status: intent === "final" ? "final" : "draft",
      created_by: userId, updated_by: userId, finalized_by: intent === "final" ? userId : null,
    });
    error = r.error?.message ?? null;
  } else if (existing.data.status === "draft") {
    const r = await supabase.from("soap_notes").update({
      ...data, updated_by: userId, ...(intent === "final" ? { status: "final" as const, finalized_by: userId } : {}),
    }).eq("id", existing.data.id);
    error = r.error?.message ?? null;
  } else {
    const reason = fstr(fd, "amendment_reason");
    if (!reason) redirect(msg(page, "error", "Give a reason for the amendment."));
    const r = await supabase.from("soap_notes").update({ ...data, status: "amended", amendment_reason: reason, updated_by: userId }).eq("id", existing.data.id);
    error = r.error?.message ?? null;
  }
  if (error) redirect(msg(page, "error", error.includes("soap_bcs_in_scale") ? "Body condition score must be within its scale." : error));
  // Keep the pet's weight current.
  if (data.weight !== null) {
    const enc = await supabase.from("encounters").select("pet_id").eq("id", encounterId).single();
    const lb = data.weight_unit === "kg" ? Math.round(data.weight * 2.20462 * 100) / 100 : data.weight;
    if (enc.data) await supabase.from("pets").update({ weight_lb: lb }).eq("id", enc.data.pet_id);
  }
  redirect(msg(page, "ok", intent === "final" ? "SOAP note finalized." : existing.data && existing.data.status !== "draft" ? "Amendment saved." : "Draft saved."));
}

async function vaccineFromForm(supabase: Awaited<ReturnType<typeof requireStaff>>["supabase"], fd: FormData) {
  const productId = fstr(fd, "product_id");
  const product = productId ? (await supabase.from("vaccine_products").select("*").eq("id", productId).single()).data : null;
  const name = product?.name ?? fstr(fd, "vaccine_name");
  const given = fdate(fd, "administered_on");
  if (!name || !given) return { error: "Choose a vaccine and the date given." } as const;
  const duration = fint(fd, "duration_months") ?? product?.default_interval_months ?? null;
  const nextDue = fdate(fd, "next_due_on") ?? (duration ? addMonths(given, duration) : null);
  return {
    row: {
      product_id: product?.id ?? null,
      vaccine_name: name,
      vaccine_type: product?.vaccine_type ?? fstr(fd, "vaccine_type") ?? name,
      is_rabies: product?.is_rabies ?? /rabies/i.test(name),
      manufacturer: fstr(fd, "manufacturer"),
      lot_number: fstr(fd, "lot_number"),
      serial_number: fstr(fd, "serial_number"),
      lot_expiration: fdate(fd, "lot_expiration"),
      administered_on: given,
      route: fstr(fd, "route"),
      site: fstr(fd, "site"),
      duration_months: duration,
      next_due_on: nextDue,
      rabies_tag_number: fstr(fd, "rabies_tag_number"),
      adverse_reaction: fstr(fd, "adverse_reaction"),
      notes: fstr(fd, "notes"),
    },
  } as const;
}

export async function addVaccination(encounterId: string, fd: FormData) {
  const { supabase, userId } = await requireStaff(["vet", "admin"]);
  const page = `/visits/${encounterId}`;
  const enc = (await supabase.from("encounters").select("pet_id, owner_id, clinician_id").eq("id", encounterId).single()).data;
  if (!enc) redirect(msg(page, "error", "Visit not found."));
  const v = await vaccineFromForm(supabase, fd);
  if ("error" in v) redirect(msg(page, "error", v.error!));
  const givenBy = fstr(fd, "administered_by") ?? enc!.clinician_id ?? userId;
  const r = await supabase.from("vaccinations").insert({ ...v.row, encounter_id: encounterId, pet_id: enc!.pet_id, owner_id: enc!.owner_id, administered_by: givenBy, source: "staff", created_by: userId });
  if (r.error) redirect(msg(page, "error", r.error.message));
  redirect(msg(page, "ok", `${v.row.vaccine_name} recorded.`) + "#vaccines");
}

export async function correctVaccination(encounterId: string, vaccinationId: string, fd: FormData) {
  const { supabase, userId } = await requireStaff(["vet", "admin"]);
  const page = `/visits/${encounterId}`;
  const old = (await supabase.from("vaccinations").select("*").eq("id", vaccinationId).single()).data;
  const reason = fstr(fd, "correction_reason");
  if (!old || !reason) redirect(msg(page, "error", "A reason is required for a correction."));
  const v = await vaccineFromForm(supabase, fd);
  if ("error" in v) redirect(msg(page, "error", v.error!));
  const r = await supabase.from("vaccinations").insert({
    ...v.row, encounter_id: old!.encounter_id, pet_id: old!.pet_id, owner_id: old!.owner_id, administered_by: old!.administered_by,
    supersedes_id: old!.id, correction_reason: reason, source: "staff", created_by: userId,
  });
  if (r.error) redirect(msg(page, "error", r.error.message));
  redirect(msg(page, "ok", "Correction saved; the original is kept in the history.") + "#vaccines");
}

export async function voidVaccination(encounterId: string, vaccinationId: string, fd: FormData) {
  const { supabase } = await requireStaff(["vet", "admin"]);
  const reason = fstr(fd, "correction_reason");
  const page = `/visits/${encounterId}`;
  if (!reason) redirect(msg(page, "error", "A reason is required to void a record."));
  const r = await supabase.from("vaccinations").update({ status: "voided", correction_reason: reason }).eq("id", vaccinationId);
  if (r.error) redirect(msg(page, "error", r.error.message));
  redirect(msg(page, "ok", "Vaccination voided.") + "#vaccines");
}

export async function issueVisitCertificate(encounterId: string, fd: FormData) {
  const { supabase, userId } = await requireStaff(["vet"]);
  const ids = fd.getAll("vaccination_ids").map(String);
  const page = `/visits/${encounterId}`;
  if (!ids.length) redirect(msg(page, "error", "Select at least one vaccine for the certificate."));
  const r = await issueCertificate(supabase, { vaccinationIds: ids, issuerId: userId, siteUrl: publicEnv.siteUrl });
  if (!r.ok) redirect(msg(page, "error", r.error ?? `Can't issue yet: ${r.readiness.blocking.join(" ")}`));
  redirect(msg(`/certificates/${r.certificateId}`, "ok", `Certificate ${r.certificateNumber} issued.`));
}
