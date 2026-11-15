import type { Database } from "@/lib/database.types";
import { US_STATES } from "@/lib/forms/schema";
import { Field, Input, Select, Textarea } from "./ui";

type Owner = Database["public"]["Tables"]["owners"]["Row"];
type Pet = Database["public"]["Tables"]["pets"]["Row"];

export function OwnerFields({ o }: { o?: Partial<Owner> }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="First name *"><Input name="first_name" required defaultValue={o?.first_name ?? ""} /></Field>
      <Field label="Last name"><Input name="last_name" defaultValue={o?.last_name ?? ""} /></Field>
      <Field label="Email"><Input name="email" type="email" defaultValue={o?.email ?? ""} /></Field>
      <Field label="Phone"><Input name="phone" type="tel" defaultValue={o?.phone ?? ""} /></Field>
      <Field label="Secondary phone"><Input name="phone_secondary" type="tel" defaultValue={o?.phone_secondary ?? ""} /></Field>
      <Field label="Preferred contact">
        <Select name="preferred_contact" defaultValue={o?.preferred_contact ?? ""}>
          <option value="">—</option><option value="text">Text</option><option value="phone">Phone</option><option value="email">Email</option>
        </Select>
      </Field>
      <Field label="Street address" className="sm:col-span-2"><Input name="address_line1" defaultValue={o?.address_line1 ?? ""} /></Field>
      <Field label="Apartment / unit"><Input name="address_line2" defaultValue={o?.address_line2 ?? ""} /></Field>
      <Field label="City"><Input name="city" defaultValue={o?.city ?? "New York"} /></Field>
      <Field label="State">
        <Select name="state" defaultValue={o?.state ?? "NY"}>{US_STATES.map((s) => <option key={s}>{s}</option>)}</Select>
      </Field>
      <Field label="ZIP"><Input name="postal_code" defaultValue={o?.postal_code ?? ""} /></Field>
      <Field label="Internal notes" className="sm:col-span-2"><Textarea name="notes" defaultValue={o?.notes ?? ""} /></Field>
    </div>
  );
}

export function PetFields({ p }: { p?: Partial<Pet> }) {
  const yn = (v: boolean | null | undefined) => (v === true ? "yes" : v === false ? "no" : "");
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Name *"><Input name="name" required defaultValue={p?.name ?? ""} /></Field>
      <Field label="Species *">
        <Select name="species" defaultValue={p?.species ?? "dog"}><option value="dog">Dog</option><option value="cat">Cat</option><option value="other">Other</option></Select>
      </Field>
      <Field label="Breed"><Input name="breed" defaultValue={p?.breed ?? ""} /></Field>
      <Field label="Color"><Input name="color" defaultValue={p?.color ?? ""} /></Field>
      <Field label="Sex">
        <Select name="sex" defaultValue={p?.sex ?? "unknown"}><option value="unknown">Unknown</option><option value="male">Male</option><option value="female">Female</option></Select>
      </Field>
      <Field label="Spayed / neutered">
        <Select name="spayed_neutered" defaultValue={yn(p?.spayed_neutered)}><option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option></Select>
      </Field>
      <Field label="Date of birth"><Input name="date_of_birth" type="date" defaultValue={p?.date_of_birth ?? ""} /></Field>
      <Field label="Estimated age (years)" hint="Only if date of birth is unknown"><Input name="estimated_age_years" inputMode="decimal" defaultValue={p?.estimated_age_years ?? ""} /></Field>
      <Field label="Weight (lb)"><Input name="weight_lb" inputMode="decimal" defaultValue={p?.weight_lb ?? ""} /></Field>
      <Field label="Microchip"><Input name="microchip" defaultValue={p?.microchip ?? ""} /></Field>
      <Field label="Allergies" className="sm:col-span-2"><Textarea name="allergies" defaultValue={p?.allergies ?? ""} /></Field>
      <Field label="Prior vaccine reactions" className="sm:col-span-2"><Textarea name="prior_reactions" defaultValue={p?.prior_reactions ?? ""} /></Field>
      <Field label="Medical conditions"><Textarea name="medical_conditions" defaultValue={p?.medical_conditions ?? ""} /></Field>
      <Field label="Medications / preventatives"><Textarea name="medications" defaultValue={p?.medications ?? ""} /></Field>
      <Field label="Diet"><Textarea name="diet" defaultValue={p?.diet ?? ""} /></Field>
      <Field label="Vaccine history notes"><Textarea name="vaccine_history_notes" defaultValue={p?.vaccine_history_notes ?? ""} /></Field>
    </div>
  );
}
