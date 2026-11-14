import test from "node:test";
import assert from "node:assert/strict";
import { validateIntake } from "../src/lib/intake-rules.mjs";

const base = () => ({
  token: "A".repeat(42),
  submissionKey: "123e4567-e89b-42d3-a456-426614174000",
  owner: { fullName: "Jane Owner", email: "jane@example.com", phone: "2125551234", address: "42 West 42nd Street, New York" },
  pets: [{ name: "Scout", species: "dog", breed: "Beagle" }],
  signedName: "Jane Owner",
  accepted: true
});

test("valid new-client consent and pet intake", () => {
  const r = validateIntake(base());
  assert.equal(r.valid, true);
  assert.equal(r.payload.owner.email, "jane@example.com");
});
test("reject consent without affirmation or matching signature", () => {
  const b = base(); b.accepted = false; b.signedName = "Impostor";
  assert.equal(validateIntake(b).valid, false);
});
test("reject missing pets or invalid species", () => {
  const b = base(); b.pets = [{ name: "Scout", species: "chameleon" }];
  assert.equal(validateIntake(b).valid, false);
});
test("cap number of pets; disallow empty", () => {
  const b = base(); b.pets = [];
  assert.equal(validateIntake(b).valid, false);
});
test("normalize email and trim fields", () => {
  const b = base(); b.owner.email = "  JANE@EXAMPLE.COM ";
  assert.equal(validateIntake(b).payload.owner.email, "jane@example.com");
});
test("reject tampered idempotency key and token", () => {
  const b = base(); b.token = "../bad"; b.submissionKey = "not-a-uuid";
  assert.equal(validateIntake(b).valid, false);
});
