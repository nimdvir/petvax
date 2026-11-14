import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPublicForm } from "@/lib/forms/public";
import { validateAnswers, validateSignature } from "@/lib/forms/schema";
import { processSubmission } from "@/lib/intake/process";

export const dynamic = "force-dynamic";

// Best-effort per-instance throttle. Put a platform firewall/rate limit in front in production.
const hits = new Map<string, number[]>();
function throttled(key: string, limit = 10, windowMs = 10 * 60_000): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > limit;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Only accept submissions sent from our own pages (blocks other websites posting into the form).
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin) {
    let originHost = "";
    try { originHost = new URL(origin).host; } catch { /* malformed */ }
    if (!host || originHost !== host) return NextResponse.json({ error: "Submission rejected." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "Invalid submission." }, { status: 415 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
  if (throttled(`${ip}:${token}`)) {
    return NextResponse.json({ error: "Too many submissions. Please wait a few minutes or contact us." }, { status: 429 });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 2_000_000) return NextResponse.json({ error: "Submission is too large." }, { status: 413 });

  const db = createAdminClient();
  const form = await loadPublicForm(db, token);
  if (!form) return NextResponse.json({ error: "This form link is no longer active. Please contact PetVax for a new link." }, { status: 404 });

  let body: { answers?: unknown; signature?: unknown; website?: string; submissionKey?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
  }
  // Honeypot: bots fill the hidden "website" field. Pretend success, store nothing.
  if (body.website) return NextResponse.json({ ok: true, message: form.schema.confirmationMessage });

  const answers = validateAnswers(form.schema, body.answers);
  const signature = validateSignature(form.schema, body.signature);
  const errors = { ...(answers.ok ? {} : answers.errors), ...(signature.ok ? {} : signature.errors) };
  if (!answers.ok || !signature.ok) {
    return NextResponse.json({ error: "Please fix the highlighted items and try again.", errors }, { status: 422 });
  }

  const result = await processSubmission(db, {
    formVersionId: form.versionId,
    formLinkId: form.linkId,
    schema: form.schema,
    consentText: form.consentText,
    answers: answers.answers,
    signature: signature.signature,
    linkOwnerId: form.ownerId,
    linkAppointmentId: form.appointmentId,
    idempotencyKey: typeof body.submissionKey === "string" && /^[0-9a-f-]{36}$/i.test(body.submissionKey) ? body.submissionKey : null,
    ipAddress: ip,
    userAgent: request.headers.get("user-agent"),
  });
  if (result.status === "error") {
    // The raw submission is saved; staff will see it flagged in Office.
    console.error("submission processing failed", result.submissionId, result.error);
    return NextResponse.json({ ok: true, message: "Thank you! We received your form. Our team will follow up if we need anything else." });
  }
  return NextResponse.json({ ok: true, message: form.schema.confirmationMessage ?? "Thank you! Your form has been received." });
}
