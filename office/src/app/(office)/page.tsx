import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { addMonths, formatNyDateTime, formatNyTime, nyLocalToUtc, todayInNy } from "@/lib/time";
import { Card, Empty, Flash, LinkButton, PageHeader, StatusBadge } from "@/components/ui";

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireStaff();
  const today = todayInNy();
  const tomorrow = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10) + 1)).toISOString().slice(0, 10);
  const [appts, requests, review, recent, due] = await Promise.all([
    supabase.from("appointments").select("id, starts_at, status, visit_address, owners(first_name, last_name), appointment_pets(pets(name))")
      .gte("starts_at", nyLocalToUtc(today, "00:00").toISOString()).lt("starts_at", nyLocalToUtc(tomorrow, "00:00").toISOString())
      .neq("status", "canceled").order("starts_at"),
    supabase.from("appointments").select("id, requested_at, client_notes, owners(first_name, last_name)").eq("status", "requested").order("requested_at").limit(10),
    supabase.from("intake_submissions").select("id, status, submitted_at, owners(first_name, last_name)").in("status", ["needs_review", "error"]).order("submitted_at", { ascending: false }).limit(10),
    supabase.from("intake_submissions").select("id, status, submitted_at, owners(first_name, last_name)").eq("status", "processed").order("submitted_at", { ascending: false }).limit(5),
    supabase.from("vaccinations").select("id", { count: "exact", head: true }).eq("status", "active").gte("next_due_on", today).lte("next_due_on", addMonths(today, 1)),
  ]);
  const name = (o: { first_name: string; last_name: string } | null) => (o ? `${o.first_name} ${o.last_name}` : "Unknown");
  return (
    <>
      <Flash params={sp} />
      <PageHeader title={`Hi, ${profile.full_name.split(" ")[0]}`} subtitle={formatNyDateTime(new Date()).replace(/,? \d+:\d+.*$/, "")}
        actions={<>{profile.role === "vet" && <LinkButton href="/certificates/new" variant="primary">New certificate</LinkButton>}<LinkButton href="/appointments/new" variant={profile.role === "vet" ? "secondary" : "primary"}>New appointment</LinkButton><LinkButton href="/clients/new">New client</LinkButton></>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Today's visits">
          {appts.data?.length ? (
            <ul className="divide-y divide-gray-100">
              {appts.data.map((a) => (
                <li key={a.id}>
                  <Link href={`/appointments/${a.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-gray-50">
                    <div>
                      <div className="font-semibold">{formatNyTime(a.starts_at)} · {name(a.owners)}</div>
                      <div className="text-sm text-gray-600">{a.appointment_pets.map((p) => p.pets?.name).join(", ")} — {a.visit_address ?? "No address"}</div>
                    </div>
                    <StatusBadge status={a.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <Empty>No visits scheduled today.</Empty>}
        </Card>
        <Card title="Needs attention">
          <ul className="space-y-2 text-sm">
            {(review.data ?? []).map((s) => (
              <li key={s.id}><Link className="flex justify-between hover:underline" href={`/submissions/${s.id}`}><span>Submission from {name(s.owners)}</span><StatusBadge status={s.status} /></Link></li>
            ))}
            {(requests.data ?? []).map((a) => (
              <li key={a.id}><Link className="flex justify-between hover:underline" href={`/appointments/${a.id}`}><span>Visit request from {name(a.owners)}</span><StatusBadge status="requested" /></Link></li>
            ))}
            {!review.data?.length && !requests.data?.length && <Empty>Nothing waiting. 🎉</Empty>}
          </ul>
        </Card>
        <Card title="Latest submissions" actions={<LinkButton href="/submissions">All</LinkButton>}>
          {recent.data?.length ? (
            <ul className="space-y-2 text-sm">
              {recent.data.map((s) => (
                <li key={s.id}><Link className="flex justify-between hover:underline" href={`/submissions/${s.id}`}><span>{name(s.owners)}</span><span className="text-gray-500">{formatNyDateTime(s.submitted_at)}</span></Link></li>
              ))}
            </ul>
          ) : <Empty>No submissions yet. Share a form link from the Forms page.</Empty>}
        </Card>
        <Card title="Vaccines due in the next month" actions={<LinkButton href="/reminders">Open</LinkButton>}>
          <p className="text-3xl font-bold">{due.count ?? 0}</p>
        </Card>
      </div>
    </>
  );
}
