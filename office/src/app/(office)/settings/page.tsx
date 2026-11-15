import Link from "next/link";
import { can, requireStaff } from "@/lib/auth";
import { archiveMissingNow, saveProduct, updateSettings } from "./actions";
import { archiveConfigFromEnv } from "@/lib/drive-archive";
import { formatNyDateTime } from "@/lib/time";
import { Badge } from "@/components/ui";
import { Card, Field, Flash, Input, PageHeader, Select, Table, Td, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireStaff();
  const [settings, products, archiveLog] = await Promise.all([
    supabase.from("app_settings").select("*").eq("id", true).single(),
    supabase.from("vaccine_products").select("*").order("species").order("name"),
    supabase.from("drive_archive_log").select("*").order("created_at", { ascending: false }).limit(10),
  ]);
  const driveReady = !!archiveConfigFromEnv();
  const s = settings.data;
  const admin = can.admin(profile.role);
  return (
    <>
      <PageHeader title="Settings" />
      <Flash params={sp} />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {admin && <Link className="rounded-full border px-3 py-1" href="/settings/staff">Staff & credentials</Link>}
        <Link className="rounded-full border px-3 py-1" href="/settings/security">My sign-in security</Link>
        {admin && <Link className="rounded-full border px-3 py-1" href="/settings/audit">Audit log</Link>}
        {admin && <a className="rounded-full border px-3 py-1" href="/api/export">Download full export (JSON)</a>}
      </div>
      <div className="space-y-4">
        <Card title="Business details & certificate appearance">
          <form action={updateSettings} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <fieldset disabled={!admin} className="contents">
              <Field label="Business name"><Input name="business_name" defaultValue={s?.business_name} /></Field>
              <Field label="Tagline"><Input name="tagline" defaultValue={s?.tagline ?? ""} /></Field>
              <Field label="Phone"><Input name="phone" defaultValue={s?.phone ?? ""} /></Field>
              <Field label="Email"><Input name="email" defaultValue={s?.email ?? ""} /></Field>
              <Field label="Website"><Input name="website" defaultValue={s?.website ?? ""} /></Field>
              <Field label="Address (optional)"><Input name="address" defaultValue={s?.address ?? ""} /></Field>
              <Field label="Send a copy of every form submission and certificate to" className="sm:col-span-2"
                hint="Leave blank to turn copies off. Needs email sending set up (see docs/DEPLOYMENT.md).">
                <Input type="email" name="notify_email" defaultValue={s?.notify_email ?? ""} />
              </Field>
              <Field label="Certificate footer text" className="sm:col-span-2"><Textarea name="certificate_footer" defaultValue={s?.certificate_footer ?? ""} /></Field>
              <Field label="Certificate accent color"><Input type="color" name="certificate_accent_color" defaultValue={s?.certificate_accent_color} className="h-11" /></Field>
              <Field label="Default visit length (minutes)"><Input name="default_visit_minutes" defaultValue={s?.default_visit_minutes} /></Field>
              {admin && <div className="sm:col-span-2"><SubmitButton>Save</SubmitButton></div>}
            </fieldset>
          </form>
        </Card>
        {admin && (
          <Card title="Google Drive archive" actions={driveReady ? <Badge color="green">connected</Badge> : <Badge color="yellow">not set up</Badge>}>
            <div id="drive" />
            <p className="mb-3 text-sm text-gray-600">
              Every form submission (as a PDF with answers, consent and signature) and every certificate PDF is saved to the
              Drive folder <strong>PetVax › PetVax Office archive</strong>, in <em>Form submissions</em> and <em>Certificates</em>
              folders by month, with an <em>index.csv</em> listing every file.
              {!driveReady && " Finish the one-time setup in docs/GOOGLE_DRIVE.md to turn it on."}
            </p>
            {driveReady && <form action={archiveMissingNow} className="mb-3"><SubmitButton variant="secondary" pendingText="Saving…">Save anything not yet in Drive</SubmitButton></form>}
            {archiveLog.data?.length ? (
              <ul className="space-y-1 text-sm">
                {archiveLog.data.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2">
                    <span className="text-gray-500">{formatNyDateTime(l.created_at)}</span>
                    <Badge color={l.status === "saved" ? "green" : l.status === "failed" ? "red" : "yellow"}>{l.status.replace("_", " ")}</Badge>
                    {l.drive_url ? <a className="text-brand-700 underline" href={l.drive_url} target="_blank" rel="noreferrer">{l.file_name}</a> : <span>{l.file_name}</span>}
                    {l.error && <span className="text-xs text-red-700">{l.error}</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-gray-500">Nothing saved yet.</p>}
          </Card>
        )}
        <Card title="Vaccine list">
          <div id="vaccines" />
          <p className="mb-3 text-sm text-gray-600">Choosing a vaccine during a visit fills in its type, rabies flag and next-due interval. Leave manufacturer blank if you stock more than one brand; the last lot used is suggested automatically.</p>
          <Table head={["Vaccine", "Species", "Interval", "Manufacturer", "Rabies", "Active", ""]}>
            {(products.data ?? []).map((p) => (
              <tr key={p.id}>
                <Td colSpan={7}>
                  <form action={saveProduct} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-7">
                    <input type="hidden" name="id" value={p.id} />
                    <Input name="name" defaultValue={p.name} aria-label="Name" />
                    <Select name="species" defaultValue={p.species} aria-label="Species"><option value="dog">Dog</option><option value="cat">Cat</option><option value="other">Other</option></Select>
                    <Input name="default_interval_months" defaultValue={p.default_interval_months ?? ""} aria-label="Interval months" placeholder="months" />
                    <Input name="manufacturer" defaultValue={p.manufacturer ?? ""} aria-label="Manufacturer" />
                    <Select name="is_rabies" defaultValue={p.is_rabies ? "yes" : "no"} aria-label="Rabies"><option value="no">No</option><option value="yes">Rabies</option></Select>
                    <Select name="active" defaultValue={p.active ? "yes" : "no"} aria-label="Active"><option value="yes">Active</option><option value="no">Hidden</option></Select>
                    <input type="hidden" name="vaccine_type" value={p.vaccine_type} />
                    {can.clinical(profile.role) && <SubmitButton variant="secondary">Save</SubmitButton>}
                  </form>
                </Td>
              </tr>
            ))}
          </Table>
          {can.clinical(profile.role) && (
            <form action={saveProduct} className="mt-4 grid grid-cols-2 items-end gap-2 sm:grid-cols-6">
              <Field label="New vaccine"><Input name="name" required /></Field>
              <Field label="Type"><Input name="vaccine_type" placeholder="e.g. DHPP" /></Field>
              <Field label="Species"><Select name="species"><option value="dog">Dog</option><option value="cat">Cat</option></Select></Field>
              <Field label="Interval (months)"><Input name="default_interval_months" /></Field>
              <Field label="Rabies?"><Select name="is_rabies"><option value="no">No</option><option value="yes">Yes</option></Select></Field>
              <SubmitButton variant="secondary">Add</SubmitButton>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
