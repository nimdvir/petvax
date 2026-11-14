import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { issueCertificate } from "@/lib/certificates/issue";
import { adminClient, makeUser, sql, uniq } from "./helpers";
import { pdfToText } from "../pdf-text";

let vet: Awaited<ReturnType<typeof makeUser>>;
let staff: Awaited<ReturnType<typeof makeUser>>;
let ownerId: string;
let petId: string;

beforeAll(async () => {
  [vet, staff] = await Promise.all([makeUser("vet"), makeUser("staff")]);
  const db = adminClient();
  ownerId = (await db.from("owners").insert({ first_name: "Clin", last_name: `Owner${uniq()}`, email: `c-${uniq()}@example.test`, address_line1: "1 Main St", city: "New York", state: "NY", postal_code: "10001", phone: "(212) 555-0142" }).select("id").single()).data!.id;
  petId = (await db.from("pets").insert({ name: "Biscuit", species: "dog", breed: "Corgi", sex: "female", spayed_neutered: true, date_of_birth: "2022-02-02", weight_lb: 28, microchip: `9851${uniq()}` }).select("id").single()).data!.id;
  await db.from("pet_owners").insert({ pet_id: petId, owner_id: ownerId });
});

describe("appointments", () => {
  it("rejects overlapping confirmed visits for the same clinician", async () => {
    const base = { owner_id: ownerId, status: "confirmed" as const, assigned_staff_id: vet.userId };
    const a = await staff.client.from("appointments").insert({ ...base, starts_at: "2027-01-05T15:00:00Z", ends_at: "2027-01-05T15:45:00Z" });
    expect(a.error).toBeNull();
    const b = await staff.client.from("appointments").insert({ ...base, starts_at: "2027-01-05T15:30:00Z", ends_at: "2027-01-05T16:00:00Z" });
    expect(b.error?.message).toMatch(/appointments_no_overlap/);
    const c = await staff.client.from("appointments").insert({ ...base, starts_at: "2027-01-05T15:45:00Z", ends_at: "2027-01-05T16:15:00Z" });
    expect(c.error).toBeNull(); // back-to-back is fine
    const d = await staff.client.from("appointments").insert({ ...base, status: "requested", starts_at: "2027-01-05T15:30:00Z", ends_at: "2027-01-05T16:00:00Z" });
    expect(d.error).toBeNull(); // requests may overlap until confirmed
  });
});

describe("SOAP notes", () => {
  it("keeps every revision and only allows amendments after finalizing", async () => {
    const enc = (await vet.client.from("encounters").insert({ pet_id: petId, owner_id: ownerId, clinician_id: vet.userId }).select("id").single()).data!;
    const note = await vet.client.from("soap_notes").insert({ encounter_id: enc.id, subjective: "Owner reports normal appetite", created_by: vet.userId, updated_by: vet.userId }).select("id").single();
    expect(note.error).toBeNull();
    const id = note.data!.id;
    const upd = await vet.client.from("soap_notes").update({ temperature: 101.5, temperature_unit: "F", heart_rate_bpm: 100, respiratory_rate_bpm: 24, weight: 28, weight_unit: "lb", body_condition_score: 5, body_condition_scale: 9, assessment: "Healthy, fit for vaccination", fit_for_vaccination: true, plan: "Rabies 3yr, DHPP", updated_by: vet.userId }).eq("id", id).select().single();
    expect(upd.error).toBeNull();
    const bad = await vet.client.from("soap_notes").update({ body_condition_score: 7, body_condition_scale: 5 }).eq("id", id);
    expect(bad.error?.message).toMatch(/soap_bcs_in_scale/);
    const fin = await vet.client.from("soap_notes").update({ status: "final", finalized_by: vet.userId }).eq("id", id).select("finalized_at").single();
    expect(fin.data?.finalized_at).toBeTruthy();
    const edit = await vet.client.from("soap_notes").update({ plan: "changed" }).eq("id", id);
    expect(edit.error?.message).toMatch(/amendment/);
    const amend = await vet.client.from("soap_notes").update({ plan: "Rabies 3yr, DHPP. Recheck in 3 weeks.", status: "amended", amendment_reason: "Added recheck", updated_by: vet.userId }).eq("id", id);
    expect(amend.error).toBeNull();
    const revs = (await vet.client.from("soap_note_revisions").select("revision, status, snapshot").eq("soap_note_id", id).order("revision")).data!;
    expect(revs.map((r) => r.status)).toEqual(["draft", "draft", "final", "amended"]);
    expect((revs[1].snapshot as { temperature: number }).temperature).toBe(101.5);
    expect((await adminClient().from("soap_notes").delete().eq("id", id)).error).not.toBeNull();
  });
});

describe("vaccination records", () => {
  it("are immutable; corrections supersede the original and stay traceable", async () => {
    const v = (await vet.client.from("vaccinations").insert({ pet_id: petId, owner_id: ownerId, vaccine_name: "DHPP / DAPP", vaccine_type: "DHPP", manufacturer: "TestPharma", lot_number: "WRONG-1", administered_on: "2026-11-10", administered_by: vet.userId, route: "SC", site: "Right fore", next_due_on: "2027-11-10" }).select("id").single()).data!;
    const edit = await vet.client.from("vaccinations").update({ lot_number: "FIXED" }).eq("id", v.id);
    expect(edit.error?.message).toMatch(/immutable/);
    const fixed = await vet.client.from("vaccinations").insert({ pet_id: petId, owner_id: ownerId, vaccine_name: "DHPP / DAPP", vaccine_type: "DHPP", manufacturer: "TestPharma", lot_number: "DH-2210", administered_on: "2026-11-10", administered_by: vet.userId, route: "SC", site: "Right fore", next_due_on: "2027-11-10", supersedes_id: v.id, correction_reason: "Lot number typo" }).select("id").single();
    expect(fixed.error).toBeNull();
    const old = (await vet.client.from("vaccinations").select("status").eq("id", v.id).single()).data!;
    expect(old.status).toBe("superseded");
    const noReason = await vet.client.from("vaccinations").insert({ pet_id: petId, owner_id: ownerId, vaccine_name: "X", vaccine_type: "X", administered_on: "2026-11-10", administered_by: vet.userId, supersedes_id: fixed.data!.id });
    expect(noReason.error).not.toBeNull();
  });
});

describe("certificates", () => {
  async function giveVaccines(by = vet.userId) {
    const rows = [
      { vaccine_name: "Rabies (3-year)", vaccine_type: "Rabies", is_rabies: true, duration_months: 36, manufacturer: "TestPharma", lot_number: "RB-4471", serial_number: "RB-4471", lot_expiration: "2027-08-31", administered_on: "2026-11-14", next_due_on: "2029-11-14", route: "SC", site: "Right hind", rabies_tag_number: "NYC-55821" },
      { vaccine_name: "DHPP / DAPP", vaccine_type: "DHPP", manufacturer: "TestPharma", lot_number: "DH-2210", lot_expiration: "2027-03-31", administered_on: "2026-11-14", next_due_on: "2027-11-14", route: "SC", site: "Right fore" },
    ];
    const r = await vet.client.from("vaccinations").insert(rows.map((x) => ({ ...x, pet_id: petId, owner_id: ownerId, administered_by: by })), { defaultToNull: false }).select("id");
    expect(r.error).toBeNull();
    return r.data!.map((x) => x.id);
  }

  it("generates, numbers, stores and links a certificate from saved records", async () => {
    const ids = await giveVaccines();
    const r = await issueCertificate(vet.client, { vaccinationIds: ids, issuerId: vet.userId, siteUrl: "https://office.example.test" });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.certificateNumber).toMatch(/^PVX-\d{4}-\d{6}$/);
    const cert = (await vet.client.from("certificates").select("*, certificate_vaccinations(vaccination_id)").eq("id", r.certificateId).single()).data!;
    expect(cert.certificate_vaccinations).toHaveLength(2);
    const file = await vet.client.storage.from("certificates").download(cert.pdf_path!);
    const bytes = new Uint8Array(await file.data!.arrayBuffer());
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(cert.pdf_sha256);
    const text = pdfToText(bytes).replace(/\s+/g, " ");
    for (const s of ["Biscuit", "Corgi", "Female (spayed)", "RB-4471", "DH-2210", "NYC-55821", r.certificateNumber, "DVM"]) expect(text).toContain(s);
    // Contents can't be altered, a second PDF can't replace the first, and it can only be voided with a reason.
    expect((await vet.client.from("certificates").update({ snapshot: {} }).eq("id", cert.id)).error?.message).toMatch(/immutable/);
    expect((await vet.client.from("certificates").update({ pdf_sha256: "x" }).eq("id", cert.id)).error?.message).toMatch(/cannot be replaced/);
    expect((await vet.client.from("certificates").update({ status: "voided" }).eq("id", cert.id)).error?.message).toMatch(/reason/);
    expect((await vet.client.from("certificates").update({ status: "voided", voided_reason: "Wrong pet" }).eq("id", cert.id)).error).toBeNull();
  });

  it("refuses to issue when credentials or clinical data are missing", async () => {
    const unlicensed = await makeUser("vet", { license_number: null });
    const ids = await giveVaccines();
    const r1 = await issueCertificate(unlicensed.client, { vaccinationIds: ids, issuerId: unlicensed.userId, siteUrl: "http://x" });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.readiness.blocking.join(" ")).toMatch(/license number/);

    const incomplete = (await vet.client.from("vaccinations").insert({ pet_id: petId, owner_id: ownerId, vaccine_name: "Rabies (1-year)", vaccine_type: "Rabies", is_rabies: true, administered_on: "2026-11-14", administered_by: vet.userId }).select("id").single()).data!;
    const r2 = await issueCertificate(vet.client, { vaccinationIds: [incomplete.id], issuerId: vet.userId, siteUrl: "http://x" });
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      const msg = r2.readiness.blocking.join(" ");
      expect(msg).toMatch(/manufacturer is missing/);
      expect(msg).toMatch(/duration/);
      expect(msg).toMatch(/serial\/lot/);
    }
  });

  it("does not let front-desk staff issue certificates", async () => {
    const ids = await giveVaccines();
    const r = await issueCertificate(staff.client, { vaccinationIds: ids, issuerId: staff.userId, siteUrl: "http://x" });
    expect(r.ok).toBe(false);
  });
});

describe("audit trail", () => {
  it("records changes with a verifiable hash chain", async () => {
    const db = adminClient();
    const o = (await db.from("owners").insert({ first_name: "Audit", last_name: uniq() }).select("id").single()).data!;
    await db.from("owners").update({ city: "Brooklyn" }).eq("id", o.id);
    const events = await sql<{ action: string; details: { changes?: { city?: { to: string } } } }>(
      "select action, details from public.audit_events where table_name = 'owners' and record_id = $1 order by id", [o.id]);
    expect(events.map((e) => e.action)).toEqual(["insert", "update"]);
    expect(events[1].details.changes?.city?.to).toBe("Brooklyn");
    const broken = await sql<{ b: string | null }>("select private.verify_audit_chain() as b");
    expect(broken[0].b).toBeNull();
    await expect(sql("update public.audit_events set action = 'x' where id = (select max(id) from public.audit_events)")).rejects.toThrow(/immutable/);
  });
});
