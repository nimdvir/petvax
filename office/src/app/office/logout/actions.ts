"use server";
import { redirect } from "next/navigation";
import { getStaffClient } from "@/lib/supabase";
export async function logout() {
  const supabase = await getStaffClient();
  await supabase.auth.signOut();
  redirect("/office/login");
}
