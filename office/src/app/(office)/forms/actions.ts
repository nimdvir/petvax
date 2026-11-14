"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { fstr, msg } from "@/lib/fd";
import { DEFAULT_FORMS } from "@/lib/forms/defaults";
import { formSchemaSchema } from "@/lib/forms/schema";
import { hashLinkToken, newLinkToken } from "@/lib/tokens";
import type { Json } from "@/lib/database.types";

const asJson = (v: unknown) => v as NonNullable<Json>;

/** Install the starter forms (rebuilt from the Jotforms) that don't exist yet, each with a shareable link. */
export async function installDefaultForms() {
  const { supabase, userId } = await requireStaff(["admin"]);
  for (const f of DEFAULT_FORMS) {
    const exists = await supabase.from("form_templates").select("id").eq("slug", f.slug).maybeSingle();
    if (exists.data) continue;
    const t = await supabase.from("form_templates").insert({ slug: f.slug, kind: f.kind, title: f.title, description: f.description }).select("id").single();
    if (t.error) redirect(msg("/forms", "error", t.error.message));
    const v = await supabase.from("form_versions").insert({ template_id: t.data.id, version: 1, schema: asJson(f.schema), consent_text: f.consentText, created_by: userId, change_note: "Rebuilt from Jotform" }).select("id").single();
    if (v.error) redirect(msg("/forms", "error", v.error.message));
    await supabase.rpc("publish_form_version", { p_version_id: v.data.id });
    const token = newLinkToken();
    await supabase.from("form_links").insert({ template_id: t.data.id, token_hash: hashLinkToken(token), share_token: token, label: "Main link", created_by: userId });
  }
  redirect(msg("/forms", "ok", "Default forms installed."));
}

export async function createForm(fd: FormData) {
  const { supabase, userId } = await requireStaff(["admin"]);
  const title = fstr(fd, "title");
  const copyFrom = fstr(fd, "copy_from");
  if (!title) redirect(msg("/forms", "error", "Give the form a name."));
  let schema: unknown = DEFAULT_FORMS[0].schema;
  let consent: string | null = DEFAULT_FORMS[0].consentText;
  let kind: "intake" | "consent" | "intake_consent" = "intake_consent";
  if (copyFrom) {
    const src = await supabase.from("form_versions").select("schema, consent_text, form_templates(kind)").eq("template_id", copyFrom).order("version", { ascending: false }).limit(1).single();
    if (src.data) { schema = src.data.schema; consent = src.data.consent_text; kind = src.data.form_templates?.kind ?? kind; }
  }
  const slug = `${title!.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "form"}-${Math.random().toString(36).slice(2, 6)}`;
  const t = await supabase.from("form_templates").insert({ slug, kind, title: title!, description: fstr(fd, "description") }).select("id").single();
  if (t.error) redirect(msg("/forms", "error", t.error.message));
  await supabase.from("form_versions").insert({ template_id: t.data.id, version: 1, schema: asJson(schema), consent_text: consent, created_by: userId, change_note: "New form" });
  redirect(`/forms/${t.data.id}`);
}

export type SaveResult = { ok: boolean; message: string; errors?: string[]; versionId?: string };

/** Save the builder's state as the template's draft version (creating one if needed). */
export async function saveFormDraft(templateId: string, payload: { schema: unknown; consentText: string | null; title: string; description: string | null; changeNote: string | null }): Promise<SaveResult> {
  const { supabase, userId } = await requireStaff(["admin"]);
  const parsed = formSchemaSchema.safeParse(payload.schema);
  if (!parsed.success) {
    return { ok: false, message: "Fix these before saving:", errors: parsed.error.issues.map((i) => `${i.path.length ? i.path.join(" › ") + ": " : ""}${i.message}`) };
  }
  if (parsed.data.consent?.enabled && !payload.consentText?.trim()) return { ok: false, message: "Consent is turned on, so the consent text can't be empty." };
  if (!payload.title.trim()) return { ok: false, message: "The form needs a title." };
  await supabase.from("form_templates").update({ title: payload.title.trim(), description: payload.description?.trim() || null }).eq("id", templateId);
  const consentText = parsed.data.consent?.enabled ? payload.consentText!.trim() : null;
  const draft = await supabase.from("form_versions").select("id").eq("template_id", templateId).eq("status", "draft").maybeSingle();
  if (draft.data) {
    const r = await supabase.from("form_versions").update({ schema: asJson(parsed.data), consent_text: consentText, change_note: payload.changeNote }).eq("id", draft.data.id);
    if (r.error) return { ok: false, message: r.error.message };
    revalidatePath(`/forms/${templateId}`);
    return { ok: true, message: "Draft saved.", versionId: draft.data.id };
  }
  const latest = await supabase.from("form_versions").select("version").eq("template_id", templateId).order("version", { ascending: false }).limit(1).maybeSingle();
  const r = await supabase.from("form_versions").insert({
    template_id: templateId, version: (latest.data?.version ?? 0) + 1, schema: asJson(parsed.data), consent_text: consentText,
    created_by: userId, change_note: payload.changeNote,
  }).select("id").single();
  if (r.error) return { ok: false, message: r.error.message };
  revalidatePath(`/forms/${templateId}`);
  return { ok: true, message: "Draft saved.", versionId: r.data.id };
}

export async function publishForm(templateId: string, payload: Parameters<typeof saveFormDraft>[1]): Promise<SaveResult> {
  const saved = await saveFormDraft(templateId, payload);
  if (!saved.ok || !saved.versionId) return saved;
  const { supabase } = await requireStaff(["admin"]);
  const r = await supabase.rpc("publish_form_version", { p_version_id: saved.versionId });
  if (r.error) return { ok: false, message: r.error.message };
  revalidatePath(`/forms/${templateId}`);
  revalidatePath("/forms");
  return { ok: true, message: "Published. Everyone who opens this form's links now sees the new version." };
}

export async function discardDraft(templateId: string) {
  const { supabase } = await requireStaff(["admin"]);
  await supabase.from("form_versions").delete().eq("template_id", templateId).eq("status", "draft");
  redirect(msg(`/forms/${templateId}`, "ok", "Draft discarded."));
}

export async function createGeneralLink(templateId: string, fd: FormData) {
  const { supabase, userId } = await requireStaff();
  const token = newLinkToken();
  const days = Number(fstr(fd, "expires_days") ?? 0);
  const r = await supabase.from("form_links").insert({
    template_id: templateId, token_hash: hashLinkToken(token), share_token: token, label: fstr(fd, "label") ?? "Link", created_by: userId,
    expires_at: days > 0 ? new Date(Date.now() + days * 86400_000).toISOString() : null,
  });
  if (r.error) redirect(msg("/forms", "error", r.error.message));
  redirect(msg("/forms", "ok", "Link created."));
}

export async function revokeLink(linkId: string) {
  const { supabase } = await requireStaff();
  await supabase.from("form_links").update({ revoked_at: new Date().toISOString() }).eq("id", linkId);
  redirect(msg("/forms", "ok", "Link turned off. Anyone opening it now sees an 'expired' message."));
}

export async function setArchived(templateId: string, archived: boolean) {
  const { supabase } = await requireStaff(["admin"]);
  await supabase.from("form_templates").update({ archived }).eq("id", templateId);
  redirect(msg("/forms", "ok", archived ? "Form archived; its links stop working." : "Form restored."));
}
