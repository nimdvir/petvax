import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { formSchemaSchema, type FormSchema } from "./schema";
import { hashLinkToken, isPlausibleToken } from "@/lib/tokens";

export interface PublicForm {
  linkId: string;
  ownerId: string | null;
  appointmentId: string | null;
  templateTitle: string;
  templateDescription: string | null;
  versionId: string;
  schema: FormSchema;
  consentText: string | null;
  business: { name: string; phone: string | null; email: string | null };
}

/**
 * Resolve a public link token to the published form it points at.
 * Returns only the form definition — never any client or pet data.
 */
export async function loadPublicForm(db: SupabaseClient<Database>, token: string): Promise<PublicForm | null> {
  if (!isPlausibleToken(token)) return null;
  const link = await db.from("form_links")
    .select("id, owner_id, appointment_id, expires_at, revoked_at, form_templates(id, title, description, archived)")
    .eq("token_hash", hashLinkToken(token)).maybeSingle();
  const l = link.data;
  if (!l || l.revoked_at || (l.expires_at && new Date(l.expires_at) < new Date()) || !l.form_templates || l.form_templates.archived) return null;
  const version = await db.from("form_versions").select("id, schema, consent_text")
    .eq("template_id", l.form_templates.id).eq("status", "published").maybeSingle();
  if (!version.data) return null;
  const parsed = formSchemaSchema.safeParse(version.data.schema);
  if (!parsed.success) return null;
  const settings = await db.from("app_settings").select("business_name, phone, email").eq("id", true).single();
  return {
    linkId: l.id,
    ownerId: l.owner_id,
    appointmentId: l.appointment_id,
    templateTitle: l.form_templates.title,
    templateDescription: l.form_templates.description,
    versionId: version.data.id,
    schema: parsed.data,
    consentText: version.data.consent_text,
    business: { name: settings.data?.business_name ?? "PetVax", phone: settings.data?.phone ?? null, email: settings.data?.email ?? null },
  };
}
