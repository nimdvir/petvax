import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv, getSecretEnv } from "./env";

export function getAdminClient() {
  const env = getSecretEnv();
  return createClient(env.url, env.secret, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
export async function getStaffClient() {
  const cookieStore = await cookies();
  const { url, key } = getPublicEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // RSC render cannot set response cookies. Login/logout server actions can.
        }
      }
    }
  });
}
export async function authenticatedStaff() {
  const client = await getStaffClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await client.from("pvo_staff")
    .select("user_id,role,active").eq("user_id", user.id).eq("active", true).maybeSingle();
  if (!profile) return null;
  return { client, user, profile };
}
