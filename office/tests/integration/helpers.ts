import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import type { Database } from "@/lib/database.types";

/**
 * Integration tests run against the LOCAL Supabase stack only (`npx supabase start`).
 * They refuse to run against anything that is not localhost.
 */
let cached: { url: string; publishable: string; secret: string; dbUrl: string } | null = null;
export function localEnv() {
  if (cached) return cached;
  const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  const env = { url: status.API_URL as string, publishable: status.PUBLISHABLE_KEY as string, secret: status.SECRET_KEY as string, dbUrl: status.DB_URL as string };
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(env.url)) throw new Error("Integration tests only run against a local Supabase stack");
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = env.publishable;
  process.env.SUPABASE_SECRET_KEY = env.secret;
  cached = env;
  return env;
}

export type Db = SupabaseClient<Database>;

export function adminClient(): Db {
  const e = localEnv();
  return createClient<Database>(e.url, e.secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function anonClient(): Db {
  const e = localEnv();
  return createClient<Database>(e.url, e.publishable, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: localEnv().dbUrl });
  await client.connect();
  try {
    return (await client.query<T>(text, params)).rows;
  } finally {
    await client.end();
  }
}

export const uniq = () => randomUUID().slice(0, 8);

/** Create an auth user (optionally with a staff profile) and return a client signed in as them. */
export async function makeUser(role: "admin" | "vet" | "staff" | null, extra: Partial<Database["public"]["Tables"]["staff_profiles"]["Insert"]> = {}) {
  const admin = adminClient();
  const email = `test-${role ?? "nobody"}-${uniq()}@example.test`;
  const password = `Pw-${randomUUID()}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const userId = created.data.user.id;
  if (role) {
    const p = await admin.from("staff_profiles").insert({
      user_id: userId, email, full_name: `Test ${role} ${uniq()}`, role,
      ...(role === "vet" ? { credentials: "DVM", license_number: `TEST-${uniq()}`, license_state: "NY" } : {}),
      ...extra,
    });
    if (p.error) throw p.error;
  }
  const client = anonClient();
  const s = await client.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  return { client, userId, email };
}
