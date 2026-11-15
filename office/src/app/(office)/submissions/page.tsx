import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { formatNyDateTime } from "@/lib/time";
import { Card, Empty, PageHeader, StatusBadge, Table, Td } from "@/components/ui";

export const metadata = { title: "Submissions" };

export default async function SubmissionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireStaff();
  let q = supabase.from("intake_submissions").select("id, status, submitted_at, source, owners(first_name, last_name), pet_ids, form_versions(form_templates(title))")
    .order("submitted_at", { ascending: false }).limit(200);
  if (sp.status) q = q.eq("status", sp.status as "processed");
  const { data } = await q;
  const filters = [["", "All"], ["needs_review", "Needs review"], ["error", "Errors"], ["processed", "Processed"]];
  return (
    <>
      <PageHeader title="Form submissions" subtitle="Every form a client submits is saved here, exactly as entered." />
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {filters.map(([v, l]) => <Link key={v} href={v ? `/submissions?status=${v}` : "/submissions"} className={`rounded-full border px-3 py-1 ${sp.status === v || (!sp.status && !v) ? "border-brand-700 bg-brand-50 text-brand-800" : "border-gray-300"}`}>{l}</Link>)}
      </div>
      <Card>
        {data?.length ? (
          <Table head={["Received", "Client", "Form", "Pets", "Status"]}>
            {data.map((s) => (
              <tr key={s.id}>
                <Td><Link className="text-brand-700 hover:underline" href={`/submissions/${s.id}`}>{formatNyDateTime(s.submitted_at)}</Link></Td>
                <Td>{s.owners ? `${s.owners.first_name} ${s.owners.last_name}` : "—"}</Td>
                <Td>{s.form_versions?.form_templates?.title ?? (s.source === "jotform" ? "Jotform import" : "—")}</Td>
                <Td>{s.pet_ids.length}</Td>
                <Td><StatusBadge status={s.status} /></Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>No submissions.</Empty>}
      </Card>
    </>
  );
}
