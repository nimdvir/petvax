/**
 * Bootstrap the first PetVax Office administrator.
 *   npm run create-admin -- --email you@example.com --name "Your Name" [--password '...'] [--role vet --credentials DVM --license 123456]
 * Without --password an invitation email is sent instead.
 */
import { arg, serviceClient } from "./_env";

async function main() {
  const { db } = serviceClient();
  const email = arg("email")?.toLowerCase();
  const name = arg("name");
  if (!email || !name) throw new Error('Usage: --email you@example.com --name "Full Name"');
  const role = (arg("role") ?? "admin") as "admin" | "vet" | "staff";
  const password = arg("password");
  const res = password
    ? await db.auth.admin.createUser({ email, password, email_confirm: true })
    : await db.auth.admin.inviteUserByEmail(email);
  if (res.error || !res.data.user) throw new Error(res.error?.message ?? "Could not create user");
  const p = await db.from("staff_profiles").upsert({
    user_id: res.data.user.id, email, full_name: name, role, active: true,
    credentials: arg("credentials") ?? null, license_number: arg("license") ?? null, license_state: arg("license-state") ?? "NY",
  });
  if (p.error) throw new Error(p.error.message);
  console.log(`✓ ${role} ${email} ready${password ? "" : " (invitation sent)"}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
