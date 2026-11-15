import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_FORMS } from "@/lib/forms/defaults";
import { validateAnswers } from "@/lib/forms/schema";
import { processSubmission } from "@/lib/intake/process";
import { issueCertificate } from "@/lib/certificates/issue";
import { archiveCertificate, archiveMissing, archiveSubmission, type ArchiveConfig } from "@/lib/drive-archive";
import { loadArchiveScript } from "../support/fake-drive";
import { pdfToText } from "../pdf-text";
import { adminClient, makeUser, uniq } from "./helpers";

// A local web server that runs the real Apps Script code against a simulated Drive.
const drive = loadArchiveScript("s3cret");
let server: http.Server;
let cfg: ArchiveConfig;
beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(drive.doPost(JSON.parse(body)))); });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  cfg = { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/exec`, secret: "s3cret" };
});
afterAll(() => server.close());

const form = DEFAULT_FORMS.find((f) => f.slug === "new-visit")!;
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("Google Drive archive", () => {
  it("saves each submission as a readable PDF with answers, consent and signature, and logs it in index.csv", async () => {
    const tag = uniq();
    const db = adminClient();
    const t = await db.from("form_templates").insert({ slug: `drive-${tag}`, kind: "intake_consent", title: `Drive Test Form ${tag}` }).select("id").single();
    const v = await db.from("form_versions").insert({ template_id: t.data!.id, version: 1, status: "published", schema: form.schema as never, consent_text: form.consentText, published_at: new Date().toISOString() }).select("id").single();
    const a = validateAnswers(form.schema, {
      first_name: "Robin", last_name: `Hale${tag}`, address_line1: "9 Grove St", city: "New York", state: "NY", postal_code: "10014",
      phone: `(917) 555-${String(1000 + Math.floor(Math.random() * 8999))}`, email: `robin-${tag}@example.test`, certify: true,
      pets: [{ pet_name: "Olive", species: "Cat", breed: "Siamese", color: "Seal point", sex: "Female", spayed_neutered: "yes", weight_lb: "8", requested_vaccines: ["FVRCP"], had_reaction: "yes", reaction_types: ["Lethargy"] }],
    });
    if (!a.ok) throw new Error(JSON.stringify(a.errors));
    const r = await processSubmission(db, { formVersionId: v.data!.id, formLinkId: null, schema: form.schema, consentText: form.consentText, answers: a.answers,
      signature: { signerName: `Robin Hale${tag}`, relationship: "Owner", agreed: true, esignAgreed: true, dataUrl: PNG }, ipAddress: "198.51.100.7", userAgent: "iPhone test" });
    expect(r.status, r.error).toBe("processed");

    const saved = await archiveSubmission(db, { submissionId: r.submissionId, siteUrl: "https://office.example.test", cfg });
    expect(saved?.status, JSON.stringify(saved)).toBe("saved");
    const archive = drive.find(["PetVax Office archive"])!;
    const sub = archive.folders.find((f) => f.name === "Form submissions")!;
    const month = sub.folders[0].folders[0];
    expect(month.name).toMatch(/^\d{4}-\d{2}$/);
    const file = month.files.find((f) => f.name.includes(`Hale${tag}`))!;
    expect(file.name).toMatch(new RegExp(`^\\d{4}-\\d{2}-\\d{2} \\d{4} - Hale${tag}, Robin - Olive - Drive Test Form ${tag} \\([0-9a-f]{8}\\)\\.pdf$`));
    const text = pdfToText(new Uint8Array(file.content)).replace(/\s+/g, " ");
    for (const s of [`Drive Test Form ${tag} (version 1)`, "Robin", `Hale${tag}`, "9 Grove St", "Pet 1: Olive", "Siamese", "FVRCP", "Lethargy",
      "Signed consent — Olive", "I authorize PetVax veterinary personnel", `Robin Hale${tag} (Owner)`, "Record hash:", "198.51.100.7"]) {
      expect(text, s).toContain(s);
    }
    const csv = archive.files.find((f) => f.name === "index.csv")!.content.toString();
    const line = csv.split("\r\n").find((l) => l.includes(`Hale${tag}`))!;
    expect(line).toContain("Form submission");
    expect(line).toContain(`https://office.example.test/submissions/${r.submissionId}`);
    expect(line).toContain("1 signed consent(s)");

    // Saving again is harmless: no duplicate file or CSV line.
    await archiveSubmission(db, { submissionId: r.submissionId, siteUrl: "https://office.example.test", cfg });
    expect(month.files.filter((f) => f.name === file.name)).toHaveLength(1);
    expect(archive.files.find((f) => f.name === "index.csv")!.content.toString().split(`Hale${tag}`).length - 1).toBeGreaterThanOrEqual(1);
  });

  it("saves each certificate PDF unchanged under Certificates/<year>/<month>", async () => {
    const vet = await makeUser("vet");
    const db = adminClient();
    const owner = (await db.from("owners").insert({ first_name: "Sam", last_name: `Ito${uniq()}`, email: `s-${uniq()}@example.test` }).select("id, last_name").single()).data!;
    const pet = (await db.from("pets").insert({ name: "Mango", species: "dog", breed: "Shiba Inu", sex: "male" }).select("id").single()).data!;
    await db.from("pet_owners").insert({ pet_id: pet.id, owner_id: owner.id });
    const vax = (await vet.client.from("vaccinations").insert({ pet_id: pet.id, owner_id: owner.id, vaccine_name: "DHPP / DAPP", vaccine_type: "DHPP", manufacturer: "TestPharma", lot_number: "D-9", administered_on: "2026-11-15", next_due_on: "2027-11-15", route: "SC", administered_by: vet.userId }).select("id").single()).data!;
    const issued = await issueCertificate(vet.client, { vaccinationIds: [vax.id], issuerId: vet.userId, siteUrl: "https://office.example.test" });
    if (!issued.ok) throw new Error(JSON.stringify(issued));
    const saved = await archiveCertificate(db, { certificateId: issued.certificateId, siteUrl: "https://office.example.test", cfg });
    expect(saved?.status).toBe("saved");
    const certFolder = drive.find(["PetVax Office archive", "Certificates", "2026"])!;
    const file = certFolder.folders.flatMap((f) => f.files).find((f) => f.name.startsWith(issued.certificateNumber))!;
    // Named "<number> - <pet> - <Last, First> - <issue date in New York>.pdf"
    expect(file.name).toMatch(new RegExp(`^${issued.certificateNumber} - Mango - ${owner.last_name}, Sam - \\d{4}-\\d{2}-\\d{2}\\.pdf$`));
    const stored = await db.storage.from("certificates").download((await db.from("certificates").select("pdf_path").eq("id", issued.certificateId).single()).data!.pdf_path!);
    expect(Buffer.compare(Buffer.from(await stored.data!.arrayBuffer()), file.content)).toBe(0);
    const csv = drive.find(["PetVax Office archive"])!.files.find((f) => f.name === "index.csv")!.content.toString();
    expect(csv).toContain(`Vaccine certificate,`);
    expect(csv).toContain(issued.certificateNumber);
  });

  it("logs 'not configured' when the archive isn't set up, and can catch up later", async () => {
    const db = adminClient();
    const tag = uniq();
    const a = validateAnswers(form.schema, { first_name: "Late", last_name: `Saver${tag}`, address_line1: "1 A St", city: "New York", state: "NY", postal_code: "10001", phone: `212555${String(1000 + Math.floor(Math.random() * 8999))}`, email: `late-${tag}@example.test`, certify: true,
      pets: [{ pet_name: "Bo", species: "Dog", breed: "Pug", color: "Fawn", sex: "Male", spayed_neutered: "no", weight_lb: "18", requested_vaccines: ["Rabies"], had_reaction: "no" }] });
    if (!a.ok) throw new Error("invalid");
    const r = await processSubmission(db, { formVersionId: null, formLinkId: null, schema: { ...form.schema, consent: undefined }, consentText: null, answers: a.answers, signature: null });
    const off = await archiveSubmission(db, { submissionId: r.submissionId, siteUrl: "https://office.example.test", cfg: null });
    expect(off?.status).toBe("not_configured");
    const log = (await db.from("drive_archive_log").select("status").eq("record_id", r.submissionId)).data!;
    expect(log.map((l) => l.status)).toEqual(["not_configured"]);
    // Catch-up saves everything not yet in Drive (batch by batch).
    for (let i = 0; i < 20; i++) {
      const res = await archiveMissing(db, { siteUrl: "https://office.example.test", cfg, limit: 50 });
      if (!res.remaining) break;
    }
    const after = (await db.from("drive_archive_log").select("status").eq("record_id", r.submissionId).eq("status", "saved")).data!;
    expect(after).toHaveLength(1);
    const second = await archiveMissing(db, { siteUrl: "https://office.example.test", cfg, limit: 50 });
    expect(second.saved + second.failed).toBe(0); // nothing left to do
  });
});
