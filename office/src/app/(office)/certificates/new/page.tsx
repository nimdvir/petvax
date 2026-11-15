import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { msg, searchSafe } from "@/lib/fd";
import { signerProblems } from "@/lib/certificates/data";
import { ageFromDob, formatDate, formatNyDateTime, formatNyTime, nyLocalToUtc, todayInNy } from "@/lib/time";
import { createCertificateForPet } from "../actions";
import { Badge, Card, Empty, Flash, Input, LinkButton, PageHeader } from "@/components/ui";
import { QuickCertificateForm } from "@/components/quick-certificate-form";
import type { ProductOption } from "@/components/vaccine-form";

export const metadata = { title: "New certificate" };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export default async function NewCertificatePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase, profile, userId } = await requireStaff(["vet", "admin"]);
  if (profile.role !== "vet") redirect(msg("/certificates", "error", "Only a clinician with signing rights can create certificates."));
  const today = todayInNy();
  const tomorrow = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10) + 1)).toISOString().slice(0, 10);
  const [me, settings, todays] = await Promise.all([
    supabase.from("staff_profiles").select("role, active, credentials, license_number").eq("user_id", userId).single(),
    supabase.from("app_settings").select("supervising_vet_name, supervising_vet_license").eq("id", true).single(),
    supabase.from("appointments").select("id, starts_at, owners(first_name, last_name), appointment_pets(pet_id, requested_vaccines, pets(id, name, species, breed))")
      .gte("starts_at", nyLocalToUtc(today, "00:00").toISOString()).lt("starts_at", nyLocalToUtc(tomorrow, "00:00").toISOString())
      .neq("status", "canceled").order("starts_at"),
  ]);
  const blocking = signerProblems(me.data, settings.data, false);
  const rabiesBlocked = signerProblems(me.data, settings.data, true).length > blocking.length;
  const setupNotice = (blocking.length > 0 || rabiesBlocked) && (
    <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900" role="status">
      <p className="font-semibold">{blocking.length ? "Before you can sign certificates:" : "Before you can sign rabies certificates:"}</p>
      <ul className="mt-1 list-disc pl-5">{(blocking.length ? blocking : signerProblems(me.data, settings.data, true)).map((b) => <li key={b}>{b}</li>)}</ul>
      <p className="mt-2"><Link className="font-medium underline" href="/settings/staff">Settings › Staff</Link> · <Link className="font-medium underline" href="/settings">Settings › Business</Link> (an admin can update these)</p>
    </div>
  );

  // ---------------------------------------------------------------- step 1: choose the pet
  if (!sp.pet) {
    const q = searchSafe(sp.q ?? "");
    let results: { id: string; name: string; species: string; breed: string | null; owner: string }[] = [];
    if (q) {
      const digits = q.replace(/\D/g, "");
      const ors = [`first_name.ilike.*${q}*`, `last_name.ilike.*${q}*`, `email.ilike.*${q}*`];
      const parts = q.split(/\s+/).filter(Boolean);
      if (parts.length === 2) ors.push(`and(first_name.ilike.*${parts[0]}*,last_name.ilike.*${parts[1]}*)`);
      if (digits.length >= 3) ors.push(`phone_digits.like.*${digits}*`);
      const [byName, byOwner] = await Promise.all([
        supabase.from("pets").select("id, name, species, breed, pet_owners(owners(first_name, last_name))").ilike("name", `%${q}%`).eq("deceased", false).limit(30),
        supabase.from("owners").select("first_name, last_name, pet_owners(pets(id, name, species, breed, deceased))").is("merged_into_id", null).or(ors.join(",")).limit(30),
      ]);
      const seen = new Set<string>();
      for (const p of byName.data ?? []) {
        const o = p.pet_owners[0]?.owners;
        if (!seen.has(p.id)) { seen.add(p.id); results.push({ id: p.id, name: p.name, species: p.species, breed: p.breed, owner: o ? `${o.first_name} ${o.last_name}` : "" }); }
      }
      for (const o of byOwner.data ?? []) for (const po of o.pet_owners) {
        const p = po.pets;
        if (p && !p.deceased && !seen.has(p.id)) { seen.add(p.id); results.push({ id: p.id, name: p.name, species: p.species, breed: p.breed, owner: `${o.first_name} ${o.last_name}` }); }
      }
      results = results.slice(0, 40);
    }
    const todayPets = (todays.data ?? []).flatMap((a) => a.appointment_pets.filter((ap) => ap.pets).map((ap) => ({ appt: a, pet: ap.pets!, requested: ap.requested_vaccines })));
    return (
      <>
        <PageHeader title="New certificate" subtitle="Step 1 of 2 — choose the pet" back={{ href: "/certificates", label: "Certificates" }} />
        <Flash params={sp} />
        {setupNotice}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Today's patients">
            {todayPets.length ? (
              <ul className="divide-y divide-gray-100">
                {todayPets.map(({ appt, pet, requested }) => (
                  <li key={`${appt.id}-${pet.id}`}>
                    <Link href={`/certificates/new?pet=${pet.id}&appointment=${appt.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-gray-50">
                      <div>
                        <div className="font-semibold">{pet.name} <span className="font-normal text-gray-600">· {appt.owners ? `${appt.owners.first_name} ${appt.owners.last_name}` : ""}</span></div>
                        <div className="text-sm text-gray-600">{formatNyTime(appt.starts_at)}{requested.length ? ` — requested ${requested.join(", ")}` : ""}</div>
                      </div>
                      <span className="text-sm font-medium text-brand-700">Start →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <Empty>No visits booked for today. Search for the pet instead.</Empty>}
          </Card>
          <Card title="Find a pet">
            <form role="search" className="flex gap-2">
              <Input name="q" defaultValue={sp.q ?? ""} placeholder="Pet name, client name or phone" aria-label="Search pets" autoFocus={!todayPets.length} />
            </form>
            {q && (results.length ? (
              <ul className="mt-3 divide-y divide-gray-100">
                {results.map((r) => (
                  <li key={r.id}>
                    <Link href={`/certificates/new?pet=${r.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-gray-50">
                      <div><div className="font-semibold">{r.name}</div><div className="text-sm text-gray-600">{[r.species, r.breed].filter(Boolean).join(", ")} · {r.owner}</div></div>
                      <span className="text-sm font-medium text-brand-700">Choose →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-gray-600">No pets match. <Link className="underline" href="/clients/new">Add a new client</Link>, or send them the <Link className="underline" href="/forms">registration form</Link>.</p>)}
          </Card>
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------- step 2: vaccines + sign
  const petRes = await supabase.from("pets").select("*, pet_owners(is_primary, owners(id, first_name, last_name, phone, email))").eq("id", sp.pet).maybeSingle();
  const pet = petRes.data;
  if (!pet) redirect(msg("/certificates/new", "error", "Pet not found."));
  const owner = pet.pet_owners.find((p) => p.is_primary)?.owners ?? pet.pet_owners[0]?.owners;
  let productsQuery = supabase.from("vaccine_products").select("*").eq("active", true).order("name");
  if (pet.species !== "other") productsQuery = productsQuery.eq("species", pet.species);
  const [products, lastLots, consent, history, apptPet] = await Promise.all([
    productsQuery,
    supabase.from("vaccinations").select("product_id, manufacturer, lot_number, serial_number, lot_expiration, route, site")
      .eq("administered_elsewhere", false).not("product_id", "is", null).eq("status", "active").order("created_at", { ascending: false }).limit(200),
    supabase.from("signed_consents").select("signed_at, signer_name").eq("pet_id", pet.id).order("signed_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("vaccinations").select("vaccine_name, administered_on, next_due_on").eq("pet_id", pet.id).eq("status", "active").order("administered_on", { ascending: false }).limit(8),
    sp.appointment ? supabase.from("appointment_pets").select("requested_vaccines").eq("appointment_id", sp.appointment).eq("pet_id", pet.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const last = new Map<string, ProductOption["last"]>();
  for (const l of lastLots.data ?? []) if (l.product_id && !last.has(l.product_id)) last.set(l.product_id, l);
  const options: ProductOption[] = (products.data ?? []).map((p) => ({ ...p, last: last.get(p.id) ?? null }));
  // Pre-tick what the client asked for (first matching product per request).
  const requested = (apptPet.data as { requested_vaccines: string[] } | null)?.requested_vaccines ?? [];
  const preselected = requested.map((r) => options.find((o) => norm(o.vaccine_type ?? "").startsWith(norm(r)) || norm(o.name).startsWith(norm(r)) || norm(r).startsWith(norm(o.vaccine_type ?? "-")))?.id)
    .filter((x): x is string => !!x);

  return (
    <>
      <PageHeader title={`Certificate for ${pet.name}`} subtitle="Step 2 of 2 — tick the vaccines given, check the lot numbers, sign."
        back={{ href: "/certificates/new", label: "Choose another pet" }} />
      <Flash params={sp} />
      {setupNotice}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <form action={createCertificateForPet.bind(null, pet.id)}>
              <QuickCertificateForm products={options} today={today} preselected={[...new Set(preselected)]} canSign={blocking.length === 0} />
            </form>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title={pet.name} actions={<LinkButton href={`/pets/${pet.id}`}>Edit</LinkButton>}>
            <p className="text-sm">{[pet.species, pet.breed, pet.sex !== "unknown" ? pet.sex : null, ageFromDob(pet.date_of_birth), pet.color, pet.weight_lb && `${pet.weight_lb} lb`].filter(Boolean).join(" · ")}</p>
            {pet.microchip && <p className="mt-1 text-sm">Microchip {pet.microchip}</p>}
            {owner && <p className="mt-3 text-sm"><Link className="font-medium text-brand-700 underline" href={`/clients/${owner.id}`}>{owner.first_name} {owner.last_name}</Link><br />{owner.phone}<br />{owner.email}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {consent.data ? <Badge color="green">Consent signed {formatNyDateTime(consent.data.signed_at)}</Badge> : <Badge color="red">No signed consent on file</Badge>}
              {pet.prior_reactions && <Badge color="yellow">Prior reaction: {pet.prior_reactions}</Badge>}
            </div>
            <p className="mt-3 text-xs text-gray-500">The certificate prints these details exactly. Fix anything wrong with “Edit” first.</p>
          </Card>
          <Card title="Vaccine history">
            {history.data?.length ? (
              <ul className="space-y-1 text-sm">{history.data.map((h, i) => <li key={i}>{h.vaccine_name} — {formatDate(h.administered_on)}{h.next_due_on ? ` · due ${formatDate(h.next_due_on)}` : ""}</li>)}</ul>
            ) : <Empty>None on file.</Empty>}
          </Card>
        </div>
      </div>
    </>
  );
}
