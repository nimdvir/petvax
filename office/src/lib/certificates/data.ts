import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { ageFromDob, todayInNy, utcToNyParts } from "@/lib/time";

type Db = SupabaseClient<Database>;

export interface CertificateVaccine {
  id: string;
  vaccine_name: string;
  vaccine_type: string;
  is_rabies: boolean;
  manufacturer: string | null;
  lot_number: string | null;
  serial_number: string | null;
  lot_expiration: string | null;
  administered_on: string;
  next_due_on: string | null;
  route: string | null;
  site: string | null;
  duration_months: number | null;
  rabies_tag_number: string | null;
  administered_by_name: string | null;
  administered_by_credentials: string | null;
  administered_by_license: string | null;
}

export interface CertificateSnapshot {
  certificate_number: string;
  verification_code: string;
  issued_at: string;
  issued_on: string;
  business: {
    name: string; tagline: string | null; phone: string | null; email: string | null; website: string | null;
    address: string | null; footer: string | null; accent_color: string;
  };
  owner: { name: string; address: string | null; phone: string | null; email: string | null };
  pet: {
    name: string; species: string; breed: string | null; sex: string; spayed_neutered: boolean | null; color: string | null;
    date_of_birth: string | null; age: string | null; weight_lb: number | null; microchip: string | null;
  };
  vaccinations: CertificateVaccine[];
  signer: { name: string; credentials: string; license_number: string; license_state: string | null; signature_path: string | null };
  verify_url: string;
}

export interface Readiness {
  blocking: string[];
  warnings: string[];
}

export interface CertificateDraft {
  petId: string;
  ownerId: string;
  encounterId: string | null;
  snapshotWithoutNumber: Omit<CertificateSnapshot, "certificate_number" | "verification_code" | "issued_at" | "issued_on" | "verify_url">;
  readiness: Readiness;
}

const speciesLabel = (s: string, other: string | null) => (s === "other" ? other || "Other" : s[0].toUpperCase() + s.slice(1));
const sexLabel = (s: string) => (s === "unknown" ? "Not recorded" : s[0].toUpperCase() + s.slice(1));

/**
 * Gather everything a certificate needs from saved records and list anything missing.
 * Nothing is filled in by guesswork: missing optional details print as "Not recorded",
 * and missing required details block issuing.
 */
export async function buildCertificateDraft(db: Db, opts: { vaccinationIds: string[]; issuerId: string }): Promise<CertificateDraft> {
  const blocking: string[] = [];
  const warnings: string[] = [];
  if (!opts.vaccinationIds.length) throw new Error("Choose at least one vaccination");

  const vax = await db.from("vaccinations")
    .select("*, administered_by_profile:staff_profiles!vaccinations_administered_by_fkey(full_name, credentials, license_number, role)")
    .in("id", opts.vaccinationIds);
  if (vax.error) throw new Error(vax.error.message);
  const rows = vax.data ?? [];
  if (rows.length !== opts.vaccinationIds.length) blocking.push("Some selected vaccinations could not be found.");
  const petIds = [...new Set(rows.map((r) => r.pet_id))];
  if (petIds.length !== 1) throw new Error("All vaccinations on a certificate must belong to the same pet");
  const petId = petIds[0];

  const [petRes, settingsRes, issuerRes] = await Promise.all([
    db.from("pets").select("*, pet_owners(is_primary, owners(*))").eq("id", petId).single(),
    db.from("app_settings").select("*").eq("id", true).single(),
    db.from("staff_profiles").select("*").eq("user_id", opts.issuerId).single(),
  ]);
  if (petRes.error) throw new Error(petRes.error.message);
  if (settingsRes.error) throw new Error(settingsRes.error.message);
  const pet = petRes.data;
  const settings = settingsRes.data;
  const issuer = issuerRes.data;
  const primary = pet.pet_owners.find((po) => po.is_primary)?.owners ?? pet.pet_owners[0]?.owners;
  if (!primary) throw new Error("This pet has no owner on file");

  // ---- Issuer (signing veterinarian) ----
  if (!issuer || !issuer.active) blocking.push("Your staff profile is missing or inactive.");
  else {
    if (issuer.role !== "vet") blocking.push("Only a veterinarian can sign and issue certificates.");
    if (!issuer.license_number) blocking.push("Add your veterinary license number in Settings > Staff before issuing.");
    if (!issuer.credentials) blocking.push("Add your professional credentials (e.g. DVM) in Settings > Staff before issuing.");
    if (!issuer.signature_path) warnings.push("No signature image on file; the certificate will carry your electronic signature statement only.");
  }

  // ---- Vaccinations ----
  const vaccines: CertificateVaccine[] = [];
  for (const v of rows.sort((a, b) => a.administered_on.localeCompare(b.administered_on) || a.vaccine_name.localeCompare(b.vaccine_name))) {
    const label = `${v.vaccine_name} (${v.administered_on})`;
    if (v.status !== "active") blocking.push(`${label} has been ${v.status} and cannot be certified.`);
    if (v.administered_elsewhere) blocking.push(`${label} was given elsewhere; PetVax can only certify vaccines it administered.`);
    if (!v.manufacturer) blocking.push(`${label}: manufacturer is missing.`);
    if (!v.lot_number && !v.serial_number) blocking.push(`${label}: lot or serial number is missing.`);
    if (!v.lot_expiration) warnings.push(`${label}: product expiration date is not recorded.`);
    if (!v.next_due_on) warnings.push(`${label}: next due date is not set.`);
    if (!v.route) warnings.push(`${label}: route is not recorded.`);
    const giver = v.administered_by_profile;
    if (v.is_rabies) {
      if (!v.duration_months) blocking.push(`${label}: rabies vaccine duration (1 or 3 years) is required.`);
      if (!giver || giver.role !== "vet" || !giver.license_number) {
        blocking.push(`${label}: a rabies certificate must show a licensed veterinarian as the administering professional.`);
      }
      if (!v.rabies_tag_number) warnings.push(`${label}: rabies tag number is not recorded.`);
      if (!v.serial_number && !v.lot_number) blocking.push(`${label}: rabies vaccine serial/lot number is required.`);
    }
    if (!giver && !v.administered_by_name) blocking.push(`${label}: administering professional is missing.`);
    vaccines.push({
      id: v.id, vaccine_name: v.vaccine_name, vaccine_type: v.vaccine_type, is_rabies: v.is_rabies, manufacturer: v.manufacturer,
      lot_number: v.lot_number, serial_number: v.serial_number, lot_expiration: v.lot_expiration, administered_on: v.administered_on,
      next_due_on: v.next_due_on, route: v.route, site: v.site, duration_months: v.duration_months, rabies_tag_number: v.rabies_tag_number,
      administered_by_name: giver?.full_name ?? v.administered_by_name, administered_by_credentials: giver?.credentials ?? null,
      administered_by_license: giver?.license_number ?? null,
    });
  }

  // ---- Pet / owner ----
  if (!pet.breed) warnings.push("Breed is not recorded.");
  if (pet.sex === "unknown") warnings.push("Sex is not recorded.");
  if (!pet.date_of_birth && pet.estimated_age_years == null) warnings.push("Date of birth / age is not recorded.");
  if (!primary.address_line1) warnings.push("Owner address is not recorded.");
  if (pet.deceased) blocking.push("This pet is marked as deceased.");

  const address = [primary.address_line1, primary.address_line2, [primary.city, primary.state].filter(Boolean).join(", "), primary.postal_code]
    .filter(Boolean).join(", ");
  const today = todayInNy();
  const age = ageFromDob(pet.date_of_birth, today)
    ?? (pet.estimated_age_years != null ? `About ${pet.estimated_age_years} year${Number(pet.estimated_age_years) === 1 ? "" : "s"} (estimated)` : null);

  return {
    petId,
    ownerId: primary.id,
    encounterId: rows.every((r) => r.encounter_id === rows[0]?.encounter_id) ? (rows[0]?.encounter_id ?? null) : null,
    readiness: { blocking, warnings },
    snapshotWithoutNumber: {
      business: {
        name: settings.business_name, tagline: settings.tagline, phone: settings.phone, email: settings.email,
        website: settings.website, address: settings.address, footer: settings.certificate_footer, accent_color: settings.certificate_accent_color,
      },
      owner: { name: `${primary.first_name} ${primary.last_name}`.trim(), address: address || null, phone: primary.phone, email: primary.email },
      pet: {
        name: pet.name, species: speciesLabel(pet.species, pet.species_other), breed: pet.breed, sex: sexLabel(pet.sex),
        spayed_neutered: pet.spayed_neutered, color: pet.color, date_of_birth: pet.date_of_birth, age,
        weight_lb: pet.weight_lb, microchip: pet.microchip,
      },
      vaccinations: vaccines,
      signer: {
        name: issuer?.full_name ?? "", credentials: issuer?.credentials ?? "", license_number: issuer?.license_number ?? "",
        license_state: issuer?.license_state ?? null, signature_path: issuer?.signature_path ?? null,
      },
    },
  };
}

export function finalizeSnapshot(draft: CertificateDraft, number: string, verificationCode: string, issuedAt: Date, siteUrl: string): CertificateSnapshot {
  return {
    ...draft.snapshotWithoutNumber,
    certificate_number: number,
    verification_code: verificationCode,
    issued_at: issuedAt.toISOString(),
    issued_on: utcToNyParts(issuedAt).date,
    verify_url: `${siteUrl.replace(/\/$/, "")}/verify/${verificationCode}`,
  };
}
