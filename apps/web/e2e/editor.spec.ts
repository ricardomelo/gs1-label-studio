import { expect, test } from "@playwright/test";

// The editor (ADR 0004, mock-ups of 28 October 2026): what the code identifies on the left, the label redrawn beside
// it as anything changes.

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  await page.goto("/");
  await expect(page.locator(".preview .symbol svg")).toBeVisible();
});

test.afterEach(() => {
  expect(errors, "errors in the page").toEqual([]);
});

test("qualifiers and a decimal attribute go into the URI as typed", async ({ page }) => {
  await page.fill("#q-22", "V1");
  await page.fill("#q-21", "S1001");
  await page.getByRole("button", { name: "+ Add attribute" }).click();
  const row = page.locator(".attr").nth(1);
  await row.getByLabel("Attribute (AI)").fill("(3103) NET WEIGHT (kg)");
  await row.getByLabel("Attribute value").fill("0,5");
  await expect(row.locator(".hint")).toContainText("→ In the code: (3103) 000500");
  await expect(page.locator(".uri")).toHaveText(
    "https://id.gs1.org/01/09506000134376/22/V1/10/B42/21/S1001?17=271231&3103=000500",
  );
  await expect(page.locator("#q-235")).toBeDisabled();
  await expect(page.locator(".caption")).toContainText("QR code version");
});

test("a wrong check digit says which it should be", async ({ page }) => {
  await page.fill("#key-value", "09506000134377");
  await expect(page.locator("#key-hint")).toHaveText("The check digit does not match: it should be 6.");
  await expect(page.locator(".preview .error")).toBeVisible();
});

test("pasted scanner output fills the fields and day 00 is explained", async ({ page }) => {
  await page.fill("#paste", "]d2010950600013435210ABC123{GS}17271200");
  await page.getByRole("button", { name: "Fill in" }).click();
  await expect(page.locator("#key-value")).toHaveValue("09506000134352");
  await expect(page.locator("#q-10")).toHaveValue("ABC123");
  await expect(page.locator(".status")).toContainText("day 00");
});

test("an SSCC gets the logistic tables and no linear barcode", async ({ page }) => {
  await page.fill("#paste", "https://id.gs1.org/00/106141411234567897");
  await page.getByRole("button", { name: "Fill in" }).click();
  await expect(page.locator("#opt-env option")).toHaveText(["Logistic units, SSCC (table 5)", "Direct part marking (table 7)"]);
  await expect(page.locator("#opt-linear")).toHaveCount(0);
  await expect(page.locator(".caption")).toContainText("X 0.743 mm");
});

test("the page fits the screen's width", async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );
});
