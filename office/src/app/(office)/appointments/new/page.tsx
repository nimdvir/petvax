import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { searchSafe } from "@/lib/fd";
import { createAppointment } from "../actions";
import { Card, Flash, Input, PageHeader, Select } from "@/components/ui";
import { ScheduleFields } from "@/components/schedule-fields";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "New appointment" };

export default async function NewAppointment({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase } = await requireStaff();
  if (!sp.owner) {
    const q = searchSafe(sp.q ?? "");
    const owners = q
      ? (await supabase.from("owners").select("id, first_name, last_name, phone").is("merged_into_id", null)
          .or(`first_name.ilike.*${q}*,last_name.ilike.*${q}*,email.ilike.*${q}*`).limit(20)).data ?? []
      : [];
    return (
      <>
        <PageHeader title="New appointment" subtitle="Step 1: find the client" back={{ href: "/appointments", label: "Appointments" }} />
        <Flash params={sp} />
        <Card>
          <form className="flex gap-2" role="search"><Input name="q" defaultValue={sp.q ?? ""} placeholder="Client name or email" autoFocus aria-label="Find client" /><SubmitButton variant="secondary">Search</SubmitButton></form>
          <ul className="mt-4 divide-y">
            {owners.map((o) => <li key={o.id}><Link className="block py-2 text-brand-700 hover:underline" href={`/appointments/new?owner=${o.id}`}>{o.first_name} {o.last_name} <span className="text-gray-500">{o.phone}</span></Link></li>)}
          </ul>
          <p className="mt-4 text-sm text-gray-600">New client? <Link className="text-brand-700 underline" href="/clients/new">Add them first</Link>.</p>
        </Card>
      </>
    );
  }
  const [owner, staff, settings] = await Promise.all([
    supabase.from("owners").select("id, first_name, last_name, address_line1, address_line2, city, state, postal_code, pet_owners(pets(id, name, species))").eq("id", sp.owner).single(),
    supabase.from("staff_profiles").select("user_id, full_name, role").eq("active", true).in("role", ["vet", "admin"]).order("full_name"),
    supabase.from("app_settings").select("default_visit_minutes").eq("id", true).single(),
  ]);
  const o = owner.data;
  if (!o) return <p>Client not found.</p>;
  const address = [o.address_line1, o.address_line2, o.city, o.state, o.postal_code].filter(Boolean).join(", ");
  return (
    <>
      <PageHeader title="New appointment" subtitle={`${o.first_name} ${o.last_name}`} back={{ href: `/clients/${o.id}`, label: "Client" }} />
      <Flash params={sp} />
      <Card>
        <form action={createAppointment} className="space-y-5">
          <input type="hidden" name="owner_id" value={o.id} />
          <fieldset>
            <legend className="text-sm font-medium">Pets</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {o.pet_owners.map(({ pets: p }) => p && (
                <label key={p.id} className="flex min-h-[44px] items-center gap-2 rounded-lg border px-3"><input type="checkbox" name="pet_ids" value={p.id} defaultChecked className="h-5 w-5 accent-brand-700" />{p.name}</label>
              ))}
              {!o.pet_owners.length && <p className="text-sm text-gray-600">Add a pet on the <Link className="underline" href={`/clients/${o.id}`}>client page</Link> first.</p>}
            </div>
          </fieldset>
          <ScheduleFields staff={staff.data ?? []} duration={settings.data?.default_visit_minutes} address={address} />
          <div className="flex flex-wrap items-center gap-4">
            <label className="text-sm">Status <Select name="status" defaultValue="confirmed" className="inline-block w-auto"><option value="confirmed">Confirmed</option><option value="requested">Requested (tentative)</option></Select></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allow_overlap" value="yes" /> Book anyway if it overlaps (requests only)</label>
          </div>
          <SubmitButton>Save appointment</SubmitButton>
        </form>
      </Card>
    </>
  );
}
