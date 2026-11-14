import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { formatNyDateTime } from "@/lib/time";
import { formSchemaSchema, type AnswerGroup, type FormSchema } from "@/lib/forms/schema";
import { markReviewed, reprocess } from "../actions";
import { Badge, Button, Card, DL, Flash, PageHeader, StatusBadge } from "@/components/ui";

const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v === true ? "Yes" : v === false ? "No" : v === null || v === undefined ? "" : String(v));

function Answers({ schema, answers }: { schema: FormSchema | null; answers: Record<string, unknown> }) {
  if (!schema) return <pre className="overflow-x-auto rounded bg-gray-50 p-3 text-xs">{JSON.stringify(answers, null, 2)}</pre>;
  return (
    <div className="space-y-5">
      {schema.sections.map((s) => s.repeat ? (
        ((answers[s.id] as AnswerGroup[]) ?? []).map((g, i) => (
          <div key={`${s.id}${i}`}><h3 className="mb-2 font-semibold">{s.repeat!.itemLabel} {i + 1}</h3>
            <DL items={s.fields.filter((f) => f.id in g && f.type !== "info").map((f) => [f.label, show(g[f.id])])} /></div>
        ))
      ) : (
        <div key={s.id}><h3 className="mb-2 font-semibold">{s.title}</h3>
          <DL items={s.fields.filter((f) => f.id in answers && f.type !== "info").map((f) => [f.label, show(answers[f.id])])} /></div>
      ))}
    </div>
  );
}

export default async function SubmissionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireStaff();
  const { data: s } = await supabase.from("intake_submissions").select("*, owners(id, first_name, last_name, review_status), form_versions(version, schema, form_templates(title))").eq("id", id).maybeSingle();
  if (!s) notFound();
  const [pets, consents, docs] = await Promise.all([
    s.pet_ids.length ? supabase.from("pets").select("id, name").in("id", s.pet_ids) : Promise.resolve({ data: [] }),
    supabase.from("signed_consents").select("id, signer_name, signer_relationship, signed_at, pet_id, record_hash").eq("submission_id", id),
    supabase.from("documents").select("id, filename, kind, bucket, storage_path").eq("submission_id", id),
  ]);
  const parsed = s.form_versions ? formSchemaSchema.safeParse(s.form_versions.schema) : null;
  const match = s.match_result as { owner?: { kind: string; reason: string }; pets?: { name: string; match: { kind: string; reason: string } }[]; notes?: string[] } | null;
  const docLinks = await Promise.all((docs.data ?? []).map(async (d) => ({ ...d, url: (await supabase.storage.from(d.bucket).createSignedUrl(d.storage_path, 300)).data?.signedUrl })));
  return (
    <>
      <PageHeader title={<>Submission <StatusBadge status={s.status} /></>}
        subtitle={`${s.form_versions?.form_templates?.title ?? "Imported"}${s.form_versions ? ` (v${s.form_versions.version})` : ""} · received ${formatNyDateTime(s.submitted_at)}${s.source === "jotform" ? ` · Jotform #${s.external_id}` : ""}`}
        back={{ href: "/submissions", label: "Submissions" }}
        actions={<>
          {s.status === "needs_review" && <form action={markReviewed.bind(null, id)}><Button variant="secondary">Mark reviewed</Button></form>}
          {s.status === "error" && <form action={reprocess.bind(null, id)}><Button>Reprocess</Button></form>}
        </>} />
      <Flash params={sp} />
      {s.processing_error && <p className="mb-4 whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-red-800">{s.processing_error}</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Answers" className="lg:col-span-2"><Answers schema={parsed?.success ? parsed.data : null} answers={s.answers as Record<string, unknown>} /></Card>
        <div className="space-y-4">
          <Card title="Filed under">
            {s.owners ? (
              <p><Link className="font-semibold text-brand-700 underline" href={`/clients/${s.owners.id}`}>{s.owners.first_name} {s.owners.last_name}</Link>{s.owners.review_status === "needs_review" && <> <Badge color="yellow">possible duplicate</Badge></>}</p>
            ) : <p className="text-sm text-gray-600">Not filed yet.</p>}
            <ul className="mt-2 text-sm">{(pets.data ?? []).map((p) => <li key={p.id}><Link className="text-brand-700 underline" href={`/pets/${p.id}`}>{p.name}</Link></li>)}</ul>
            {match?.owner && <p className="mt-3 text-xs text-gray-600">Client: {match.owner.kind.replace(/_/g, " ")} — {match.owner.reason}</p>}
            {match?.pets?.map((p, i) => <p key={i} className="text-xs text-gray-600">{p.name}: {p.match.kind.replace(/_/g, " ")} — {p.match.reason}</p>)}
            {match?.notes?.map((n, i) => <p key={i} className="text-xs text-amber-800">{n}</p>)}
          </Card>
          <Card title="Signed consent">
            {consents.data?.length ? (
              <ul className="space-y-1 text-sm">{consents.data.map((c) => <li key={c.id}>{c.signer_name} ({c.signer_relationship}) · {formatNyDateTime(c.signed_at)}</li>)}</ul>
            ) : <p className="text-sm text-gray-600">None with this submission.</p>}
          </Card>
          {docLinks.length > 0 && (
            <Card title="Attachments">
              <ul className="text-sm">{docLinks.map((d) => <li key={d.id}>{d.url ? <a className="text-brand-700 underline" href={d.url} target="_blank" rel="noreferrer">{d.filename ?? d.kind}</a> : d.filename}</li>)}</ul>
            </Card>
          )}
          <Card title="Technical details"><DL items={[["IP address", s.ip_address as string | null], ["Device", s.user_agent]]} /></Card>
        </div>
      </div>
    </>
  );
}
