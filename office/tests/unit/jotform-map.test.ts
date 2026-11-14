import { describe, expect, it } from "vitest";
import { jotformDate, mapJotformSubmission } from "@/lib/jotform/map";
import { nyLocalToUtc } from "@/lib/time";
import { JOTFORM_CONSENT_TEXT } from "@/lib/forms/defaults";
import { jotformFixtures } from "../fixtures/jotform";

const [intake, consent, unsigned] = jotformFixtures("u");

describe("Jotform mapping", () => {
  it("maps the intake form by question text", () => {
    const m = mapJotformSubmission(intake, nyLocalToUtc);
    expect(m.kind).toBe("intake");
    expect(m.answers).toMatchObject({ first_name: "Riley", last_name: "Mossu", address_line1: "12 Bank St", address_line2: "4R", state: "NY", phone: "(917) 555-0142" });
    expect((m.answers.pets as Record<string, unknown>[])[0]).toMatchObject({ pet_name: "Biscuit", species: "Dog", date_of_birth: "2021-03-09", requested_vaccines: ["Rabies", "DHPP/DAPP"], had_reaction: "no" });
    expect(m.fileUrls).toHaveLength(1);
    expect(m.signatureUrl).toMatch(/sig\.png$/);
    expect(m.consentText).toBeNull(); // intake certification is not a vaccination consent
    expect(m.submittedAt).toBe("2026-11-02T14:15:00.000Z"); // 9:15 New York (EST)
    expect((m.answers as Record<string, unknown>)._jotform).toBeTruthy(); // original kept
  });

  it("maps the consent form, including address objects, 'Other' reactions and the consent text", () => {
    const m = mapJotformSubmission(consent, nyLocalToUtc);
    expect(m.kind).toBe("consent");
    expect(m.answers).toMatchObject({ address_line1: "12 Bank St", city: "New York", state: "NY", postal_code: "10014" });
    expect((m.answers.pets as Record<string, unknown>[])[0]).toMatchObject({ boarding: "yes", wildlife: "no", reaction_types: ["Hives", "Other: Sleepy for a day"], had_reaction: "yes" });
    expect(m.consentText).toBe(JOTFORM_CONSENT_TEXT);
    expect(m.consentConfirmed).toBe(true);
    expect(m.signedDate).toBe("2026-11-03");
  });

  it("flags a consent without a signature", () => {
    expect(mapJotformSubmission(unsigned, nyLocalToUtc).warnings).toContain("Consent form has no signature image.");
  });

  it("parses Jotform date formats", () => {
    expect(jotformDate({ answer: "06-15-2020" })).toBe("2020-06-15");
    expect(jotformDate({ answer: { datetime: "2020-06-15 00:00:00" } })).toBe("2020-06-15");
    expect(jotformDate({ answer: "" })).toBeNull();
  });
});
