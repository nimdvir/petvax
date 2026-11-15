"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { fbool, fdate, fnum, fstr, msg } from "@/lib/fd";
import { formatPhone, normalizeEmail } from "@/lib/forms/extract";
import { hashLinkToken, newLinkToken } from "@/lib/tokens";
import { publicEnv } from "@/lib/env";

function ownerFromForm(fd: FormData) {
  return {
    first_name: fstr(fd, "first_name") ?? "",
    last_name: fstr(fd, "last_name") ?? "",
    email: normalizeEmail(fstr(fd, "email")),
    phone: formatPhone(fstr(fd, "phone")),
    phone_secondary: formatPhone(fstr(fd, "phone_secondary")),
    preferred_contact: (fstr(fd, "preferred_contact") as "email" | "phone" | "text" | null) ?? null,
    address_line1: fstr(fd, "address_line1"),
    address_line2: fstr(fd, "address_line2"),
    city: fstr(fd, "city"),
    state: fstr(fd, "state"),
    postal_code: fstr(fd, "postal_code"),
    notes: fstr(fd, "notes"),
  };
}

function petFromForm(fd: FormData) {
  const sex = fstr(fd, "sex");
  return {
    name: fstr(fd, "name") ?? "",
    species: (fstr(fd, "species") as "dog" | "cat" | "other") ?? "dog",
    breed: fstr(fd, "breed"),
    color: fstr(fd, "color"),
    sex: (sex === "male" || sex === "female" ? sex : "unknown") as "male" | "female" | "unknown",
    spayed_neutered: fbool(fd, "spayed_neutered"),
    date_of_birth: fdate(fd, "date_of_birth"),
    estimated_age_years: fnum(fd, "estimated_age_years"),
    weight_lb: fnum(fd, "weight_lb"),
    microchip: fstr(fd, "microchip")?.replace(/\s+/g, "") ?? null,
    allergies: fstr(fd, "allergies"),
    prior_reactions: fstr(fd, "prior_reactions"),
    medical_conditions: fstr(fd, "medical_conditions"),
    medications: fstr(fd, "medications"),
    diet: fstr(fd, "diet"),
    vaccine_history_notes: fstr(fd, "vaccine_history_notes"),
  };
}

export async function createOwner(fd: FormData) {
  const { supabase } = await requireStaff();
  const data = ownerFromForm(fd);
  if (!data.first_name) redirect(msg("/clients/new", "error", "First name is required."));
  if (data.email || data.phone) {
    // Warn about likely duplicates instead of silently creating one.
    const found = [
      ...(data.email ? (await supabase.from("owners").select("id, first_name, last_name").eq("email_normalized", data.email).is("merged_into_id", null).limit(1)).data ?? [] : []),
      ...(data.phone ? (await supabase.from("owners").select("id, first_name, last_name").eq("phone_digits", data.phone.replace(/\D/g, "")).is("merged_into_id", null).limit(1)).data ?? [] : []),
    ];
    if (found.length && fstr(fd, "confirm_duplicate") !== "yes") {
      const d = found[0];
      redirect(msg(`/clients/new?dupe=${d.id}`, "error", `${d.first_name} ${d.last_name} already has this email or phone. Open their record, or tick "create anyway".`));
    }
  }
  const r = await supabase.from("owners").insert({ ...data, source: "staff" }).select("id").single();
  if (r.error) redirect(msg("/clients/new", "error", r.error.message));
  redirect(msg(`/clients/${r.data.id}`, "ok", "Client created."));
}

export async function updateOwner(id: string, fd: FormData) {
  const { supabase } = await requireStaff();
  const r = await supabase.from("owners").update(ownerFromForm(fd)).eq("id", id).select("id").single();
  if (r.error) redirect(msg(`/clients/${id}`, "error", r.error.message));
  revalidatePath(`/clients/${id}`);
  redirect(msg(`/clients/${id}`, "ok", "Saved."));
}

export async function addPet(ownerId: string, fd: FormData) {
  const { supabase } = await requireStaff();
  const pet = petFromForm(fd);
  if (!pet.name) redirect(msg(`/clients/${ownerId}`, "error", "Pet name is required."));
  const r = await supabase.from("pets").insert({ ...pet, source: "staff" }).select("id").single();
  if (r.error) redirect(msg(`/clients/${ownerId}`, "error", r.error.message));
  const l = await supabase.from("pet_owners").insert({ pet_id: r.data.id, owner_id: ownerId, is_primary: true });
  if (l.error) redirect(msg(`/clients/${ownerId}`, "error", l.error.message));
  redirect(msg(`/pets/${r.data.id}`, "ok", "Pet added."));
}

export async function updatePet(petId: string, fd: FormData) {
  const { supabase } = await requireStaff();
  const r = await supabase.from("pets").update(petFromForm(fd)).eq("id", petId).select("id").single();
  if (r.error) redirect(msg(`/pets/${petId}`, "error", r.error.message));
  redirect(msg(`/pets/${petId}`, "ok", "Saved."));
}

/** Personal link: the submission is filed under this client automatically. */
export async function createClientLink(ownerId: string, fd: FormData) {
  const { supabase, userId } = await requireStaff();
  const templateId = fstr(fd, "template_id");
  if (!templateId) redirect(msg(`/clients/${ownerId}`, "error", "Choose a form."));
  const token = newLinkToken();
  const r = await supabase.from("form_links").insert({
    template_id: templateId, token_hash: hashLinkToken(token), label: "Personal link", owner_id: ownerId,
    created_by: userId, expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
  });
  if (r.error) redirect(msg(`/clients/${ownerId}`, "error", r.error.message));
  redirect(`/clients/${ownerId}?link=${encodeURIComponent(`${publicEnv.siteUrl}/f/${token}`)}`);
}

/** Resolve a possible duplicate: merge this (newer) client into an existing one, or confirm they are different people. */
export async function resolveDuplicate(ownerId: string, fd: FormData) {
  const { supabase } = await requireStaff();
  const target = fstr(fd, "merge_into");
  if (!target) {
    await supabase.from("owners").update({ review_status: "ok", possible_duplicate_of: [] }).eq("id", ownerId);
    redirect(msg(`/clients/${ownerId}`, "ok", "Marked as a separate client."));
  }
  if (target === ownerId) redirect(msg(`/clients/${ownerId}`, "error", "Cannot merge a client into itself."));
  // Move pets, appointments and submissions. Signed consents, vaccinations and certificates keep pointing
  // at the record that existed when they were created (they are immutable); the pet links keep them visible.
  const pets = await supabase.from("pet_owners").select("pet_id").eq("owner_id", ownerId);
  for (const p of pets.data ?? []) {
    const exists = await supabase.from("pet_owners").select("pet_id").eq("pet_id", p.pet_id).eq("owner_id", target!).maybeSingle();
    if (!exists.data) {
      await supabase.from("pet_owners").update({ is_primary: false }).eq("pet_id", p.pet_id);
      const ins = await supabase.from("pet_owners").insert({ pet_id: p.pet_id, owner_id: target!, is_primary: true });
      if (ins.error) redirect(msg(`/clients/${ownerId}`, "error", ins.error.message));
    }
  }
  await supabase.from("appointments").update({ owner_id: target! }).eq("owner_id", ownerId);
  await supabase.from("intake_submissions").update({ owner_id: target! }).eq("owner_id", ownerId);
  const done = await supabase.from("owners").update({ review_status: "merged", merged_into_id: target!, possible_duplicate_of: [] }).eq("id", ownerId).select("id").single();
  if (done.error) redirect(msg(`/clients/${ownerId}`, "error", done.error.message));
  redirect(msg(`/clients/${target}`, "ok", "Records merged. The earlier record is kept and marked as merged."));
}
