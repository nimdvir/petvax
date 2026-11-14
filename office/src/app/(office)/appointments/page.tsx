import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { formatNyTime, nyLocalToUtc, todayInNy, utcToNyParts } from "@/lib/time";
import { Card, Empty, LinkButton, PageHeader, StatusBadge } from "@/components/ui";

export const metadata = { title: "Appointments" };

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireStaff();
  const anchor = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : todayInNy();
  const dow = new Date(`${anchor}T12:00:00Z`).getUTCDay();
  const monday = shiftDate(anchor, -((dow + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
  const [week, requests] = await Promise.all([
    supabase.from("appointments")
      .select("id, starts_at, ends_at, status, visit_address, owners(first_name, last_name), appointment_pets(pets(name)), staff_profiles(full_name)")
      .gte("starts_at", nyLocalToUtc(monday, "00:00").toISOString()).lt("starts_at", nyLocalToUtc(shiftDate(monday, 7), "00:00").toISOString())
      .order("starts_at"),
    supabase.from("appointments").select("id, requested_at, client_notes, starts_at, owners(first_name, last_name), appointment_pets(pets(name))")
      .eq("status", "requested").order("requested_at").limit(50),
  ]);
  const byDay = new Map<string, NonNullable<typeof week.data>>();
  for (const a of week.data ?? []) {
    const d = utcToNyParts(a.starts_at!).date;
    byDay.set(d, [...(byDay.get(d) ?? []), a]);
  }
  const fmtDay = (d: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));
  const today = todayInNy();
  return (
    <>
      <PageHeader title="Appointments" subtitle="Times shown in New York time"
        actions={<LinkButton href="/appointments/new" variant="primary">New appointment</LinkButton>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title={`Week of ${fmtDay(monday)}`}
          actions={<>
            <LinkButton href={`/appointments?week=${shiftDate(monday, -7)}`} aria-label="Previous week">←</LinkButton>
            <LinkButton href="/appointments">This week</LinkButton>
            <LinkButton href={`/appointments?week=${shiftDate(monday, 7)}`} aria-label="Next week">→</LinkButton>
          </>}>
          <div className="space-y-4">
            {days.map((d) => (
              <div key={d}>
                <h3 className={`mb-1 text-sm font-semibold ${d === today ? "text-brand-700" : "text-gray-700"}`}>{fmtDay(d)}{d === today && " · Today"}</h3>
                {byDay.get(d)?.length ? (
                  <ul className="space-y-1">
                    {byDay.get(d)!.map((a) => (
                      <li key={a.id}>
                        <Link href={`/appointments/${a.id}`} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 hover:bg-gray-50 ${a.status === "canceled" ? "opacity-50" : ""}`}>
                          <span><span className="font-semibold">{formatNyTime(a.starts_at)}–{formatNyTime(a.ends_at)}</span> · {a.owners?.first_name} {a.owners?.last_name} · {a.appointment_pets.map((p) => p.pets?.name).join(", ")}</span>
                          <span className="flex items-center gap-2 text-xs text-gray-500">{a.staff_profiles?.full_name}<StatusBadge status={a.status} /></span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-gray-400">No visits</p>}
              </div>
            ))}
          </div>
        </Card>
        <Card title="Requests to schedule">
          {requests.data?.length ? (
            <ul className="space-y-2 text-sm">
              {requests.data.map((a) => (
                <li key={a.id}>
                  <Link href={`/appointments/${a.id}`} className="block rounded-lg border p-2 hover:bg-gray-50">
                    <div className="font-medium">{a.owners?.first_name} {a.owners?.last_name} · {a.appointment_pets.map((p) => p.pets?.name).join(", ")}</div>
                    <div className="line-clamp-2 whitespace-pre-line text-xs text-gray-600">{a.client_notes}</div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <Empty>No open requests.</Empty>}
        </Card>
      </div>
    </>
  );
}
