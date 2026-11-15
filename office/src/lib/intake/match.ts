import { normalizeEmail, normalizePhone, type OwnerData, type PetData } from "@/lib/forms/extract";

export interface CandidateOwner {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  phone_secondary?: string | null;
  merged_into_id?: string | null;
  pets: CandidatePet[];
}

export interface CandidatePet {
  id: string;
  name: string;
  species: string;
  microchip: string | null;
}

export type OwnerMatch =
  | { kind: "existing"; ownerId: string; reason: string }
  | { kind: "new"; reason: string }
  | { kind: "new_needs_review"; candidateIds: string[]; reason: string };

export type PetMatch =
  | { kind: "existing"; petId: string; reason: string }
  | { kind: "new"; reason: string }
  | { kind: "new_needs_review"; candidateIds: string[]; reason: string };

const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Decide whether a submission belongs to an existing client.
 * Rules (conservative — when unsure, create a new record and flag it for a person to review):
 *   1. Same email AND (same phone OR same last name)                    -> existing client
 *   2. Same phone AND same first AND last name                         -> existing client
 *   3. Anything weaker (email only, phone only, name only), or more
 *      than one client meeting rule 1/2                                 -> new client, flagged for review
 * Records are never merged automatically on names alone.
 */
export function matchOwner(incoming: OwnerData, candidates: CandidateOwner[]): OwnerMatch {
  const email = normalizeEmail(incoming.email);
  const phone = normalizePhone(incoming.phone);
  const active = candidates.filter((c) => !c.merged_into_id);

  const strong: { id: string; reason: string }[] = [];
  const weak: { id: string; reason: string }[] = [];
  for (const c of active) {
    const emailEq = !!email && normalizeEmail(c.email) === email;
    const cPhones = [normalizePhone(c.phone), normalizePhone(c.phone_secondary)].filter(Boolean);
    const phoneEq = !!phone && cPhones.includes(phone);
    const lastEq = same(c.last_name, incoming.last_name);
    const firstEq = same(c.first_name, incoming.first_name);

    if (emailEq && (phoneEq || lastEq)) strong.push({ id: c.id, reason: phoneEq ? "same email and phone" : "same email and last name" });
    else if (phoneEq && firstEq && lastEq) strong.push({ id: c.id, reason: "same phone and full name" });
    else if (emailEq) weak.push({ id: c.id, reason: "same email, different name and phone" });
    else if (phoneEq) weak.push({ id: c.id, reason: "same phone, different name/email" });
    else if (firstEq && lastEq) weak.push({ id: c.id, reason: "same name, different contact details" });
  }

  if (strong.length === 1) return { kind: "existing", ownerId: strong[0].id, reason: strong[0].reason };
  if (strong.length > 1) {
    return { kind: "new_needs_review", candidateIds: strong.map((s) => s.id), reason: "more than one existing client matches" };
  }
  if (weak.length) {
    return { kind: "new_needs_review", candidateIds: weak.map((w) => w.id), reason: weak.map((w) => w.reason).join("; ") };
  }
  return { kind: "new", reason: "no existing client with this email or phone" };
}

/** Match a submitted pet against the pets of an already-matched owner. */
export function matchPet(incoming: PetData, ownerPets: CandidatePet[]): PetMatch {
  const chip = incoming.microchip?.replace(/\s+/g, "");
  if (chip) {
    const byChip = ownerPets.filter((p) => p.microchip?.replace(/\s+/g, "") === chip);
    if (byChip.length === 1) return { kind: "existing", petId: byChip[0].id, reason: "same microchip" };
  }
  const byName = ownerPets.filter((p) => same(p.name, incoming.name) && p.species === incoming.species);
  if (byName.length === 1) {
    const other = byName[0];
    if (chip && other.microchip && other.microchip.replace(/\s+/g, "") !== chip) {
      return { kind: "new_needs_review", candidateIds: [other.id], reason: "same name but a different microchip" };
    }
    return { kind: "existing", petId: other.id, reason: "same name and species for this client" };
  }
  if (byName.length > 1) return { kind: "new_needs_review", candidateIds: byName.map((p) => p.id), reason: "several pets with this name" };
  return { kind: "new", reason: "new pet for this client" };
}

/** Values from a returning client's form replace stored values only when they actually answered. */
export function mergeUpdates(existing: Record<string, unknown>, incoming: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const k of keys) {
    const v = incoming[k];
    const empty = v === null || v === undefined || v === "" || (typeof v === "object" && !Array.isArray(v) && v !== null && Object.keys(v).length === 0);
    if (!empty && JSON.stringify(v) !== JSON.stringify(existing[k])) update[k] = v;
  }
  return update;
}
