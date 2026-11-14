import { describe, expect, it } from "vitest";
import { matchOwner, matchPet, mergeUpdates, type CandidateOwner } from "@/lib/intake/match";
import type { OwnerData, PetData } from "@/lib/forms/extract";

const incoming: OwnerData = {
  first_name: "Dana", last_name: "Rivera", email: "dana@example.com", phone: "(212) 555-0100", phone_secondary: null,
  address_line1: null, address_line2: null, city: null, state: null, postal_code: null, preferred_contact: null,
};
const owner = (o: Partial<CandidateOwner>): CandidateOwner => ({ id: "o1", first_name: "Dana", last_name: "Rivera", email: "dana@example.com", phone: "212-555-0100", pets: [], ...o });

describe("matchOwner", () => {
  it("matches on email + phone", () => {
    expect(matchOwner(incoming, [owner({})])).toMatchObject({ kind: "existing", ownerId: "o1" });
  });
  it("matches on email + last name when the phone changed", () => {
    expect(matchOwner(incoming, [owner({ phone: "917-000-0000" })])).toMatchObject({ kind: "existing" });
  });
  it("matches on phone + full name when the email changed", () => {
    expect(matchOwner(incoming, [owner({ email: "old@example.com" })])).toMatchObject({ kind: "existing" });
  });
  it("never merges on name alone", () => {
    const r = matchOwner(incoming, [owner({ email: "other@example.com", phone: "917-000-0000" })]);
    expect(r).toMatchObject({ kind: "new_needs_review", candidateIds: ["o1"] });
  });
  it("flags a shared email with a different person", () => {
    const r = matchOwner(incoming, [owner({ first_name: "Sam", last_name: "Lee", phone: null })]);
    expect(r.kind).toBe("new_needs_review");
  });
  it("flags when two clients both match strongly", () => {
    const r = matchOwner(incoming, [owner({ id: "a" }), owner({ id: "b" })]);
    expect(r).toMatchObject({ kind: "new_needs_review", candidateIds: ["a", "b"] });
  });
  it("ignores merged records", () => {
    expect(matchOwner(incoming, [owner({ merged_into_id: "x" })])).toMatchObject({ kind: "new" });
  });
  it("treats a +1 country code as the same phone", () => {
    expect(matchOwner({ ...incoming, email: null }, [owner({ phone: "+1 212 555 0100", email: null })])).toMatchObject({ kind: "existing" });
  });
});

describe("matchPet", () => {
  const pet = { name: "Rex", species: "dog", microchip: null } as unknown as PetData;
  it("matches same name and species", () => {
    expect(matchPet(pet, [{ id: "p1", name: "rex", species: "dog", microchip: null }])).toMatchObject({ kind: "existing", petId: "p1" });
  });
  it("does not match a different species", () => {
    expect(matchPet(pet, [{ id: "p1", name: "Rex", species: "cat", microchip: null }]).kind).toBe("new");
  });
  it("prefers microchip", () => {
    expect(matchPet({ ...pet, name: "Rexy", microchip: "985 112" } as PetData, [{ id: "p1", name: "Rex", species: "dog", microchip: "985112" }])).toMatchObject({ kind: "existing" });
  });
  it("flags same name with a conflicting microchip", () => {
    expect(matchPet({ ...pet, microchip: "1" } as PetData, [{ id: "p1", name: "Rex", species: "dog", microchip: "2" }]).kind).toBe("new_needs_review");
  });
});

describe("mergeUpdates", () => {
  it("only overwrites with answered values", () => {
    expect(mergeUpdates({ city: "New York", phone: "1" }, { city: "", phone: "2" }, ["city", "phone"])).toEqual({ phone: "2" });
  });
});
