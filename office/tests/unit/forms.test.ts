import { describe, expect, it } from "vitest";
import { DEFAULT_FORMS } from "@/lib/forms/defaults";
import { formSchemaSchema, validateAnswers, validateSignature } from "@/lib/forms/schema";
import { extractIntake } from "@/lib/forms/extract";

const newVisit = DEFAULT_FORMS.find((f) => f.slug === "new-visit")!;

const goodAnswers = {
  first_name: "Dana", last_name: "Rivera", address_line1: "500 W 43rd St", address_line2: "Apt 12B", city: "New York",
  state: "ny", postal_code: "10036", phone: "(212) 555-0100", email: "Dana.Rivera@Example.com", preferred_contact: "Text",
  certify: true,
  pets: [
    { pet_name: "Rex", species: "Dog", breed: "Beagle", color: "Tricolor", sex: "Male", spayed_neutered: "yes",
      date_of_birth: "2021-03-04", weight_lb: "24.5", requested_vaccines: ["Rabies", "DHPP/DAPP"], had_reaction: "no",
      boarding: "yes", reaction_types: ["Hives"] },
    { pet_name: "Miso", species: "Cat", breed: "DSH", color: "Orange", sex: "Female", spayed_neutered: "no",
      age: "3", weight_lb: "9", requested_vaccines: ["FVRCP", "Other: Something"], had_reaction: "yes",
      reaction_types: ["Swelling"], reaction_details: "Mild swelling 2023" },
  ],
};

describe("default forms", () => {
  it.each(DEFAULT_FORMS)("$slug is a valid form definition", (f) => {
    const r = formSchemaSchema.safeParse(f.schema);
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it("keeps the Jotform consent wording verbatim", () => {
    expect(newVisit.consentText).toContain("I authorize PetVax veterinary personnel to administer vaccines deemed appropriate for my pet.");
  });
});

describe("validateAnswers", () => {
  it("accepts a complete two-pet submission", () => {
    const r = validateAnswers(newVisit.schema, goodAnswers);
    expect(r.ok, JSON.stringify(!r.ok && r.errors)).toBe(true);
  });

  it("reports missing required fields per pet", () => {
    const bad = { ...goodAnswers, email: "nope", pets: [{ ...goodAnswers.pets[0], pet_name: "" }] };
    const r = validateAnswers(newVisit.schema, bad);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.email).toMatch(/valid email/);
      expect(r.errors["pets.0.pet_name"]).toMatch(/required/);
    }
  });

  it("drops conditional answers that are hidden", () => {
    const r = validateAnswers(newVisit.schema, goodAnswers);
    if (!r.ok) throw new Error("expected ok");
    const pets = r.answers.pets as Record<string, unknown>[];
    expect(pets[0].reaction_types).toBeUndefined(); // had_reaction = no
    expect(pets[1].reaction_types).toEqual(["Swelling"]);
  });

  it("requires at least one pet", () => {
    const r = validateAnswers(newVisit.schema, { ...goodAnswers, pets: [] });
    expect(r.ok).toBe(false);
  });

  it("rejects options that are not on the form", () => {
    const r = validateAnswers(newVisit.schema, { ...goodAnswers, pets: [{ ...goodAnswers.pets[0], species: "Dragon" }] });
    expect(r.ok).toBe(false);
  });
});

describe("validateSignature", () => {
  const png = "data:image/png;base64," + "A".repeat(400);
  it("requires name, relationship, both agreements and a drawn signature", () => {
    expect(validateSignature(newVisit.schema, {}).ok).toBe(false);
    expect(validateSignature(newVisit.schema, { signerName: "Dana Rivera", relationship: "Owner", agreed: true, esignAgreed: true, dataUrl: png }).ok).toBe(true);
    expect(validateSignature(newVisit.schema, { signerName: "Dana Rivera", relationship: "Neighbor", agreed: true, esignAgreed: true, dataUrl: png }).ok).toBe(false);
  });
});

describe("extractIntake", () => {
  it("maps answers onto owner, pets and the visit request", () => {
    const r = validateAnswers(newVisit.schema, { ...goodAnswers, preferred_date: "2026-12-01", preferred_time: "Morning (9-12)" });
    if (!r.ok) throw new Error("expected ok");
    const x = extractIntake(newVisit.schema, r.answers);
    expect(x.owner).toMatchObject({ first_name: "Dana", last_name: "Rivera", email: "dana.rivera@example.com", phone: "(212) 555-0100", state: "NY", preferred_contact: "text" });
    expect(x.pets).toHaveLength(2);
    expect(x.pets[0]).toMatchObject({ name: "Rex", species: "dog", sex: "male", spayed_neutered: true, weight_lb: 24.5, date_of_birth: "2021-03-04", lifestyle: { boarding: true }, prior_reactions: null });
    expect(x.pets[1]).toMatchObject({ name: "Miso", species: "cat", estimated_age_years: 3, prior_reactions: "Swelling — Mild swelling 2023" });
    expect(x.appointment).toMatchObject({ preferred_date: "2026-12-01", preferred_time: "Morning (9-12)" });
  });
});
