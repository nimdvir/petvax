"use server";
import { redirect } from "next/navigation";
import { getStaffClient } from "@/lib/supabase";
export async function login(form:FormData) {
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  if (!email || !password) redirect("/office/login?error=credentials");
  const supabase = await getStaffClient();
  const { data, error } = await supabase.auth.signInWithPassword({email,password});
  if (error || !data.user) redirect("/office/login?error=credentials");
  const { data: staff } = await supabase.from("pvo_staff").select("active")
    .eq("user_id",data.user.id).eq("active",true).maybeSingle();
  if (!staff) {
    await supabase.auth.signOut();
    redirect("/office/login?error=access");
  }
  redirect("/office");
}
