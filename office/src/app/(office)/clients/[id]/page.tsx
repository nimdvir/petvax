import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { formatDate, formatNyDateTime } from "@/lib/time";
import { addPet, createClientLink, resolveDuplicate, updateOwner } from "../actions";
import { OwnerFields, PetFields } from "@/components/record-forms";
import { Badge, Card, DL, Empty, Flash, LinkButton, PageHeader, Select, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { CopyLink } from "@/components/copy-link";

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireStaff();
  const { data: o } = await supabase.from("owners").select("*, pet_owners(is_primary, pets(*))").eq("id", id).maybeSingle();
  if (!o) notFound();
  const petIds = o.pet_owners.map((p) => p.pets?.id).filter(Boolean) as string[];
  const [appts, subs, certs, templates, dupes, mergedFrom] = await Promise.all([
    supabase.from("appointments").select("id, status, starts_at, requested_at").eq("owner_id", id).order("starts_at", { ascending: false, nullsFirst: true }).limit(20),
    supabase.from("intake_submissions").select("id, status, submitted_at, source").eq("owner_id", id).order("submitted_at", { ascending: false }).limit(20),
    petIds.length ? supabase.from("certificates").select("id, certificate_number, issued_at, status, pets(name)").in("pet_id", petIds).order("issued_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    supabase.from("form_templates").select("id, title").eq("archived", false).order("title"),
    o.possible_duplicate_of.length ? supabase.from("owners").select("id, first_name, last_name, email, phone, address_line1").in("id", o.possible_duplicate_of) : Promise.resolve({ data: [] }),
    supabase.from("owners").select("id, first_name, last_name").eq("merged_into_id", id),
  ]);
  const name = `${o.first_name} ${o.last_name}`.trim();
  return (
    <>
      <PageHeader title={name} back={{ href: "/clients", label: "Clients" }}
        subtitle={o.merged_into_id ? <Badge color="gray">Merged into another record</Badge> : `Client since ${formatDate(o.created_at.slice(0, 10))}`}
        actions={<LinkButton href={`/appointments/new?owner=${id}`} variant="primary">Book visit</LinkButton>} />
      <Flash params={sp} />
      {o.merged_into_id && <p className="mb-4 text-sm"><Link className="text-brand-700 underline" href={`/clients/${o.merged_into_id}`}>Go to the current record →</Link></p>}

      {o.review_status === "needs_review" && (
        <Card title="Possible duplicate — please review" className="mb-4 border-amber-300 bg-amber-50">
          <p className="mb-3 text-sm text-gray-700">This record was created from a form whose details partly match an existing client. Nothing was merged automatically.</p>
          <ul className="mb-3 space-y-1 text-sm">
            {(dupes.data ?? []).map((d) => (
              <li key={d.id}><Link className="text-brand-700 underline" href={`/clients/${d.id}`}>{d.first_name} {d.last_name}</Link> — {d.email ?? "no email"} · {d.phone ?? "no phone"} · {d.address_line1 ?? ""}</li>
            ))}
          </ul>
          <form action={resolveDuplicate.bind(null, id)} className="flex flex-wrap items-end gap-2">
            <label className="text-sm">Merge this record into
              <Select name="merge_into" defaultValue="">
                <option value="">— They are different people —</option>
                {(dupes.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>)}
              </Select>
            </label>
            <SubmitButton variant="secondary">Resolve</SubmitButton>
          </form>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Pets" actions={<a href="#add-pet" className="text-sm text-brand-700 underline">Add pet</a>}>
            {o.pet_owners.length ? (
              <ul className="divide-y divide-gray-100">
                {o.pet_owners.map(({ pets: p }) => p && (
                  <li key={p.id} className="flex items-center justify-between py-3">
                    <Link href={`/pets/${p.id}`} className="font-semibold text-brand-700 hover:underline">{p.name}</Link>
                    <span className="text-sm text-gray-600">{[p.species, p.breed, p.sex !== "unknown" && p.sex].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty>No pets yet.</Empty>}
          </Card>

          <Card title="Contact details">
            <details>
              <summary className="cursor-pointer list-none">
                <DL items={[
                  ["Email", o.email], ["Phone", o.phone], ["Secondary phone", o.phone_secondary], ["Preferred contact", o.preferred_contact],
                  ["Address", [o.address_line1, o.address_line2, o.city, o.state, o.postal_code].filter(Boolean).join(", ")], ["Notes", o.notes],
                ]} />
                <span className="mt-3 inline-block text-sm text-brand-700 underline">Edit</span>
              </summary>
              <form action={updateOwner.bind(null, id)} className="mt-4 space-y-4 border-t pt-4">
                <OwnerFields o={o} />
                <SubmitButton>Save changes</SubmitButton>
              </form>
            </details>
          </Card>

          <Card title="Add pet">
            <form id="add-pet" action={addPet.bind(null, id)} className="space-y-4">
              <PetFields />
              <SubmitButton>Add pet</SubmitButton>
            </form>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Send a form">
            {sp.link ? (
              <div className="space-y-2 text-sm">
                <p>Personal link (valid 30 days). Submissions are filed under this client:</p>
                <CopyLink url={sp.link} phone={o.phone} email={o.email} name={o.first_name} />
              </div>
            ) : (
              <form action={createClientLink.bind(null, id)} className="space-y-2">
                <Select name="template_id" aria-label="Form">{(templates.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</Select>
                <SubmitButton variant="secondary" className="w-full">Create personal link</SubmitButton>
              </form>
            )}
          </Card>
          <Card title="Appointments">
            {appts.data?.length ? (
              <ul className="space-y-2 text-sm">
                {appts.data.map((a) => (
                  <li key={a.id}><Link href={`/appointments/${a.id}`} className="flex justify-between hover:underline"><span>{a.starts_at ? formatNyDateTime(a.starts_at) : `Requested ${formatNyDateTime(a.requested_at)}`}</span><StatusBadge status={a.status} /></Link></li>
                ))}
              </ul>
            ) : <Empty>None yet.</Empty>}
          </Card>
          <Card title="Certificates">
            {certs.data?.length ? (
              <ul className="space-y-2 text-sm">
                {certs.data.map((c) => (
                  <li key={c.id}><Link href={`/certificates/${c.id}`} className="flex justify-between hover:underline"><span>{c.pets?.name} · {c.certificate_number}</span><StatusBadge status={c.status} /></Link></li>
                ))}
              </ul>
            ) : <Empty>None yet.</Empty>}
          </Card>
          <Card title="Form submissions">
            {subs.data?.length ? (
              <ul className="space-y-2 text-sm">
                {subs.data.map((s) => (
                  <li key={s.id}><Link href={`/submissions/${s.id}`} className="flex justify-between hover:underline"><span>{formatNyDateTime(s.submitted_at)}{s.source === "jotform" ? " (Jotform)" : ""}</span><StatusBadge status={s.status} /></Link></li>
                ))}
              </ul>
            ) : <Empty>None yet.</Empty>}
          </Card>
          {!!mergedFrom.data?.length && (
            <Card title="Merged records">
              <ul className="text-sm">{mergedFrom.data.map((m) => <li key={m.id}><Link className="underline" href={`/clients/${m.id}`}>{m.first_name} {m.last_name}</Link></li>)}</ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
