import Link from "next/link";
import { can, requireStaff } from "@/lib/auth";
import { searchSafe } from "@/lib/fd";
import { formatDate, formatNyDateTime } from "@/lib/time";
import type { CertificateSnapshot } from "@/lib/certificates/data";
import { Card, Empty, Flash, Input, LinkButton, PageHeader, StatusBadge, Table, Td } from "@/components/ui";

export const metadata = { title: "Certificates" };

export default async function CertificatesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireStaff();
  const q = searchSafe(sp.q ?? "");
  let query = supabase.from("certificates").select("id, certificate_number, status, issued_at, pet_id, snapshot").order("issued_at", { ascending: false }).limit(100);
  if (q) query = query.or(`certificate_number.ilike.*${q}*,snapshot->pet->>name.ilike.*${q}*,snapshot->owner->>name.ilike.*${q}*`);
  const { data } = await query;
  return (
    <>
      <PageHeader title="Certificates" subtitle="Every signed vaccination certificate, newest first."
        actions={can.issueCertificates(profile.role) ? <LinkButton href="/certificates/new" variant="primary">New certificate</LinkButton> : undefined} />
      <Flash params={sp} />
      <Card>
        <form className="mb-4 flex gap-2" role="search">
          <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search pet, client or certificate number" aria-label="Search certificates" />
        </form>
        {data?.length ? (
          <Table head={["Certificate", "Pet", "Client", "Vaccines", "Issued"]}>
            {data.map((c) => {
              const s = c.snapshot as unknown as CertificateSnapshot;
              return (
                <tr key={c.id}>
                  <Td><Link className="font-medium text-brand-700 hover:underline" href={`/certificates/${c.id}`}>{c.certificate_number}</Link> {c.status !== "issued" && <StatusBadge status={c.status} />}</Td>
                  <Td>{s.pet.name}</Td>
                  <Td>{s.owner.name}</Td>
                  <Td className="text-gray-600">{s.vaccinations.map((v) => v.vaccine_name).join(", ")}</Td>
                  <Td>{formatDate(s.issued_on)}<div className="text-xs text-gray-500">{formatNyDateTime(c.issued_at).replace(/^.*, /, "")}</div></Td>
                </tr>
              );
            })}
          </Table>
        ) : <Empty>{q ? "No certificates match." : "No certificates yet. Press “New certificate” to make the first one."}</Empty>}
      </Card>
    </>
  );
}
