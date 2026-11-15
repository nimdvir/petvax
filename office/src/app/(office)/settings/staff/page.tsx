import { requireStaff } from "@/lib/auth";
import { inviteStaff, updateStaff, uploadSignature } from "../actions";
import { Badge, Card, Field, Flash, Input, PageHeader, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Staff" };

export default async function StaffPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase } = await requireStaff(["admin"]);
  const { data: staff } = await supabase.from("staff_profiles").select("*").order("active", { ascending: false }).order("full_name");
  return (
    <>
      <PageHeader title="Staff & credentials" back={{ href: "/settings", label: "Settings" }}
        subtitle="Certificates print the issuing vet's name, credentials and license number exactly as entered here — enter them from the license itself." />
      <Flash params={sp} />
      <div className="space-y-4">
        {(staff ?? []).map((s) => (
          <Card key={s.user_id} title={<>{s.full_name} <Badge color={s.active ? "green" : "gray"}>{s.active ? s.role : "inactive"}</Badge></>}>
            <p className="mb-3 text-sm text-gray-600">{s.email}</p>
            <form action={updateStaff.bind(null, s.user_id)} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Full name"><Input name="full_name" defaultValue={s.full_name} /></Field>
              <Field label="Role"><Select name="role" defaultValue={s.role}><option value="staff">Staff (front desk)</option><option value="vet">Veterinarian</option><option value="admin">Admin</option></Select></Field>
              <Field label="Status"><Select name="active" defaultValue={s.active ? "yes" : "no"}><option value="yes">Active</option><option value="no">Deactivated</option></Select></Field>
              <Field label="Credentials" hint="e.g. DVM"><Input name="credentials" defaultValue={s.credentials ?? ""} /></Field>
              <Field label="License number"><Input name="license_number" defaultValue={s.license_number ?? ""} /></Field>
              <Field label="License state"><Input name="license_state" defaultValue={s.license_state ?? "NY"} /></Field>
              <div className="sm:col-span-3"><SubmitButton variant="secondary">Save</SubmitButton></div>
            </form>
            {s.role === "vet" && (
              <form action={uploadSignature.bind(null, s.user_id)} className="mt-4 flex flex-wrap items-end gap-2 border-t pt-4">
                <Field label={`Signature image ${s.signature_path ? "(on file — upload to replace)" : "(optional)"}`}><Input type="file" name="signature" accept="image/png,image/jpeg" /></Field>
                <SubmitButton variant="secondary">Upload</SubmitButton>
              </form>
            )}
          </Card>
        ))}
        <Card title="Invite a staff member">
          <form action={inviteStaff} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Full name"><Input name="full_name" required /></Field>
            <Field label="Email"><Input type="email" name="email" required /></Field>
            <Field label="Role"><Select name="role"><option value="staff">Staff (front desk)</option><option value="vet">Veterinarian</option><option value="admin">Admin</option></Select></Field>
            <Field label="Credentials"><Input name="credentials" /></Field>
            <Field label="License number"><Input name="license_number" /></Field>
            <Field label="License state"><Input name="license_state" defaultValue="NY" /></Field>
            <div className="sm:col-span-3"><SubmitButton>Send invitation</SubmitButton></div>
          </form>
        </Card>
      </div>
    </>
  );
}
