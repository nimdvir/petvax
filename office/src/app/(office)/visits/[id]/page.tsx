import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireStaff } from "@/lib/auth";
import { buildCertificateDraft } from "@/lib/certificates/data";
import { ageFromDob, formatDate, formatNyDateTime, todayInNy } from "@/lib/time";
import { addVaccination, correctVaccination, issueVisitCertificate, saveSoap, voidVaccination } from "../actions";
import { Badge, Card, Empty, Field, Flash, Input, PageHeader, Select, StatusBadge, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { VaccineFields, type ProductOption } from "@/components/vaccine-form";

export default async function VisitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, profile, userId } = await requireStaff();
  const { data: e } = await supabase.from("encounters")
    .select("*, pets(*), owners(id, first_name, last_name), appointments(id, starts_at, client_notes), soap_notes(*), staff_profiles(full_name)")
    .eq("id", id).maybeSingle();
  if (!e || !e.pets) notFound();
  const pet = e.pets;
  const [vax, products, lastLots, consent, certs, revisions, clinicians, appointmentPet] = await Promise.all([
    supabase.from("vaccinations").select("*").eq("encounter_id", id).order("created_at"),
    supabase.from("vaccine_products").select("*").eq("active", true).eq("species", pet.species === "other" ? "dog" : pet.species).order("name"),
    supabase.from("vaccinations").select("product_id, manufacturer, lot_number, serial_number, lot_expiration, route, site")
      .eq("administered_elsewhere", false).not("product_id", "is", null).eq("status", "active").order("created_at", { ascending: false }).limit(200),
    supabase.from("signed_consents").select("signed_at, signer_name").eq("pet_id", pet.id).order("signed_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("certificates").select("id, certificate_number, status, issued_at").eq("encounter_id", id).order("issued_at", { ascending: false }),
    e.soap_notes ? supabase.from("soap_note_revisions").select("revision, status, edited_at, edited_by").eq("soap_note_id", e.soap_notes.id).order("revision", { ascending: false }) : Promise.resolve({ data: [] as { revision: number; status: string; edited_at: string; edited_by: string | null }[] }),
    supabase.from("staff_profiles").select("user_id, full_name, role, active").order("full_name"),
    e.appointment_id ? supabase.from("appointment_pets").select("requested_vaccines").eq("appointment_id", e.appointment_id).eq("pet_id", pet.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const last = new Map<string, ProductOption["last"]>();
  for (const l of lastLots.data ?? []) if (l.product_id && !last.has(l.product_id)) last.set(l.product_id, l);
  const productOptions: ProductOption[] = (products.data ?? []).map((p) => ({ ...p, last: last.get(p.id) ?? null }));

  const staffName = new Map((clinicians.data ?? []).map((c) => [c.user_id, c.full_name]));
  const givers = (clinicians.data ?? []).filter((c) => c.active && c.role !== "staff");
  const note = e.soap_notes;
  const locked = note && note.status !== "draft";
  const clinical = can.clinical(profile.role);
  const active = (vax.data ?? []).filter((v) => v.status === "active" && !v.administered_elsewhere);
  const certDraft = can.issueCertificates(profile.role) && active.length
    ? await buildCertificateDraft(supabase, { vaccinationIds: active.map((v) => v.id), issuerId: userId }).catch(() => null)
    : null;
  const requested = (appointmentPet.data as { requested_vaccines: string[] } | null)?.requested_vaccines ?? [];

  // Pre-fill the subjective section from what the client already told us.
  const subjectiveDefault = note?.subjective ?? [
    e.appointments?.client_notes && `Client notes: ${e.appointments.client_notes}`,
    pet.prior_reactions && `Prior vaccine reactions: ${pet.prior_reactions}`,
    pet.medical_conditions && `Medical conditions: ${pet.medical_conditions}`,
    pet.medications && `Medications: ${pet.medications}`,
    requested.length && `Requested vaccines: ${requested.join(", ")}`,
  ].filter(Boolean).join("\n");
  const v = (k: keyof NonNullable<typeof note>) => (note?.[k] ?? "") as string | number;

  return (
    <>
      <PageHeader
        title={<>{pet.name} <span className="text-base font-normal text-gray-600">· {formatDate(e.encounter_date)}</span></>}
        subtitle={<>{[pet.species, pet.breed, ageFromDob(pet.date_of_birth), pet.weight_lb && `${pet.weight_lb} lb`].filter(Boolean).join(" · ")} — <Link className="text-brand-700 underline" href={`/clients/${e.owners?.id}`}>{e.owners?.first_name} {e.owners?.last_name}</Link></>}
        back={e.appointment_id ? { href: `/appointments/${e.appointment_id}`, label: "Appointment" } : { href: `/pets/${pet.id}`, label: pet.name }} />
      <Flash params={sp} />

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {consent.data ? <Badge color="green">Consent signed {formatNyDateTime(consent.data.signed_at)} by {consent.data.signer_name}</Badge> : <Badge color="red">No signed consent on file</Badge>}
        {pet.prior_reactions && <Badge color="yellow">Prior reaction: {pet.prior_reactions}</Badge>}
        {pet.allergies && <Badge color="yellow">Allergies: {pet.allergies}</Badge>}
        {requested.length > 0 && <Badge color="blue">Requested: {requested.join(", ")}</Badge>}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card title={<>SOAP note {note && <StatusBadge status={note.status} />}</>}>
            {!clinical ? <p className="text-sm text-gray-600">Only clinicians can edit SOAP notes.</p> : (
              <form action={saveSoap.bind(null, id)} className="space-y-4">
                <Field label="S — Subjective (owner concerns, history)"><Textarea name="subjective" defaultValue={subjectiveDefault} rows={4} /></Field>
                <fieldset className="rounded-lg border border-gray-200 p-3">
                  <legend className="px-1 text-sm font-semibold">O — Objective (pre-vaccination exam)</legend>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Field label="Temp"><Input name="temperature" inputMode="decimal" defaultValue={v("temperature")} /></Field>
                    <Field label="Unit"><Select name="temperature_unit" defaultValue={note?.temperature_unit ?? "F"}><option>F</option><option>C</option></Select></Field>
                    <Field label="Heart rate (bpm)"><Input name="heart_rate_bpm" inputMode="numeric" defaultValue={v("heart_rate_bpm")} /></Field>
                    <Field label="Resp. rate (bpm)"><Input name="respiratory_rate_bpm" inputMode="numeric" defaultValue={v("respiratory_rate_bpm")} /></Field>
                    <Field label="Weight"><Input name="weight" inputMode="decimal" defaultValue={note?.weight ?? pet.weight_lb ?? ""} /></Field>
                    <Field label="Unit"><Select name="weight_unit" defaultValue={note?.weight_unit ?? "lb"}><option>lb</option><option>kg</option></Select></Field>
                    <Field label="Body condition"><Input name="body_condition_score" inputMode="decimal" defaultValue={v("body_condition_score")} /></Field>
                    <Field label="BCS scale"><Select name="body_condition_scale" defaultValue={String(note?.body_condition_scale ?? 9)}><option value="9">/ 9</option><option value="5">/ 5</option></Select></Field>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="General appearance"><Input name="general_appearance" defaultValue={v("general_appearance") || (note ? "" : "BAR (bright, alert, responsive)")} /></Field>
                    <Field label="Exam findings"><Input name="exam_findings" defaultValue={v("exam_findings")} placeholder="Eyes, ears, oral, heart/lungs, lymph nodes, skin…" /></Field>
                  </div>
                  <Field label="Other objective notes" className="mt-3"><Textarea name="objective_notes" defaultValue={v("objective_notes")} rows={2} /></Field>
                </fieldset>
                <Field label="A — Assessment"><Textarea name="assessment" defaultValue={v("assessment")} rows={2} /></Field>
                <Field label="Fit for vaccination?">
                  <Select name="fit_for_vaccination" defaultValue={note?.fit_for_vaccination === true ? "yes" : note?.fit_for_vaccination === false ? "no" : ""}>
                    <option value="">—</option><option value="yes">Yes</option><option value="no">No — defer</option>
                  </Select>
                </Field>
                <Field label="P — Plan (vaccines, recommendations)"><Textarea name="plan" defaultValue={v("plan")} rows={3} /></Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Reactions observed after vaccination"><Input name="observed_reactions" defaultValue={v("observed_reactions")} placeholder="None observed" /></Field>
                  <Field label="Follow-up"><Input name="follow_up" defaultValue={v("follow_up")} /></Field>
                </div>
                {locked ? (
                  <div className="space-y-2 rounded-lg bg-amber-50 p-3">
                    <p className="text-sm text-amber-900">This note is {note!.status}. Changes are saved as a dated amendment; earlier versions are kept.</p>
                    <Field label="Reason for amendment *"><Input name="amendment_reason" required /></Field>
                    <SubmitButton name="intent" value="amend">Save amendment</SubmitButton>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <SubmitButton name="intent" value="draft" variant="secondary">Save draft</SubmitButton>
                    <SubmitButton name="intent" value="final">Finalize note</SubmitButton>
                  </div>
                )}
              </form>
            )}
            {!!revisions.data?.length && (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer text-gray-600">History ({revisions.data.length} saved versions)</summary>
                <ul className="mt-2 space-y-1 text-gray-600">
                  {revisions.data.map((r) => <li key={r.revision}>v{r.revision} · {r.status} · {formatNyDateTime(r.edited_at)} · {staffName.get(r.edited_by ?? "") ?? "unknown"}</li>)}
                </ul>
              </details>
            )}
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card title="Vaccines given at this visit" className="scroll-mt-24">
            <div id="vaccines" />
            {vax.data?.length ? (
              <ul className="space-y-3">
                {vax.data.map((x) => (
                  <li key={x.id} className={`rounded-lg border p-3 text-sm ${x.status !== "active" ? "bg-gray-50 text-gray-500" : ""}`}>
                    <div className="flex items-center justify-between gap-2"><span className="font-semibold">{x.vaccine_name}</span><StatusBadge status={x.status} /></div>
                    <div>{x.manufacturer ?? "—"} · Lot {x.lot_number ?? "—"}{x.lot_expiration && ` (exp ${formatDate(x.lot_expiration)})`}</div>
                    <div>{[x.route, x.site].filter(Boolean).join(" / ") || "—"} · Next due {formatDate(x.next_due_on)}</div>
                    {x.rabies_tag_number && <div>Tag {x.rabies_tag_number}</div>}
                    {x.adverse_reaction && <div className="text-red-700">Reaction: {x.adverse_reaction}</div>}
                    {x.correction_reason && <div className="text-xs italic">{x.supersedes_id ? "Correction" : "Voided"}: {x.correction_reason}</div>}
                    {x.status === "active" && clinical && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-brand-700 underline">Correct or void</summary>
                        <form action={correctVaccination.bind(null, id, x.id)} className="mt-2 space-y-2 border-t pt-2">
                          <VaccineFields products={productOptions} today={x.administered_on} defaults={{ ...x, product_id: x.product_id }} />
                          <Input name="correction_reason" placeholder="Reason for correction *" required aria-label="Reason for correction" />
                          <SubmitButton variant="secondary">Save correction</SubmitButton>
                        </form>
                        <form action={voidVaccination.bind(null, id, x.id)} className="mt-2 flex gap-2">
                          <Input name="correction_reason" placeholder="Reason to void *" required aria-label="Reason to void" />
                          <SubmitButton variant="danger">Void</SubmitButton>
                        </form>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            ) : <Empty>No vaccines recorded yet.</Empty>}
            {clinical && (
              <details className="mt-4" open={!vax.data?.length}>
                <summary className="cursor-pointer font-medium text-brand-700">+ Add vaccine</summary>
                <form action={addVaccination.bind(null, id)} className="mt-3 space-y-3">
                  <VaccineFields products={productOptions} today={todayInNy()} staff={givers} defaultGivenBy={e.clinician_id ?? userId} />
                  <SubmitButton>Save vaccine</SubmitButton>
                </form>
              </details>
            )}
          </Card>

          <Card title="Certificate">
            {certs.data?.map((c) => (
              <Link key={c.id} href={`/certificates/${c.id}`} className="mb-2 flex justify-between rounded-lg border p-2 text-sm hover:bg-gray-50">
                <span>{c.certificate_number}</span><StatusBadge status={c.status} />
              </Link>
            ))}
            {!can.issueCertificates(profile.role) ? <p className="text-sm text-gray-600">A veterinarian signs and issues certificates.</p>
              : !active.length ? <Empty>Record vaccines first.</Empty> : (
              <form action={issueVisitCertificate.bind(null, id)} className="space-y-3">
                <fieldset className="space-y-1">
                  <legend className="text-sm font-medium">Include</legend>
                  {active.map((x) => <label key={x.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="vaccination_ids" value={x.id} defaultChecked className="h-4 w-4 accent-brand-700" />{x.vaccine_name}</label>)}
                </fieldset>
                {certDraft?.readiness.blocking.length ? (
                  <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
                    <p className="font-semibold">Fix before issuing:</p>
                    <ul className="list-disc pl-5">{certDraft.readiness.blocking.map((b, i) => <li key={i}>{b}</li>)}</ul>
                  </div>
                ) : null}
                {certDraft?.readiness.warnings.length ? (
                  <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-semibold">Will print as “Not recorded”:</p>
                    <ul className="list-disc pl-5">{certDraft.readiness.warnings.map((b, i) => <li key={i}>{b}</li>)}</ul>
                  </div>
                ) : null}
                <SubmitButton disabled={!!certDraft?.readiness.blocking.length} pendingText="Generating PDF…">Sign & generate certificate</SubmitButton>
                <p className="text-xs text-gray-500">Signed electronically as {profile.full_name}{profile.credentials ? `, ${profile.credentials}` : ""}.</p>
              </form>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
