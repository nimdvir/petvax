import type { AnswerGroup, AnswerValue, Answers, FormSchema, FormSection } from "./schema";
import { repeatSection } from "./schema";

export interface OwnerData {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  phone_secondary: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  preferred_contact: "email" | "phone" | "text" | null;
}

export interface PetData {
  name: string;
  species: "dog" | "cat" | "other";
  species_other: string | null;
  breed: string | null;
  color: string | null;
  /** null when the form didn't ask or the client didn't answer — never overwrites a known value. */
  sex: "male" | "female" | null;
  spayed_neutered: boolean | null;
  date_of_birth: string | null;
  estimated_age_years: number | null;
  weight_lb: number | null;
  microchip: string | null;
  allergies: string | null;
  prior_reactions: string | null;
  medical_conditions: string | null;
  medications: string | null;
  diet: string | null;
  vaccine_history_notes: string | null;
  lifestyle: Record<string, boolean>;
  requested_vaccines: string[];
  /** Visit-specific details (symptoms, concerns). Kept on the submission and shown to the clinician. */
  visit_notes: string | null;
}

export interface AppointmentRequest {
  preferred_date: string | null;
  preferred_time: string | null;
  notes: string | null;
}

export interface ExtractedIntake {
  owner: OwnerData;
  pets: PetData[];
  appointment: AppointmentRequest | null;
}

const str = (v: AnswerValue | undefined): string | null => {
  if (v === null || v === undefined || typeof v === "boolean") return null;
  const s = Array.isArray(v) ? v.join(", ") : v.trim();
  return s ? s : null;
};
const num = (v: AnswerValue | undefined): number | null => {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const yesNo = (v: AnswerValue | undefined): boolean | null => {
  const s = str(v)?.toLowerCase();
  if (s === "yes" || s === "true") return true;
  if (s === "no" || s === "false") return false;
  return null;
};

export function normalizeEmail(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase();
  return e ? e : null;
}

/** Normalize to 10-digit US numbers where possible: "+1 (212) 555-0100" -> "2125550100". */
export function normalizePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function formatPhone(phone: string | null | undefined): string | null {
  const d = normalizePhone(phone);
  if (!d) return null;
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : phone!.trim();
}

function byTarget(fields: FormSection["fields"], group: AnswerGroup): Map<string, AnswerValue> {
  const map = new Map<string, AnswerValue>();
  for (const f of fields) if (f.mapsTo && f.id in group) map.set(f.mapsTo, group[f.id]);
  return map;
}

function species(v: AnswerValue | undefined): { species: PetData["species"]; other: string | null } {
  const s = str(v);
  const lower = s?.toLowerCase() ?? "";
  if (lower === "dog" || lower === "canine") return { species: "dog", other: null };
  if (lower === "cat" || lower === "feline") return { species: "cat", other: null };
  return { species: "other", other: s };
}

function sex(v: AnswerValue | undefined): PetData["sex"] {
  const s = str(v)?.toLowerCase() ?? "";
  if (s.startsWith("m")) return "male";
  if (s.startsWith("f")) return "female";
  return null;
}

function contact(v: AnswerValue | undefined): OwnerData["preferred_contact"] {
  const s = str(v)?.toLowerCase() ?? "";
  if (s.includes("text") || s.includes("sms")) return "text";
  if (s.includes("phone") || s.includes("call")) return "phone";
  if (s.includes("mail")) return "email";
  return null;
}

/** Turn validated answers into the records they describe. Unmapped questions stay on the submission only. */
export function extractIntake(schema: FormSchema, answers: Answers): ExtractedIntake {
  const topFields = schema.sections.filter((s) => !s.repeat).flatMap((s) => s.fields);
  const top = byTarget(topFields, answers as AnswerGroup);
  const name = str(top.get("owner.first_name")) ?? "";
  const lastName = str(top.get("owner.last_name"));
  const owner: OwnerData = {
    first_name: name,
    last_name: lastName ?? "",
    email: normalizeEmail(str(top.get("owner.email"))),
    phone: formatPhone(str(top.get("owner.phone"))),
    phone_secondary: formatPhone(str(top.get("owner.phone_secondary"))),
    address_line1: str(top.get("owner.address_line1")),
    address_line2: str(top.get("owner.address_line2")),
    city: str(top.get("owner.city")),
    state: str(top.get("owner.state"))?.toUpperCase() ?? null,
    postal_code: str(top.get("owner.postal_code")),
    preferred_contact: contact(top.get("owner.preferred_contact")),
  };

  const petSection = repeatSection(schema);
  const groups = petSection ? ((answers[petSection.id] as AnswerGroup[] | undefined) ?? []) : [];
  const pets: PetData[] = groups.map((group) => {
    const p = byTarget(petSection!.fields, group);
    const sp = species(p.get("pet.species"));
    const reactions = [str(p.get("pet.prior_reactions")), str(p.get("pet.prior_reaction_details"))].filter(Boolean).join(" — ");
    const lifestyle: Record<string, boolean> = {};
    for (const key of ["boarding", "grooming", "travel", "wildlife"]) {
      const v = yesNo(p.get(`pet.lifestyle.${key}`));
      if (v !== null) lifestyle[key] = v;
    }
    const requested = p.get("pet.requested_vaccines");
    const visitNotes = [
      str(p.get("pet.current_symptoms")) && `Current symptoms: ${str(p.get("pet.current_symptoms"))}`,
      str(p.get("pet.concerns")) && `Concerns: ${str(p.get("pet.concerns"))}`,
    ].filter(Boolean).join("\n");
    const dob = str(p.get("pet.date_of_birth"));
    return {
      name: str(p.get("pet.name")) ?? "",
      species: sp.species,
      species_other: sp.other,
      breed: str(p.get("pet.breed")),
      color: str(p.get("pet.color")),
      sex: sex(p.get("pet.sex")),
      spayed_neutered: yesNo(p.get("pet.spayed_neutered")),
      date_of_birth: dob && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : null,
      estimated_age_years: num(p.get("pet.estimated_age_years")),
      weight_lb: num(p.get("pet.weight_lb")),
      microchip: str(p.get("pet.microchip"))?.replace(/\s+/g, "") ?? null,
      allergies: str(p.get("pet.allergies")),
      prior_reactions: reactions || null,
      medical_conditions: str(p.get("pet.medical_conditions")),
      medications: str(p.get("pet.medications")),
      diet: str(p.get("pet.diet")),
      vaccine_history_notes: str(p.get("pet.vaccine_history_notes")),
      lifestyle,
      requested_vaccines: Array.isArray(requested) ? requested : requested ? [String(requested)] : [],
      visit_notes: visitNotes || null,
    };
  });

  const appt: AppointmentRequest = {
    preferred_date: str(top.get("appointment.preferred_date")),
    preferred_time: str(top.get("appointment.preferred_time")),
    notes: str(top.get("appointment.notes")),
  };
  const hasAppt = appt.preferred_date || appt.preferred_time || appt.notes;
  return { owner, pets, appointment: hasAppt ? appt : null };
}
