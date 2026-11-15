import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { addMonths, todayInNy } from "@/lib/time";
import { signerProblems } from "./data";
import { issueCertificate } from "./issue";

type Db = SupabaseClient<Database>;

export interface QuickVaccine {
  productId: string;
  manufacturer: string | null;
  lot_number: string | null;
  serial_number: string | null;
  lot_expiration: string | null;
  route: string | null;
  site: string | null;
  duration_months: number | null;
  next_due_on: string | null;
  rabies_tag_number: string | null;
}

export interface QuickCertificateInput {
  petId: string;
  administeredOn: string;
  vaccines: QuickVaccine[];
  notes: string | null;
}

export type QuickResult =
  | { ok: true; certificateId: string; certificateNumber: string; encounterId: string }
  | { ok: false; problems: string[]; encounterId?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);
/** Verify calendar dates (e.g. reject Feb 30) before a clinical record can be created. */
const date = (v: FormDataEntryValue | null) => {
  const s = str(v);
  if (!s || !DATE.test(s)) return null;
  const [year, month, day] = s.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day ? s : null;
};
const int = (v: FormDataEntryValue | null) => { const s = str(v); return s && /^\d+$/.test(s) ? Number(s) : null; };

/** Read the one-page certificate form. Each ticked vaccine's fields are named "<productId>.<field>". */
export function parseQuickForm(petId: string, fd: FormData): QuickCertificateInput {
  const ids = [...new Set(fd.getAll("vaccine").map(String))];
  return {
    petId,
    administeredOn: date(fd.get("administered_on")) ?? "",
    notes: str(fd.get("notes")),
    vaccines: ids.map((id) => {
      const g = (k: string) => fd.get(`${id}.${k}`);
      return {
        productId: id, manufacturer: str(g("manufacturer")), lot_number: str(g("lot_number")), serial_number: str(g("serial_number")),
        lot_expiration: date(g("lot_expiration")), route: str(g("route")), site: str(g("site")), duration_months: int(g("duration_months")),
        next_due_on: date(g("next_due_on")), rabies_tag_number: str(g("rabies_tag_number")),
      };
    }),
  };
}

/**
 * The whole certificate in one step: record a visit for today, save the vaccines given,
 * and issue the signed certificate. Everything is checked first, so a blocked certificate
 * leaves nothing half-saved. `db` must be the signed-in clinician's own client (RLS applies).
 */
export async function createQuickCertificate(db: Db, input: QuickCertificateInput & { issuerId: string; siteUrl: string }): Promise<QuickResult> {
  const problems: string[] = [];
  if (!input.vaccines.length) return { ok: false, problems: ["Tick at least one vaccine."] };
  if (!input.administeredOn) problems.push("Enter the date the vaccines were given.");
  else if (input.administeredOn > todayInNy()) problems.push("The date given can't be in the future.");

  const [petRes, productsRes, issuerRes, settingsRes] = await Promise.all([
    db.from("pets").select("id, name, deceased, pet_owners(is_primary, owner_id)").eq("id", input.petId).maybeSingle(),
    db.from("vaccine_products").select("*").in("id", input.vaccines.map((v) => v.productId)),
    db.from("staff_profiles").select("role, active, credentials, license_number").eq("user_id", input.issuerId).maybeSingle(),
    db.from("app_settings").select("supervising_vet_name, supervising_vet_license").eq("id", true).maybeSingle(),
  ]);
  const pet = petRes.data;
  if (!pet) return { ok: false, problems: ["Pet not found."] };
  if (pet.deceased) problems.push(`${pet.name} is marked as deceased.`);
  const ownerId = pet.pet_owners.find((o) => o.is_primary)?.owner_id ?? pet.pet_owners[0]?.owner_id;
  if (!ownerId) problems.push(`${pet.name} has no owner on file.`);
  const products = new Map((productsRes.data ?? []).map((p) => [p.id, p]));
  const hasRabies = input.vaccines.some((v) => products.get(v.productId)?.is_rabies);
  problems.push(...signerProblems(issuerRes.data, settingsRes.data, hasRabies));

  for (const v of input.vaccines) {
    const p = products.get(v.productId);
    if (!p || !p.active) { problems.push("One of the chosen vaccines is no longer in the vaccine list."); continue; }
    if (!v.manufacturer) problems.push(`${p.name}: enter the manufacturer.`);
    if (!v.lot_number && !v.serial_number) problems.push(`${p.name}: enter the lot or serial number.`);
    if (v.lot_expiration && input.administeredOn && v.lot_expiration < input.administeredOn)
      problems.push(`${p.name}: this vial expired before the vaccination date. Please check the lot details.`);
    if (p.is_rabies && !v.duration_months) problems.push(`${p.name}: choose 1 year or 3 years.`);
    const due = v.next_due_on ?? (v.duration_months && input.administeredOn ? addMonths(input.administeredOn, v.duration_months) : null);
    if (due && input.administeredOn && due <= input.administeredOn) problems.push(`${p.name}: next due date must be after the date given.`);
  }
  if (problems.length) return { ok: false, problems };

  const enc = await db.from("encounters").insert({
    pet_id: pet.id, owner_id: ownerId!, clinician_id: input.issuerId, encounter_date: input.administeredOn, created_by: input.issuerId,
  }).select("id").single();
  if (enc.error) return { ok: false, problems: [`Could not save the visit: ${enc.error.message}`] };
  const encounterId = enc.data.id;

  const vax = await db.from("vaccinations").insert(input.vaccines.map((v) => {
    const p = products.get(v.productId)!;
    const duration = v.duration_months ?? p.default_interval_months ?? null;
    return {
      encounter_id: encounterId, pet_id: pet.id, owner_id: ownerId!, product_id: p.id, vaccine_name: p.name, vaccine_type: p.vaccine_type,
      is_rabies: p.is_rabies, manufacturer: v.manufacturer, lot_number: v.lot_number, serial_number: v.serial_number,
      lot_expiration: v.lot_expiration, administered_on: input.administeredOn, route: v.route, site: v.site, duration_months: duration,
      next_due_on: v.next_due_on ?? (duration ? addMonths(input.administeredOn, duration) : null),
      rabies_tag_number: p.is_rabies ? v.rabies_tag_number : null, administered_by: input.issuerId, source: "staff" as const, created_by: input.issuerId,
    };
  })).select("id");
  if (vax.error) return { ok: false, problems: [`Could not save the vaccines: ${vax.error.message}`], encounterId };

  const issued = await issueCertificate(db, { vaccinationIds: vax.data.map((r) => r.id), issuerId: input.issuerId, siteUrl: input.siteUrl, notes: input.notes });
  if (!issued.ok) return { ok: false, problems: issued.error ? [issued.error] : issued.readiness.blocking, encounterId };
  return { ok: true, certificateId: issued.certificateId, certificateNumber: issued.certificateNumber, encounterId };
}
