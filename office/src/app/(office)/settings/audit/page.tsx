import { requireStaff } from "@/lib/auth";
import { formatNyDateTime } from "@/lib/time";
import { Card, PageHeader, Table, Td } from "@/components/ui";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ table?: string; record?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireStaff(["admin"]);
  let q = supabase.from("audit_events").select("*").order("id", { ascending: false }).limit(300);
  if (sp.table) q = q.eq("table_name", sp.table);
  if (sp.record) q = q.eq("record_id", sp.record);
  const [{ data }, staff] = await Promise.all([q, supabase.from("staff_profiles").select("user_id, full_name")]);
  const names = new Map((staff.data ?? []).map((s) => [s.user_id, s.full_name]));
  return (
    <>
      <PageHeader title="Audit log" back={{ href: "/settings", label: "Settings" }} subtitle="Every change to client, clinical and form records, newest first. Entries are hash-chained and cannot be edited." />
      <Card>
        <Table head={["When", "Who", "Action", "Record", "Changes"]}>
          {(data ?? []).map((e) => (
            <tr key={e.id}>
              <Td className="whitespace-nowrap">{formatNyDateTime(e.occurred_at)}</Td>
              <Td>{e.actor_id ? names.get(e.actor_id) ?? e.actor_id.slice(0, 8) : e.actor_role}</Td>
              <Td>{e.action}</Td>
              <Td><a className="underline" href={`/settings/audit?table=${e.table_name}&record=${e.record_id}`}>{e.table_name}</a></Td>
              <Td><code className="line-clamp-3 break-all text-xs">{JSON.stringify((e.details as { changes?: unknown }).changes ?? Object.keys((e.details as { new?: object }).new ?? {}).length + " fields")}</code></Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
