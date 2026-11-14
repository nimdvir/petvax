import type { FormSchema, FormSection } from "./schema";

/**
 * Starter forms rebuilt from the two live Jotforms:
 *   - "PetVax Client Intake Form - NEW"        (jotform 262500538572052)
 *   - "PetVax Vaccination Consent Form - NEW"  (jotform 262500542108042)
 * plus a combined "New visit" form so a client only needs one link.
 * Every question can be edited in Office > Forms; these are only the starting point.
 */

/** Consent wording copied verbatim from the current Jotform consent form. Have it reviewed before relying on it. */
export const JOTFORM_CONSENT_TEXT =
  "I understand that vaccines have both benefits and risks, and that my pet will be examined prior to vaccination. " +
  "I acknowledge that adverse reactions can occur, and I authorize PetVax veterinary personnel to administer vaccines " +
  "deemed appropriate for my pet.";

const VACCINES = ["Rabies", "DHPP/DAPP", "Leptospirosis", "Bordetella", "Canine Influenza", "Lyme", "FVRCP", "FeLV"];
const REACTIONS = ["Swelling", "Hives", "Vomiting", "Diarrhea", "Lethargy", "Collapse", "Difficulty breathing"];

const ownerSection: FormSection = {
  id: "owner",
  title: "Owner information",
  fields: [
    { id: "first_name", label: "First name", type: "text", required: true, mapsTo: "owner.first_name" },
    { id: "last_name", label: "Last name", type: "text", required: true, mapsTo: "owner.last_name" },
    { id: "address_line1", label: "Street address", type: "text", required: true, mapsTo: "owner.address_line1" },
    { id: "address_line2", label: "Apartment / unit", type: "text", mapsTo: "owner.address_line2" },
    { id: "city", label: "City", type: "text", required: true, mapsTo: "owner.city" },
    { id: "state", label: "State", type: "state", required: true, mapsTo: "owner.state" },
    { id: "postal_code", label: "ZIP code", type: "text", required: true, mapsTo: "owner.postal_code" },
    { id: "phone", label: "Primary phone number", type: "phone", required: true, mapsTo: "owner.phone" },
    { id: "phone_secondary", label: "Secondary phone number", type: "phone", mapsTo: "owner.phone_secondary" },
    { id: "email", label: "Email address", type: "email", required: true, mapsTo: "owner.email",
      help: "We send vaccine certificates to this address." },
    { id: "preferred_contact", label: "Preferred way to reach you", type: "radio", options: ["Text", "Phone", "Email"],
      mapsTo: "owner.preferred_contact" },
  ],
};

const petBasics = [
  { id: "pet_name", label: "Pet name", type: "text", required: true, mapsTo: "pet.name" },
  { id: "species", label: "Species", type: "radio", required: true, options: ["Dog", "Cat"], mapsTo: "pet.species" },
  { id: "breed", label: "Breed", type: "text", required: true, mapsTo: "pet.breed" },
  { id: "color", label: "Color", type: "text", required: true, mapsTo: "pet.color" },
  { id: "sex", label: "Sex", type: "radio", required: true, options: ["Male", "Female"], mapsTo: "pet.sex" },
  { id: "spayed_neutered", label: "Spayed / neutered", type: "yesno", required: true, mapsTo: "pet.spayed_neutered" },
  { id: "date_of_birth", label: "Date of birth", type: "date", mapsTo: "pet.date_of_birth",
    help: "If you don't know the exact date, leave this blank and enter an approximate age." },
  { id: "age", label: "Approximate age (years)", type: "number", mapsTo: "pet.estimated_age_years" },
  { id: "weight_lb", label: "Weight (lb)", type: "number", required: true, mapsTo: "pet.weight_lb" },
  { id: "microchip", label: "Microchip number", type: "text", mapsTo: "pet.microchip" },
] satisfies FormSection["fields"];

const petHealth = [
  { id: "vaccine_history", label: "Previous vaccine history", type: "textarea", mapsTo: "pet.vaccine_history_notes" },
  { id: "requested_vaccines", label: "Which vaccines are you interested in?", type: "checkboxes", required: true,
    options: VACCINES, allowOther: true, mapsTo: "pet.requested_vaccines" },
  { id: "had_reaction", label: "Has your pet ever had a reaction to vaccinations?", type: "yesno", required: true },
  { id: "reaction_types", label: "Prior vaccine reactions (check all that apply)", type: "checkboxes",
    options: REACTIONS, allowOther: true, mapsTo: "pet.prior_reactions", showIf: { field: "had_reaction", equals: "yes" } },
  { id: "reaction_details", label: "Please explain the reaction", type: "textarea", mapsTo: "pet.prior_reaction_details",
    showIf: { field: "had_reaction", equals: "yes" } },
  { id: "allergies", label: "Known allergies", type: "textarea", mapsTo: "pet.allergies" },
  { id: "medical_conditions", label: "Current medical conditions", type: "textarea", mapsTo: "pet.medical_conditions" },
  { id: "current_symptoms", label: "Current symptoms", type: "textarea", mapsTo: "pet.current_symptoms" },
  { id: "medications", label: "Current medications, vitamins, supplements, or preventatives", type: "textarea", mapsTo: "pet.medications" },
  { id: "diet", label: "Diet and feeding information", type: "textarea", mapsTo: "pet.diet" },
  { id: "concerns", label: "Other concerns for the appointment", type: "textarea", mapsTo: "pet.concerns" },
] satisfies FormSection["fields"];

const petLifestyle = [
  { id: "boarding", label: "My pet visits a boarding kennel", type: "yesno", mapsTo: "pet.lifestyle.boarding" },
  { id: "grooming", label: "My pet is groomed", type: "yesno", mapsTo: "pet.lifestyle.grooming" },
  { id: "travel", label: "My pet travels outside the immediate area", type: "yesno", mapsTo: "pet.lifestyle.travel" },
  { id: "wildlife", label: "My pet has exposure to wildlife", type: "yesno", mapsTo: "pet.lifestyle.wildlife" },
] satisfies FormSection["fields"];

const petsRepeat = { itemLabel: "Pet", addLabel: "Add another pet", min: 1, max: 10 };

const consentBlock: NonNullable<FormSchema["consent"]> = {
  enabled: true,
  heading: "Vaccination consent",
  relationshipOptions: ["Owner", "Co-owner", "Authorized agent of the owner"],
  agreeLabel: "I have read and understand the above consent statement.",
  esignLabel:
    "I agree to sign this form electronically. My electronic signature has the same effect as a handwritten signature, " +
    "and I can ask PetVax for a paper copy of this form at any time.",
};

export interface DefaultFormDefinition {
  slug: string;
  kind: "intake" | "consent" | "intake_consent";
  title: string;
  description: string;
  schema: FormSchema;
  consentText: string | null;
}

export const DEFAULT_FORMS: DefaultFormDefinition[] = [
  {
    slug: "new-visit",
    kind: "intake_consent",
    title: "PetVax New Visit Form",
    description: "One link for new and returning clients: your details, your pets, health questions, and vaccination consent.",
    consentText: JOTFORM_CONSENT_TEXT,
    schema: {
      sections: [
        ownerSection,
        {
          id: "pets",
          title: "Your pets",
          description: "Add every pet that will be seen during the visit.",
          repeat: petsRepeat,
          fields: [...petBasics, ...petLifestyle, ...petHealth],
        },
        {
          id: "visit",
          title: "Visit request (optional)",
          fields: [
            { id: "preferred_date", label: "Preferred date", type: "date", mapsTo: "appointment.preferred_date" },
            { id: "preferred_time", label: "Preferred time", type: "select",
              options: ["Morning (9-12)", "Afternoon (12-4)", "Evening (4-7)", "Flexible"], mapsTo: "appointment.preferred_time" },
            { id: "visit_notes", label: "Anything we should know about the visit (buzzer, parking, pets' temperament)?",
              type: "textarea", mapsTo: "appointment.notes" },
          ],
        },
        {
          id: "certification",
          title: "Client certification",
          fields: [
            { id: "certify", label: "I certify that the information provided is accurate and true to the best of my knowledge.",
              type: "agree", required: true },
          ],
        },
      ],
      consent: consentBlock,
      submitLabel: "Submit",
      confirmationMessage: "Thank you! Your information and consent have been received. We'll be in touch to confirm your visit.",
    },
  },
  {
    slug: "client-intake",
    kind: "intake",
    title: "PetVax Client Intake Form",
    description: "Share your contact details, your pet's info, and vaccination/medical history for your at-home visit.",
    consentText: null,
    schema: {
      sections: [
        ownerSection,
        { id: "pets", title: "Pet information", repeat: petsRepeat, fields: [...petBasics, ...petHealth] },
        {
          id: "certification",
          title: "Client certification",
          fields: [
            { id: "certify", label: "I certify that the information provided is accurate and true to the best of my knowledge.",
              type: "agree", required: true },
          ],
        },
      ],
      submitLabel: "Submit",
      confirmationMessage: "Thank you! Your intake form has been received.",
    },
  },
  {
    slug: "vaccination-consent",
    kind: "consent",
    title: "PetVax Vaccination Consent Form",
    description: "Provide your details, pet information, exposure history, and consent for in-home vaccination.",
    consentText: JOTFORM_CONSENT_TEXT,
    schema: {
      sections: [
        {
          ...ownerSection,
          fields: ownerSection.fields.filter((f) => !["phone_secondary", "preferred_contact"].includes(f.id)),
        },
        {
          id: "pets",
          title: "Pet information",
          repeat: petsRepeat,
          fields: [
            ...petBasics.filter((f) => ["pet_name", "species", "breed", "date_of_birth", "weight_lb", "spayed_neutered"].includes(f.id))
              .map((f) => (["breed", "weight_lb", "spayed_neutered"].includes(f.id) ? { ...f, required: false } : f)),
            ...petLifestyle,
            { id: "had_reaction", label: "Has your pet had any prior vaccine reactions?", type: "yesno", required: true },
            { id: "reaction_types", label: "Prior vaccine reactions (check all that apply)", type: "checkboxes",
              options: REACTIONS, allowOther: true, mapsTo: "pet.prior_reactions", showIf: { field: "had_reaction", equals: "yes" } },
            { id: "reaction_details", label: "If you selected 'Other' or wish to explain, please provide details",
              type: "textarea", mapsTo: "pet.prior_reaction_details", showIf: { field: "had_reaction", equals: "yes" } },
          ],
        },
      ],
      consent: consentBlock,
      submitLabel: "Submit consent",
      confirmationMessage: "Thank you! Your signed consent has been received.",
    },
  },
];
