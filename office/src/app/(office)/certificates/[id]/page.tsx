import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireStaff } from "@/lib/auth";
import { formatDate, formatNyDateTime } from "@/lib/time";
import type { CertificateSnapshot } from "@/lib/certificates/data";
import { emailCertificate, voidCertificate } from "../actions";
import { Badge, Card, DL, Empty, Flash, Input, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export default async function CertificatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, profile } = await requireStaff();
  const { data: c } = await supabase.from("certificates").select("*, owners(id, email), staff_profiles(full_name)").eq("id", id).maybeSingle();
  if (!c) notFound();
  const deliveries = await supabase.from("email_deliveries").select("*").eq("certificate_id", id).order("created_at", { ascending: false });
  const snap = c.snapshot as unknown as CertificateSnapshot;
  return (
    <>
      <PageHeader title={<>{c.certificate_number} <StatusBadge status={c.status} /></>}
        subtitle={`${snap.pet.name} · issued ${formatNyDateTime(c.issued_at)} by ${c.staff_profiles?.full_name}`}
        back={c.encounter_id ? { href: `/visits/${c.encounter_id}`, label: "Visit" } : { href: `/pets/${c.pet_id}`, label: snap.pet.name }}
        actions={<>
          <LinkButton href={`/api/certificates/${id}/pdf`} target="_blank" variant="primary">View / print PDF</LinkButton>
          <LinkButton href={`/api/certificates/${id}/pdf?download=1`}>Download</LinkButton>
        </>} />
      <Flash params={sp} />
      {c.status === "voided" && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">Voided {formatNyDateTime(c.voided_at)}: {c.voided_reason}</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="What's on the certificate" className="lg:col-span-2">
          <DL items={[["Owner", snap.owner.name], ["Pet", `${snap.pet.name} (${snap.pet.species}${snap.pet.breed ? `, ${snap.pet.breed}` : ""})`], ["Microchip", snap.pet.microchip], ["Signed by", `${snap.signer.name}, ${snap.signer.credentials} · License ${snap.signer.license_number}`]]} />
          <ul className="mt-4 space-y-1 text-sm">
            {snap.vaccinations.map((v) => <li key={v.id}><span className="font-medium">{v.vaccine_name}</span> — {formatDate(v.administered_on)} · lot {v.lot_number ?? v.serial_number} · next due {formatDate(v.next_due_on)}</li>)}
          </ul>
          <p className="mt-4 break-all text-xs text-gray-500">PDF SHA-256: {c.pdf_sha256 ?? "not stored yet"} · Verify: <a className="underline" href={snap.verify_url}>{snap.verify_url}</a></p>
        </Card>
        <div className="space-y-4">
          {c.status === "issued" && (
            <Card title="Email to client">
              {c.owners?.email ? (
                <form action={emailCertificate.bind(null, id)} className="space-y-2">
                  <p className="text-sm">Send to <strong>{c.owners.email}</strong></p>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm_email" value={c.owners.email} required /> I confirmed this address with the client</label>
                  <SubmitButton className="w-full" pendingText="Sending…">Send certificate</SubmitButton>
                </form>
              ) : <p className="text-sm">No email on file. <Link className="underline" href={`/clients/${c.owners?.id}`}>Add one</Link>.</p>}
            </Card>
          )}
          <Card title="Delivery log">
            {deliveries.data?.length ? (
              <ul className="space-y-2 text-sm">
                {deliveries.data.map((d) => <li key={d.id}>{formatNyDateTime(d.created_at)} → {d.to_email} <Badge color={d.status === "sent" ? "green" : "red"}>{d.status.replace("_", " ")}</Badge>{d.error && <div className="text-xs text-red-700">{d.error}</div>}</li>)}
              </ul>
            ) : <Empty>Not sent yet.</Empty>}
          </Card>
          {c.status === "issued" && can.clinical(profile.role) && (
            <Card title="Void certificate">
              <form action={voidCertificate.bind(null, id)} className="space-y-2">
                <Input name="voided_reason" placeholder="Reason *" required aria-label="Reason to void" />
                <SubmitButton variant="danger" className="w-full">Void</SubmitButton>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
