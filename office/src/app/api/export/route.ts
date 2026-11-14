import { NextResponse } from "next/server";
import { getStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TABLES = ["owners", "pets", "pet_owners", "appointments", "appointment_pets", "intake_submissions", "signed_consents",
  "encounters", "soap_notes", "soap_note_revisions", "vaccinations", "vaccine_products", "certificates", "certificate_vaccinations",
  "email_deliveries", "documents", "form_templates", "form_versions", "staff_profiles", "app_settings", "external_ids", "import_runs"] as const;

/** Admin-only JSON export of every Office table (files stay in Storage; see docs/BACKUP.md). */
export async function GET() {
  const s = await getStaff();
  if (!s?.profile?.active || s.profile.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const out: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const r = await s.supabase.from(t).select("*").range(from, from + 999);
      if (r.error) return NextResponse.json({ error: `${t}: ${r.error.message}` }, { status: 500 });
      rows.push(...(r.data ?? []));
      if ((r.data ?? []).length < 1000) break;
    }
    out[t] = rows;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return new NextResponse(JSON.stringify({ exported_at: new Date().toISOString(), tables: out }, null, 1), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="petvax-office-export-${stamp}.json"`, "Cache-Control": "no-store" },
  });
}
