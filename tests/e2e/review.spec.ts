import { expect, test } from "@playwright/test";

test("upload → extract → review → confirm → save produces a verified deadline", async ({ page }) => {
  await page.goto("/upload");
  await page.setInputFiles('input[type="file"]', "fixtures/invoice-text.pdf");
  await expect(page.getByText("Text extracted")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Extract fields" }).click();

  // Review screen: the extractor's proposal, clearly labelled as a proposal.
  await expect(page.getByText("Review before saving")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Product name")).toHaveValue("Aurora ANC Headphones");
  await expect(page.getByLabel("Seller", { exact: true })).toHaveValue("SonicWave Electronics");
  await expect(page.getByLabel("Purchase date")).toHaveValue("2026-10-11");
  await expect(page.getByLabel("Currency")).toHaveValue("INR");

  // The return window says "of delivery", so the start date must be blank
  // and the form must say so instead of inventing a date.
  await expect(page.getByLabel("Return window start")).toHaveValue("");
  await expect(page.getByText(/ties this window to delivery/i)).toBeVisible();

  // The extractor deliberately left both start dates blank where the invoice is
  // silent; the user supplies them, then confirms explicitly.
  await expect(page.getByLabel("Warranty start")).toHaveValue("");
  await page.getByLabel("Return window start").fill("2026-10-14");
  await page.getByLabel("Warranty start").fill("2026-10-11");
  await page.getByLabel("I've checked this return window against the invoice.").check();
  await page.getByLabel("I confirmed this warranty myself.").check();

  await page.getByRole("button", { name: "Save confirmed product" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Aurora ANC Headphones" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Return window", { exact: true })).toBeVisible();
  await expect(page.getByText("Verified").first()).toBeVisible();

  // 2026-10-14 + 15 days = 2026-10-29, computed in code, not by the model.
  await expect(page.getByText("29 Oct 2026")).toBeVisible();

  // Clean up so the suite leaves no residue.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete product" }).click();
  await expect(page).toHaveURL(/\/products$/);
});

test("an unconfirmed extraction saves as needs review and stays out of the dashboard", async ({ page }) => {
  await page.goto("/upload");
  await page.setInputFiles('input[type="file"]', "fixtures/invoice-text.pdf");
  await expect(page.getByText("Text extracted")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Extract fields" }).click();
  await expect(page.getByText("Review before saving")).toBeVisible({ timeout: 20_000 });

  await page.getByLabel("Product name").fill("Unconfirmed Extraction Test");
  await page.getByLabel("Return window start").fill("2026-10-15");
  await page.getByLabel("Warranty start").fill("2026-10-11");
  // Deliberately do NOT tick either confirmation box.
  await page.getByRole("button", { name: "Save confirmed product" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Unconfirmed Extraction Test" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Needs review").first()).toBeVisible();
  // Both policies are unconfirmed, so both carry the warning.
  await expect(page.getByText(/stays off the dashboard/i).first()).toBeVisible();

  // It may appear in the "needs review" section, but never as a deadline.
  await page.goto("/");
  await expect(page.getByText("Unconfirmed Extraction Test").first()).toBeVisible();
  await expect(
    page.locator('section[aria-labelledby="returns-heading"]').getByText("Unconfirmed Extraction Test"),
  ).toHaveCount(0);
  await expect(
    page.locator('section[aria-labelledby="warranty-heading"]').getByText("Unconfirmed Extraction Test"),
  ).toHaveCount(0);

  // Remove the record so the suite leaves nothing behind.
  await page.goto("/products");
  const card = page.locator("a", { hasText: "Unconfirmed Extraction Test" }).first();
  await card.click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete product" }).click();
  await expect(page).toHaveURL(/\/products$/);
});
