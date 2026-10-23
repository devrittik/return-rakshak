import { expect, test } from "@playwright/test";

test("dashboard renders and navigation reaches every page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  for (const [label, heading] of [
    ["Products", "Products"],
    ["Reminders", "Reminders"],
    ["Privacy", "What ReturnRakshak stores"],
  ] as const) {
    await page.getByRole("navigation", { name: "Primary" }).first().getByRole("link", { name: label }).click();
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(heading) })).toBeVisible();
  }
});

test("a manually entered product can be saved, verified and deleted", async ({ page }) => {
  const name = `E2E Lamp ${Date.now()}`;

  await page.goto("/products/new");
  await page.getByLabel("Product name", { exact: false }).fill(name);
  await page.getByLabel("Seller", { exact: true }).fill("Playwright Traders");
  await page.getByLabel("Price", { exact: true }).fill("1299.50");

  // Confirm the return window explicitly — otherwise it must stay unverified.
  await page.getByRole("checkbox", { name: /I checked this against the seller/i }).check();
  await page.getByRole("button", { name: "Save product" }).click();

  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText("Verified").first()).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete product" }).click();

  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByText(name)).toHaveCount(0);
});

test("an unconfirmed policy is shown as needing review, never as a verified date", async ({ page }) => {
  const name = `E2E Unverified ${Date.now()}`;

  await page.goto("/products/new");
  await page.getByLabel("Product name", { exact: false }).fill(name);
  await page.getByRole("button", { name: "Save product" }).click();

  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText("Needs review").first()).toBeVisible();
  await expect(page.getByText(/cannot be treated as confirmed/i)).toBeVisible();

  // Leave the database exactly as we found it.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete product" }).click();
  await expect(page).toHaveURL(/\/products$/);
});
