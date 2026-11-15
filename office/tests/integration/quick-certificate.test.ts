import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createQuickCertificate, parseQuickForm } from "@/lib/certificates/quick";
import { todayInNy } from "@/lib/time";
import { adminClient, makeUser, uniq } from "./helpers";
import { pdfToText } from "../pdf-text";

let tech: Awaited<ReturnType<typeof makeUser>>;
let staff: Awaited<ReturnType<typeof makeUser>>;
let petId: string;
let ownerId: string;
let dhpp: { id: string; name: string };
let rabies: { id: string; name: string };
const today = todayInNy();

const form = (fields: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
};
const count = async (table: "vaccinations" | "encounters" | "certificates") =>
  (await adminClient().from(table).select("id", { count: "exact", head: true }).eq("pet_id", petId)).count ?? 0;

beforeAll(async () => {
  // A technician who signs certificates but has no veterinary license of their own (like PetVax today).
  [tech, staff] = await Promise.all([makeUser("vet", { credentials: "LVT, VTS", license_number: null }), makeUser("staff")]);
  const db = adminClient();
  ownerId = (await db.from("owners").insert({ first_name: "Quick", last_name: `Owner${uniq()}`, email: `q-${uniq()}@example.test`, phone: "(212) 555-0177", address_line1: "350 W 43rd St", city: "New York", state: "NY", postal_code: "10036" }).select("id").single()).data!.id;
  petId = (await db.from("pets").insert({ name: `Samba${uniq()}`, species: "dog", breed: "Miniature Dachshund", sex: "female", spayed_neutered: false, color: "Chocolate dapple" }).select("id").single()).data!.id;
  await db.from("pet_owners").insert({ pet_id: petId, owner_id: ownerId });
  const products = (await db.from("vaccine_products").select("id, name, is_rabies, vaccine_type").eq("species", "dog").eq("active", true)).data!;
  dhpp = products.find((p) => p.vaccine_type.startsWith("DHPP"))!;
  rabies = products.find((p) => p.is_rabies && p.name.includes("3"))!;
  // An earlier puppy dose given by PetVax, which should show on the new certificate.
  await db.from("vaccinations").insert({ pet_id: petId, owner_id: ownerId, product_id: dhpp.id, vaccine_name: dhpp.name, vaccine_type: "DHPP", manufacturer: "TestPharma", lot_number: "DH-OLD", administered_on: "2026-10-10", administered_by: tech.userId, next_due_on: "2026-10-31" });
});

afterAll(async () => {
  await adminClient().from("app_settings").update({ supervising_vet_name: null, supervising_vet_license: null }).eq("id", true);
});

describe("one-step certificate", () => {
  it("reads the form: only ticked vaccines, fields keyed by product", () => {
    const input = parseQuickForm("pet-1", form({
      administered_on: "2026-11-15", vaccine: ["a", "a"], notes: "  Healthy  ",
      "a.manufacturer": "Zoetis", "a.lot_number": "L1", "a.duration_months": "36", "a.next_due_on": "bad-date", "b.lot_number": "ignored",
    }));
    expect(input.vaccines).toHaveLength(1);
    expect(input.vaccines[0]).toMatchObject({ productId: "a", manufacturer: "Zoetis", lot_number: "L1", duration_months: 36, next_due_on: null });
    expect(input.notes).toBe("Healthy");
  });

  it("saves the visit and vaccines and issues the signed certificate in one go", async () => {
    const r = await createQuickCertificate(tech.client, {
      ...parseQuickForm(petId, form({
        administered_on: today, vaccine: dhpp.id, notes: "Healthy puppy exam. T 101.5 F.",
        [`${dhpp.id}.manufacturer`]: "TestPharma", [`${dhpp.id}.lot_number`]: "DH-NEW", [`${dhpp.id}.route`]: "SC", [`${dhpp.id}.duration_months`]: "12",
      })), issuerId: tech.userId, siteUrl: "https://office.example.test",
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    const cert = (await tech.client.from("certificates").select("pdf_path, encounter_id, certificate_vaccinations(vaccinations(lot_number, next_due_on, administered_by))").eq("id", r.certificateId).single()).data!;
    expect(cert.encounter_id).toBe(r.encounterId);
    const v = cert.certificate_vaccinations[0].vaccinations!;
    expect(v).toMatchObject({ lot_number: "DH-NEW", administered_by: tech.userId });
    expect(v.next_due_on! > today).toBe(true);
    const pdf = new Uint8Array(await (await tech.client.storage.from("certificates").download(cert.pdf_path!)).data!.arrayBuffer());
    const t = pdfToText(pdf).replace(/\s+/g, " ");
    for (const s of ["DH-NEW", "Earlier doses: Oct 10, 2026", "Healthy puppy exam. T 101.5 F.", "LVT, VTS"]) expect(t).toContain(s);
    expect(t).not.toContain("Rabies Vaccination Certificate");
  });

  it("blocks rabies without a licensed veterinarian, and saves nothing", async () => {
    const before = await Promise.all([count("vaccinations"), count("encounters"), count("certificates")]);
    const input = parseQuickForm(petId, form({
      administered_on: today, vaccine: rabies.id,
      [`${rabies.id}.manufacturer`]: "Zoetis", [`${rabies.id}.serial_number`]: "RB-1", [`${rabies.id}.duration_months`]: "36", [`${rabies.id}.rabies_tag_number`]: "218240",
    }));
    const r = await createQuickCertificate(tech.client, { ...input, issuerId: tech.userId, siteUrl: "http://x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).toMatch(/licensed veterinarian/);
    expect(await Promise.all([count("vaccinations"), count("encounters"), count("certificates")])).toEqual(before);

    // Once an admin records the supervising veterinarian, the same certificate goes through and names them.
    await adminClient().from("app_settings").update({ supervising_vet_name: "Dr. Test Supervisor", supervising_vet_license: "SUP-010", supervising_vet_license_state: "NY" }).eq("id", true);
    const ok = await createQuickCertificate(tech.client, { ...input, issuerId: tech.userId, siteUrl: "http://x" });
    expect(ok.ok, JSON.stringify(ok)).toBe(true);
    if (!ok.ok) return;
    const path = (await tech.client.from("certificates").select("pdf_path").eq("id", ok.certificateId).single()).data!.pdf_path!;
    const t = pdfToText(new Uint8Array(await (await tech.client.storage.from("certificates").download(path)).data!.arrayBuffer())).replace(/\s+/g, " ");
    for (const s of ["Rabies Vaccination Certificate", "Supervising veterinarian: Dr. Test Supervisor, NY License No. SUP-010", "NY license no. SUP-010", "Duration 3 years", "Rabies tag no. 218240"]) expect(t).toContain(s);
  });

  it("checks required details before saving anything", async () => {
    const before = await count("vaccinations");
    const r = await createQuickCertificate(tech.client, {
      ...parseQuickForm(petId, form({ administered_on: "2099-01-01", vaccine: [dhpp.id, rabies.id] })), issuerId: tech.userId, siteUrl: "http://x",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const m = r.problems.join(" ");
      for (const s of [/future/, /manufacturer/, /lot or serial/, /1 year or 3 years/]) expect(m).toMatch(s);
    }
    expect(await count("vaccinations")).toBe(before);
    expect((await createQuickCertificate(tech.client, { ...parseQuickForm(petId, form({ administered_on: today })), issuerId: tech.userId, siteUrl: "http://x" })).ok).toBe(false);
  });

  it("rejects expired vaccine vials before creating any records", async () => {
    const before = await Promise.all([count("vaccinations"), count("encounters"), count("certificates")]);
    const result = await createQuickCertificate(tech.client, {
      ...parseQuickForm(petId, form({
        administered_on: today, vaccine: dhpp.id,
        [`${dhpp.id}.manufacturer`]: "TestPharma",
        [`${dhpp.id}.lot_number`]: "EXPIRED-001",
        [`${dhpp.id}.lot_expiration`]: "2020-01-01",
      })), issuerId: tech.userId, siteUrl: "https://office.example.test",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(" ")).toMatch(/expired/i);
    expect(await Promise.all([count("vaccinations"), count("encounters"), count("certificates")])).toEqual(before);
  });

  it("rejects impossible calendar dates in the certificate form", () => {
    const parsed = parseQuickForm(petId, form({
      administered_on: "2026-02-30", vaccine: dhpp.id,
      [`${dhpp.id}.lot_expiration`]: "2026-13-01",
      [`${dhpp.id}.next_due_on`]: "2027-02-29",
    }));
    expect(parsed.administeredOn).toBe("");
    expect(parsed.vaccines[0].lot_expiration).toBeNull();
    expect(parsed.vaccines[0].next_due_on).toBeNull();
  });

  it("does not let front-desk staff sign", async () => {
    const r = await createQuickCertificate(staff.client, {
      ...parseQuickForm(petId, form({ administered_on: today, vaccine: dhpp.id, [`${dhpp.id}.manufacturer`]: "X", [`${dhpp.id}.lot_number`]: "Y" })),
      issuerId: staff.userId, siteUrl: "http://x",
    });
    expect(r.ok).toBe(false);
  });
});
