import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

test("the EPC asks for a serial number, then writes every format", async ({ page }) => {
  const section = page.locator("details.epc");
  await expect(section.locator(".epc-message")).toHaveText("This key's EPC needs its qualifier (21), such as the serial number.");
  await page.fill("#q-21", "S1001");
  await page.selectOption("#epc-prefix", "7");
  const kv = section.locator(".kv");
  await expect(kv).toContainText("SGTIN-198");
  // 198 bits, zero-filled to the 16-bit word as a tag holds them: 52 hexadecimal digits
  await expect(kv).toContainText("36364433400d1f69b160c1880000000000000000000000000000");
  await expect(kv).toContainText("urn:epc:tag:sgtin-198:1.9506000.013437.S1001");
  await expect(kv).toContainText("urn:epc:id:sgtin:9506000.013437.S1001");
  await expect(kv).toContainText("https://id.gs1.org/eh36364433400d1f69b160c18800000000000000000000000000 Copy");
  await expect(kv).toContainText("https://id.gs1.org/exNjZEM0ANH2mxYMGIAAAAAAAAAAAAAAAAA");
});

test("GS1's GCP length table gives the prefix's length and stays in the browser", async ({ page }) => {
  await page.fill("#q-21", "S1001");
  await expect(page.locator("details.epc .epc-message")).toHaveText(
    "Choose the company prefix length, or load GS1's GCP length table.",
  );
  await page.setInputFiles("#gcp-file", {
    name: "GCPPrefixFormatList.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(
      '<?xml version="1.0"?><GCPPrefixFormatList date="2026-09-17T11:04:36.316Z">' +
        '<entry prefix="950" gcpLength="7"/><entry prefix="9506" gcpLength="9"/></GCPPrefixFormatList>',
    ),
  });
  await expect(page.locator("details.epc .gcp .hint")).toContainText("GS1's list of 2026-09-17 loaded: 2 prefixes");
  await expect(page.locator("details.epc")).toContainText("A company prefix of 9 digits, from GS1's list of 2026-09-17.");
  await expect(page.locator("details.epc .kv")).toContainText("urn:epc:id:sgtin:950600013.0437.S1001");
  await page.reload();
  await expect(page.locator("details.epc .gcp .hint")).toContainText("GS1's list of 2026-09-17: 2 prefixes, kept in this browser.");
});

test("the label downloads as SVG, PNG, PDF, EPS and zip, named after the key", async ({ page }) => {
  const name = "dl-qrcode_01_09506000134376_10_B42";
  const files: [RegExp, string, number[]][] = [
    [/^Download SVG$/, `${name}.svg`, [0x3c, 0x3f, 0x78, 0x6d, 0x6c]], // <?xml
    [/^PNG \(616 dpi\)$/, `${name}.png`, [0x89, 0x50, 0x4e, 0x47]],
    [/^PDF$/, `${name}.pdf`, [0x25, 0x50, 0x44, 0x46]], // %PDF
    [/^EPS$/, `${name}.eps`, [0x25, 0x21, 0x50, 0x53]], // %!PS
    [/^Zip of all$/, `${name}.zip`, [0x50, 0x4b, 0x03, 0x04]],
  ];
  for (const [button, file, signature] of files) {
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: button }).click()]);
    expect(download.suggestedFilename()).toBe(file);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect([...Buffer.concat(chunks).subarray(0, signature.length)]).toEqual(signature);
    // The browser's own deflate wrote the zip: every entry's CRC checked by Info-ZIP's unzip.
    if (file.endsWith(".zip")) {
      expect(execFileSync("unzip", ["-tq", (await download.path())!], { encoding: "utf8" })).toContain("No errors");
      expect(execFileSync("unzip", ["-Z1", (await download.path())!], { encoding: "utf8" }).split("\n").filter(Boolean))
        .toEqual([`${name}.svg`, `${name}.png`, `${name}.pdf`, `${name}.eps`, "README.txt"]);
    }
  }
});

test("GS1 QR Code is not offered beside the QR code with a GS1 Digital Link URI", async ({ page }) => {
  const symbols = await page.locator("#opt-symbol option").allTextContents();
  expect(symbols).toContain("QR code (GS1 Digital Link)");
  expect(symbols).not.toContain("GS1 QR Code");
});

// Step 2, where the code is scanned (backlog 1.2, mock-up B of 29 October 2026): the decision tree's questions, the
// table they lead to, and the symbols it allows for the data, the recommended one drawn.
const answer = (page: import("@playwright/test").Page, question: string, value: "Yes" | "No") =>
  page.getByRole("group", { name: question }).getByRole("button", { name: value }).click();

test("at a retail till, a batch and a date: the EAN-13 with a QR code beside it, from table 1", async ({ page }) => {
  const step = page.locator("section[aria-labelledby='scan-title']");
  await expect(step).toContainText("The GTIN already answers 2 questions of the tree");
  await answer(page, "Is it scanned at a general retail point of sale?", "Yes");
  await answer(page, "Is it scanned in general distribution?", "No");
  await expect(step.locator(".table-box")).toContainText("Symbol specification table 1");
  await expect(step.getByRole("radio", { checked: true })).toContainText("EAN-13, with a QR code (GS1 Digital Link) beside it");
  await expect(page.locator(".chosen")).toContainText("EAN-13 with a QR code (GS1 Digital Link) beside it · table 1");
  await expect(page.locator("#opt-symbol")).toHaveCount(0);
  await expect(page.locator("#opt-env")).toHaveCount(0);
  await expect(page.locator(".caption")).toContainText("label 71.8 × 32.7 mm");
  await expect(step).toContainText("Not for this data: UPC-A (carries a GTIN-12)");

  await step.getByRole("radio", { name: /^EAN-13 alone/ }).click();
  await expect(page.locator(".caption")).toContainText("EAN-13");
  await expect(page.locator(".caption")).not.toContainText("QR code");
  // GS1 DataBar Expanded carries a fixed measure item's GTIN alone at a till (section 2.1.3).
  await step.getByRole("radio", { name: /^GS1 DataBar Expanded alone/ }).click();
  await expect(page.locator(".caption")).toContainText("GS1 DataBar Expanded · bars 11.23 mm · X 0.330 mm");
  await expect(page.locator(".preview svg path[aria-label]")).toHaveAttribute("aria-label", "(01)09506000134376");
});

test("an SSCC in distribution: GS1-128 at table 5's sizes and bar height", async ({ page }) => {
  await page.fill("#paste", "https://id.gs1.org/00/106141411234567897");
  await page.getByRole("button", { name: "Fill in" }).click();
  const step = page.locator("section[aria-labelledby='scan-title']");
  await expect(step).toContainText("The SSCC already answers 4 questions");
  await answer(page, "Is it scanned in general distribution?", "Yes");
  await answer(page, "Is it a tobacco product under the EU traceability regulation?", "No");
  await expect(step).toContainText("The SSCC already answers 5 questions of the tree: not an asset, document or location; " +
    "not a service relationship (GSRN); not sold at a retail till; not sold in a pharmacy; a logistic unit.");
  await expect(step.getByRole("radio", { checked: true })).toContainText("GS1-128");
  await expect(page.locator(".caption")).toHaveText("GS1-128 · bars 31.75 mm · X 0.495 mm · label 89.1 × 37.6 mm at 100 %");
  await expect(page.locator("#opt-size option")).toHaveText([
    "100 % (X 0.495 mm, recommended)", "120 % (X 0.594 mm)", "150 % (X 0.743 mm)",
  ]);
  await page.selectOption("#opt-size", "150");
  await expect(page.locator(".caption")).toContainText("GS1-128 · bars 31.75 mm · X 0.743 mm");
  await expect(page.locator(".preview svg path[aria-label]")).toHaveAttribute("aria-label", "(00)106141411234567897");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ZPL (203 dpi)" }).click()]);
  expect(download.suggestedFilename()).toBe("gs1-128_00_106141411234567897.zpl");
});

test("choosing the symbol yourself starts from the guided choice and can go back", async ({ page }) => {
  await answer(page, "Is it scanned at a general retail point of sale?", "No");
  await answer(page, "Is it a regulated healthcare item sold in a retail pharmacy?", "No");
  await answer(page, "Is it scanned in general distribution?", "No");
  await answer(page, "Is it a regulated healthcare item?", "Yes");
  await answer(page, "Is the code marked directly on the item?", "No");
  await expect(page.locator(".chosen")).toContainText("GS1 DataMatrix · table 6");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await expect(page.locator("#opt-symbol")).toHaveValue("gs1-datamatrix");
  await expect(page.locator("#opt-env")).toHaveValue("healthcare");
  await page.getByRole("button", { name: "Back to the guided choice" }).click();
  await expect(page.locator(".chosen")).toContainText("GS1 DataMatrix · table 6");
});

// Item 1.3: ITF-14, GS1-128 and GS1 DataBar laid out as the General Specifications place them.
test("a case in general distribution: ITF-14 with its bearer bars and digits, at table 2's sizes", async ({ page }) => {
  await page.fill("#paste", "(01)19506000134373");
  await page.getByRole("button", { name: "Fill in" }).click();
  await answer(page, "Is it scanned at a general retail point of sale?", "No");
  await answer(page, "Is it a regulated healthcare item sold in a retail pharmacy?", "No");
  await answer(page, "Is it scanned in general distribution?", "Yes");
  await answer(page, "Is it a tobacco product under the EU traceability regulation?", "No");
  await answer(page, "Is it a regulated healthcare item not sold at retail?", "No");
  await expect(page.locator(".chosen")).toContainText("ITF-14 · table 2");
  await expect(page.locator(".caption")).toHaveText("ITF-14 · bars 31.75 mm · X 0.495 mm · label 81.2 × 47.3 mm at 100 %");
  await expect(page.locator(".preview svg path[aria-label]")).toHaveAttribute("aria-label", "19506000134373");
  await expect(page.locator("#opt-bearer option")).toHaveText([
    "A frame, 4.83 mm (any printing; needed with printing plates)", "Top and bottom, 2X (printing without plates: thermal, laser)",
  ]);
  await page.selectOption("#opt-bearer", "bars");
  await expect(page.locator(".caption")).toContainText("label 71.5 × 39.6 mm at 100 %");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PDF", exact: true }).click()]);
  expect(download.suggestedFilename()).toBe("itf14_01_19506000134373.pdf");
  // The ZPL draws the same bearer bars with ^GB, and the digits below them.
  const [zpl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ZPL (203 dpi)" }).click()]);
  const text = readFileSync((await zpl.path())!, "utf8");
  expect(text).toContain("^BY4,3.0,257^B2N,257,N,N,N^FD19506000134373^FS"); // 31.75 mm: 257 dots
  expect(text.match(/\^GB\d+,8,8\^FS/g)).toHaveLength(2);
  expect(text).toContain("^FD19506000134373^FS");
});

test("a case's GTIN at a retail till: GS1 DataBar Omnidirectional; with a batch, two symbols to choose from", async ({ page }) => {
  await page.fill("#paste", "(01)19506000134373");
  await page.getByRole("button", { name: "Fill in" }).click();
  await answer(page, "Is it scanned at a general retail point of sale?", "Yes");
  await answer(page, "Is it scanned in general distribution?", "No");
  await expect(page.locator(".chosen")).toContainText("GS1 DataBar Omnidirectional · table 1");
  await expect(page.locator(".caption")).toContainText("GS1 DataBar Omnidirectional · bars 15.19 mm · X 0.330 mm");
  // ^BR prints it 33 modules high; table 1 asks for 46: the ZPL is refused, with the reason.
  await page.getByRole("button", { name: "ZPL (203 dpi)" }).click();
  await expect(page.locator(".error.small")).toContainText("^BR prints GS1 DataBar Omnidirectional 33 modules high");
  await page.fill("#q-10", "B42");
  const step = page.locator("section[aria-labelledby='scan-title']");
  await expect(step).toContainText(
    "This data needs two symbols: GS1 DataBar Omnidirectional with a QR code (GS1 Digital Link) beside it.");
  await expect(page.locator(".preview .error")).toContainText("This data needs two symbols");
  await step.getByRole("radio", { name: /^GS1 DataBar Stacked Omnidirectional/ }).click();
  await expect(page.locator(".caption")).toContainText("GS1 DataBar Stacked Omnidirectional · bars 31.37 mm");
});

test("choosing ITF-14 yourself offers the key's scanning environments whose table allows it", async ({ page }) => {
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await page.selectOption("#opt-symbol", "itf14");
  const environments = await page.locator("#opt-env").evaluate((select: HTMLSelectElement) => [...select.options].map((o) => o.value));
  expect(environments).toEqual(["distribution", "pharmacy", "pharmacy-gd", "healthcare", "other"]);
  await expect(page.locator(".preview .error")).toContainText("ITF-14 carries the GTIN alone");
});

// Item 1.6 (mock-up A of 29 October 2026): the preview at real size with rulers, the screen's calibration, the scan test.
test("the scan test reads the label back as intended, with ZXing in the browser", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toHaveText(
    "✓ Read as intended: ]Q1 https://id.gs1.org/01/09506000134376/10/B42?17=271231", { timeout: 30_000 });
  // An ITF-14 with its bearer bars, from step 2.
  await page.fill("#paste", "(01)19506000134373");
  await page.getByRole("button", { name: "Fill in" }).click();
  await expect(page.locator(".scan-result")).toHaveText("Reads the label back with ZXing, here in the browser.");
  await answer(page, "Is it scanned at a general retail point of sale?", "No");
  await answer(page, "Is it a regulated healthcare item sold in a retail pharmacy?", "No");
  await answer(page, "Is it scanned in general distribution?", "Yes");
  await answer(page, "Is it a tobacco product under the EU traceability regulation?", "No");
  await answer(page, "Is it a regulated healthcare item not sold at retail?", "No");
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toHaveText("✓ Read as intended: ]I1 19506000134373", { timeout: 30_000 });
  // Nothing leaves the browser: the reader and its WebAssembly come from the application.
  expect(requests.filter((url) => !url.startsWith("http://localhost:4173/") && !url.startsWith("blob:"))).toEqual([]);
});

test("at real size the label is drawn between rulers in millimetres, at the screen's calibration", async ({ page }) => {
  await page.getByRole("button", { name: "Real size" }).click();
  const symbol = page.locator(".real .symbol");
  // 32.6 mm wide at 96 CSS pixels an inch.
  const box = await symbol.boundingBox();
  expect(box!.width).toBeCloseTo((32.6 * 96) / 25.4, 0);
  await expect(page.locator(".real .ruler")).toHaveCount(2);
  await page.getByRole("button", { name: "Calibrate the screen" }).click();
  await page.locator("#calibrate").fill("5");
  expect((await page.locator(".card-bar").boundingBox())!.width).toBeCloseTo(53.98 * 5, 0); // a card's short side
  expect((await symbol.boundingBox())!.width).toBeCloseTo(32.6 * 5, 0);
  // Kept in this browser.
  await page.reload();
  await page.getByRole("button", { name: "Real size" }).click();
  expect((await page.locator(".real .symbol").boundingBox())!.width).toBeCloseTo(32.6 * 5, 0);
  await page.getByRole("button", { name: "Calibrate the screen" }).click();
  await page.getByRole("button", { name: "Reset" }).click();
  expect((await page.locator(".real .symbol").boundingBox())!.width).toBeCloseTo((32.6 * 96) / 25.4, 0);
  await page.getByRole("button", { name: "Fit" }).click();
  await expect(page.locator(".real")).toHaveCount(0);
});

// The rest of item 1.5: prepress.
test("a bar width reduction narrows the bars of a linear symbol; a PNG at a chosen resolution", async ({ page }) => {
  await expect(page.locator("#opt-reduction")).toHaveCount(0); // a QR code alone has no bars
  await page.selectOption("#opt-linear", "auto");
  await page.selectOption("#opt-reduction", "0.02");
  await expect(page.locator(".preview svg desc")).toContainText("bars reduced by 0.020 mm (bar width reduction)");
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toContainText("✓ Read as intended", { timeout: 30_000 });
  await expect(page.locator("#opt-png option").nth(1)).toHaveText("300 dpi — 6 pixels a module, X 0.508 mm");
  await page.selectOption("#opt-png", "300");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PNG (300 dpi)" }).click()]);
  const png = readFileSync((await download.path())!);
  // pHYs: 11811 pixels a metre, 300 dpi.
  const at = png.indexOf("pHYs");
  expect(png.readUInt32BE(at + 4)).toBe(11811);
});

// Item 1.7: offline. The service worker keeps every file of the application on the first visit.
test("works offline once loaded, the scan test too", async ({ page, context }) => {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.locator(".preview .symbol svg")).toBeVisible();
    // The GS1 Barcode Syntax Engine and the encoder still answer…
    await page.fill("#q-21", "S1");
    await expect(page.locator(".uri")).toHaveText("https://id.gs1.org/01/09506000134376/10/B42/21/S1?17=271231");
    // …and ZXing's WebAssembly, never loaded before, comes from the cache.
    await page.getByRole("button", { name: "Scan test" }).click();
    await expect(page.locator(".scan-result")).toContainText("✓ Read as intended", { timeout: 30_000 });
  } finally {
    await context.setOffline(false);
  }
});
