import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { renderCertificatePdf } from "@/lib/certificates/pdf";
import { sampleSnapshot } from "../fixtures";
import { pdfToText } from "../pdf-text";

const logo = { bytes: new Uint8Array(readFileSync(path.join(__dirname, "../../public/logo.jpg"))), type: "jpg" as const };

describe("certificate PDF", () => {
  it("prints every required field from the saved record", async () => {
    const pdf = await renderCertificatePdf(sampleSnapshot(), { logo });
    const t = pdfToText(pdf).replace(/\s+/g, " ");
    for (const expected of [
      "PetVax", "Vaccination Certificate", "Certificate No. PVX-2026-001001", "Issued Nov 14, 2026",
      "Dana Rivera", "500 W 43rd St", "(212) 555-0100", "dana@example.com",
      "Rex", "Dog", "Beagle", "Male (neutered)", "5 years", "985112003456789", "24.5 lb",
      "Rabies (3-year)", "3-year rabies", "TestPharma", "RB-4471", "exp. Aug 31, 2027", "Nov 14, 2029",
      "Rabies tag no.: NYC-55821", "DHPP / DAPP", "DH-2210", "Nov 14, 2027", "SC / Right hind",
      "Test Vet, DVM", "NY Veterinary License No. TEST-000",
      "Verify this certificate: https://office.petvax.org/verify/a1b2c3d4e5f6a7b8c9", "Page 1 of 1",
    ]) expect(t).toContain(expected);
  });

  it("says 'Not recorded' instead of inventing missing details", async () => {
    const snap = sampleSnapshot();
    snap.pet = { ...snap.pet, breed: null, color: null, microchip: null, weight_lb: null };
    snap.vaccinations = [{ ...snap.vaccinations[1], route: null, site: null, next_due_on: null }];
    const t = pdfToText(await renderCertificatePdf(snap)).replace(/\s+/g, " ");
    expect(t).toContain("Breed Not recorded");
    expect(t).toContain("None on file");
    expect((t.match(/Not recorded/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("paginates long vaccine lists and survives non-Latin characters", async () => {
    const snap = sampleSnapshot({ owner: { name: "Zoë Łukasz 王", address: null, phone: null, email: null } });
    snap.vaccinations = Array.from({ length: 30 }, (_, i) => ({ ...snap.vaccinations[1], id: `v${i}`, vaccine_name: `Vaccine ${i + 1}` }));
    const pdf = await renderCertificatePdf(snap);
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    const t = pdfToText(pdf);
    expect(t).toContain("Vaccine 30");
    expect(t).toContain("Zoe Lukasz ?");
    expect(t).toMatch(/Page 2 of \d/);
  });

  it("sets document metadata", async () => {
    const doc = await PDFDocument.load(await renderCertificatePdf(sampleSnapshot()));
    expect(doc.getTitle()).toContain("PVX-2026-001001");
  });
});
