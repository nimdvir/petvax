"use server";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { msg } from "@/lib/fd";
import { createAdminClient } from "@/lib/supabase/admin";
import { formSchemaSchema, validateAnswers } from "@/lib/forms/schema";
import { processSubmission } from "@/lib/intake/process";

export async function markReviewed(id: string) {
  const { supabase, userId } = await requireStaff();
  await supabase.from("intake_submissions").update({ status: "processed", reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq("id", id);
  redirect(msg(`/submissions/${id}`, "ok", "Marked as reviewed."));
}

/** Re-run a submission that failed to process. The original stays as-is for the record. */
export async function reprocess(id: string) {
  const { supabase } = await requireStaff();
  const sub = (await supabase.from("intake_submissions").select("*, form_versions(schema, consent_text)").eq("id", id).single()).data;
  if (!sub || sub.status !== "error" || !sub.form_versions) redirect(msg(`/submissions/${id}`, "error", "Only failed submissions can be reprocessed."));
  const schema = formSchemaSchema.parse(sub!.form_versions!.schema);
  const answers = validateAnswers(schema, sub!.answers);
  if (!answers.ok) redirect(msg(`/submissions/${id}`, "error", "The saved answers no longer pass validation; enter them manually."));
  // Signatures can't be re-captured; reprocessing files the client/pet data only.
  const r = await processSubmission(createAdminClient(), {
    formVersionId: sub!.form_version_id, formLinkId: null, schema: { ...schema, consent: undefined }, consentText: null,
    answers: answers.ok ? answers.answers : {}, signature: null, source: "petvax",
  });
  await supabase.from("intake_submissions").update({ status: "processed", processing_error: `${sub!.processing_error ?? ""}\nReprocessed as ${r.submissionId}`.trim() }).eq("id", id);
  redirect(msg(`/submissions/${r.submissionId}`, r.status === "error" ? "error" : "ok", r.status === "error" ? r.error! : "Reprocessed."));
}
