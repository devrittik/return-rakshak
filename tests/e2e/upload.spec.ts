import { expect, test } from "@playwright/test";

const pdf = "fixtures/invoice-text.pdf";
const scan = "fixtures/invoice-scan.png";

test("a text PDF is read natively and nothing is persisted", async ({ page }) => {
  // Baseline: how many products does the app currently track?
  await page.goto("/");
  const statValue = page.locator("text=PRODUCTS").locator("..").locator("p").nth(1);
  const before = await statValue.textContent().catch(() => null);

  await page.goto("/upload");
  await page.setInputFiles('input[type="file"]', pdf);

  await expect(page.getByText("Text extracted")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Native text layer")).toBeVisible();
  await expect(page.getByText("Nothing", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Show extracted text" }).click();
  await expect(page.locator("pre")).toContainText("Aurora ANC Headphones");

  // The privacy claim, checked end to end: no product was created.
  await page.goto("/");
  if (before !== null) {
    await expect(page.locator("text=PRODUCTS").locator("..").locator("p").nth(1)).toHaveText(before);
  }
});

test("a scanned image falls back to OCR", async ({ page }) => {
  test.skip(process.env.E2E_SKIP_OCR === "1", "OCR disabled for this environment");

  await page.goto("/upload");
  await page.setInputFiles('input[type="file"]', scan);

  await expect(page.getByText("Text extracted")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/OCR · \d+% confidence/)).toBeVisible();
});

test("an unsupported file is rejected with a recoverable path", async ({ page }) => {
  await page.goto("/upload");
  await page.setInputFiles('input[type="file"]', {
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an invoice"),
  });

  // Scope to the message: Next injects its own role="alert" route announcer.
  await expect(page.getByText("Only PDF, PNG and JPEG invoices are supported.")).toBeVisible();
  await expect(page.getByRole("link", { name: "add the product manually" })).toBeVisible();
});
