import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_FORMS } from "@/lib/forms/defaults";
import { validateAnswers } from "@/lib/forms/schema";
import { processSubmission } from "@/lib/intake/process";
import { issueCertificate } from "@/lib/certificates/issue";
import { notifyCertificate, notifySubmission } from "@/lib/notify";
import type { EmailConfig } from "@/lib/email";
import { adminClient, makeUser, uniq } from "./helpers";

// The local Supabase stack's mail catcher (Mailpit): SMTP on 54325, API on 54324.
const cfg: EmailConfig = { smtp: { host: "127.0.0.1", port: 54325, user: "test", password: "test" }, from: "PetVax <petvaxnyc@gmail.com>" };
const MAILPIT = "http://127.0.0.1:54324/api/v1";
async function findMessage(subjectPart: string) {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`subject:"${subjectPart}"`)}`).then((x) => x.json());
    if (r.messages?.length) return fetch(`${MAILPIT}/message/${r.messages[0].ID}`).then((x) => x.json());
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`no email with subject containing ${subjectPart}`);
}

const form = DEFAULT_FORMS.find((f) => f.slug === "new-visit")!;
const office = `office-${uniq()}@example.test`;
beforeAll(async () => {
  await adminClient().from("app_settings").update({ notify_email: office }).eq("id", true);
});

describe("copies to the office inbox", () => {
  it("emails a summary of each new submission", async () => {
    const tag = uniq();
    const v = validateAnswers(form.schema, {
      first_name: "Avery", last_name: `Stone${tag}`, address_line1: "1 Main St", city: "New York", state: "NY", postal_code: "10001",
      phone: "(212) 555-0161", email: `avery-${tag}@example.test`, certify: true,
      pets: [{ pet_name: "Juniper", species: "Dog", breed: "Poodle", color: "White", sex: "Female", spayed_neutered: "yes", weight_lb: "40", requested_vaccines: ["Rabies"], had_reaction: "no" }],
    });
    if (!v.ok) throw new Error(JSON.stringify(v.errors));
    const r = await processSubmission(adminClient(), { formVersionId: null, formLinkId: null, schema: { ...form.schema, consent: undefined }, consentText: null, answers: v.answers, signature: null });
    const sent = await notifySubmission(adminClient(), { submissionId: r.submissionId, siteUrl: "https://office.example.test", cfg });
    expect(sent?.status, JSON.stringify(sent)).toBe("sent");
    const msg = await findMessage(`Stone${tag}`);
    expect(msg.To[0].Address).toBe(office);
    expect(msg.Subject).toContain("Juniper");
    expect(msg.Text).toContain("requested: Rabies");
    expect(msg.Text).toContain(`https://office.example.test/submissions/${r.submissionId}`);
    const log = await adminClient().from("email_deliveries").select("status, to_email").eq("to_email", office);
    expect(log.data?.some((d) => d.status === "sent")).toBe(true);
  });

  it("emails a copy of each issued certificate with the PDF attached", async () => {
    const vet = await makeUser("vet");
    const db = adminClient();
    const owner = (await db.from("owners").insert({ first_name: "Cert", last_name: `Copy${uniq()}`, email: `c-${uniq()}@example.test` }).select("id").single()).data!;
    const pet = (await db.from("pets").insert({ name: `Pip${uniq()}`, species: "cat", breed: "DSH", sex: "male" }).select("id, name").single()).data!;
    await db.from("pet_owners").insert({ pet_id: pet.id, owner_id: owner.id });
    const vax = (await vet.client.from("vaccinations").insert({ pet_id: pet.id, owner_id: owner.id, vaccine_name: "FVRCP", vaccine_type: "FVRCP", manufacturer: "TestPharma", lot_number: "F-1", administered_on: "2026-11-15", next_due_on: "2027-11-15", route: "SC", administered_by: vet.userId }).select("id").single()).data!;
    const issued = await issueCertificate(vet.client, { vaccinationIds: [vax.id], issuerId: vet.userId, siteUrl: "https://office.example.test" });
    if (!issued.ok) throw new Error(JSON.stringify(issued));
    const sent = await notifyCertificate(db, { certificateId: issued.certificateId, siteUrl: "https://office.example.test", cfg });
    expect(sent?.status, JSON.stringify(sent)).toBe("sent");
    const msg = await findMessage(issued.certificateNumber);
    expect(msg.To[0].Address).toBe(office);
    expect(msg.Attachments).toHaveLength(1);
    expect(msg.Attachments[0].ContentType).toBe("application/pdf");
    expect(msg.Attachments[0].FileName).toContain(issued.certificateNumber);
  });

  it("sends nothing when no copy address is set", async () => {
    await adminClient().from("app_settings").update({ notify_email: null }).eq("id", true);
    const r = await notifySubmission(adminClient(), { submissionId: "00000000-0000-0000-0000-000000000000", siteUrl: "x", cfg });
    expect(r).toBeNull();
    await adminClient().from("app_settings").update({ notify_email: office }).eq("id", true);
  });
});
