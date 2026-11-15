import { createAdminClient } from "@/lib/supabase/admin";
import type { CertificateSnapshot } from "@/lib/certificates/data";
import { formatDate } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verify certificate", robots: { index: false } };

/** Public check that a certificate is genuine. Shows only what is printed on it, minus owner contact details. */
export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const cert = /^[0-9a-f]{18}$/.test(code)
    ? (await createAdminClient().from("certificates").select("certificate_number, status, issued_at, voided_at, snapshot").eq("verification_code", code).maybeSingle()).data
    : null;
  const snap = cert?.snapshot as unknown as CertificateSnapshot | undefined;
  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.jpg" alt="PetVax" className="mb-4 h-12 w-auto rounded" />
      {!cert || !snap ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6"><h1 className="text-lg font-bold text-red-900">Certificate not found</h1><p className="text-sm text-red-800">Check the code, or contact PetVax.</p></div>
      ) : (
        <div className={`rounded-xl border p-6 ${cert.status === "issued" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
          <h1 className="text-lg font-bold">{cert.status === "issued" ? "✓ Valid certificate" : "✗ This certificate has been voided"}</h1>
          <p className="text-sm">{cert.certificate_number} · issued {formatDate(snap.issued_on)} by {snap.signer.name}, {snap.signer.credentials}</p>
          <p className="mt-3 font-semibold">{snap.pet.name} ({snap.pet.species}{snap.pet.breed ? `, ${snap.pet.breed}` : ""})</p>
          <ul className="mt-2 space-y-1 text-sm">
            {snap.vaccinations.map((v) => <li key={v.id}>{v.vaccine_name}: given {formatDate(v.administered_on)}{v.next_due_on && `, due ${formatDate(v.next_due_on)}`}</li>)}
          </ul>
        </div>
      )}
    </main>
  );
}
