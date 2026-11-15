import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { formatDate, formatNyDateTime, utcToNyParts } from "@/lib/time";
import { appointmentLink, markFlag, openVisit, setStatus, updateSchedule } from "../actions";
import { Badge, Button, Card, DL, Field, Flash, Input, PageHeader, Select, StatusBadge } from "@/components/ui";
import { ScheduleFields } from "@/components/schedule-fields";
import { SubmitButton } from "@/components/submit-button";
import { CopyLink } from "@/components/copy-link";

export default async function AppointmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireStaff();
  const { data: a } = await supabase.from("appointments")
    .select("*, owners(id, first_name, last_name, phone, email), appointment_pets(requested_vaccines, pets(id, name, species, prior_reactions, allergies)), encounters(id, pet_id, soap_notes(status))")
    .eq("id", id).maybeSingle();
  if (!a) notFound();
  const [staff, templates, consents] = await Promise.all([
    supabase.from("staff_profiles").select("user_id, full_name, role").eq("active", true).in("role", ["vet", "admin"]).order("full_name"),
    supabase.from("form_templates").select("id, title, slug").eq("archived", false).order("title"),
    supabase.from("signed_consents").select("pet_id, signed_at").in("pet_id", a.appointment_pets.map((p) => p.pets?.id ?? "")).order("signed_at", { ascending: false }),
  ]);
  const lastConsent = new Map<string, string>();
  for (const c of consents.data ?? []) if (!lastConsent.has(c.pet_id)) lastConsent.set(c.pet_id, c.signed_at);
  const local = a.starts_at ? utcToNyParts(a.starts_at) : null;
  const minutes = a.starts_at && a.ends_at ? Math.round((+new Date(a.ends_at) - +new Date(a.starts_at)) / 60000) : 45;
  const owner = a.owners!;
  return (
    <>
      <PageHeader title={<>{owner.first_name} {owner.last_name} <StatusBadge status={a.status} /></>}
        subtitle={a.starts_at ? formatNyDateTime(a.starts_at) : "Not scheduled yet"}
        back={{ href: "/appointments", label: "Appointments" }}
        actions={<>
          {a.status === "requested" && <form action={setStatus.bind(null, id, "confirmed")}><Button>Confirm</Button></form>}
          {a.status === "confirmed" && <form action={setStatus.bind(null, id, "completed")}><Button>Mark completed</Button></form>}
        </>} />
      <Flash params={sp} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Pets at this visit">
            <ul className="divide-y divide-gray-100">
              {a.appointment_pets.map(({ pets: p, requested_vaccines }) => {
                if (!p) return null;
                const enc = a.encounters.find((e) => e.pet_id === p.id);
                const consent = lastConsent.get(p.id);
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <Link href={`/pets/${p.id}`} className="font-semibold text-brand-700 hover:underline">{p.name}</Link>
                      <span className="text-sm text-gray-600"> · {p.species}</span>
                      {requested_vaccines.length > 0 && <div className="text-sm text-gray-600">Requested: {requested_vaccines.join(", ")}</div>}
                      <div className="text-xs">{consent ? <Badge color="green">Consent signed {formatDate(consent.slice(0, 10))}</Badge> : <Badge color="red">No signed consent</Badge>}</div>
                      {(p.prior_reactions || p.allergies) && <div className="text-xs text-amber-800">⚠ {[p.prior_reactions, p.allergies].filter(Boolean).join("; ")}</div>}
                    </div>
                    <form action={openVisit.bind(null, id, p.id)}>
                      <Button variant={enc ? "secondary" : "primary"}>{enc ? `Open exam (${enc.soap_notes?.status ?? "draft"})` : "Start exam"}</Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card title="Schedule">
            <form action={updateSchedule.bind(null, id)} className="space-y-4">
              <ScheduleFields staff={staff.data ?? []} date={local?.date} time={local?.time} duration={minutes} staffId={a.assigned_staff_id} address={a.visit_address} notes={a.internal_notes} />
              <div className="flex flex-wrap items-end gap-4">
                <Field label="Follow-up on"><Input type="date" name="follow_up_on" defaultValue={a.follow_up_on ?? ""} /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allow_overlap" value="yes" /> Save anyway if it overlaps</label>
              </div>
              <SubmitButton variant="secondary">Save schedule</SubmitButton>
            </form>
          </Card>
          {a.client_notes && <Card title="From the client"><p className="whitespace-pre-line text-sm">{a.client_notes}</p></Card>}
        </div>
        <div className="space-y-4">
          <Card title="Client">
            <DL items={[["Phone", owner.phone], ["Email", owner.email]]} />
            <Link className="mt-3 inline-block text-sm text-brand-700 underline" href={`/clients/${owner.id}`}>Open client</Link>
          </Card>
          <Card title="Confirmation & reminders">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between">Client confirmed {a.client_confirmed_at ? <Badge color="green">{formatNyDateTime(a.client_confirmed_at)}</Badge> : <form action={markFlag.bind(null, id, "client_confirmed_at")}><button className="text-brand-700 underline">Record</button></form>}</li>
              <li className="flex items-center justify-between">Reminder sent {a.reminder_sent_at ? <Badge color="green">{formatNyDateTime(a.reminder_sent_at)}</Badge> : <form action={markFlag.bind(null, id, "reminder_sent_at")}><button className="text-brand-700 underline">Mark sent</button></form>}</li>
            </ul>
            {owner.phone && a.starts_at && (
              <a className="mt-3 inline-block text-sm text-brand-700 underline"
                href={`sms:${owner.phone.replace(/\D/g, "")}?&body=${encodeURIComponent(`Hi ${owner.first_name}, this is PetVax confirming your visit on ${formatNyDateTime(a.starts_at)}. Reply YES to confirm.`)}`}>
                Text a confirmation request
              </a>
            )}
          </Card>
          <Card title="Send forms for this visit">
            {sp.link ? <CopyLink url={sp.link} phone={owner.phone} email={owner.email} name={owner.first_name} /> : (
              <form action={appointmentLink.bind(null, id)} className="space-y-2">
                <Select name="template_id" aria-label="Form" defaultValue={templates.data?.find((t) => t.slug === "vaccination-consent")?.id}>
                  {(templates.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </Select>
                <SubmitButton variant="secondary" className="w-full">Create link</SubmitButton>
              </form>
            )}
          </Card>
          {a.status !== "canceled" && a.status !== "completed" && (
            <Card title="Cancel">
              <form action={setStatus.bind(null, id, "canceled")} className="space-y-2">
                <Input name="cancel_reason" placeholder="Reason (optional)" aria-label="Cancel reason" />
                <SubmitButton variant="danger" className="w-full">Cancel appointment</SubmitButton>
              </form>
            </Card>
          )}
          {a.status === "canceled" && <p className="text-sm text-gray-600">Canceled {formatNyDateTime(a.canceled_at)}{a.cancel_reason && ` — ${a.cancel_reason}`}</p>}
        </div>
      </div>
    </>
  );
}
