import { notFound } from "next/navigation";
import { can, requireStaff } from "@/lib/auth";
import { formatNyDateTime } from "@/lib/time";
import { formSchemaSchema, type FormSchema } from "@/lib/forms/schema";
import { discardDraft } from "../actions";
import { Badge, Button, Card, Flash, PageHeader } from "@/components/ui";
import { FormBuilder } from "@/components/form-builder";
import { FormRenderer } from "@/components/form-renderer";

export default async function FormEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, profile } = await requireStaff();
  const { data: t } = await supabase.from("form_templates").select("*, form_versions(id, version, status, schema, consent_text, published_at, created_at, change_note)").eq("id", id).maybeSingle();
  if (!t) notFound();
  const versions = [...t.form_versions].sort((a, b) => b.version - a.version);
  const working = versions.find((v) => v.status === "draft") ?? versions.find((v) => v.status === "published") ?? versions[0];
  const parsed = formSchemaSchema.safeParse(working?.schema);
  const schema = (parsed.success ? parsed.data : working?.schema) as FormSchema;
  const subs = await supabase.from("intake_submissions").select("form_version_id").in("form_version_id", versions.map((v) => v.id));
  const counts = new Map<string, number>();
  for (const s of subs.data ?? []) counts.set(s.form_version_id!, (counts.get(s.form_version_id!) ?? 0) + 1);

  if (!can.admin(profile.role)) {
    return (
      <>
        <PageHeader title={t.title} back={{ href: "/forms", label: "Forms" }} subtitle="Preview (only admins can edit forms)" />
        <div className="mx-auto max-w-2xl"><FormRenderer schema={schema} consentText={working?.consent_text ?? null} title={t.title} description={t.description} /></div>
      </>
    );
  }
  return (
    <>
      <PageHeader title={`Edit: ${t.title}`} back={{ href: "/forms", label: "Forms" }}
        subtitle={working?.status === "draft" ? <Badge color="yellow">Editing unpublished draft v{working.version}</Badge> : "Changes are saved as a draft until you publish."}
        actions={working?.status === "draft" && versions.some((v) => v.status === "published") ? <form action={discardDraft.bind(null, id)}><Button variant="ghost">Discard draft</Button></form> : undefined} />
      <Flash params={sp} />
      <FormBuilder templateId={id} initial={{ schema, consentText: working?.consent_text ?? "", title: t.title, description: t.description ?? "" }} />
      <Card title="Version history" className="mt-6">
        <ul className="space-y-1 text-sm">
          {versions.map((v) => (
            <li key={v.id}>v{v.version} · <Badge color={v.status === "published" ? "green" : v.status === "draft" ? "yellow" : "gray"}>{v.status}</Badge>
              {" "}{v.published_at ? `published ${formatNyDateTime(v.published_at)}` : `created ${formatNyDateTime(v.created_at)}`}
              {v.change_note && ` — ${v.change_note}`} · {counts.get(v.id) ?? 0} submissions</li>
          ))}
        </ul>
      </Card>
    </>
  );
}
