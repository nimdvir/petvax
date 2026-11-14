import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { extractIntake, normalizePhone, type PetData } from "@/lib/forms/extract";
import type { Answers, FormSchema, SignatureInput } from "@/lib/forms/schema";
import { sha256Hex } from "@/lib/tokens";
import { matchOwner, matchPet, mergeUpdates, type CandidateOwner, type OwnerMatch, type PetMatch } from "./match";

export type Db = SupabaseClient<Database>;

export interface ProcessInput {
  formVersionId: string | null;
  formLinkId: string | null;
  schema: FormSchema;
  consentText: string | null;
  answers: Answers;
  signature: SignatureInput | null;
  /** Owner pre-assigned by a personal link, if any. */
  linkOwnerId?: string | null;
  linkAppointmentId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  submittedAt?: string;
  source?: "petvax" | "jotform";
  externalId?: string | null;
  /** For imports: signature image already fetched from the source system. */
  signatureImage?: { bytes: Uint8Array; contentType: string } | null;
}

export interface ProcessResult {
  submissionId: string;
  status: "processed" | "needs_review" | "error";
  ownerId: string | null;
  petIds: string[];
  consentIds: string[];
  appointmentId: string | null;
  error?: string;
}

const OWNER_KEYS = ["first_name", "last_name", "email", "phone", "phone_secondary", "address_line1", "address_line2",
  "city", "state", "postal_code", "preferred_contact"] as const;
const PET_KEYS = ["breed", "color", "sex", "spayed_neutered", "date_of_birth", "estimated_age_years", "weight_lb",
  "microchip", "allergies", "prior_reactions", "medical_conditions", "medications", "diet", "vaccine_history_notes"] as const;

function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what}: no data`);
  return res.data as NonNullable<T>;
}

const asJson = (v: unknown) => v as NonNullable<Json>;
type OwnerUpdate = Database["public"]["Tables"]["owners"]["Update"];
type PetUpdate = Database["public"]["Tables"]["pets"]["Update"];

async function loadCandidates(db: Db, email: string | null, phone: string | null, first: string, last: string): Promise<CandidateOwner[]> {
  const ids = new Set<string>();
  if (email) {
    const r = await db.from("owners").select("id").eq("email_normalized", email).limit(20);
    r.data?.forEach((o) => ids.add(o.id));
  }
  const digits = normalizePhone(phone);
  if (digits) {
    const r = await db.from("owners").select("id").in("phone_digits", [digits, `1${digits}`]).limit(20);
    r.data?.forEach((o) => ids.add(o.id));
  }
  if (first && last) {
    const esc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
    const r = await db.from("owners").select("id").ilike("last_name", esc(last)).ilike("first_name", esc(first)).limit(20);
    r.data?.forEach((o) => ids.add(o.id));
  }
  if (!ids.size) return [];
  const rows = must(
    await db.from("owners")
      .select("id, first_name, last_name, email, phone, phone_secondary, merged_into_id, pet_owners(pets(id, name, species, microchip))")
      .in("id", [...ids]),
    "load candidate owners",
  );
  return rows.map((o) => ({
    id: o.id, first_name: o.first_name, last_name: o.last_name, email: o.email, phone: o.phone,
    phone_secondary: o.phone_secondary, merged_into_id: o.merged_into_id,
    pets: (o.pet_owners ?? []).map((po) => po.pets).filter(Boolean) as CandidateOwner["pets"],
  }));
}

function petRow(p: PetData, source: "petvax" | "jotform") {
  return {
    name: p.name, species: p.species, species_other: p.species_other, breed: p.breed, color: p.color, sex: p.sex,
    spayed_neutered: p.spayed_neutered, date_of_birth: p.date_of_birth, estimated_age_years: p.estimated_age_years,
    weight_lb: p.weight_lb, microchip: p.microchip, allergies: p.allergies, prior_reactions: p.prior_reactions,
    medical_conditions: p.medical_conditions, medications: p.medications, diet: p.diet,
    vaccine_history_notes: p.vaccine_history_notes, lifestyle: asJson(p.lifestyle), source,
  };
}

function decodePng(dataUrl: string): Uint8Array {
  return Uint8Array.from(Buffer.from(dataUrl.split(",")[1] ?? "", "base64"));
}

/**
 * Save a form submission and file its contents into the client, pet, consent and appointment records.
 * The raw submission is stored first, so nothing the client typed is lost even if a later step fails.
 */
export async function processSubmission(db: Db, input: ProcessInput): Promise<ProcessResult> {
  const source = input.source ?? "petvax";
  const submission = must(
    await db.from("intake_submissions").insert({
      form_version_id: input.formVersionId,
      form_link_id: input.formLinkId,
      answers: asJson(input.answers),
      status: "received",
      ip_address: input.ipAddress ?? null,
      user_agent: input.userAgent?.slice(0, 500) ?? null,
      submitted_at: input.submittedAt ?? new Date().toISOString(),
      source,
      external_id: input.externalId ?? null,
    }).select("id").single(),
    "save submission",
  );

  const result: ProcessResult = { submissionId: submission.id, status: "processed", ownerId: null, petIds: [], consentIds: [], appointmentId: null };
  try {
    const intake = extractIntake(input.schema, input.answers);
    const notes: string[] = [];
    let needsReview = false;

    // ---- Owner ----------------------------------------------------------------
    let ownerMatch: OwnerMatch;
    let candidates: CandidateOwner[] = [];
    if (input.linkOwnerId) {
      ownerMatch = { kind: "existing", ownerId: input.linkOwnerId, reason: "personal link sent to this client" };
      const own = must(await db.from("owners").select("id, first_name, last_name, email, phone, phone_secondary, merged_into_id, pet_owners(pets(id, name, species, microchip))").eq("id", input.linkOwnerId).single(), "load link owner");
      candidates = [{ ...own, pets: (own.pet_owners ?? []).map((po: { pets: CandidateOwner["pets"][number] | null }) => po.pets).filter(Boolean) as CandidateOwner["pets"] }];
    } else {
      candidates = await loadCandidates(db, intake.owner.email, intake.owner.phone, intake.owner.first_name, intake.owner.last_name);
      ownerMatch = matchOwner(intake.owner, candidates);
    }

    let ownerId: string;
    if (ownerMatch.kind === "existing") {
      ownerId = ownerMatch.ownerId;
      const existing = must(await db.from("owners").select(OWNER_KEYS.join(",")).eq("id", ownerId).single(), "load owner") as unknown as Record<string, unknown>;
      const update = mergeUpdates(existing, intake.owner as unknown as Record<string, unknown>, [...OWNER_KEYS]);
      if (Object.keys(update).length) {
        must(await db.from("owners").update(update as OwnerUpdate).eq("id", ownerId).select("id").single(), "update owner");
        notes.push(`Updated client fields: ${Object.keys(update).join(", ")}`);
      }
    } else {
      needsReview = ownerMatch.kind === "new_needs_review";
      const created = must(
        await db.from("owners").insert({
          ...intake.owner,
          source,
          review_status: needsReview ? "needs_review" : "ok",
          possible_duplicate_of: ownerMatch.kind === "new_needs_review" ? ownerMatch.candidateIds : [],
        }).select("id").single(),
        "create owner",
      );
      ownerId = created.id;
    }
    result.ownerId = ownerId;

    // ---- Pets -----------------------------------------------------------------
    const ownerPets = ownerMatch.kind === "existing" ? (candidates.find((c) => c.id === ownerId)?.pets ?? []) : [];
    const petMatches: { name: string; match: PetMatch; petId: string }[] = [];
    for (const pet of intake.pets) {
      const match = matchPet(pet, ownerPets);
      let petId: string;
      if (match.kind === "existing") {
        petId = match.petId;
        const existing = must(await db.from("pets").select(PET_KEYS.join(",") + ", lifestyle").eq("id", petId).single(), "load pet") as unknown as Record<string, unknown>;
        const update = mergeUpdates(existing, petRow(pet, source) as unknown as Record<string, unknown>, [...PET_KEYS]);
        const lifestyle = { ...((existing.lifestyle as Record<string, boolean>) ?? {}), ...pet.lifestyle };
        if (JSON.stringify(lifestyle) !== JSON.stringify(existing.lifestyle)) (update as Record<string, unknown>).lifestyle = lifestyle;
        if (Object.keys(update).length) {
          must(await db.from("pets").update(update as PetUpdate).eq("id", petId).select("id").single(), "update pet");
        }
      } else {
        if (match.kind === "new_needs_review") needsReview = true;
        // A microchip already registered to a different client must be looked at by a person.
        let row = petRow(pet, source);
        if (pet.microchip) {
          const clash = await db.from("pets").select("id").eq("microchip", pet.microchip).maybeSingle();
          if (clash.data) {
            needsReview = true;
            notes.push(`Microchip ${pet.microchip} is already on file for another pet; saved without the microchip for review.`);
            row = { ...row, microchip: null, vaccine_history_notes: [row.vaccine_history_notes, `Submitted microchip: ${pet.microchip}`].filter(Boolean).join("\n") };
          }
        }
        const created = must(await db.from("pets").insert(row).select("id").single(), "create pet");
        petId = created.id;
        must(await db.from("pet_owners").insert({ pet_id: petId, owner_id: ownerId, relationship: "owner", is_primary: true }).select("pet_id").single(), "link pet");
      }
      petMatches.push({ name: pet.name, match, petId });
      result.petIds.push(petId);
    }

    // ---- Consent --------------------------------------------------------------
    if (input.signature && input.consentText) {
      const bytes = input.signatureImage?.bytes ?? decodePng(input.signature.dataUrl);
      if (bytes.length < 50) throw new Error("Signature image is empty");
      const contentType = input.signatureImage?.contentType ?? "image/png";
      const ext = contentType.includes("svg") ? "svg" : contentType.includes("jpeg") ? "jpg" : "png";
      const signatureSha = sha256Hex(bytes);
      const path = `${ownerId}/${submission.id}.${ext}`;
      const up = await db.storage.from("consent-signatures").upload(path, bytes, { contentType, upsert: false });
      if (up.error) throw new Error(`store signature: ${up.error.message}`);
      const signedAt = input.submittedAt ?? new Date().toISOString();
      for (const pm of petMatches) {
        const consent = must(
          await db.from("signed_consents").insert({
            submission_id: submission.id,
            form_version_id: input.formVersionId,
            owner_id: ownerId,
            pet_id: pm.petId,
            consent_text: input.consentText,
            consent_text_sha256: sha256Hex(input.consentText),
            signer_name: input.signature.signerName,
            signer_relationship: input.signature.relationship,
            signature_path: path,
            signature_sha256: signatureSha,
            signed_at: signedAt,
            ip_address: input.ipAddress ?? null,
            user_agent: input.userAgent?.slice(0, 500) ?? null,
            evidence: {
              agreed_to_consent: input.signature.agreed,
              agreed_to_electronic_signature: input.signature.esignAgreed,
              form_link_id: input.formLinkId,
              method: source === "jotform" ? "jotform_import" : "drawn_signature",
            },
            record_hash: "pending",
            source,
            external_id: input.externalId ?? null,
          }).select("id").single(),
          "save consent",
        );
        result.consentIds.push(consent.id);
      }
    }

    // ---- Appointment ------------------------------------------------------------
    const requestedFor = (petId: string) => intake.pets[result.petIds.indexOf(petId)]?.requested_vaccines ?? [];
    if (input.linkAppointmentId) {
      result.appointmentId = input.linkAppointmentId;
      for (const petId of result.petIds) {
        await db.from("appointment_pets").upsert({ appointment_id: input.linkAppointmentId, pet_id: petId, requested_vaccines: requestedFor(petId) });
      }
    } else if (intake.appointment && source === "petvax") {
      const a = intake.appointment;
      const clientNotes = [
        a.preferred_date && `Preferred date: ${a.preferred_date}`,
        a.preferred_time && `Preferred time: ${a.preferred_time}`,
        a.notes,
        ...intake.pets.filter((p) => p.visit_notes).map((p) => `${p.name}: ${p.visit_notes}`),
      ].filter(Boolean).join("\n");
      const address = [intake.owner.address_line1, intake.owner.address_line2, intake.owner.city, intake.owner.state, intake.owner.postal_code].filter(Boolean).join(", ");
      const appt = must(
        await db.from("appointments").insert({ owner_id: ownerId, status: "requested", visit_address: address || null, client_notes: clientNotes || null, source: "petvax" })
          .select("id").single(),
        "create appointment request",
      );
      result.appointmentId = appt.id;
      for (const petId of result.petIds) {
        must(await db.from("appointment_pets").insert({ appointment_id: appt.id, pet_id: petId, requested_vaccines: requestedFor(petId) }).select("pet_id").single(), "add pet to appointment");
      }
    }

    result.status = needsReview ? "needs_review" : "processed";
    must(
      await db.from("intake_submissions").update({
        status: result.status,
        owner_id: ownerId,
        pet_ids: result.petIds,
        match_result: asJson({ owner: ownerMatch, pets: petMatches, notes }),
      }).eq("id", submission.id).select("id").single(),
      "finish submission",
    );
    if (input.formLinkId) {
      const link = await db.from("form_links").select("use_count").eq("id", input.formLinkId).single();
      if (link.data) await db.from("form_links").update({ use_count: link.data.use_count + 1 }).eq("id", input.formLinkId);
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from("intake_submissions").update({ status: "error", processing_error: message.slice(0, 2000) }).eq("id", submission.id);
    return { ...result, status: "error", error: message };
  }
}
