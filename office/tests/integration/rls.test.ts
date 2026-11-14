import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, makeUser, uniq, type Db } from "./helpers";

let staff: Awaited<ReturnType<typeof makeUser>>;
let vet: Awaited<ReturnType<typeof makeUser>>;
let admin: Awaited<ReturnType<typeof makeUser>>;
let outsider: Awaited<ReturnType<typeof makeUser>>;
let ownerId: string;
let petId: string;

beforeAll(async () => {
  [staff, vet, admin, outsider] = await Promise.all([makeUser("staff"), makeUser("vet"), makeUser("admin"), makeUser(null)]);
  const o = await staff.client.from("owners").insert({ first_name: "Rls", last_name: `Owner${uniq()}`, email: `rls-${uniq()}@example.test` }).select("id").single();
  expect(o.error).toBeNull();
  ownerId = o.data!.id;
  const p = await staff.client.from("pets").insert({ name: "Fido", species: "dog" }).select("id").single();
  petId = p.data!.id;
  await staff.client.from("pet_owners").insert({ pet_id: petId, owner_id: ownerId });
});

describe("public (anon) access", () => {
  const tables = ["owners", "pets", "signed_consents", "vaccinations", "certificates", "intake_submissions", "form_versions", "audit_events"] as const;
  it.each(tables)("cannot read %s", async (t) => {
    const r = await anonClient().from(t).select("*").limit(1);
    expect(r.error?.message ?? "").toMatch(/permission denied/);
  });
  it("cannot write owners", async () => {
    const r = await anonClient().from("owners").insert({ first_name: "Hacker" });
    expect(r.error).not.toBeNull();
  });
  it("cannot download private files", async () => {
    const r = await anonClient().storage.from("consent-signatures").list();
    expect(r.data ?? []).toHaveLength(0);
  });
});

describe("signed-in user without a staff profile", () => {
  it("sees no client records", async () => {
    const r = await outsider.client.from("owners").select("id").eq("id", ownerId);
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(0);
  });
  it("cannot create records", async () => {
    expect((await outsider.client.from("owners").insert({ first_name: "X" })).error).not.toBeNull();
  });
  it("cannot make themselves staff", async () => {
    const r = await outsider.client.from("staff_profiles").insert({ user_id: outsider.userId, full_name: "Me", email: outsider.email, role: "admin" });
    expect(r.error).not.toBeNull();
  });
});

describe("role-based permissions", () => {
  it("front-desk staff can read clients but cannot write SOAP notes or give vaccines", async () => {
    expect((await staff.client.from("owners").select("id").eq("id", ownerId)).data).toHaveLength(1);
    const enc = await staff.client.from("encounters").insert({ pet_id: petId, owner_id: ownerId }).select("id").single();
    expect(enc.error).toBeNull();
    const soap = await staff.client.from("soap_notes").insert({ encounter_id: enc.data!.id, subjective: "x" });
    expect(soap.error?.message).toMatch(/row-level security/);
    const vax = await staff.client.from("vaccinations").insert({ pet_id: petId, owner_id: ownerId, vaccine_name: "Rabies", vaccine_type: "Rabies", administered_on: "2026-11-01", administered_by: staff.userId });
    expect(vax.error?.message).toMatch(/row-level security/);
  });
  it("front-desk staff may record history given elsewhere", async () => {
    const r = await staff.client.from("vaccinations").insert({ pet_id: petId, owner_id: ownerId, vaccine_name: "DHPP", vaccine_type: "DHPP", administered_on: "2025-01-01", administered_elsewhere: true, administered_by_name: "Other clinic" });
    expect(r.error).toBeNull();
  });
  it("vets can record vaccinations", async () => {
    const r = await vet.client.from("vaccinations").insert({ pet_id: petId, owner_id: ownerId, vaccine_name: "Rabies (1-year)", vaccine_type: "Rabies", is_rabies: true, administered_on: "2026-11-01", administered_by: vet.userId });
    expect(r.error).toBeNull();
  });
  it("only admins read the audit log and change settings", async () => {
    expect((await staff.client.from("audit_events").select("id").limit(1)).data).toHaveLength(0);
    expect((await admin.client.from("audit_events").select("id").limit(1)).data!.length).toBe(1);
    const s1 = await staff.client.from("app_settings").update({ phone: "000" }).eq("id", true).select();
    expect(s1.data).toHaveLength(0);
    const s2 = await admin.client.from("app_settings").update({ phone: "(212) 555-0199" }).eq("id", true).select();
    expect(s2.data).toHaveLength(1);
  });
  it("staff cannot promote themselves", async () => {
    const r = await staff.client.from("staff_profiles").update({ role: "admin" }).eq("user_id", staff.userId).select();
    expect(r.data ?? []).toHaveLength(0);
  });
  it("nobody can delete client records through the API", async () => {
    const r = await admin.client.from("owners").delete().eq("id", ownerId);
    expect(r.error?.message).toMatch(/permission denied/);
  });
  it("only vets can issue certificates, and only in their own name", async () => {
    const base = { certificate_number: `T-${uniq()}`, pet_id: petId, owner_id: ownerId, snapshot: {} };
    expect((await staff.client.from("certificates").insert({ ...base, issued_by: staff.userId })).error).not.toBeNull();
    expect((await admin.client.from("certificates").insert({ ...base, issued_by: admin.userId })).error).not.toBeNull();
    const other = await makeUser("vet");
    expect((await vet.client.from("certificates").insert({ ...base, issued_by: other.userId })).error).not.toBeNull();
  });
  it("staff can read private files, outsiders cannot", async () => {
    const db: Db = adminClient();
    const path = `rls/${uniq()}.png`;
    await db.storage.from("documents").upload(path, new Uint8Array([1, 2, 3]), { contentType: "image/png" });
    expect((await staff.client.storage.from("documents").download(path)).error).toBeNull();
    expect((await outsider.client.storage.from("documents").download(path)).error).not.toBeNull();
    expect((await anonClient().storage.from("documents").download(path)).error).not.toBeNull();
  });
  it("deactivated staff lose access immediately", async () => {
    const temp = await makeUser("staff");
    expect((await temp.client.from("owners").select("id").eq("id", ownerId)).data).toHaveLength(1);
    const off = await admin.client.from("staff_profiles").update({ active: false }).eq("user_id", temp.userId).select();
    expect(off.data).toHaveLength(1);
    expect((await temp.client.from("owners").select("id").eq("id", ownerId)).data).toHaveLength(0);
  });
});
