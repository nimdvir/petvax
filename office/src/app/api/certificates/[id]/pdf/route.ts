import { NextResponse, type NextRequest } from "next/server";
import { getStaff } from "@/lib/auth";
import type { CertificateSnapshot } from "@/lib/certificates/data";
import { renderFromSnapshot, storeCertificatePdf } from "@/lib/certificates/issue";

export const dynamic = "force-dynamic";

/** Streams the stored certificate PDF to signed-in staff. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getStaff();
  if (!s?.profile?.active) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const cert = (await s.supabase.from("certificates").select("id, pet_id, certificate_number, pdf_path, snapshot, status").eq("id", id).maybeSingle()).data;
  if (!cert) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let bytes: Uint8Array | null = null;
  if (cert.pdf_path) {
    const f = await s.supabase.storage.from("certificates").download(cert.pdf_path);
    if (f.data) bytes = new Uint8Array(await f.data.arrayBuffer());
  }
  if (!bytes) {
    const snap = cert.snapshot as unknown as CertificateSnapshot;
    // Recover a missing PDF from the saved snapshot (stored if the viewer is a vet; otherwise just rendered).
    const stored = s.profile.role === "vet" ? await storeCertificatePdf(s.supabase, cert.id, cert.pet_id, snap) : null;
    bytes = stored?.ok ? stored.bytes : await renderFromSnapshot(s.supabase, snap);
  }
  const download = new URL(request.url).searchParams.has("download");
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${cert.certificate_number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
