"use server";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { fdate, fint, fstr, msg } from "@/lib/fd";
import { nyLocalToUtc, todayInNy } from "@/lib/time";
import { hashLinkToken, newLinkToken } from "@/lib/tokens";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/database.types";

type ApptUpdate = Database["public"]["Tables"]["appointments"]["Update"];

type Supa = Awaited<ReturnType<typeof requireStaff>>["supabase"];

/** Other non-canceled visits for the same clinician that overlap [start, end). */
async function conflicts(supabase: Supa, staffId: string | null, start: Date, end: Date, excludeId?: string) {
  if (!staffId) return [];
  let q = supabase.from("appointments").select("id, starts_at, status, owners(first_name, last_name)")
    .eq("assigned_staff_id", staffId).neq("status", "canceled")
    .lt("starts_at", end.toISOString()).gt("ends_at", start.toISOString());
  if (excludeId) q = q.neq("id", excludeId);
  return (await q).data ?? [];
}

function timesFrom(fd: FormData) {
  const date = fdate(fd, "date");
  const time = fstr(fd, "time");
  const minutes = fint(fd, "duration") ?? 45;
  if (!date || !time) return null;
  const start = nyLocalToUtc(date, time);
  return { start, end: new Date(start.getTime() + minutes * 60_000) };
}

export async function createAppointment(fd: FormData) {
  const { supabase, userId } = await requireStaff();
  const ownerId = fstr(fd, "owner_id");
  const back = `/appointments/new?owner=${ownerId ?? ""}`;
  if (!ownerId) redirect(msg("/appointments/new", "error", "Choose a client."));
  const petIds = fd.getAll("pet_ids").map(String);
  if (!petIds.length) redirect(msg(back, "error", "Choose at least one pet."));
  const t = timesFrom(fd);
  const staffId = fstr(fd, "assigned_staff_id");
  const status = (fstr(fd, "status") === "confirmed" ? "confirmed" : "requested") as "confirmed" | "requested";
  if (status === "confirmed" && !t) redirect(msg(back, "error", "A confirmed visit needs a date and time."));
  if (t && fstr(fd, "allow_overlap") !== "yes") {
    const c = await conflicts(supabase, staffId, t.start, t.end);
    if (c.length) redirect(msg(back, "error", `Conflicts with ${c.length} other visit(s) for this clinician. Pick another time or tick "book anyway" (requests only).`));
  }
  const r = await supabase.from("appointments").insert({
    owner_id: ownerId!, status, starts_at: t?.start.toISOString() ?? null, ends_at: t?.end.toISOString() ?? null,
    assigned_staff_id: staffId, visit_address: fstr(fd, "visit_address"), internal_notes: fstr(fd, "internal_notes"),
    confirmed_at: status === "confirmed" ? new Date().toISOString() : null, source: "staff", created_by: userId,
  }).select("id").single();
  if (r.error) redirect(msg(back, "error", r.error.message.includes("appointments_no_overlap") ? "That clinician already has a confirmed visit at that time." : r.error.message));
  const ap = await supabase.from("appointment_pets").insert(petIds.map((pet_id) => ({ appointment_id: r.data.id, pet_id })));
  if (ap.error) redirect(msg(`/appointments/${r.data.id}`, "error", ap.error.message));
  redirect(msg(`/appointments/${r.data.id}`, "ok", "Appointment saved."));
}

export async function updateSchedule(id: string, fd: FormData) {
  const { supabase } = await requireStaff();
  const t = timesFrom(fd);
  const staffId = fstr(fd, "assigned_staff_id");
  const page = `/appointments/${id}`;
  if (t) {
    const c = await conflicts(supabase, staffId, t.start, t.end, id);
    if (c.length && fstr(fd, "allow_overlap") !== "yes") {
      redirect(msg(page, "error", `Overlaps ${c.map((x) => `${x.owners?.first_name} ${x.owners?.last_name} (${x.status})`).join(", ")}. Tick "save anyway" to keep it as a request.`));
    }
  }
  const r = await supabase.from("appointments").update({
    starts_at: t?.start.toISOString() ?? null, ends_at: t?.end.toISOString() ?? null, assigned_staff_id: staffId,
    visit_address: fstr(fd, "visit_address"), internal_notes: fstr(fd, "internal_notes"), follow_up_on: fdate(fd, "follow_up_on"),
  }).eq("id", id).select("id").single();
  if (r.error) redirect(msg(page, "error", r.error.message.includes("appointments_no_overlap") ? "That clinician already has a confirmed visit at that time." : r.error.message));
  redirect(msg(page, "ok", "Saved."));
}

export async function setStatus(id: string, status: "confirmed" | "completed" | "canceled" | "requested", fd: FormData) {
  const { supabase } = await requireStaff();
  const now = new Date().toISOString();
  const patch: ApptUpdate = { status };
  if (status === "confirmed") patch.confirmed_at = now;
  if (status === "completed") patch.completed_at = now;
  if (status === "canceled") { patch.canceled_at = now; patch.cancel_reason = fstr(fd, "cancel_reason"); }
  const r = await supabase.from("appointments").update(patch).eq("id", id).select("id").single();
  if (r.error) {
    const text = r.error.message.includes("appointments_confirmed_has_time") ? "Set a date and time before confirming."
      : r.error.message.includes("appointments_no_overlap") ? "That clinician already has a confirmed visit at that time." : r.error.message;
    redirect(msg(`/appointments/${id}`, "error", text));
  }
  redirect(msg(`/appointments/${id}`, "ok", `Marked ${status}.`));
}

export async function markFlag(id: string, flag: "client_confirmed_at" | "reminder_sent_at") {
  const { supabase } = await requireStaff();
  await supabase.from("appointments").update({ [flag]: new Date().toISOString() } as ApptUpdate).eq("id", id);
  redirect(msg(`/appointments/${id}`, "ok", flag === "client_confirmed_at" ? "Client confirmation recorded." : "Reminder marked as sent."));
}

/** Open (or create) the exam record for one pet at this appointment. */
export async function openVisit(appointmentId: string, petId: string) {
  const { supabase, userId, profile } = await requireStaff();
  const existing = await supabase.from("encounters").select("id").eq("appointment_id", appointmentId).eq("pet_id", petId).maybeSingle();
  if (existing.data) redirect(`/visits/${existing.data.id}`);
  if (profile.role === "staff") redirect(msg(`/appointments/${appointmentId}`, "error", "Only clinicians can start an exam."));
  const appt = (await supabase.from("appointments").select("owner_id, starts_at, assigned_staff_id").eq("id", appointmentId).single()).data!;
  const r = await supabase.from("encounters").insert({
    appointment_id: appointmentId, pet_id: petId, owner_id: appt.owner_id,
    clinician_id: appt.assigned_staff_id ?? (profile.role === "vet" ? userId : null), created_by: userId, encounter_date: todayInNy(),
  }).select("id").single();
  if (r.error) redirect(msg(`/appointments/${appointmentId}`, "error", r.error.message));
  redirect(`/visits/${r.data.id}`);
}

export async function appointmentLink(appointmentId: string, fd: FormData) {
  const { supabase, userId } = await requireStaff();
  const appt = (await supabase.from("appointments").select("owner_id").eq("id", appointmentId).single()).data;
  const token = newLinkToken();
  const r = await supabase.from("form_links").insert({
    template_id: fstr(fd, "template_id")!, token_hash: hashLinkToken(token), label: "Appointment link",
    owner_id: appt?.owner_id ?? null, appointment_id: appointmentId, created_by: userId,
    expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
  });
  if (r.error) redirect(msg(`/appointments/${appointmentId}`, "error", r.error.message));
  redirect(`/appointments/${appointmentId}?link=${encodeURIComponent(`${publicEnv.siteUrl}/f/${token}`)}`);
}
