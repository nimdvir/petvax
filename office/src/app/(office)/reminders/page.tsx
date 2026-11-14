import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { addMonths, formatDate, todayInNy } from "@/lib/time";
import { Badge, Card, Empty, PageHeader, Table, Td } from "@/components/ui";

export const metadata = { title: "Due soon" };

export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ months?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireStaff();
  const today = todayInNy();
  const months = Math.min(Math.max(Number(sp.months ?? 2), 1), 12);
  const { data } = await supabase.from("vaccinations")
    .select("id, pet_id, vaccine_type, vaccine_name, next_due_on, administered_on, pets(name, deceased), owners(id, first_name, last_name, phone, email, preferred_contact)")
    .eq("status", "active").not("next_due_on", "is", null)
    .gte("next_due_on", addMonths(today, -3)).lte("next_due_on", addMonths(today, months)).order("next_due_on").limit(500);
  // Skip vaccines that have already been repeated (a newer active record of the same type for the same pet).
  const petIds = [...new Set((data ?? []).map((v) => v.pet_id))];
  const newer = petIds.length ? (await supabase.from("vaccinations").select("pet_id, vaccine_type, administered_on").in("pet_id", petIds).eq("status", "active")).data ?? [] : [];
  const rows = (data ?? []).filter((v) => !v.pets?.deceased && !newer.some((n) => n.pet_id === v.pet_id && n.vaccine_type === v.vaccine_type && n.administered_on > v.administered_on));
  return (
    <>
      <PageHeader title="Vaccines due" subtitle={`Overdue (last 3 months) and due in the next ${months} months`} />
      <div className="mb-3 flex gap-2 text-sm">{[1, 2, 3, 6].map((m) => <Link key={m} href={`/reminders?months=${m}`} className={`rounded-full border px-3 py-1 ${m === months ? "border-brand-700 bg-brand-50" : ""}`}>{m} mo</Link>)}</div>
      <Card>
        {rows.length ? (
          <Table head={["Due", "Pet", "Vaccine", "Client", "Reach out"]}>
            {rows.map((v) => {
              const o = v.owners;
              const text = `Hi ${o?.first_name}, ${v.pets?.name}'s ${v.vaccine_name} is due ${formatDate(v.next_due_on)}. Reply to book a PetVax house call!`;
              return (
                <tr key={v.id}>
                  <Td>{formatDate(v.next_due_on)} {v.next_due_on! < today && <Badge color="red">overdue</Badge>}</Td>
                  <Td><Link className="text-brand-700 underline" href={`/pets/${v.pet_id}`}>{v.pets?.name}</Link></Td>
                  <Td>{v.vaccine_name}</Td>
                  <Td><Link className="underline" href={`/clients/${o?.id}`}>{o?.first_name} {o?.last_name}</Link></Td>
                  <Td className="space-x-2 whitespace-nowrap">
                    {o?.phone && <a className="text-brand-700 underline" href={`sms:${o.phone.replace(/\D/g, "")}?&body=${encodeURIComponent(text)}`}>Text</a>}
                    {o?.email && <a className="text-brand-700 underline" href={`mailto:${o.email}?subject=${encodeURIComponent(`${v.pets?.name}'s vaccine is due`)}&body=${encodeURIComponent(text)}`}>Email</a>}
                  </Td>
                </tr>
              );
            })}
          </Table>
        ) : <Empty>Nothing due in this window.</Empty>}
      </Card>
    </>
  );
}
