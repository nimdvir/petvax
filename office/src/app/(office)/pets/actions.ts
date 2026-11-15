"use server";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { fdate, fint, fstr, msg } from "@/lib/fd";
import { todayInNy } from "@/lib/time";

async function primaryOwner(supabase: Awaited<ReturnType<typeof requireStaff>>["supabase"], petId: string) {
  const r = await supabase.from("pet_owners").select("owner_id, is_primary").eq("pet_id", petId).order("is_primary", { ascending: false }).limit(1).single();
  return r.data?.owner_id ?? null;
}

/** Start a visit for a pet outside of a scheduled appointment. */
export async function startVisit(petId: string) {
  const { supabase, userId, profile } = await requireStaff(["vet", "admin"]);
  const ownerId = await primaryOwner(supabase, petId);
  if (!ownerId) redirect(msg(`/pets/${petId}`, "error", "This pet has no owner on file."));
  const r = await supabase.from("encounters").insert({ pet_id: petId, owner_id: ownerId!, clinician_id: profile.role === "vet" ? userId : null, created_by: userId, encounter_date: todayInNy() }).select("id").single();
  if (r.error) redirect(msg(`/pets/${petId}`, "error", r.error.message));
  redirect(`/visits/${r.data.id}`);
}

/** Record a vaccine given by another clinic (history only; not certifiable by PetVax). */
export async function addOutsideVaccine(petId: string, fd: FormData) {
  const { supabase, userId } = await requireStaff();
  const ownerId = await primaryOwner(supabase, petId);
  const given = fdate(fd, "administered_on");
  const name = fstr(fd, "vaccine_name");
  if (!ownerId || !given || !name) redirect(msg(`/pets/${petId}`, "error", "Vaccine name and date are required."));
  const r = await supabase.from("vaccinations").insert({
    pet_id: petId, owner_id: ownerId!, vaccine_name: name!, vaccine_type: fstr(fd, "vaccine_type") ?? name!,
    is_rabies: /rabies/i.test(name!), administered_on: given!, next_due_on: fdate(fd, "next_due_on"),
    manufacturer: fstr(fd, "manufacturer"), lot_number: fstr(fd, "lot_number"), duration_months: fint(fd, "duration_months"),
    administered_elsewhere: true, administered_by_name: fstr(fd, "administered_by_name") ?? "Another clinic",
    notes: fstr(fd, "notes"), source: "staff", created_by: userId,
  });
  if (r.error) redirect(msg(`/pets/${petId}`, "error", r.error.message));
  redirect(msg(`/pets/${petId}`, "ok", "Outside vaccine recorded."));
}
