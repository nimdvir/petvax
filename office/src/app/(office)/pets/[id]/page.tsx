import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireStaff } from "@/lib/auth";
import { ageFromDob, formatDate, formatNyDateTime } from "@/lib/time";
import { updatePet } from "../../clients/actions";
import { addOutsideVaccine, startVisit } from "../actions";
import { PetFields } from "@/components/record-forms";
import { Badge, Button, Card, DL, Empty, Field, Flash, Input, LinkButton, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export default async function PetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, profile } = await requireStaff();
  const { data: p } = await supabase.from("pets").select("*, pet_owners(is_primary, relationship, owners(id, first_name, last_name))").eq("id", id).maybeSingle();
  if (!p) notFound();
  const [vax, encounters, consents, certs] = await Promise.all([
    supabase.from("vaccinations").select("*, staff_profiles!vaccinations_administered_by_fkey(full_name)").eq("pet_id", id).order("administered_on", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("encounters").select("id, encounter_date, soap_notes(status), staff_profiles(full_name)").eq("pet_id", id).order("encounter_date", { ascending: false }),
    supabase.from("signed_consents").select("id, signed_at, signer_name, signer_relationship, signature_path, source, record_hash").eq("pet_id", id).order("signed_at", { ascending: false }),
    supabase.from("certificates").select("id, certificate_number, issued_at, status").eq("pet_id", id).order("issued_at", { ascending: false }),
  ]);
  const sigUrls = new Map<string, string>();
  for (const c of consents.data ?? []) {
    if (!c.signature_path) continue;
    const u = await supabase.storage.from("consent-signatures").createSignedUrl(c.signature_path, 300);
    if (u.data) sigUrls.set(c.id, u.data.signedUrl);
  }
  const owners = p.pet_owners.map((po) => po.owners).filter(Boolean);
  const alerts = [p.prior_reactions && `Prior reactions: ${p.prior_reactions}`, p.allergies && `Allergies: ${p.allergies}`, p.medical_conditions && `Conditions: ${p.medical_conditions}`].filter(Boolean);
  return (
    <>
      <PageHeader title={p.name}
        subtitle={<>{[p.species, p.breed, ageFromDob(p.date_of_birth)].filter(Boolean).join(" · ")} — owner {owners.map((o, i) => <span key={o!.id}>{i > 0 && ", "}<Link className="text-brand-700 underline" href={`/clients/${o!.id}`}>{o!.first_name} {o!.last_name}</Link></span>)}</>}
        back={owners[0] ? { href: `/clients/${owners[0].id}`, label: "Client" } : undefined}
        actions={can.clinical(profile.role) ? <>
          {can.issueCertificates(profile.role) && <LinkButton href={`/certificates/new?pet=${id}`} variant="primary">New certificate</LinkButton>}
          <form action={startVisit.bind(null, id)}><Button variant="secondary">Start full visit</Button></form>
        </> : undefined} />
      <Flash params={sp} />
      {alerts.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="note">
          {alerts.map((a, i) => <div key={i}>⚠ {a}</div>)}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Vaccination history">
            {vax.data?.length ? (
              <Table head={["Vaccine", "Given", "Next due", "Lot", "By", ""]}>
                {vax.data.map((v) => (
                  <tr key={v.id} className={v.status !== "active" ? "text-gray-400 line-through" : ""}>
                    <Td><span className="font-medium">{v.vaccine_name}</span>{v.adverse_reaction && <div className="text-xs text-red-700 no-underline">Reaction: {v.adverse_reaction}</div>}</Td>
                    <Td>{formatDate(v.administered_on)}</Td>
                    <Td>{formatDate(v.next_due_on)}</Td>
                    <Td>{v.lot_number ?? "—"}</Td>
                    <Td>{v.administered_elsewhere ? <Badge>{v.administered_by_name ?? "elsewhere"}</Badge> : v.staff_profiles?.full_name}</Td>
                    <Td>{v.status !== "active" && <StatusBadge status={v.status} />}{v.encounter_id && <Link className="ml-1 text-xs text-brand-700 underline" href={`/visits/${v.encounter_id}`}>visit</Link>}</Td>
                  </tr>
                ))}
              </Table>
            ) : <Empty>No vaccinations recorded.</Empty>}
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-brand-700 underline">Record a vaccine given elsewhere</summary>
              <form action={addOutsideVaccine.bind(null, id)} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Vaccine *"><Input name="vaccine_name" required /></Field>
                <Field label="Date given *"><Input name="administered_on" type="date" required /></Field>
                <Field label="Next due"><Input name="next_due_on" type="date" /></Field>
                <Field label="Given by"><Input name="administered_by_name" placeholder="Clinic / vet name" /></Field>
                <Field label="Manufacturer"><Input name="manufacturer" /></Field>
                <Field label="Lot"><Input name="lot_number" /></Field>
                <div className="sm:col-span-3"><SubmitButton variant="secondary">Save history</SubmitButton></div>
              </form>
            </details>
          </Card>
          <Card title="Visits & SOAP notes">
            {encounters.data?.length ? (
              <ul className="divide-y divide-gray-100">
                {encounters.data.map((e) => (
                  <li key={e.id}><Link href={`/visits/${e.id}`} className="flex justify-between py-2 hover:underline"><span>{formatDate(e.encounter_date)} · {e.staff_profiles?.full_name ?? "—"}</span><StatusBadge status={e.soap_notes?.status ?? "draft"} /></Link></li>
                ))}
              </ul>
            ) : <Empty>No visits yet.</Empty>}
          </Card>
          <Card title="Details">
            <details>
              <summary className="cursor-pointer list-none">
                <DL items={[
                  ["Sex", `${p.sex}${p.spayed_neutered === true ? " (spayed/neutered)" : p.spayed_neutered === false ? " (intact)" : ""}`],
                  ["Date of birth", p.date_of_birth ? formatDate(p.date_of_birth) : p.estimated_age_years ? `~${p.estimated_age_years} yrs (est.)` : null],
                  ["Color", p.color], ["Weight", p.weight_lb ? `${p.weight_lb} lb` : null], ["Microchip", p.microchip],
                  ["Medications", p.medications], ["Diet", p.diet], ["History notes", p.vaccine_history_notes],
                  ["Lifestyle", Object.entries((p.lifestyle as Record<string, boolean>) ?? {}).filter(([, v]) => v).map(([k]) => k).join(", ")],
                ]} />
                <span className="mt-3 inline-block text-sm text-brand-700 underline">Edit</span>
              </summary>
              <form action={updatePet.bind(null, id)} className="mt-4 space-y-4 border-t pt-4">
                <PetFields p={p} />
                <SubmitButton>Save</SubmitButton>
              </form>
            </details>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Signed consents">
            {consents.data?.length ? (
              <ul className="space-y-3 text-sm">
                {consents.data.map((c) => (
                  <li key={c.id} className="rounded-lg border border-gray-200 p-2">
                    <div className="font-medium">{formatNyDateTime(c.signed_at)}</div>
                    <div className="text-gray-600">{c.signer_name} ({c.signer_relationship}){c.source === "jotform" && " · Jotform"}</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {sigUrls.get(c.id) && <img src={sigUrls.get(c.id)} alt={`Signature of ${c.signer_name}`} className="mt-1 h-14 rounded border bg-white" />}
                    <div className="mt-1 truncate font-mono text-[10px] text-gray-400" title="Tamper-evident record hash">#{c.record_hash.slice(0, 16)}</div>
                  </li>
                ))}
              </ul>
            ) : <Empty>No consent on file. Send the consent form before vaccinating.</Empty>}
          </Card>
          <Card title="Certificates">
            {certs.data?.length ? (
              <ul className="space-y-2 text-sm">
                {certs.data.map((c) => (
                  <li key={c.id}><Link className="flex justify-between hover:underline" href={`/certificates/${c.id}`}><span>{c.certificate_number}</span><StatusBadge status={c.status} /></Link></li>
                ))}
              </ul>
            ) : <Empty>None yet.</Empty>}
          </Card>
        </div>
      </div>
    </>
  );
}
