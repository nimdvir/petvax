import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type StaffRole = Database["public"]["Enums"]["staff_role"];
export type StaffProfile = Database["public"]["Tables"]["staff_profiles"]["Row"];

/** Current signed-in staff member, or null. Verifies the JWT via getClaims(). */
export async function getStaff() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;
  const { data: profile } = await supabase.from("staff_profiles").select("*").eq("user_id", userId).maybeSingle();
  return { supabase, userId, email: (data.claims.email as string | undefined) ?? "", aal: (data.claims.aal as string | undefined) ?? "aal1", profile };
}

/**
 * Require an active staff member (optionally with one of `roles`).
 * Users who enrolled an authenticator app must complete the second step first.
 */
export async function requireStaff(roles?: StaffRole[]) {
  const s = await getStaff();
  if (!s) redirect("/login");
  if (!s.profile || !s.profile.active) redirect("/login?error=not_staff");
  if (s.aal !== "aal2") {
    // Verified with the Auth server: also catches accounts that were deleted or banned since sign-in.
    const { data: u, error } = await s.supabase.auth.getUser();
    if (error || !u.user) redirect("/login");
    if (u.user.factors?.some((f) => f.status === "verified")) redirect("/auth/mfa");
  }
  if (roles && !roles.includes(s.profile.role)) redirect("/?error=" + encodeURIComponent("You don't have permission for that page."));
  return { ...s, profile: s.profile };
}

export const can = {
  clinical: (role: StaffRole) => role === "vet" || role === "admin",
  issueCertificates: (role: StaffRole) => role === "vet",
  admin: (role: StaffRole) => role === "admin",
};
