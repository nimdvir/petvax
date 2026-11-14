import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_FORMS } from "@/lib/forms/defaults";
import { validateAnswers, type Answers } from "@/lib/forms/schema";
import { processSubmission } from "@/lib/intake/process";
import { adminClient, sql, uniq } from "./helpers";

const form = DEFAULT_FORMS.find((f) => f.slug === "new-visit")!;
// 1x1 transparent PNG, padded so it passes the size check
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" + "";
const sig = (name: string) => ({ signerName: name, relationship: "Owner", agreed: true, esignAgreed: true, dataUrl: PNG });

function answers(over: Record<string, unknown> = {}, pets?: Record<string, unknown>[]): Answers {
  const base = {
    first_name: "Dana", last_name: `Rivera${uniq()}`, address_line1: "500 W 43rd St", city: "New York", state: "NY",
    postal_code: "10036", phone: `(212) 555-${String(Math.floor(1000 + Math.random() * 8999))}`, email: `dana-${uniq()}@example.test`,
    certify: true, preferred_date: "2026-12-01", preferred_time: "Morning (9-12)",
    pets: pets ?? [
      { pet_name: "Rex", species: "Dog", breed: "Beagle", color: "Tricolor", sex: "Male", spayed_neutered: "yes", weight_lb: "24", requested_vaccines: ["Rabies"], had_reaction: "no" },
      { pet_name: "Miso", species: "Cat", breed: "DSH", color: "Orange", sex: "Female", spayed_neutered: "no", weight_lb: "9", requested_vaccines: ["FVRCP"], had_reaction: "yes", reaction_types: ["Hives"] },
    ],
    ...over,
  };
  const r = validateAnswers(form.schema, base);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.answers;
}

let versionId: string;
beforeAll(async () => {
  const db = adminClient();
  const t = await db.from("form_templates").insert({ slug: `test-${uniq()}`, kind: form.kind, title: `Integration test form ${uniq()}` }).select("id").single();
  const v = await db.from("form_versions").insert({ template_id: t.data!.id, version: 1, status: "published", schema: form.schema as never, consent_text: form.consentText, published_at: new Date().toISOString() }).select("id").single();
  expect(v.error).toBeNull();
  versionId = v.data!.id;
});

const submit = (a: Answers, s = sig("Dana Rivera")) =>
  processSubmission(adminClient(), { formVersionId: versionId, formLinkId: null, schema: form.schema, consentText: form.consentText, answers: a, signature: s, ipAddress: "203.0.113.5", userAgent: "vitest iPhone" });

describe("new client registration with consent", () => {
  it("creates the owner, both pets, a signed consent per pet and a visit request", async () => {
    const a = answers();
    const r = await submit(a);
    expect(r.status, r.error).toBe("processed");
    expect(r.petIds).toHaveLength(2);
    expect(r.consentIds).toHaveLength(2);
    const db = adminClient();
    const owner = (await db.from("owners").select("*, pet_owners(pets(name, species, lifestyle))").eq("id", r.ownerId!).single()).data!;
    expect(owner.email).toBe((a.email as string).toLowerCase());
    expect(owner.pet_owners.map((p) => p.pets?.name).sort()).toEqual(["Miso", "Rex"]);

    const consents = (await db.from("signed_consents").select("*").in("id", r.consentIds)).data!;
    for (const c of consents) {
      expect(c.consent_text).toBe(form.consentText);
      expect(c.consent_text_sha256).toBe(createHash("sha256").update(form.consentText!).digest("hex"));
      expect(c.signer_name).toBe("Dana Rivera");
      expect(c.ip_address).toBe("203.0.113.5");
      expect(c.record_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(c.form_version_id).toBe(versionId);
      const file = await db.storage.from("consent-signatures").download(c.signature_path!);
      const bytes = Buffer.from(await file.data!.arrayBuffer());
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(c.signature_sha256);
    }
    const appt = (await db.from("appointments").select("*, appointment_pets(requested_vaccines)").eq("id", r.appointmentId!).single()).data!;
    expect(appt.status).toBe("requested");
    expect(appt.client_notes).toContain("Preferred date: 2026-12-01");
    expect(appt.appointment_pets).toHaveLength(2);
  });

  it("links each consent to the previous one (tamper-evident chain)", async () => {
    await submit(answers());
    const rows = await sql<{ prev_hash: string | null; record_hash: string }>("select prev_hash, record_hash from public.signed_consents order by created_at, id");
    for (let i = 1; i < rows.length; i++) expect(rows[i].prev_hash).toBe(rows[i - 1].record_hash);
  });

  it("never allows a signed consent to be edited or deleted", async () => {
    const r = await submit(answers());
    const db = adminClient(); // even the privileged server key cannot change it
    const upd = await db.from("signed_consents").update({ signer_name: "Someone Else" }).eq("id", r.consentIds[0]);
    expect(upd.error?.message).toMatch(/immutable/);
    const del = await db.from("signed_consents").delete().eq("id", r.consentIds[0]);
    expect(del.error?.message).toMatch(/immutable/);
  });
});

describe("returning clients and duplicate prevention", () => {
  it("updates the existing client and pet instead of duplicating", async () => {
    const first = answers();
    const r1 = await submit(first);
    const again = answers({ email: first.email, phone: first.phone, last_name: first.last_name, phone_secondary: "(917) 555-0111" },
      [{ pet_name: "rex", species: "Dog", breed: "Beagle mix", color: "Tricolor", sex: "Male", spayed_neutered: "yes", weight_lb: "26", requested_vaccines: ["DHPP/DAPP"], had_reaction: "no" },
       { pet_name: "Bean", species: "Dog", breed: "Pug", color: "Fawn", sex: "Female", spayed_neutered: "yes", weight_lb: "15", requested_vaccines: ["Rabies"], had_reaction: "no" }]);
    const r2 = await submit(again);
    expect(r2.status).toBe("processed");
    expect(r2.ownerId).toBe(r1.ownerId);
    expect(r2.petIds[0]).toBe(r1.petIds[0]); // Rex matched
    expect(r1.petIds).not.toContain(r2.petIds[1]); // Bean is new
    const db = adminClient();
    const owners = (await db.from("owners").select("id").eq("email_normalized", (first.email as string).toLowerCase())).data!;
    expect(owners).toHaveLength(1);
    const owner = (await db.from("owners").select("phone_secondary").eq("id", r1.ownerId!).single()).data!;
    expect(owner.phone_secondary).toBe("(917) 555-0111");
    const rex = (await db.from("pets").select("breed, weight_lb").eq("id", r1.petIds[0]).single()).data!;
    expect(rex).toMatchObject({ breed: "Beagle mix", weight_lb: 26 });
    const petCount = (await db.from("pet_owners").select("pet_id").eq("owner_id", r1.ownerId!)).data!;
    expect(petCount).toHaveLength(3);
  });

  it("a later form that doesn't ask a question never erases what's on file", async () => {
    const first = answers();
    const r1 = await submit(first);
    const consentForm = DEFAULT_FORMS.find((f) => f.slug === "vaccination-consent")!;
    const later = validateAnswers(consentForm.schema, {
      first_name: first.first_name, last_name: first.last_name, address_line1: "500 W 43rd St", city: "New York", state: "NY",
      postal_code: "10036", phone: first.phone, email: first.email,
      pets: [{ pet_name: "Rex", species: "Dog", had_reaction: "no" }],
    });
    if (!later.ok) throw new Error(JSON.stringify(later.errors));
    const r2 = await processSubmission(adminClient(), { formVersionId: null, formLinkId: null, schema: consentForm.schema, consentText: consentForm.consentText, answers: later.answers, signature: sig("Dana Rivera") });
    expect(r2.petIds[0]).toBe(r1.petIds[0]);
    const rex = (await adminClient().from("pets").select("sex, breed, color, spayed_neutered").eq("id", r1.petIds[0]).single()).data!;
    expect(rex).toMatchObject({ sex: "male", breed: "Beagle", color: "Tricolor", spayed_neutered: true });
  });

  it("flags a same-name client with different contact details for review instead of merging", async () => {
    const first = answers();
    const r1 = await submit(first);
    const r2 = await submit(answers({ first_name: first.first_name, last_name: first.last_name }));
    expect(r2.status).toBe("needs_review");
    expect(r2.ownerId).not.toBe(r1.ownerId);
    const o = (await adminClient().from("owners").select("review_status, possible_duplicate_of").eq("id", r2.ownerId!).single()).data!;
    expect(o.review_status).toBe("needs_review");
    expect(o.possible_duplicate_of).toContain(r1.ownerId);
  });

  it("a double-tapped submit (same submission key) is saved once", async () => {
    const a = answers();
    const key = crypto.randomUUID();
    const send = () => processSubmission(adminClient(), { formVersionId: versionId, formLinkId: null, schema: form.schema, consentText: form.consentText, answers: a, signature: sig("Dana Rivera"), idempotencyKey: key });
    const [x, y] = await Promise.all([send(), send()]);
    const z = await send();
    expect([x.status, y.status].sort()).toEqual(["duplicate", "processed"]);
    expect(z.status).toBe("duplicate");
    const subs = await adminClient().from("intake_submissions").select("id").eq("idempotency_key", key);
    expect(subs.data).toHaveLength(1);
    const consents = await adminClient().from("signed_consents").select("id").eq("submission_id", subs.data![0].id);
    expect(consents.data).toHaveLength(2); // one per pet, not doubled
  });

  it("keeps the raw submission even when processing fails", async () => {
    const a = answers();
    const r = await processSubmission(adminClient(), { formVersionId: versionId, formLinkId: null, schema: form.schema, consentText: form.consentText, answers: a, signature: { ...sig("X"), dataUrl: "data:image/png;base64," } });
    expect(r.status).toBe("error");
    const s = (await adminClient().from("intake_submissions").select("status, answers, processing_error").eq("id", r.submissionId).single()).data!;
    expect(s.status).toBe("error");
    expect((s.answers as Record<string, unknown>).email).toBe(a.email);
  });
});
