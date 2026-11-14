import { DEFAULT_FORMS, JOTFORM_CONSENT_TEXT } from "@/lib/forms/defaults";
import type { Answers, FormSchema } from "@/lib/forms/schema";

/** Shape of one submission from the Jotform API (GET /form/{id}/submissions). */
export interface JotformAnswer {
  name?: string;
  text?: string;
  type?: string;
  answer?: unknown;
  prettyFormat?: string;
}
export interface JotformSubmission {
  id: string;
  form_id: string;
  created_at: string;
  status?: string;
  answers: Record<string, JotformAnswer>;
}

export interface MappedSubmission {
  externalId: string;
  formId: string;
  kind: "intake" | "consent" | "unknown";
  schema: FormSchema;
  answers: Answers;
  submittedAt: string;
  signatureUrl: string | null;
  signedDate: string | null;
  consentText: string | null;
  consentConfirmed: boolean;
  signerName: string;
  fileUrls: { questionId: string; label: string; url: string }[];
  warnings: string[];
}

/** The two live PetVax Jotforms. Other form ids are detected by their questions. */
export const KNOWN_FORMS: Record<string, "intake" | "consent"> = {
  "262500538572052": "intake",
  "262500542108042": "consent",
};

const norm = (s: string | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function asText(a: JotformAnswer | undefined): string | null {
  if (!a || a.answer === undefined || a.answer === null || a.answer === "") return null;
  if (typeof a.answer === "string") return a.answer.trim() || null;
  if (typeof a.answer === "number") return String(a.answer);
  if (a.prettyFormat) return a.prettyFormat.trim() || null;
  return null;
}

function asList(a: JotformAnswer | undefined): string[] {
  if (!a || a.answer == null) return [];
  if (Array.isArray(a.answer)) return a.answer.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof a.answer === "object") {
    // Checkbox with "Other": { "0": "Rabies", "other": "Giardia" }
    return Object.entries(a.answer as Record<string, unknown>).map(([k, v]) => (k === "other" ? `Other: ${v}` : String(v))).filter((s) => s && s !== "Other: ");
  }
  return String(a.answer).split(/\r?\n|,\s*/).map((s) => s.trim()).filter(Boolean);
}

/** Jotform dates arrive as {month, day, year} or as "MM-DD-YYYY" / "YYYY-MM-DD" text. */
export function jotformDate(a: JotformAnswer | undefined): string | null {
  if (!a || a.answer == null) return null;
  if (typeof a.answer === "object" && !Array.isArray(a.answer)) {
    const o = a.answer as Record<string, string>;
    if (o.year && o.month && o.day) return `${o.year.padStart(4, "0")}-${o.month.padStart(2, "0")}-${o.day.padStart(2, "0")}`;
    if (o.datetime) return o.datetime.slice(0, 10);
  }
  const s = asText(a);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

/**
 * Jotform's created_at is "YYYY-MM-DD HH:MM:SS" in the account's timezone (PetVax: New York).
 * Converts to an ISO UTC timestamp.
 */
export function jotformTimestamp(createdAt: string, offsetFor: (date: string, time: string) => Date): string {
  const m = createdAt.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?/);
  if (!m) return new Date(createdAt).toISOString();
  const d = offsetFor(m[1], m[2]);
  return new Date(d.getTime() + Number(m[3] ?? 0) * 1000).toISOString();
}

function yesNo(a: JotformAnswer | undefined): string | null {
  const s = asText(a)?.toLowerCase();
  return s === "yes" ? "yes" : s === "no" ? "no" : null;
}

/** Map a raw Jotform submission onto the matching PetVax form's answers. Unknown questions are kept in `_jotform`. */
export function mapJotformSubmission(sub: JotformSubmission, toUtc: (date: string, time: string) => Date): MappedSubmission {
  const byLabel = new Map<string, JotformAnswer & { qid: string }>();
  for (const [qid, a] of Object.entries(sub.answers ?? {})) {
    if (a?.text) byLabel.set(norm(a.text), { ...a, qid });
  }
  const get = (...labels: string[]) => {
    for (const l of labels) {
      const hit = byLabel.get(norm(l));
      if (hit) return hit;
    }
    // Fall back to "label starts with" for slightly reworded questions.
    for (const l of labels) {
      for (const [k, v] of byLabel) if (k.startsWith(norm(l))) return v;
    }
    return undefined;
  };
  const warnings: string[] = [];
  const known: "intake" | "consent" | undefined = KNOWN_FORMS[sub.form_id];
  let kind: MappedSubmission["kind"] = known ?? "unknown";
  if (!known) {
    kind = get("Consent Statement", "I have read and understand the above consent statement") ? "consent" : "intake";
    warnings.push(`Form ${sub.form_id} is not one of the known PetVax forms; detected as ${kind} from its questions.`);
  }
  const def = DEFAULT_FORMS.find((f) => f.slug === (kind === "consent" ? "vaccination-consent" : "client-intake"))!;

  // ---- Owner
  const fullName = get("Owner Full Name")?.answer as { first?: string; last?: string } | string | undefined;
  let first = "", last = "";
  if (fullName && typeof fullName === "object") { first = (fullName.first ?? "").trim(); last = (fullName.last ?? "").trim(); }
  else if (typeof fullName === "string") { const parts = fullName.trim().split(/\s+/); first = parts[0] ?? ""; last = parts.slice(1).join(" "); }
  if (!first) warnings.push("Owner name is missing.");

  const addrObj = get("Address")?.answer as Record<string, string> | undefined;
  const address = typeof addrObj === "object" && addrObj ? addrObj : null;
  const phoneAns = get("Primary Phone Number", "Phone Number")?.answer as { full?: string } | string | undefined;
  const phone = typeof phoneAns === "object" ? phoneAns?.full ?? null : phoneAns ?? null;
  const phone2Ans = get("Secondary Phone Number")?.answer as { full?: string } | string | undefined;
  const phone2 = typeof phone2Ans === "object" ? phone2Ans?.full ?? null : phone2Ans ?? null;

  const answers: Answers = {
    first_name: first,
    last_name: last,
    address_line1: address?.addr_line1 ?? asText(get("Street Address")),
    address_line2: asText(get("Apartment/Unit")) ?? address?.addr_line2 ?? null,
    city: address?.city ?? asText(get("City")),
    state: (address?.state ?? asText(get("State")))?.toUpperCase().replace(/^NEW YORK$/, "NY") ?? null,
    postal_code: address?.postal ?? asText(get("ZIP Code", "Postal Code")),
    phone: phone || null,
    phone_secondary: phone2 || null,
    email: asText(get("Email Address", "Email")),
  };

  // ---- Pet (the PetVax Jotforms take one pet per submission)
  const reactionList = asList(get("Has your pet had any prior vaccine reactions", "Prior vaccine reactions"));
  const hadReaction = yesNo(get("Has your pet ever had a reaction to vaccinations?")) ?? (reactionList.length ? "yes" : kind === "consent" ? "no" : null);
  const pet: Record<string, string | string[] | null> = {
    pet_name: asText(get("Pet Name")),
    species: asText(get("Species")),
    breed: asText(get("Breed")),
    color: asText(get("Color")),
    sex: asText(get("Sex")),
    spayed_neutered: yesNo(get("Spayed/Neutered")),
    date_of_birth: jotformDate(get("Date of Birth")),
    age: asText(get("Age")),
    weight_lb: asText(get("Weight (lb)", "Weight (lbs)", "Weight")),
    microchip: asText(get("Microchip Number")),
    vaccine_history: asText(get("Previous Vaccine History")),
    requested_vaccines: asList(get("Which vaccines are you interested in?")),
    had_reaction: hadReaction,
    reaction_types: reactionList,
    reaction_details: asText(get("If yes, please explain", "If you selected 'Other' or wish to explain, please provide details")),
    medical_conditions: asText(get("Current medical conditions")),
    current_symptoms: asText(get("Current symptoms")),
    medications: asText(get("Current medications, vitamins, supplements, or preventatives")),
    diet: asText(get("Diet and feeding information")),
    concerns: asText(get("Other concerns for the appointment")),
    boarding: yesNo(get("My pet visits a boarding kennel")),
    grooming: yesNo(get("My pet is groomed")),
    travel: yesNo(get("My pet travels outside the immediate area")),
    wildlife: yesNo(get("My pet has exposure to wildlife")),
  };
  if (!pet.pet_name) warnings.push("Pet name is missing.");
  if (!pet.species) warnings.push("Species is missing.");
  for (const k of Object.keys(pet)) if (pet[k] === null || (Array.isArray(pet[k]) && !(pet[k] as string[]).length)) delete pet[k];
  answers.pets = [pet as Record<string, string | string[]>];

  const certify = get("I certify that the information provided is accurate and true to the best of my knowledge");
  if (certify) answers.certify = asList(certify).length > 0;

  // ---- Consent & signature
  const sig = Object.values(sub.answers ?? {}).find((a) => a?.type === "control_signature" || norm(a?.text) === "owner signature");
  const signatureUrl = typeof sig?.answer === "string" && /^https?:\/\//.test(sig.answer) ? sig.answer : null;
  const consentQ = get("I have read and understand the above consent statement");
  const consentConfirmed = consentQ ? asList(consentQ).length > 0 : false;
  // The consent wording lives in a static text field; use what the form showed, falling back to the known Jotform text.
  const consentStatic = asText(get("Consent Statement"));
  const consentText = kind === "consent" ? (consentStatic && consentStatic.length > 40 ? consentStatic : JOTFORM_CONSENT_TEXT) : null;
  if (kind === "consent" && !signatureUrl) warnings.push("Consent form has no signature image.");
  if (kind === "consent" && !consentConfirmed) warnings.push("Consent confirmation box was not ticked.");

  const fileUrls: MappedSubmission["fileUrls"] = [];
  for (const [qid, a] of Object.entries(sub.answers ?? {})) {
    if (a?.type !== "control_fileupload") continue;
    for (const url of asList(a)) if (/^https?:\/\//.test(url)) fileUrls.push({ questionId: qid, label: a.text ?? "Attachment", url });
  }

  // Keep every original answer with the submission.
  (answers as Record<string, unknown>)._jotform = { form_id: sub.form_id, submission_id: sub.id, created_at: sub.created_at, answers: sub.answers };

  return {
    externalId: sub.id,
    formId: sub.form_id,
    kind,
    schema: def.schema,
    answers,
    submittedAt: jotformTimestamp(sub.created_at, toUtc),
    signatureUrl,
    signedDate: jotformDate(get("Date Signed")),
    consentText,
    consentConfirmed,
    signerName: `${first} ${last}`.trim() || "Unknown",
    fileUrls,
    warnings,
  };
}
