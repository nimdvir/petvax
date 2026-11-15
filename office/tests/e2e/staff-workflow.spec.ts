import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { ctx } from "./context";

async function login(page: Page, who: "vet" | "admin") {
  const u = ctx().users[who];
  await page.goto("/login");
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: "Today" })).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("signed-out visitors cannot reach Office pages or files", async ({ page, request }) => {
  await page.goto("/clients");
  await expect(page).toHaveURL(/\/login\?next=%2Fclients/);
  const pdf = await request.get("/api/certificates/00000000-0000-0000-0000-000000000000/pdf", { maxRedirects: 0 });
  expect([302, 307, 401]).toContain(pdf.status());
  // Another website can't post into a PetVax form.
  const { links } = ctx();
  const token = links["PetVax New Visit Form"].split("/f/")[1];
  const foreign = await request.post(`/api/public/forms/${token}`, { headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, data: { answers: {} } });
  expect(foreign.status()).toBe(403);
  const exp = await request.get("/api/export", { maxRedirects: 0 });
  expect([302, 307, 401, 403]).toContain(exp.status());
});

test("vet runs the full visit: request → schedule → exam → vaccines → certificate → email", async ({ page }) => {
  const { stamp } = ctx();
  await login(page, "vet");

  // 1. The client's submission is already filed with both pets and a visit request.
  await page.getByRole("link", { name: "Submissions" }).click();
  await expect(page).toHaveURL(/\/submissions$/);
  await page.getByRole("row", { name: new RegExp(`Jordan Ellis${stamp}`) }).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/submissions\/[0-9a-f-]{36}/);
  await expect(page.getByRole("link", { name: `Jordan Ellis${stamp}` })).toBeVisible();
  await expect(page.getByRole("link", { name: "Pepper" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tofu" })).toBeVisible();
  await expect(page.getByText(`Jordan Ellis${stamp} (Owner)`)).toHaveCount(2); // one signed consent per pet

  // 2. Schedule the requested visit.
  await page.getByRole("link", { name: "Appointments" }).click();
  await expect(page).toHaveURL(/\/appointments$/);
  await page.getByRole("link", { name: new RegExp(`Jordan Ellis${stamp}`) }).first().click();
  await expect(page).toHaveURL(/\/appointments\/[0-9a-f-]{36}/);
  await expect(page.getByText("Preferred date: 2026-12-03")).toBeVisible();
  await page.getByLabel("Date").fill("2026-12-03");
  await page.getByLabel("Start time (New York)").fill("10:30");
  await page.getByLabel("Clinician").selectOption({ label: "Taylor Test (vet)" });
  await page.getByRole("button", { name: "Save schedule" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Marked confirmed.")).toBeVisible();
  await expect(page.getByText("Thu, Dec 3, 2026, 10:30 AM")).toBeVisible();

  // 3. Exam for Pepper. Consent is on file; intake answers pre-fill the note.
  const pepperRow = page.locator("li", { hasText: "Pepper" });
  await expect(pepperRow.getByText(/Consent signed/)).toBeVisible();
  await pepperRow.getByRole("button", { name: "Start exam" }).click();
  await expect(page).toHaveURL(/\/visits\/[0-9a-f-]{36}/);
  await expect(page.getByLabel("S — Subjective (owner concerns, history)")).toHaveValue(/Requested vaccines: Rabies, DHPP\/DAPP/);
  await page.getByLabel("Temp", { exact: true }).fill("101.2");
  await page.getByLabel("Heart rate (bpm)").fill("96");
  await page.getByLabel("Resp. rate (bpm)").fill("22");
  await page.getByLabel("Weight", { exact: true }).fill("63");
  await page.getByLabel("Body condition").fill("5");
  await page.getByLabel("Exam findings").fill("Mucous membranes pink, CRT <2s, heart and lungs auscult normally");
  await page.getByLabel("A — Assessment").fill("Healthy adult dog. Suitable for vaccination.");
  await page.getByLabel("Fit for vaccination?").selectOption("yes");
  await page.getByLabel("P — Plan (vaccines, recommendations)").fill("Rabies 3-year and DHPP given. Monitor 30 min.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();

  // 4. Record two vaccines.
  async function addVaccine(name: string, lot: string, extra?: () => Promise<void>) {
    const form = page.locator("form", { has: page.getByRole("button", { name: "Save vaccine" }) });
    if (!(await form.isVisible())) await page.getByText("+ Add vaccine").click();
    await form.getByLabel("Vaccine *").selectOption({ label: name });
    await form.getByLabel("Manufacturer *").fill("E2E Biologics");
    await form.getByLabel("Lot number *").fill(lot);
    await form.getByLabel("Product expiration").fill("2027-09-30");
    await form.getByLabel("Route").selectOption("SC");
    await form.getByLabel("Site").selectOption("Right hindlimb");
    if (extra) await extra();
    await form.getByRole("button", { name: "Save vaccine" }).click();
    await expect(page.getByText(`${name} recorded.`)).toBeVisible();
  }
  await addVaccine("Rabies (3-year)", "RAB-E2E-1", async () => {
    const form = page.locator("form", { has: page.getByRole("button", { name: "Save vaccine" }) });
    await expect(form.getByLabel("Next due")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    await form.getByLabel("Serial number").fill("SN-998877");
    await form.getByLabel("Rabies tag number").fill(`TAG-${stamp}`);
  });
  await addVaccine("DHPP / DAPP", "DHPP-E2E-2");

  // 5. Finalize the note; it becomes amend-only.
  await page.getByRole("button", { name: "Finalize note" }).click();
  await expect(page.getByText("SOAP note finalized.")).toBeVisible();
  await expect(page.getByLabel("Reason for amendment *")).toBeVisible();

  // 6. Generate the certificate.
  await page.getByRole("button", { name: "Sign & generate certificate" }).click();
  await expect(page.getByText(/Certificate PVX-\d{4}-\d{6} issued\./)).toBeVisible();
  const number = (await page.getByRole("heading", { level: 1 }).textContent())!.match(/PVX-\d{4}-\d{6}/)![0];

  // 7. Download and read the PDF.
  const res = await page.request.get(page.url().replace(/\/certificates\/([^/?]+).*$/, "/api/certificates/$1/pdf"));
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  const dir = mkdtempSync(path.join(tmpdir(), "pvx-e2e-"));
  const file = path.join(dir, "cert.pdf");
  writeFileSync(file, await res.body());
  writeFileSync("test-results/e2e-certificate.pdf", await res.body());
  const text = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" }).replace(/\s+/g, " ");
  for (const s of [number, "Pepper", "Labrador Retriever", "Female (spayed)", `Jordan Ellis${stamp}`, "350 W 42nd St",
    "Rabies (3-year)", "3-year rabies", "RAB-E2E-1", "SN-998877", `TAG-${stamp}`, "DHPP / DAPP", "DHPP-E2E-2", "E2E Biologics",
    "exp. Sep 30, 2027", "SC / Right hindlimb", "Taylor Test, DVM", "NY License No. E2E-TEST-1", "63 lb", "Rabies Vaccination Certificate", "vaccinated against rabies in accordance with New York State law"]) {
    expect(text, `PDF should contain "${s}"`).toContain(s);
  }

  // 8. Email: no provider is configured locally, so the attempt is logged as not sent.
  await page.getByText("I confirmed this address with the client").click();
  await page.getByRole("button", { name: "Send certificate" }).click();
  await expect(page.getByText(/Not sent: Email sending is not set up/)).toBeVisible();
  await expect(page.getByText("not configured")).toHaveCount(2); // the office copy + the client email, both logged

  // 9. Public verification page.
  const verifyUrl = (await page.getByRole("link", { name: /\/verify\// }).getAttribute("href"))!;
  await page.goto(new URL(verifyUrl).pathname);
  await expect(page.getByText("✓ Valid certificate")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("350 W 42nd St");

  // 10. Pet history shows everything.
  await login(page, "vet");
  await page.goto("/clients?q=" + encodeURIComponent(`Ellis${stamp}`));
  await page.getByRole("link", { name: new RegExp(`Ellis${stamp}`) }).click();
  await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}/);
  await page.getByRole("link", { name: "Pepper" }).first().click();
  await expect(page).toHaveURL(/\/pets\/[0-9a-f-]{36}/);
  await expect(page.getByRole("cell", { name: "Rabies (3-year)" })).toBeVisible();
  await expect(page.getByText(number)).toBeVisible();
  await expect(page.getByRole("img", { name: /Signature of Jordan Ellis/ }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/desktop-pet-history.png", fullPage: true });
});

test("vet makes a certificate on one screen from the Certificates tab", async ({ page }) => {
  const { stamp } = ctx();
  await login(page, "vet");
  await page.getByRole("link", { name: "Certificates" }).click();
  await expect(page).toHaveURL(/\/certificates$/);
  await page.getByRole("link", { name: "New certificate" }).click();
  await expect(page).toHaveURL(/\/certificates\/new$/);
  await page.getByLabel("Search pets").fill(`Ellis${stamp}`);
  await page.getByLabel("Search pets").press("Enter");
  await page.getByRole("link", { name: /Tofu/ }).click();
  await expect(page).toHaveURL(/\/certificates\/new\?pet=/);
  await expect(page.getByRole("heading", { name: "Certificate for Tofu" })).toBeVisible();

  const button = page.getByRole("button", { name: /Sign & create certificate/ });
  await expect(button).toBeDisabled(); // nothing ticked yet
  await page.getByRole("checkbox", { name: "FVRCP" }).check();
  const fvrcp = page.getByRole("region", { name: "FVRCP" });
  await fvrcp.getByLabel("Manufacturer *").fill("E2E Biologics");
  await fvrcp.getByLabel("Lot number *").fill("FVR-E2E-3");
  await fvrcp.getByLabel("Route").selectOption("SC");
  await expect(fvrcp.getByLabel("Next due")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/); // filled from the 12-month default
  await page.getByLabel("Notes to print on the certificate (optional)").fill("Healthy exam, no reactions.");
  await page.screenshot({ path: "test-results/desktop-new-certificate.png", fullPage: true });
  await button.click();
  await expect(page.getByText(/Certificate PVX-\d{4}-\d{6} created and signed\./)).toBeVisible();

  const res = await page.request.get(page.url().replace(/\/certificates\/([^/?]+).*$/, "/api/certificates/$1/pdf"));
  expect(res.status()).toBe(200);
  const dir = mkdtempSync(path.join(tmpdir(), "pvx-e2e-"));
  const file = path.join(dir, "quick.pdf");
  writeFileSync(file, await res.body());
  writeFileSync("test-results/e2e-quick-certificate.pdf", await res.body());
  const text = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" }).replace(/\s+/g, " ");
  for (const s of ["Tofu", "Domestic Shorthair", "FVRCP", "FVR-E2E-3", "E2E Biologics", "Healthy exam, no reactions.", "Taylor Test, DVM"]) expect(text).toContain(s);
  expect(text).not.toContain("Rabies Vaccination Certificate");

  // It's listed on the Certificates tab.
  await page.getByRole("link", { name: "Certificates" }).click();
  await expect(page.getByRole("row", { name: /Tofu/ })).toBeVisible();
});

test("returning client reusing the link updates their record instead of duplicating it", async ({ page }) => {
  const { links, stamp } = ctx();
  await page.goto(links["PetVax Vaccination Consent Form"]);
  await page.getByLabel("First name").fill("Jordan");
  await page.getByLabel("Last name").fill(`Ellis${stamp}`);
  await page.getByLabel("Street address").fill("350 W 42nd St");
  await page.getByLabel("City").fill("New York");
  await page.getByRole("combobox", { name: /^State/ }).selectOption("NY");
  await page.getByLabel("ZIP code").fill("10036");
  await page.getByLabel("Primary phone number").fill("646-555-0187");
  await page.getByLabel("Email address").fill(`JORDAN.${stamp}@example.org`);
  const pet = page.getByTestId("pet-0");
  await pet.getByLabel("Pet name").fill("pepper");
  await pet.getByText("Dog", { exact: true }).click();
  await pet.locator("fieldset", { hasText: "prior vaccine reactions?" }).getByText("No").click();
  await page.getByText("I have read and understand the above consent statement.").click();
  await page.getByText("I agree to sign this form electronically").click();
  await page.getByLabel("Your full name").fill(`Jordan Ellis${stamp}`);
  const box = (await page.getByTestId("signature-pad").boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 40); await page.mouse.down();
  for (let i = 0; i < 15; i++) await page.mouse.move(box.x + 20 + i * 12, box.y + 40 + (i % 3) * 10);
  await page.mouse.up();
  await page.getByRole("button", { name: "Submit consent" }).click();
  await expect(page.getByRole("heading", { name: "Submitted" })).toBeVisible();

  await login(page, "vet");
  await page.goto("/clients?q=" + encodeURIComponent(`Ellis${stamp}`));
  await expect(page.getByRole("link", { name: new RegExp(`Ellis${stamp}`) })).toHaveCount(1);
  await page.getByRole("link", { name: new RegExp(`Ellis${stamp}`) }).click();
  await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}/);
  const petsCard = page.locator("section").filter({ has: page.getByRole("heading", { name: "Pets", exact: true }) });
  await expect(petsCard.locator("li", { hasText: "Pepper" })).toHaveCount(1);
  await expect(petsCard.locator("li")).toHaveCount(2); // Pepper + Tofu, no duplicate pet
  await page.getByRole("link", { name: "Pepper" }).first().click();
  await expect(page).toHaveURL(/\/pets\/[0-9a-f-]{36}/);
  await expect(page.getByText(/Jordan Ellis\d+ \(Owner\)/)).toHaveCount(2);
  // The consent form doesn't ask about sex; the "Female" from the first form must still be there.
  await expect(page.getByText("female (spayed/neutered)")).toBeVisible();
});

test("admin customizes the form; the public link shows the new question", async ({ page }) => {
  const { links } = ctx();
  await login(page, "admin");
  await page.getByRole("link", { name: "Forms" }).click();
  const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "PetVax New Visit Form", exact: true }) });
  await card.getByRole("link", { name: "Edit form" }).click();
  await expect(page).toHaveURL(/\/forms\/[0-9a-f-]{36}/);
  const certSection = page.locator("section", { has: page.locator('input[value="Client certification"]') });
  await certSection.getByRole("button", { name: "+ Add question" }).click();
  await certSection.getByRole("button", { name: /New question/ }).click();
  await certSection.getByLabel("Question").fill("How did you hear about PetVax?");
  await certSection.getByLabel("Answer type").selectOption("radio");
  await certSection.getByLabel("Choices (one per line)").fill("Google\nInstagram\nFriend");
  await certSection.getByLabel("Choices (one per line)").blur();
  await page.getByLabel("What changed? (for the version history)").fill("Added referral question");
  await page.getByRole("tab", { name: "Preview (phone)" }).click();
  await expect(page.getByText("How did you hear about PetVax?")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/Published\./)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/v2 · published/)).toBeVisible();
  await expect(page.getByText("Added referral question")).toBeVisible();

  await page.goto(links["PetVax New Visit Form"]);
  await expect(page.getByText("How did you hear about PetVax?")).toBeVisible();
  await expect(page.getByText("Instagram")).toBeVisible();
});

test("front-desk pages and forms work at iPad width", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await login(page, "admin");
  for (const p of ["/", "/appointments", "/clients", "/submissions", "/forms", "/reminders", "/settings", "/settings/staff"]) {
    const r = await page.goto(p);
    expect(r?.status(), p).toBe(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${p} should not scroll sideways`).toBeLessThanOrEqual(1);
  }
});
