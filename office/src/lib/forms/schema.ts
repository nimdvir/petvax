import { z } from "zod";

/**
 * Form definitions are stored as JSON in `form_versions.schema`, so staff can change
 * questions without code changes. Every published version is immutable; submissions
 * and consents point at the exact version the client saw.
 */

export const FIELD_TYPES = [
  "text", "textarea", "email", "phone", "number", "date",
  "select", "radio", "checkboxes", "yesno", "agree", "state", "info",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** Where an answer is saved in the client/pet record. Unmapped answers are kept on the submission. */
export const OWNER_TARGETS = [
  "owner.first_name", "owner.last_name", "owner.email", "owner.phone", "owner.phone_secondary",
  "owner.address_line1", "owner.address_line2", "owner.city", "owner.state", "owner.postal_code",
  "owner.preferred_contact",
] as const;
export const PET_TARGETS = [
  "pet.name", "pet.species", "pet.breed", "pet.color", "pet.sex", "pet.spayed_neutered",
  "pet.date_of_birth", "pet.estimated_age_years", "pet.weight_lb", "pet.microchip",
  "pet.allergies", "pet.prior_reactions", "pet.prior_reaction_details", "pet.medical_conditions",
  "pet.medications", "pet.diet", "pet.vaccine_history_notes", "pet.requested_vaccines",
  "pet.current_symptoms", "pet.concerns",
  "pet.lifestyle.boarding", "pet.lifestyle.grooming", "pet.lifestyle.travel", "pet.lifestyle.wildlife",
] as const;
export const APPOINTMENT_TARGETS = ["appointment.preferred_date", "appointment.preferred_time", "appointment.notes"] as const;
export const MAP_TARGETS = [...OWNER_TARGETS, ...PET_TARGETS, ...APPOINTMENT_TARGETS] as const;
export type MapTarget = (typeof MAP_TARGETS)[number];

export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA",
  "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR",
  "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

const idSchema = z.string().regex(/^[a-z][a-z0-9_]{0,48}$/, "Use lowercase letters, numbers and underscores");

export const fieldSchema = z.object({
  id: idSchema,
  label: z.string().min(1).max(500),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().optional(),
  help: z.string().max(2000).optional(),
  placeholder: z.string().max(200).optional(),
  options: z.array(z.string().min(1).max(200)).max(100).optional(),
  allowOther: z.boolean().optional(),
  mapsTo: z.enum(MAP_TARGETS).optional(),
  showIf: z.object({ field: idSchema, equals: z.string() }).optional(),
});
export type FormField = z.infer<typeof fieldSchema>;

export const sectionSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  /** A repeating section lets the client add several pets in one submission. */
  repeat: z
    .object({
      itemLabel: z.string().min(1).max(60),
      addLabel: z.string().min(1).max(60),
      min: z.number().int().min(1).max(10),
      max: z.number().int().min(1).max(20),
    })
    .optional(),
  fields: z.array(fieldSchema).max(80),
});
export type FormSection = z.infer<typeof sectionSchema>;

export const formSchemaSchema = z
  .object({
    sections: z.array(sectionSchema).min(1).max(30),
    consent: z
      .object({
        enabled: z.boolean(),
        heading: z.string().max(200).optional(),
        relationshipOptions: z.array(z.string().min(1).max(60)).min(1).max(10),
        agreeLabel: z.string().min(1).max(300),
        esignLabel: z.string().min(1).max(600),
      })
      .optional(),
    submitLabel: z.string().max(60).optional(),
    confirmationMessage: z.string().max(2000).optional(),
  })
  .superRefine((form, ctx) => {
    const ids = new Set<string>();
    const repeatIds = form.sections.filter((s) => s.repeat).map((s) => s.id);
    if (repeatIds.length > 1) ctx.addIssue({ code: "custom", message: "Only one repeating (pets) section is allowed" });
    for (const section of form.sections) {
      if (ids.has(section.id)) ctx.addIssue({ code: "custom", message: `Duplicate id "${section.id}"` });
      ids.add(section.id);
      for (const field of section.fields) {
        if (ids.has(field.id)) ctx.addIssue({ code: "custom", message: `Duplicate field id "${field.id}"` });
        ids.add(field.id);
        if (["select", "radio", "checkboxes"].includes(field.type) && !field.options?.length) {
          ctx.addIssue({ code: "custom", message: `"${field.label}" needs at least one option` });
        }
        if (field.mapsTo?.startsWith("pet.") && !section.repeat) {
          ctx.addIssue({ code: "custom", message: `"${field.label}" saves to the pet record, so it must be in the pets section` });
        }
        if (field.mapsTo && !field.mapsTo.startsWith("pet.") && section.repeat) {
          ctx.addIssue({ code: "custom", message: `"${field.label}" saves to the owner/appointment, so it cannot be in the pets section` });
        }
      }
    }
    const mapped = form.sections.flatMap((s) => s.fields.map((f) => f.mapsTo)).filter(Boolean);
    const dupes = mapped.filter((m, i) => mapped.indexOf(m) !== i);
    if (dupes.length) ctx.addIssue({ code: "custom", message: `Each record field can only be used once: ${[...new Set(dupes)].join(", ")}` });
    for (const required of ["owner.first_name", "owner.email", "pet.name", "pet.species"] as const) {
      if (!mapped.includes(required)) {
        ctx.addIssue({ code: "custom", message: `The form must include a question saved to ${required}` });
      }
    }
  });
export type FormSchema = z.infer<typeof formSchemaSchema>;

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------
export type AnswerValue = string | string[] | boolean | null;
export type AnswerGroup = Record<string, AnswerValue>;
/** Top-level answers keyed by field id; the repeating section's answers are an array under its section id. */
export type Answers = Record<string, AnswerValue | AnswerGroup[]>;

export interface SignatureInput {
  signerName: string;
  relationship: string;
  agreed: boolean;
  esignAgreed: boolean;
  /** PNG data URL captured from the signature pad. */
  dataUrl: string;
}

export function repeatSection(schema: FormSchema): FormSection | undefined {
  return schema.sections.find((s) => s.repeat);
}

export function isVisible(field: FormField, scope: AnswerGroup): boolean {
  if (!field.showIf) return true;
  const v = scope[field.showIf.field];
  if (Array.isArray(v)) return v.includes(field.showIf.equals);
  return String(v ?? "").toLowerCase() === field.showIf.equals.toLowerCase();
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateField(field: FormField, raw: unknown): { value: AnswerValue; error?: string } {
  if (field.type === "info") return { value: null };
  const empty = raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0) || raw === false;

  if (empty) {
    if (field.required) return { value: null, error: field.type === "agree" ? "Please confirm to continue" : "This field is required" };
    return { value: field.type === "checkboxes" ? [] : null };
  }

  switch (field.type) {
    case "agree":
      return raw === true || raw === "true" ? { value: true } : { value: null, error: "Please confirm to continue" };
    case "checkboxes": {
      const arr = (Array.isArray(raw) ? raw : [raw]).map((v) => String(v).trim()).filter(Boolean).slice(0, 50);
      const bad = arr.filter((v) => !field.options?.includes(v) && !(field.allowOther && v.startsWith("Other: ")));
      return bad.length ? { value: arr, error: "Choose from the listed options" } : { value: arr };
    }
    default: {
      if (typeof raw !== "string") return { value: null, error: "Invalid answer" };
      const v = raw.trim().slice(0, field.type === "textarea" ? 5000 : 500);
      if (field.type === "email" && !EMAIL_RE.test(v)) return { value: v, error: "Enter a valid email address" };
      if (field.type === "phone" && v.replace(/\D/g, "").length < 10) return { value: v, error: "Enter a 10-digit phone number" };
      if (field.type === "number" && !Number.isFinite(Number(v))) return { value: v, error: "Enter a number" };
      if (field.type === "date") {
        if (!DATE_RE.test(v) || Number.isNaN(Date.parse(v))) return { value: v, error: "Enter a valid date" };
      }
      if (field.type === "state" && !US_STATES.includes(v.toUpperCase())) return { value: v, error: "Choose a state" };
      if (field.type === "yesno" && !["yes", "no"].includes(v.toLowerCase())) return { value: v, error: "Choose yes or no" };
      if ((field.type === "select" || field.type === "radio") && !field.options?.includes(v)
          && !(field.allowOther && v.startsWith("Other: "))) {
        return { value: v, error: "Choose one of the options" };
      }
      return { value: field.type === "state" ? v.toUpperCase() : field.type === "yesno" ? v.toLowerCase() : v };
    }
  }
}

function validateGroup(fields: FormField[], input: Record<string, unknown>, prefix: string, errors: Record<string, string>) {
  const clean: AnswerGroup = {};
  // First pass without visibility so showIf can see raw values.
  const raw: AnswerGroup = {};
  for (const f of fields) raw[f.id] = (input[f.id] ?? null) as AnswerValue;
  for (const f of fields) {
    if (f.type === "info" || !isVisible(f, raw)) continue;
    const { value, error } = validateField(f, input[f.id]);
    clean[f.id] = value;
    if (error) errors[prefix + f.id] = error;
  }
  return clean;
}

export function validateAnswers(schema: FormSchema, input: unknown):
  { ok: true; answers: Answers } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const answers: Answers = {};
  for (const section of schema.sections) {
    if (section.repeat) {
      const items = Array.isArray(src[section.id]) ? (src[section.id] as unknown[]) : [];
      if (items.length < section.repeat.min) errors[section.id] = `Add at least ${section.repeat.min} ${section.repeat.itemLabel.toLowerCase()}`;
      if (items.length > section.repeat.max) errors[section.id] = `At most ${section.repeat.max} allowed`;
      answers[section.id] = items.slice(0, section.repeat.max).map((item, i) =>
        validateGroup(section.fields, (item && typeof item === "object" ? item : {}) as Record<string, unknown>, `${section.id}.${i}.`, errors));
    } else {
      Object.assign(answers, validateGroup(section.fields, src, "", errors));
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, answers };
}

export function validateSignature(schema: FormSchema, sig: unknown): { ok: true; signature: SignatureInput | null } | { ok: false; errors: Record<string, string> } {
  if (!schema.consent?.enabled) return { ok: true, signature: null };
  const s = (sig ?? {}) as Partial<SignatureInput>;
  const errors: Record<string, string> = {};
  if (!s.signerName || s.signerName.trim().length < 2) errors["signature.signerName"] = "Type your full name";
  if (!s.relationship || !schema.consent.relationshipOptions.includes(s.relationship)) errors["signature.relationship"] = "Choose your relationship to the pet";
  if (s.agreed !== true) errors["signature.agreed"] = "Please confirm you have read the consent";
  if (s.esignAgreed !== true) errors["signature.esignAgreed"] = "Please agree to sign electronically";
  if (!s.dataUrl || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s.dataUrl) || s.dataUrl.length < 200) {
    errors["signature.dataUrl"] = "Please sign in the box";
  } else if (s.dataUrl.length > 1_400_000) {
    errors["signature.dataUrl"] = "Signature image is too large";
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    signature: {
      signerName: s.signerName!.trim().slice(0, 200),
      relationship: s.relationship!,
      agreed: true,
      esignAgreed: true,
      dataUrl: s.dataUrl!,
    },
  };
}
