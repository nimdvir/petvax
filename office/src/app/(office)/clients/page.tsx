import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { searchSafe } from "@/lib/fd";
import { Badge, Card, Empty, Input, LinkButton, PageHeader, Table, Td } from "@/components/ui";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; review?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireStaff();
  const q = searchSafe(sp.q ?? "");
  let query = supabase.from("owners").select("id, first_name, last_name, email, phone, city, review_status, pet_owners(pets(name))")
    .is("merged_into_id", null).order("last_name").order("first_name").limit(100);
  if (q) {
    const digits = q.replace(/\D/g, "");
    const parts = q.split(/\s+/).filter(Boolean);
    const ors = [`first_name.ilike.*${q}*`, `last_name.ilike.*${q}*`, `email.ilike.*${q}*`];
    if (parts.length === 2) ors.push(`and(first_name.ilike.*${parts[0]}*,last_name.ilike.*${parts[1]}*)`);
    if (digits.length >= 3) ors.push(`phone_digits.like.*${digits}*`);
    query = query.or(ors.join(","));
  }
  if (sp.review) query = query.eq("review_status", "needs_review");
  const { data } = await query;
  // Also find clients by pet name.
  let byPet: typeof data = [];
  if (q) {
    const pets = await supabase.from("pets").select("pet_owners(owner_id)").ilike("name", `%${q}%`).limit(50);
    const ids = [...new Set((pets.data ?? []).flatMap((p) => p.pet_owners.map((po) => po.owner_id)))].filter((id) => !data?.some((o) => o.id === id));
    if (ids.length) byPet = (await supabase.from("owners").select("id, first_name, last_name, email, phone, city, review_status, pet_owners(pets(name))").in("id", ids).is("merged_into_id", null)).data ?? [];
  }
  const rows = [...(data ?? []), ...(byPet ?? [])];
  return (
    <>
      <PageHeader title="Clients" actions={<LinkButton href="/clients/new" variant="primary">New client</LinkButton>} />
      <Card>
        <form className="mb-4 flex gap-2" role="search">
          <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search name, pet, email or phone" aria-label="Search clients" />
          <LinkButton href="/clients?review=1">Needs review</LinkButton>
        </form>
        {rows.length ? (
          <Table head={["Client", "Pets", "Contact", ""]}>
            {rows.map((o) => (
              <tr key={o.id}>
                <Td><Link className="font-medium text-brand-700 hover:underline" href={`/clients/${o.id}`}>{o.last_name ? `${o.last_name}, ${o.first_name}` : o.first_name}</Link></Td>
                <Td>{o.pet_owners.map((p) => p.pets?.name).filter(Boolean).join(", ") || "—"}</Td>
                <Td><div>{o.phone}</div><div className="text-gray-500">{o.email}</div></Td>
                <Td>{o.review_status === "needs_review" && <Badge color="yellow">possible duplicate</Badge>}</Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>{q ? "No clients match." : "No clients yet."}</Empty>}
      </Card>
    </>
  );
}
