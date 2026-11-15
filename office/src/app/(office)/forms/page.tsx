import Link from "next/link";
import { can, requireStaff } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { formatNyDateTime } from "@/lib/time";
import { createForm, createGeneralLink, installDefaultForms, revokeLink, setArchived } from "./actions";
import { Badge, Button, Card, Field, Flash, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { CopyLink } from "@/components/copy-link";

export const metadata = { title: "Forms" };

export default async function FormsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireStaff();
  const admin = can.admin(profile.role);
  const { data: templates } = await supabase.from("form_templates")
    .select("id, title, description, slug, archived, form_versions(id, version, status, published_at), form_links(id, label, share_token, revoked_at, expires_at, use_count, owner_id, appointment_id, created_at)")
    .order("archived").order("title");
  return (
    <>
      <PageHeader title="Forms" subtitle="Client-facing forms. Edit questions and consent wording any time; each published change becomes a new version and old submissions keep the version they used." />
      <Flash params={sp} />
      {!templates?.length && (
        <Card className="mb-4">
          <p className="mb-3 text-sm">No forms yet. Install the starter forms rebuilt from your current Jotforms (Client Intake, Vaccination Consent, and a combined New Visit form).</p>
          {admin ? <form action={installDefaultForms}><SubmitButton>Install default forms</SubmitButton></form> : <p className="text-sm text-gray-600">Ask an admin to install them.</p>}
        </Card>
      )}
      <div className="space-y-4">
        {(templates ?? []).map((t) => {
          const published = t.form_versions.find((v) => v.status === "published");
          const draft = t.form_versions.find((v) => v.status === "draft");
          const links = t.form_links.filter((l) => !l.owner_id && !l.appointment_id && !l.revoked_at && (!l.expires_at || new Date(l.expires_at) > new Date()));
          return (
            <Card key={t.id} title={<>{t.title} {t.archived && <Badge>archived</Badge>}</>}
              actions={admin ? <>
                <LinkButton href={`/forms/${t.id}`} variant="primary">Edit form</LinkButton>
                <form action={setArchived.bind(null, t.id, !t.archived)}><Button variant="ghost">{t.archived ? "Restore" : "Archive"}</Button></form>
              </> : <LinkButton href={`/forms/${t.id}`}>Preview</LinkButton>}>
              {t.description && <p className="mb-2 text-sm text-gray-600">{t.description}</p>}
              <p className="mb-3 text-xs text-gray-500">
                {published ? `Live: version ${published.version}, published ${formatNyDateTime(published.published_at)}` : "Not published yet"}
                {draft && <> · <Badge color="yellow">unpublished draft v{draft.version}</Badge></>}
              </p>
              {!t.archived && (
                <div className="space-y-3">
                  {links.map((l) => (
                    <div key={l.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-medium">{l.label}</span>
                        <span className="text-xs text-gray-500">{l.use_count} submissions{l.expires_at && ` · expires ${formatNyDateTime(l.expires_at)}`}</span>
                      </div>
                      {l.share_token && <CopyLink url={`${publicEnv.siteUrl}/f/${l.share_token}`} />}
                      <form action={revokeLink.bind(null, l.id)} className="mt-2"><button className="text-xs text-red-700 underline">Turn off this link</button></form>
                    </div>
                  ))}
                  <details>
                    <summary className="cursor-pointer text-sm text-brand-700 underline">New shareable link</summary>
                    <form action={createGeneralLink.bind(null, t.id)} className="mt-2 flex flex-wrap items-end gap-2">
                      <Field label="Label"><Input name="label" placeholder="e.g. Website, Instagram" required /></Field>
                      <Field label="Expires">
                        <Select name="expires_days" defaultValue="0"><option value="0">Never</option><option value="7">7 days</option><option value="30">30 days</option></Select>
                      </Field>
                      <SubmitButton variant="secondary">Create link</SubmitButton>
                    </form>
                  </details>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {admin && !!templates?.length && (
        <Card title="Create a new form" className="mt-6">
          <form action={createForm} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Name"><Input name="title" required /></Field>
            <Field label="Start from">
              <Select name="copy_from">{(templates ?? []).map((t) => <option key={t.id} value={t.id}>Copy of {t.title}</option>)}</Select>
            </Field>
            <div className="flex items-end"><SubmitButton variant="secondary">Create</SubmitButton></div>
          </form>
          {!templates?.some((t) => ["new-visit", "client-intake", "vaccination-consent"].includes(t.slug)) && (
            <form action={installDefaultForms} className="mt-3"><SubmitButton variant="ghost">Install default forms</SubmitButton></form>
          )}
        </Card>
      )}
      <p className="mt-6 text-xs text-gray-500">Personal links sent from a client or appointment page are not listed here. <Link className="underline" href="/submissions">See all submissions</Link>.</p>
    </>
  );
}
