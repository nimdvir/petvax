"use server";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { fbool, fint, fstr, msg } from "@/lib/fd";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";

export async function updateSettings(fd: FormData) {
  const { supabase } = await requireStaff(["admin"]);
  const color = fstr(fd, "certificate_accent_color") ?? "#b91c1c";
  const r = await supabase.from("app_settings").update({
    business_name: fstr(fd, "business_name") ?? "PetVax", tagline: fstr(fd, "tagline"), phone: fstr(fd, "phone"), email: fstr(fd, "email"),
    website: fstr(fd, "website"), address: fstr(fd, "address"), certificate_footer: fstr(fd, "certificate_footer"),
    certificate_accent_color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#b91c1c", default_visit_minutes: fint(fd, "default_visit_minutes") ?? 45,
  }).eq("id", true).select("id").single();
  if (r.error) redirect(msg("/settings", "error", r.error.message));
  redirect(msg("/settings", "ok", "Settings saved. New certificates use them; issued certificates never change."));
}

export async function saveProduct(fd: FormData) {
  const { supabase } = await requireStaff(["vet", "admin"]);
  const id = fstr(fd, "id");
  const row = {
    name: fstr(fd, "name")!, vaccine_type: fstr(fd, "vaccine_type") ?? fstr(fd, "name")!, species: (fstr(fd, "species") ?? "dog") as "dog" | "cat" | "other",
    manufacturer: fstr(fd, "manufacturer"), default_route: fstr(fd, "default_route"), default_site: fstr(fd, "default_site"),
    default_interval_months: fint(fd, "default_interval_months"), is_rabies: fbool(fd, "is_rabies") ?? false, active: fbool(fd, "active") ?? true,
  };
  if (!row.name) redirect(msg("/settings#vaccines", "error", "Name is required."));
  const r = id ? await supabase.from("vaccine_products").update(row).eq("id", id) : await supabase.from("vaccine_products").insert(row);
  if (r.error) redirect(msg("/settings", "error", r.error.message));
  redirect(msg("/settings", "ok", "Vaccine list updated.") + "#vaccines");
}

/** Invite a staff member by email. They set their own password from the email link. */
export async function inviteStaff(fd: FormData) {
  const { supabase } = await requireStaff(["admin"]);
  const email = fstr(fd, "email")?.toLowerCase();
  const name = fstr(fd, "full_name");
  const role = (fstr(fd, "role") ?? "staff") as "admin" | "vet" | "staff";
  if (!email || !name) redirect(msg("/settings/staff", "error", "Name and email are required."));
  const admin = createAdminClient();
  const invited = await admin.auth.admin.inviteUserByEmail(email!, { redirectTo: `${publicEnv.siteUrl}/auth/callback?next=/auth/update-password` });
  if (invited.error || !invited.data.user) redirect(msg("/settings/staff", "error", invited.error?.message ?? "Invite failed."));
  const r = await supabase.from("staff_profiles").insert({
    user_id: invited.data.user!.id, email: email!, full_name: name!, role,
    credentials: fstr(fd, "credentials"), license_number: fstr(fd, "license_number"), license_state: fstr(fd, "license_state") ?? "NY",
  });
  if (r.error) redirect(msg("/settings/staff", "error", r.error.message));
  redirect(msg("/settings/staff", "ok", `Invitation sent to ${email}.`));
}

export async function updateStaff(userId: string, fd: FormData) {
  const { supabase, userId: me } = await requireStaff(["admin"]);
  const active = fbool(fd, "active") ?? true;
  const role = (fstr(fd, "role") ?? "staff") as "admin" | "vet" | "staff";
  if (userId === me && (!active || role !== "admin")) redirect(msg("/settings/staff", "error", "You can't remove your own admin access."));
  const r = await supabase.from("staff_profiles").update({
    full_name: fstr(fd, "full_name") ?? "", role, active, credentials: fstr(fd, "credentials"),
    license_number: fstr(fd, "license_number"), license_state: fstr(fd, "license_state"),
  }).eq("user_id", userId).select("user_id").single();
  if (r.error) redirect(msg("/settings/staff", "error", r.error.message));
  redirect(msg("/settings/staff", "ok", "Staff member updated."));
}

export async function uploadSignature(userId: string, fd: FormData) {
  const { supabase } = await requireStaff(["admin"]);
  const file = fd.get("signature");
  if (!(file instanceof File) || !file.size) redirect(msg("/settings/staff", "error", "Choose a PNG or JPEG image."));
  const f = file as File;
  if (!["image/png", "image/jpeg"].includes(f.type) || f.size > 1_000_000) redirect(msg("/settings/staff", "error", "Use a PNG or JPEG under 1 MB."));
  const path = `${userId}/${Date.now()}.${f.type === "image/png" ? "png" : "jpg"}`;
  const up = await supabase.storage.from("staff-signatures").upload(path, f, { contentType: f.type });
  if (up.error) redirect(msg("/settings/staff", "error", up.error.message));
  await supabase.from("staff_profiles").update({ signature_path: path }).eq("user_id", userId);
  redirect(msg("/settings/staff", "ok", "Signature image saved. It appears on certificates issued from now on."));
}
