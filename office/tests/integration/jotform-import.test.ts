import { describe, expect, it } from "vitest";
import { importJotform, reportToMarkdown, type FetchFile } from "@/lib/jotform/import";
import { adminClient, uniq } from "./helpers";
import { PNG_BYTES, jotformFixtures } from "../fixtures/jotform";

const fetchFile: FetchFile = async (url) => (url.includes("missing") ? null : { bytes: PNG_BYTES, contentType: "image/png" });

describe("Jotform import", () => {
  const tag = uniq();
  const subs = jotformFixtures(tag);

  it("dry run writes nothing", async () => {
    const db = adminClient();
    const r = await importJotform(db, subs, { dryRun: true, fetchFile });
    expect(r.totals.wouldImport).toBe(3);
    const found = await db.from("intake_submissions").select("id").eq("source", "jotform").in("external_id", subs.map((s) => s.id));
    expect(found.data).toHaveLength(0);
  });

  it("imports clients, pets, consents, signatures and files, preserving originals", async () => {
    const db = adminClient();
    const r = await importJotform(db, subs, { dryRun: false, fetchFile });
    expect(r.totals.imported).toBe(3);
    expect(r.totals.failed).toBe(0);
    expect(r.verification?.missingFromDb).toEqual([]);
    expect(r.totals.consentsCreated).toBe(1);
    expect(r.totals.signaturesMissing).toBe(1);
    // Intake + consent from the same person landed on one client and one pet.
    const [intakeRow, consentRow] = r.rows;
    expect(consentRow.ownerId).toBe(intakeRow.ownerId);
    expect(consentRow.petIds).toEqual(intakeRow.petIds);
    const pet = (await db.from("pets").select("name, breed, lifestyle, prior_reactions, date_of_birth").eq("id", intakeRow.petIds![0]).single()).data!;
    expect(pet).toMatchObject({ name: "Biscuit", breed: "Corgi", date_of_birth: "2021-03-09" });
    expect(pet.lifestyle).toMatchObject({ boarding: true, wildlife: false });
    expect(pet.prior_reactions).toContain("Hives");
    const consent = (await db.from("signed_consents").select("*").eq("submission_id", consentRow.submissionId!).single()).data!;
    expect(consent).toMatchObject({ source: "jotform", external_id: subs[1].id, signer_name: `Riley Moss${tag}`, signed_at: "2026-11-03T23:40:12+00:00" });
    expect((consent.evidence as Record<string, unknown>).agreed_to_electronic_signature).toBe(false);
    const docs = (await db.from("documents").select("kind").eq("submission_id", intakeRow.submissionId!)).data!.map((d) => d.kind).sort();
    expect(docs).toEqual(["jotform_raw", "jotform_signature", "pet_photo"]);
    const sub = (await db.from("intake_submissions").select("submitted_at, answers").eq("id", intakeRow.submissionId!).single()).data!;
    expect(sub.submitted_at).toBe("2026-11-02T14:15:00+00:00");
    expect((sub.answers as { _jotform: { submission_id: string } })._jotform.submission_id).toBe(subs[0].id);
    expect(reportToMarkdown(r)).toContain("Consent form has no signature image.");
  });

  it("running again imports nothing new", async () => {
    const r = await importJotform(adminClient(), subs, { dryRun: false, fetchFile });
    expect(r.totals.imported).toBe(0);
    expect(r.totals.alreadyImported).toBe(3);
    const owners = await adminClient().from("owners").select("id").eq("email_normalized", `riley.${tag}@example.net`);
    expect(owners.data).toHaveLength(1);
  });
});
