import { expect, test, type Locator, type Page } from "@playwright/test";

// The user guide's screenshots (docs/user-guide.md; ADR 0005), from the built application, each a step the guide
// describes. Run with `pnpm --filter @gs1-label-studio/web screenshots` after `pnpm build`.

const out = (name: string) => new URL(`../../../docs/images/guide/${name}.png`, import.meta.url).pathname;
const xlsx = new URL("../../../packages/core/test/fixtures/bulk/products.xlsx", import.meta.url).pathname;

const identify = (page: Page) => page.locator("section[aria-labelledby='identify-title']");
const scan = (page: Page) => page.locator("section[aria-labelledby='scan-title']");
const label = (page: Page) => page.locator("section[aria-labelledby='label-title']");
const answer = (page: Page, question: string, value: "Yes" | "No") =>
  page.getByRole("group", { name: question }).getByRole("button", { name: value }).click();

async function shot(target: Locator | Page, name: string) {
  await (target as Page).screenshot({ path: out(name), animations: "disabled" });
}

async function paste(page: Page, data: string) {
  await page.fill("#paste", data);
  await page.getByRole("button", { name: "Fill in" }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".preview .symbol svg")).toBeVisible();
});

test("the editor at a glance", async ({ page }) => {
  await shot(page, "editor");
});

test("step 1: what the code identifies", async ({ page }) => {
  await paste(page, "]d2010950600013435210ABC123{GS}17271200");
  await expect(page.locator(".status")).toContainText("day 00");
  await shot(identify(page), "identify-error");
  await paste(page, "(01)09506000134352(10)ABC123(17)271231");
  await page.locator(".add-rows button.link", { hasText: /^\+ \(21\) / }).click();
  await page.fill("#q-21", "S1001");
  await page.getByRole("button", { name: "+ Add attributes" }).click();
  const row = page.locator(".attr").last();
  await row.getByLabel("Attribute (AI)").fill("(3103) NET WEIGHT (kg)");
  await row.getByLabel("Attribute value").fill("0,5");
  await expect(row.locator(".hint")).toContainText("→ In the code: (3103) 000500");
  await shot(identify(page), "identify");
});

test("step 1: several keys and the URI's parameters", async ({ page }) => {
  await page.selectOption("#key", "00");
  await page.fill("#key-value", "106141411234567897");
  await page.locator(".other-keys button.link").first().click();
  const rows = page.locator(".attr");
  await rows.nth(0).getByLabel("Attribute value").fill("09506000134376");
  await rows.nth(1).getByLabel("Attribute value").fill("10");
  await page.getByRole("button", { name: "+ Add parameter" }).click();
  await page.locator(".param").last().locator("input").first().fill("lang");
  await page.locator(".param").last().locator("input").last().fill("pt");
  await shot(identify(page), "several-keys");
});

test("step 2: where it is scanned", async ({ page }) => {
  await answer(page, "Is it scanned at a general retail point of sale?", "Yes");
  await answer(page, "Is it scanned in general distribution?", "No");
  await expect(scan(page).locator(".table-box")).toContainText("Symbol specification table 1");
  await shot(scan(page), "guided-choice");
  await shot(label(page).locator(".stage"), "label-ean13-qr");
});

test("step 3: the label, its options and exports", async ({ page }) => {
  await shot(label(page), "label-card");
  await page.getByRole("button", { name: "Real size" }).click();
  await page.getByRole("button", { name: "Calibrate the screen" }).click();
  await shot(label(page).locator(".stage"), "real-size");
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toContainText("✓ Read as intended", { timeout: 30_000 });
  await shot(label(page).locator(".toolbar"), "scan-test");
});

test("step 3: symbols laid out by their table", async ({ page }) => {
  await paste(page, "(01)19506000134373");
  await answer(page, "Is it scanned at a general retail point of sale?", "No");
  await answer(page, "Is it a regulated healthcare item sold in a retail pharmacy?", "No");
  await answer(page, "Is it scanned in general distribution?", "Yes");
  await answer(page, "Is it a tobacco product under the EU traceability regulation?", "No");
  await answer(page, "Is it a regulated healthcare item not sold at retail?", "No");
  await shot(label(page).locator(".canvas-frame"), "itf14");
  await paste(page, "(00)106141411234567897(02)09506000134376(37)24(10)ABC123(15)271231(3103)000500(400)PO-2026-0042(410)9506000134352");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await page.selectOption("#opt-symbol", "gs1-128");
  await shot(label(page).locator(".canvas-frame"), "gs1-128-stack");
});

test("step 3: the GS1 Logistic Label", async ({ page }) => {
  await paste(page, "(00)106141411234567897(02)09506000134376(37)24(10)ABC123");
  await page.selectOption("#opt-logistic", "a5");
  await page.fill("#opt-from", "Dal Giardino S.p.A.\nVia Roma 1, Milano");
  await page.fill("#opt-to", "Supermarket DC 12");
  await expect(page.locator(".caption")).toContainText("GS1 Logistic Label A5");
  await shot(label(page).locator(".stage"), "logistic-label");
});

test("printer, RFID and NFC, signature", async ({ page }) => {
  await page.locator("details.printer summary").click();
  await shot(page.locator("details.printer"), "printer");
  await page.locator("details.printer summary").click();
  await page.locator(".add-rows button.link", { hasText: /^\+ \(21\) / }).click();
  await page.fill("#q-21", "S1001");
  await page.selectOption("#epc-prefix", "7");
  await shot(page.locator("details.epc"), "epc");
  await page.locator("details.sign summary").click();
  await page.fill("#sig-name", "Finest Truffle Tapenade");
  await page.fill("#sig-brand", "Dal Giardino");
  await page.getByRole("button", { name: "New key" }).click();
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await expect(page.locator("details.sign .hint.ok")).toContainText("✓ Verified here");
  await shot(page.locator("details.sign"), "signature");
});

test("in bulk", async ({ page }) => {
  await page.getByRole("button", { name: "In bulk" }).click();
  await shot(page.locator("section[aria-labelledby='rows-title']"), "bulk-start");
  await page.fill("#rows-paste", "GTIN\tLote\tValidade\n9506000134376\tA1\t31/12/2027\n9506000134352\tA2\t31/02/2028\n" +
    "9506000134377\tA3\t30/06/2028\n\tA4\t30/06/2028\n");
  await page.getByRole("button", { name: "Use the pasted rows" }).click();
  await expect(page.locator(".report")).toContainText("1 row ready · 3 with errors");
  await shot(page.locator("section[aria-labelledby='rows-title']"), "bulk-report");
  await page.locator("#rows-file").setInputFiles(xlsx);
  await expect(page.locator(".summary")).toContainText("2 rows ready · 2 with errors");
  await page.locator("#gen-pattern").fill("{01}_{10}");
  await page.selectOption("#gen-sheet", "avery-l7163");
  await shot(page.locator(".generate"), "generate");
  await page.selectOption("#seq-kind", "sscc");
  await page.fill("#seq-count", "3");
  await page.fill("#seq-first", "123456789");
  await page.fill("#seq-extension", "1");
  await page.fill("#seq-gcp", "0614141");
  await expect(page.locator(".sequence .hint")).toContainText("106141411234567897 to 106141411234567910");
  await shot(page.locator(".sequence"), "sequence");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test("the fields first, the label fixed at the top", async ({ page }) => {
    await page.locator("#key-value").scrollIntoViewIfNeeded();
    await shot(page, "phone");
  });
});
