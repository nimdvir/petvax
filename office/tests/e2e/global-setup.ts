import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/** Creates e2e staff accounts and installs the default forms in the LOCAL database. */
export default async function globalSetup() {
  const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  if (!/127\.0\.0\.1|localhost/.test(status.API_URL)) throw new Error("E2E tests only run against local Supabase");
  const db = createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false } });
  const stamp = Date.now();
  const users = {
    vet: { email: `e2e-vet-${stamp}@example.test`, password: `Vet-${stamp}-pw!`, name: "Taylor Test", role: "vet", credentials: "DVM", license: "E2E-TEST-1" },
    admin: { email: `e2e-admin-${stamp}@example.test`, password: `Adm-${stamp}-pw!`, name: "Alex Admin", role: "admin", credentials: null, license: null },
  };
  for (const u of Object.values(users)) {
    const r = await db.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true });
    if (r.error) throw r.error;
    const p = await db.from("staff_profiles").insert({ user_id: r.data.user.id, email: u.email, full_name: u.name, role: u.role, credentials: u.credentials, license_number: u.license, license_state: "NY" });
    if (p.error) throw p.error;
  }
  const out = execSync("npx tsx scripts/seed-forms.ts", { encoding: "utf8", env: { ...process.env, NEXT_PUBLIC_SITE_URL: "http://localhost:3000" } });
  const links = Object.fromEntries(out.trim().split("\n").map((l) => { const i = l.lastIndexOf(": "); return [l.slice(0, i), l.slice(i + 2)]; }));
  writeFileSync(".e2e-context.json", JSON.stringify({ users, links, stamp }, null, 2));
}
