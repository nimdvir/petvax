import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";
import type { Database } from "@/lib/database.types";

export type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Privileged client that bypasses Row Level Security.
 * Only used by server code paths that do their own authorization
 * (public form submission with a validated link token, admin-only operations).
 */
export function createAdminClient() {
  return createClient<Database>(publicEnv.supabaseUrl, serverEnv().secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
