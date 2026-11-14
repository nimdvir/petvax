import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { getAdminClient } from "@/lib/supabase";
import IntakeForm from "@/components/IntakeForm";

export const dynamic = "force-dynamic";
export default async function PublicIntake({ params }: {params: Promise<{token: string}>}) {
  const { token } = await params;
  if (!/^[a-zA-Z0-9_-]{32,200}$/.test(token)) notFound();
  const digest = createHash("sha256").update(token).digest("hex");
  const admin = getAdminClient();
  const { data, error } = await admin.from("pvo_public_forms")
    .select("consent_text,consent_version,expires_at")
    .eq("token_digest", digest).eq("active", true).maybeSingle();
  if (error || !data || (data.expires_at && new Date(data.expires_at) <= new Date())) notFound();
  return <section className="stack">
    <div><div className="eyebrow">Secure client intake</div><h1>Register your pet</h1>
      <p className="muted">Complete the information below before your PetVax house-call vaccination visit.</p></div>
    <IntakeForm token={token} consentText={data.consent_text} consentVersion={data.consent_version}/>
  </section>;
}
