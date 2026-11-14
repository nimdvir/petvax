import { expect, test, type Page } from "@playwright/test";
import { ctx } from "./context";

async function sign(page: Page) {
  const pad = page.getByTestId("signature-pad");
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(box.x + 30 + i * 10, box.y + box.height / 2 + Math.sin(i) * 20);
  await page.mouse.up();
}

test("client completes the New Visit form for two pets on an iPhone", async ({ page }) => {
  const { links, stamp } = ctx();
  await page.goto(links["PetVax New Visit Form"]);
  await expect(page.getByRole("heading", { name: "PetVax New Visit Form" })).toBeVisible();
  // Nothing private is on the page.
  await expect(page.locator("body")).not.toContainText("@example.test");

  await page.getByLabel("First name").fill("Jordan");
  await page.getByLabel("Last name").fill(`Ellis${stamp}`);
  await page.getByLabel("Street address").fill("350 W 42nd St");
  await page.getByLabel("Apartment / unit").fill("Apt 9C");
  await page.getByLabel("City").fill("New York");
  await page.getByRole("combobox", { name: /^State/ }).selectOption("NY");
  await page.getByLabel("ZIP code").fill("10036");
  await page.getByLabel("Primary phone number").fill("(646) 555-0187");
  await page.getByLabel("Email address").fill(`jordan.${stamp}@example.org`);
  await page.getByText("Text", { exact: true }).click();

  const pet1 = page.getByTestId("pet-0");
  await pet1.getByLabel("Pet name").fill("Pepper");
  await pet1.getByText("Dog", { exact: true }).click();
  await pet1.getByLabel("Breed").fill("Labrador Retriever");
  await pet1.getByLabel("Color").fill("Black");
  await pet1.getByText("Female", { exact: true }).click();
  await pet1.locator("fieldset", { hasText: "Spayed / neutered" }).getByText("Yes").click();
  await pet1.getByLabel("Date of birth").fill("2020-06-15");
  await pet1.getByLabel("Weight (lb)").fill("62");
  await pet1.getByLabel("Microchip number").fill(`98510${stamp}`.slice(0, 15));
  await pet1.getByText("Rabies", { exact: true }).click();
  await pet1.getByText("DHPP/DAPP", { exact: true }).click();
  await pet1.locator("fieldset", { hasText: "ever had a reaction" }).getByText("No").click();

  // Validation runs on the server too: submitting now flags the missing consent + signature.
  await page.getByRole("button", { name: "+ Add another pet" }).click();
  const pet2 = page.getByTestId("pet-1");
  await pet2.getByLabel("Pet name").fill("Tofu");
  await pet2.getByText("Cat", { exact: true }).click();
  await pet2.getByLabel("Breed").fill("Domestic Shorthair");
  await pet2.getByLabel("Color").fill("Grey tabby");
  await pet2.getByText("Male", { exact: true }).click();
  await pet2.locator("fieldset", { hasText: "Spayed / neutered" }).getByText("Yes").click();
  await pet2.getByLabel("Approximate age (years)").fill("4");
  await pet2.getByLabel("Weight (lb)").fill("11");
  await pet2.getByText("FVRCP", { exact: true }).click();
  await pet2.locator("fieldset", { hasText: "ever had a reaction" }).getByText("Yes").click();
  await pet2.getByText("Swelling", { exact: true }).click();
  await pet2.getByLabel("Please explain the reaction").fill("Small lump at injection site in 2024");

  await page.getByLabel("Preferred date").fill("2026-12-03");
  await page.getByLabel("Preferred time").selectOption("Morning (9-12)");
  await page.getByText("I certify that the information provided").click();

  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.getByText("Please sign in the box")).toBeVisible();

  await expect(page.getByTestId("consent-text")).toContainText("I authorize PetVax veterinary personnel");
  await page.getByText("I have read and understand the above consent statement.").click();
  await page.getByText("I agree to sign this form electronically").click();
  await page.getByLabel("Your full name").fill(`Jordan Ellis${stamp}`);
  await sign(page);
  // Fixed fields no longer show their old error messages.
  await expect(page.getByText("Please sign in the box")).toHaveCount(0);
  await expect(page.getByText("Type your full name")).toHaveCount(0);
  await page.screenshot({ path: "test-results/iphone-form-before-submit.png", fullPage: false });
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("heading", { name: "Submitted" })).toBeVisible();
  await expect(page.getByText("Your information and consent have been received")).toBeVisible();
});

test("a revoked or made-up link shows a friendly message", async ({ page }) => {
  const res = await page.goto("/f/thisIsNotARealTokenAtAll1234");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("This link may have expired")).toBeVisible();
});
