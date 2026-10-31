import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

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

/** A qualifier's value: its row added from the key's qualifiers first if it is not in the list yet (backlog 1.15). */
async function qualifier(page: Page, ai: string, value: string) {
  if (!(await page.locator(`#q-${ai}`).count())) await page.locator(".add-rows button.link", { hasText: new RegExp(`^\\+ \\(${ai}\\) `) }).click();
  await page.fill(`#q-${ai}`, value);
}

test.afterEach(() => {
  expect(errors, "errors in the page").toEqual([]);
});

test("qualifiers and a decimal attribute go into the URI as typed", async ({ page }) => {
  await qualifier(page, "22", "V1");
  await qualifier(page, "21", "S1001");
  await page.getByRole("button", { name: "+ Add attributes" }).click();
  const row = page.locator(".attr").last();
  await row.getByLabel("Attribute (AI)").fill("(3103) NET WEIGHT (kg)");
  await row.getByLabel("Attribute value").fill("0,5");
  await expect(row.locator(".hint")).toContainText("→ In the code: (3103) 000500");
  await expect(page.locator(".uri")).toHaveText(
    "https://id.gs1.org/01/09506000134376/22/V1/10/B42/21/S1001?17=271231&3103=000500",
  );
  await expect(page.locator(".caption")).toContainText("QR code version");
  // The rows' order does not change the path's; (235) is not taken with (21)
  await page.locator(".attr").first().getByRole("button", { name: "Move down" }).click();
  await expect(page.locator(".uri")).toHaveText(
    "https://id.gs1.org/01/09506000134376/22/V1/10/B42/21/S1001?17=271231&3103=000500",
  );
  await qualifier(page, "235", "X1");
  await expect(page.locator(".attr.qualifier", { has: page.locator("#q-235") }).locator(".hint")).toHaveText("Not with (22), (10) and (21): the key takes one or the other.");
  await expect(page.locator(".preview .error")).toContainText("Qualifiers (22) and (235) cannot be used together");
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
  await qualifier(page, "21", "S1001");
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
  await qualifier(page, "21", "S1001");
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
  await expect(page.locator(".caption")).toHaveText("GS1-128 · bars 31.75 mm · X 0.495 mm · label 89.1 × 37.6 mm at 100 % · 156 modules wide · 21 characters encoded (FNC1 included)");
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
  await expect(page.locator(".caption")).toHaveText("ITF-14 · bars 31.75 mm · X 0.495 mm · label 81.2 × 47.3 mm at 100 % · 120.5 modules wide · 14 characters encoded");
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
  await qualifier(page, "10", "B42");
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
  // At the slider's maximum the bar still fits its box, across the label's card (backlog 1.10 c); − and + fine-tune.
  if (page.viewportSize()!.width > 900) expect(Number(await page.locator("#calibrate").getAttribute("max"))).toBe(7);
  const top = Number(await page.locator("#calibrate").getAttribute("max")); // 7, or less where 7 does not fit
  await page.locator("#calibrate").fill(String(top));
  const bar = (await page.locator(".card-bar").boundingBox())!;
  const frame = (await page.locator(".calibration").boundingBox())!;
  expect(bar.width).toBeCloseTo(53.98 * top, 0);
  expect(bar.x + bar.width).toBeLessThanOrEqual(frame.x + frame.width);
  await expect(page.getByRole("button", { name: "Longer" })).toBeDisabled();
  await page.getByRole("button", { name: "Shorter" }).click();
  expect((await page.locator(".card-bar").boundingBox())!.width).toBeCloseTo(53.98 * (top - 0.01), 1);
  await page.locator("#calibrate").fill("5");
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
    await qualifier(page, "21", "S1");
    await expect(page.locator(".uri")).toHaveText("https://id.gs1.org/01/09506000134376/10/B42/21/S1?17=271231");
    // …and ZXing's WebAssembly, never loaded before, comes from the cache.
    await page.getByRole("button", { name: "Scan test" }).click();
    await expect(page.locator(".scan-result")).toContainText("✓ Read as intended", { timeout: 30_000 });
  } finally {
    await context.setOffline(false);
  }
});

test("tobacco unit packs: GS1 DotCode named but not drawn, GS1 DataMatrix at table 12's size", async ({ page }) => {
  await answer(page, "Is it scanned at a general retail point of sale?", "No");
  await answer(page, "Is it a regulated healthcare item sold in a retail pharmacy?", "No");
  await answer(page, "Is it scanned in general distribution?", "Yes");
  await answer(page, "Is it a tobacco product under the EU traceability regulation?", "Yes");
  await answer(page, "Is it a unit pack?", "Yes");
  await expect(page.locator(".chosen")).toContainText("GS1 DataMatrix · table 12");
  const step = page.locator("section[aria-labelledby='scan-title']");
  await expect(step).toContainText("GS1 DotCode");
  await expect(step).toContainText("none reads GS1 DotCode yet");
  await expect(page.locator(".caption")).toContainText("X 0.380 mm");
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toContainText("✓ Read as intended: ]d2 (01)09506000134376(10)B42(17)271231", { timeout: 30_000 });
});

// Item 2.1 (mock-up A of 29 October 2026): in bulk, rows from a file or pasted, their columns, the row shown.
test("in bulk: an Excel workbook's rows, columns guessed from their headers, each row drawn and checked", async ({ page }) => {
  await page.getByRole("button", { name: "In bulk" }).click();
  await expect(page.locator(".preview .error")).toHaveText("Add rows: a CSV or Excel file, or rows pasted from a spreadsheet.");
  await page.locator("#rows-file").setInputFiles(new URL("../../../packages/core/test/fixtures/bulk/products.xlsx", import.meta.url).pathname);
  await expect(page.locator(".source")).toContainText("products.xlsx · sheet “Produtos” · 4 rows");
  await expect(page.locator("#map-0")).toHaveValue("01");
  await expect(page.locator("#map-2")).toHaveValue("17");
  await expect(page.locator("#map-4")).toHaveValue("");
  await expect(page.locator(".summary")).toContainText("2 rows ready · 2 with errors");
  await expect(page.locator(".rrow[data-row='4'] .why")).toHaveText("The check digit does not match: it should be 2.");
  await expect(page.locator(".uri")).toHaveText("https://id.gs1.org/01/09506000134376/10/B42?17=271231&3101=000005&11=261001");
  await page.getByRole("button", { name: "Next row" }).click();
  await expect(page.locator(".row-nav")).toContainText("Row 3 · 2 of 4 · ready");
  await expect(page.locator(".uri")).toHaveText("https://id.gs1.org/01/09506000134352/10/L-7?17=280105&3102=000125&11=261001");
  await page.locator(".rrow[data-row='5']").getByRole("button", { name: "Show" }).click();
  await expect(page.locator(".row-nav")).toContainText("Row 5 · 4 of 4 · error");
  await expect(page.locator(".preview .error")).toHaveText("Row 5: The key's column is empty on this row.");
  // A column left out: the production date goes.
  await page.getByRole("button", { name: "Previous row" }).click();
  await page.getByRole("button", { name: "Previous row" }).click();
  await page.selectOption("#map-5", "");
  await expect(page.locator(".uri")).toHaveText("https://id.gs1.org/01/09506000134352/10/L-7?17=280105&3102=000125");
});

test("in bulk: pasted rows, a value for every row, and the columns remembered for the same headers", async ({ page }) => {
  await page.getByRole("button", { name: "In bulk" }).click();
  await page.fill("#rows-paste", "Código de barras\tLote\tVence\n9506000134376\tA1\t31/12/2027\n9506000134352\tA2\t30/06/2028\n");
  await page.getByRole("button", { name: "Use the pasted rows" }).click();
  await expect(page.locator(".summary")).toContainText("2 rows ready");
  await expect(page.locator("#map-2")).toHaveValue(""); // "Vence" is not a word the guess knows
  await page.selectOption("#map-2", "17");
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.selectOption("#fixed-ai-0", "422");
  await page.fill("[aria-label='Value 1']", "076");
  await expect(page.locator(".uri")).toHaveText("https://id.gs1.org/01/09506000134376/10/A1?17=271231&422=076");
  // The same headers again, after a reload: the columns and the fixed value as they were chosen.
  await page.reload();
  await page.getByRole("button", { name: "In bulk" }).click();
  await page.fill("#rows-paste", "Código de barras\tLote\tVence\n9506000134352\tB7\t01/01/2029\n");
  await page.getByRole("button", { name: "Use the pasted rows" }).click();
  await expect(page.locator(".uri")).toHaveText("https://id.gs1.org/01/09506000134352/10/B7?17=290101&422=076");
});

// Item 2.2 (mock-up A of 29 October 2026): the validation report — the cell at fault fixed in place, rows skipped,
// the report and the corrected rows as CSV.
test("in bulk: the validation report, a cell fixed in place, rows skipped, the report and the corrected rows", async ({ page }) => {
  await page.getByRole("button", { name: "In bulk" }).click();
  await page.fill("#rows-paste", "GTIN\tLote\tValidade\n9506000134376\tA1\t31/12/2027\n9506000134352\tA2\t31/02/2028\n" +
    "9506000134377\tA3\t30/06/2028\n\tA4\t30/06/2028\n");
  await page.getByRole("button", { name: "Use the pasted rows" }).click();
  const report = page.locator(".report");
  await expect(report).toContainText("1 row ready · 3 with errors");
  await expect(report.getByRole("button", { name: "With errors (3)" })).toHaveAttribute("aria-pressed", "true");
  // The cell at fault, marked: the date of row 3, the GTIN of rows 4 and 5.
  await expect(page.locator("#cell-1-2")).toHaveClass(/at-fault/);
  await expect(page.locator("#cell-1-0")).not.toHaveClass(/at-fault/);
  await expect(page.locator("#cell-2-0")).toHaveClass(/at-fault/);
  await expect(page.locator(".rrow[data-row='3'] .why")).toHaveText("AI (17): The date contains an illegal day of the month.");
  // Fixed in place: the row stays in the list, now fixed, and the label shows it.
  await page.fill("#cell-1-2", "28/02/2028");
  await expect(report).toContainText("1 row ready · 2 with errors · 1 fixed");
  await expect(page.locator(".rrow[data-row='3'] .tag")).toHaveText("fixed");
  await page.locator(".rrow[data-row='3']").getByRole("button", { name: "Show" }).click();
  await expect(page.locator(".row-nav")).toContainText("Row 3 · 2 of 4 · fixed");
  await expect(page.locator(".uri")).toHaveText("https://id.gs1.org/01/09506000134352/10/A2?17=280228");
  // The rows still in error skipped together; one of them included again.
  await page.getByRole("button", { name: "Skip the 2 rows with errors" }).click();
  await expect(report).toContainText("1 row ready · 1 fixed · 2 skipped");
  await report.getByRole("button", { name: "Skipped (2)" }).click();
  await page.locator(".rrow[data-row='5']").getByRole("button", { name: "Include" }).click();
  await expect(report).toContainText("1 row ready · 1 with errors · 1 fixed · 1 skipped");
  // The report and the corrected rows as CSV.
  const [reportFile] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Report (CSV)" }).click()]);
  expect(reportFile.suggestedFilename()).toBe("Pasted_rows_report.csv");
  const reportText = readFileSync((await reportFile.path())!, "utf8");
  expect(reportText).toContain("Row,Status,Reason,Columns at fault,Fixed in the studio,GTIN (01),Lote (10),Validade (17)\r\n");
  expect(reportText).toContain("3,fixed,,,Validade,9506000134352,A2,28/02/2028\r\n");
  expect(reportText).toContain("4,skipped,The check digit does not match: it should be 6.,GTIN,,9506000134377,A3,30/06/2028\r\n");
  const [corrected] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Corrected rows (CSV)" }).click()]);
  expect(readFileSync((await corrected.path())!, "utf8")).toBe("GTIN,Lote,Validade\r\n9506000134376,A1,31/12/2027\r\n" +
    "9506000134352,A2,28/02/2028\r\n9506000134377,A3,30/06/2028\r\n,A4,30/06/2028\r\n");
  // Undone: the file's value again, the row back in error.
  await report.getByRole("button", { name: "All (4)" }).click();
  await page.locator(".rrow[data-row='3']").getByRole("button", { name: "Undo the fixes" }).click();
  await expect(page.locator("#cell-1-2")).toHaveValue("31/02/2028");
  await expect(report).toContainText("1 row ready · 2 with errors · 1 skipped");
});

// Every AI choice as "(AI) abbreviation name", in the order of that text (the owner, 30 October 2026; backlog 1.10).
test("AI choices read (AI) abbreviation name, in the GS1 order of the AI", async ({ page }) => {
  const keys = await page.locator("#key optgroup[label='GS1 Digital Link keys'] option").allTextContents();
  expect(keys.slice(0, 4)).toEqual(["(00) SSCC Logistic unit", "(01) GTIN Product", "(253) GDTI Document", "(255) GCN Coupon"]);
  expect(keys.at(-1)).toBe("(8018) GSRN Service recipient");
  expect(keys).toEqual([...keys].sort());
  await expect(page.locator("#q-10")).toHaveAccessibleName("(10) Batch/lot value");
  await expect(page.locator(".add-rows button.link")).toHaveText([/^\+ \(22\) /, /^\+ \(21\) /, "+ (235) TPX Third-party serialised extension"]);
  await page.locator(".attr .combo-arrow").nth(1).click();
  const items = await page.locator(".combo-list li").allInnerTexts();
  // The key's qualifiers not yet given first, then the attributes
  expect(items.slice(0, 3).map((text) => text.slice(0, text.indexOf(")") + 1))).toEqual(["(22)", "(21)", "(235)"]);
  expect(items.slice(0, 3).every((text) => text.endsWith(" · qualifier · in the URI's path"))).toBe(true);
  const attributes = items.slice(3).map((text) => text.replace(/ · element strings only$/, ""));
  expect(attributes.slice(0, 3)).toEqual(["(00) SSCC Logistic unit", "(02) CONTENT", "(11) PROD DATE"]); // (01) and its qualifiers are not attributes
  await page.keyboard.press("Escape");
  expect(attributes).toEqual([...attributes].sort());
  await page.getByRole("button", { name: "In bulk" }).click();
  await page.fill("#rows-paste", "GTIN\n9506000134376\n");
  await page.getByRole("button", { name: "Use the pasted rows" }).click();
  await expect(page.locator("#map-0 optgroup[label='Keys'] option").first()).toHaveText("(00) SSCC Logistic unit");
  await expect(page.locator("#map-0 optgroup[label='Qualifiers'] option").first()).toHaveText("(10) Batch/lot");
});

// The label's area across step 3, its exports below it and the options below them; the page the whole width
// (mock-up B of 30 October 2026; backlog 1.10 a).
test("the label in its own area across step 3, exports below it, options below them", async ({ page }) => {
  const card = (await page.locator(".label-card").boundingBox())!;
  const canvas = (await page.locator(".canvas").boundingBox())!;
  const exports = (await page.locator(".exportbar").boundingBox())!;
  const options = (await page.locator("#opt-size").boundingBox())!;
  expect(canvas.width).toBeGreaterThan(card.width * 0.85);
  expect(exports.y).toBeGreaterThan(canvas.y + canvas.height - 1);
  expect(options.y).toBeGreaterThan(exports.y + exports.height - 1);
  if (page.viewportSize()!.width > 900) {
    await page.setViewportSize({ width: 1920, height: 1000 });
    const main = (await page.locator("main.editor").boundingBox())!;
    expect(main.width).toBeGreaterThan(1900); // no longer stopped at 1 400 pixels
  }
});

// Zoom at the canvas's corner (the owner, 30 October 2026): of the fitted label, or of the real size.
test("zoom in and out on the label's canvas, back to 100 % on a click or a change of view", async ({ page }) => {
  const width = async () => (await page.locator(".canvas .preview").boundingBox())!.width;
  const fitted = await width();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.locator(".zoom-value")).toHaveText("150 %");
  expect(await width()).toBeCloseTo(fitted * 1.5, 0);
  await page.getByRole("button", { name: "Zoom out" }).click();
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect(page.locator(".zoom-value")).toHaveText("75 %");
  await page.locator(".zoom-value").click();
  await expect(page.locator(".zoom-value")).toHaveText("100 %");
  // At real size the zoom enlarges the label and its rulers together: 32.6 mm at twice 96 pixels an inch.
  await page.getByRole("button", { name: "Real size" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.locator(".zoom-value")).toHaveText("200 %");
  expect((await page.locator(".real .symbol").boundingBox())!.width).toBeCloseTo(((32.6 * 96) / 25.4) * 2, 0);
  await page.getByRole("button", { name: "Fit" }).click();
  await expect(page.locator(".zoom-value")).toHaveText("100 %");
});

// The caption's modules and encoded characters (the owner, 30 October 2026).
test("the caption counts the modules and the characters encoded, FNC1 and group separators included", async ({ page }) => {
  await expect(page.locator(".caption")).toContainText("QR code version 4 · 33 × 33 = 1,089 modules · correction M");
  await expect(page.locator(".caption")).toContainText("· 53 characters encoded");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await page.selectOption("#opt-symbol", "gs1-datamatrix");
  await expect(page.locator(".caption")).toContainText("31 characters encoded (FNC1 and 1 group separator included)");
});

// Item 1.11: the Made-to-Order GTIN (03), a key of element strings only (GS1 General Specifications 26.0, 1.3.1.6).
test("the Made-to-Order GTIN (03): its own group, its batch and serial, drawn in GS1 DataMatrix, never in a URI", async ({ page }) => {
  await expect(page.locator("#key optgroup[label='In element strings only'] option")).toHaveText(["(03) MtO GTIN Made-to-order product"]);
  await page.fill("#paste", "(03)09506000134376(10)B1(17)271231");
  await page.getByRole("button", { name: "Fill in" }).click();
  await expect(page.locator("#key")).toHaveValue("03");
  await expect(page.locator(".attr.qualifier .kind")).toHaveText(["qualifier · in the URI's path"]);
  await expect(page.locator(".add-rows button.link")).toHaveText([/^\+ \(21\) /]);
  await expect(page.locator("#q-10")).toHaveValue("B1");
  await expect(page.locator(".caption")).toContainText("GS1 DataMatrix");
  await expect(page.locator(".uri")).toHaveCount(0);
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toHaveText("✓ Read as intended: ]d2 (03)09506000134376(10)B1(17)271231", { timeout: 30_000 });
});

// The attribute's AI field (the owner's report of 30 October 2026): once an AI is chosen, the arrow still lists them all.
test("an attribute's AI: the arrow lists every AI even after one is chosen; typing filters", async ({ page }) => {
  const row = page.locator(".attr").nth(1);
  await expect(row.getByRole("combobox")).toHaveValue("(17) USE BY or EXPIRY");
  // Clicked without moving the pointer, which on a phone's narrow screen would rest on an option of the list as it opens
  await row.locator(".combo-arrow").dispatchEvent("click");
  expect(await page.locator(".combo-list li").count()).toBeGreaterThan(200);
  await expect(page.locator(".combo-list li[aria-selected='true']")).toHaveText("(17) USE BY or EXPIRY");
  await page.keyboard.press("Escape");
  await row.getByRole("combobox").fill("imei");
  await expect(page.locator(".combo-list li")).toHaveText(["(8040) IMEI · element strings only", "(8041) IMEI2 · element strings only"]);
  await page.keyboard.press("Enter");
  await expect(row.getByRole("combobox")).toHaveValue("(8040) IMEI");
});

// "Start over" (the owner, 30 October 2026): every field and choice as on a first visit.
test("Start over clears the data and every choice, as on a first visit", async ({ page }) => {
  await qualifier(page, "21", "S1");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await page.selectOption("#opt-symbol", "gs1-datamatrix");
  await page.getByRole("button", { name: "Real size" }).click();
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.locator("#q-21")).toHaveCount(0);
  await expect(page.locator(".caption")).toContainText("QR code version 4");
  await expect(page.getByRole("button", { name: "Fit" })).toHaveAttribute("aria-pressed", "true");
  // In bulk, with rows loaded, it asks first.
  await page.getByRole("button", { name: "In bulk" }).click();
  await page.fill("#rows-paste", "GTIN\n9506000134376\n");
  await page.getByRole("button", { name: "Use the pasted rows" }).click();
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.locator(".source")).toContainText("Pasted rows");
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByRole("button", { name: "One code" })).toHaveAttribute("aria-pressed", "true");
});


// Item 2.4 (mock-up A of three, 30 October 2026): in bulk, the label shown drawn for every row ready or fixed, in one zip.
test("in bulk: Generate N labels makes each row's files, a PDF and label sheets, and the CSV of what was generated", async ({ page }) => {
  await page.getByRole("button", { name: "In bulk" }).click();
  await page.locator("#rows-file").setInputFiles(new URL("../../../packages/core/test/fixtures/bulk/products.xlsx", import.meta.url).pathname);
  await expect(page.locator(".summary")).toContainText("2 rows ready · 2 with errors");
  const panel = page.locator(".generate");
  await expect(panel).toContainText("2 rows left out (errors or skipped) are named in the CSV.");
  await page.locator("#gen-pattern").fill("{01}_{lot}");
  await expect(panel.locator(".error")).toContainText("Not a name the pattern knows: {lot}.");
  await expect(page.getByRole("button", { name: "Generate 2 labels" })).toBeDisabled();
  await page.locator("#gen-pattern").fill("{01}_{10}");
  await expect(panel).toContainText("First: 09506000134376_B42.svg");
  // A sheet whose labels are smaller than the label shown: said before anything is generated
  await page.selectOption("#gen-sheet", "avery-l7651");
  await expect(panel).toContainText("is larger than the sheet's labels (38.1 × 21.2 mm); it is never scaled.");
  // A custom sheet described wrongly, then rightly
  await page.selectOption("#gen-sheet", "custom");
  await page.locator("#gen-xp").fill("60");
  await expect(panel.locator(".error")).toHaveText("The labels overlap: the pitch must be at least the label's size.");
  await page.locator("#gen-xp").fill("70");
  await page.locator("#gen-lh").fill("50");
  await page.locator("#gen-yp").fill("50");
  await page.locator("#gen-rows").fill("5");
  await expect(panel).toContainText("2 labels on 1 sheet.");
  await page.locator(".generate label.check", { hasText: "PNG" }).locator("input").check();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Generate 2 labels" }).click()]);
  expect(download.suggestedFilename()).toBe("products_labels.zip");
  const path = (await download.path())!;
  expect(execFileSync("unzip", ["-tq", path], { encoding: "utf8" })).toContain("No errors");
  expect(execFileSync("unzip", ["-Z1", path], { encoding: "utf8" }).split("\n").filter(Boolean)).toEqual([
    "09506000134376_B42.svg", "09506000134376_B42.png", "09506000134352_L-7.svg", "09506000134352_L-7.png",
    "labels_dl-qrcode.pdf", "labels_dl-qrcode_custom.pdf", "generated.csv",
  ]);
  const csv = execFileSync("unzip", ["-p", path, "generated.csv"], { encoding: "utf8" }).split("\r\n");
  expect(csv[1]).toMatch(/^2,generated,09506000134376_B42.svg; 09506000134376_B42.png; labels_dl-qrcode.pdf; labels_dl-qrcode_custom.pdf,/);
  expect(csv[3]).toBe("4,error,,,,The check digit does not match: it should be 2.");
  await expect(panel).toContainText("2 labels generated; 2 rows left out, each with its reason in generated.csv.");
});

// Item 1.17 (the owner's idea of 30 October 2026): the URI's own parameters, after the data attributes.
test("the GS1 Digital Link URI's own parameters: after the attributes, a name of digits refused, taken from a pasted URI", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add parameter" }).click();
  await page.getByLabel("Parameter name").fill("20");
  await page.getByLabel("Parameter value").fill("12");
  await expect(page.locator(".param .hint")).toContainText('The parameter "20" is made of digits only');
  await expect(page.locator(".preview .error")).toContainText("such names are GS1 Application Identifiers");
  await page.getByLabel("Parameter name").fill("lang");
  await page.getByLabel("Parameter value").fill("pt BR");
  await expect(page.locator(".uri")).toHaveText("https://id.gs1.org/01/09506000134376/10/B42?17=271231&lang=pt%20BR");
  await page.fill("#paste", "https://id.gs1.org/01/09506000134376/10/B42?17=271231&20=12&a=1&b=2&c=3");
  await page.getByRole("button", { name: "Fill in" }).click();
  await expect(page.locator(".uri")).toHaveText("https://id.gs1.org/01/09506000134376/10/B42?17=271231&20=12&a=1&b=2&c=3");
  await expect(page.getByLabel("Parameter name")).toHaveCount(3);
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toHaveText("✓ Read as intended: ]Q1 https://id.gs1.org/01/09506000134376/10/B42?17=271231&20=12&a=1&b=2&c=3", { timeout: 30_000 });
  // Element strings have no place for them
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await page.selectOption("#opt-symbol", "gs1-datamatrix");
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toHaveText("✓ Read as intended: ]d2 (01)09506000134376(10)B42(17)271231(20)12", { timeout: 30_000 });
});

// Item 1.12: several keys in one symbol, as the General Specifications pair them (4.13).
test("several keys: an SSCC with the GTIN it contains and their count, each check digit checked, the others in the query string", async ({ page }) => {
  await page.selectOption("#key", "00");
  await page.fill("#key-value", "106141411234567897");
  const links = page.locator(".other-keys button.link");
  await expect(links.first()).toHaveText("+ (02) and (37) the GTIN of the trade items it contains, and their count");
  await links.first().click();
  const rows = page.locator(".attr");
  await expect(rows.nth(0).locator(".kind")).toHaveText("another key · in the URI's query string");
  await rows.nth(0).getByLabel("Attribute value").fill("09506000134377");
  await expect(rows.nth(0).locator(".hint")).toHaveText("The check digit does not match: it should be 6.");
  await rows.nth(0).getByLabel("Attribute value").fill("09506000134376");
  await rows.nth(1).getByLabel("Attribute value").fill("10");
  await expect(page.locator(".uri")).toHaveText("https://id.gs1.org/00/106141411234567897?02=09506000134376&37=10");
  await expect(links.first()).toHaveText("+ (01) a GTIN, when the logistic unit is itself a trade item");
  // (01) beside (02) is a pair the General Specifications forbid (table 4-4)
  await links.first().click();
  await rows.nth(2).getByLabel("Attribute value").fill("09506000134376");
  await expect(page.locator(".preview .error")).toContainText("It is invalid to pair AI (01) with AI (37)");
  await rows.nth(2).getByRole("button", { name: "Remove attribute" }).click();
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await page.selectOption("#opt-symbol", "gs1-datamatrix");
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toHaveText("✓ Read as intended: ]d2 (00)106141411234567897(02)09506000134376(37)10", { timeout: 30_000 });
});

// Item 2.3 (mock-up A of two, 30 October 2026): serial numbers and SSCCs made in the studio.
test("in bulk: SSCCs made as rows, serial numbers added as a column to a file's rows", async ({ page }) => {
  await page.getByRole("button", { name: "In bulk" }).click();
  await page.selectOption("#seq-kind", "sscc");
  await page.fill("#seq-count", "3");
  await page.fill("#seq-first", "123456789");
  await page.fill("#seq-extension", "1");
  await page.fill("#seq-gcp", "061414");
  await page.fill("#seq-gcp", "0614141");
  await expect(page.locator(".sequence .hint")).toContainText("106141411234567897 to 106141411234567910");
  await page.getByRole("button", { name: "Make 3 rows" }).click();
  await expect(page.locator(".source")).toContainText("SSCCs made here · 3 rows");
  await expect(page.locator(".summary")).toContainText("3 rows ready");
  await expect(page.locator(".uri")).toHaveText("https://id.gs1.org/00/106141411234567897");
  // A file's rows, then a serial number for each
  await page.locator("#rows-file").setInputFiles(new URL("../../../packages/core/test/fixtures/bulk/products.xlsx", import.meta.url).pathname);
  await expect(page.locator(".source")).toContainText("products.xlsx");
  await page.selectOption("#seq-kind", "serial");
  await page.fill("#seq-prefix", "S(");
  await expect(page.locator(".sequence .hint")).toContainText("character set 82");
  await page.fill("#seq-prefix", "S-");
  await page.fill("#seq-first", "1");
  await page.getByRole("button", { name: "Add as a column to the 4 rows" }).click();
  await expect(page.locator(".source")).toContainText("products.xlsx + serial numbers");
  await expect(page.locator("#map-6")).toHaveValue("21");
  await expect(page.locator(".uri")).toHaveText("https://id.gs1.org/01/09506000134376/10/B42/21/S-000001?17=271231&3101=000005&11=261001");
});

// Item 1.16: the human readable text's place and height (GS1 General Specifications 4.14).
test("the human readable text above, split, left or right, and higher; the symbol still reads", async ({ page }) => {
  const caption = page.locator(".caption");
  const size = async () => (/label ([\d.]+) × ([\d.]+) mm/.exec((await caption.textContent())!)!).slice(1).map(Number);
  await expect(caption).toContainText("label ");
  const [w0, h0] = await size();
  await page.selectOption("#opt-hri-position", "left");
  await expect.poll(async () => (await size())[0]).toBeGreaterThan(w0! + 10);
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toContainText("✓ Read as intended", { timeout: 30_000 });
  await page.selectOption("#opt-hri-position", "split");
  await expect.poll(async () => (await size())[0]).toBe(w0);
  await page.selectOption("#opt-hri-height", "3");
  await expect.poll(async () => (await size())[1]).toBeGreaterThan(h0!);
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toContainText("✓ Read as intended", { timeout: 30_000 });
  // An EAN/UPC alone keeps its digits where section 5.2.5 puts them
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await page.selectOption("#opt-symbol", "ean13");
  await expect(page.locator("#opt-hri-position")).toHaveCount(0);
});

// Item 1.13: GS1-128 over several symbols (General Specifications 5.4.4.3), split automatically or where the person chooses.
test("GS1-128 beyond 48 data characters in several symbols, each read back; the person moves where one starts", async ({ page }) => {
  await page.fill("#paste", "(00)106141411234567897(02)09506000134376(37)24(10)ABCDEFGHIJ(15)271231(3102)001250");
  await page.getByRole("button", { name: "Fill in" }).click();
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await page.selectOption("#opt-symbol", "gs1-128");
  await expect(page.locator(".caption")).toContainText("GS1-128 in 2 symbols");
  await expect(page.locator(".gs1128-head")).toContainText("2 symbols, as many element strings as fit in each");
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toHaveText(
    "✓ Read as intended: ]C1 (00)106141411234567897(02)09506000134376(37)24 and ]C1 (10)ABCDEFGHIJ(15)271231(3102)001250", { timeout: 30_000 });
  await page.locator(".gs1128-list li").nth(5).getByRole("checkbox").check();
  await expect(page.locator(".caption")).toContainText("GS1-128 in 3 symbols");
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toContainText("✓ Read as intended", { timeout: 30_000 });
  await expect(page.locator(".scan-result")).toContainText("]C1 (3102)001250");
  await page.locator(".gs1128-head").getByRole("button", { name: "Automatic" }).click();
  await expect(page.locator(".caption")).toContainText("GS1-128 in 2 symbols");
});

// Item 2.5: the generation runs in a worker, with its progress and a way to stop it.
test("in bulk: generating thousands of labels shows its progress and can be cancelled; the page stays usable", async ({ page }) => {
  await page.getByRole("button", { name: "In bulk" }).click();
  await page.selectOption("#seq-kind", "sscc");
  await page.fill("#seq-count", "3000");
  await page.fill("#seq-first", "1");
  await page.fill("#seq-gcp", "0614141");
  await page.getByRole("button", { name: "Make 3,000 rows" }).click();
  await expect(page.locator(".summary")).toContainText("3000 rows ready");
  await page.getByRole("button", { name: "Generate 3000 labels" }).click();
  await expect(page.locator(".generate progress")).toBeVisible();
  await expect(page.locator(".generate-go .hint")).toContainText(/Drawing \d+ of 3000/);
  // The page answers while the worker draws
  await page.getByRole("button", { name: "Next row" }).click();
  await expect(page.locator(".row-nav")).toContainText("2 of 3000");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".generate-go .hint")).toHaveText("Stopped: nothing was downloaded.");
  await expect(page.locator(".generate progress")).toHaveCount(0);
});

// Item 1.14: QR Code's encoding modes, one for the whole data (ISO/IEC 18004).
test("QR Code's encoding mode: alphanumeric with the domain in capitals, byte; each read back", async ({ page }) => {
  await page.selectOption("#opt-qr-mode", "alphanumeric");
  await expect(page.locator(".preview .error")).toContainText("alphanumeric mode cannot encode “h”");
  await page.selectOption("#opt-qr-upper", "upper");
  await expect(page.locator(".preview .error")).toContainText("cannot encode “?”"); // the query string of (17)
  await page.locator(".attr").nth(1).getByRole("button", { name: "Remove attribute" }).click();
  await expect(page.locator(".caption")).toContainText("QR code version 3 · 29 × 29 = 841 modules · correction M · alphanumeric mode");
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toHaveText("✓ Read as intended: ]Q1 HTTPS://ID.GS1.ORG/01/09506000134376/10/B42", { timeout: 30_000 });
  await page.selectOption("#opt-qr-mode", "byte");
  await expect(page.locator(".caption")).toContainText("QR code version 4 · 33 × 33 = 1,089 modules · correction M · byte mode");
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toHaveText("✓ Read as intended: ]Q1 HTTPS://ID.GS1.ORG/01/09506000134376/10/B42", { timeout: 30_000 });
  await page.getByRole("button", { name: "ZPL (203 dpi)" }).click();
  await expect(page.locator(".error.small")).toContainText("ZPL writes the QR code in the printer's automatic mode");
});

// Item 1.18 (mock-up A of two, 31 October 2026): a JWS of the code's data, a security marking's code read from the marking.
test("digital signature: a key made here, a JWS with the marking's code taken out, verified; credentials need an issuer", async ({ page }) => {
  await page.locator("details.sign summary").click();
  await page.fill("#sig-name", "Finest Truffle Tapenade");
  await page.fill("#sig-brand", "Dal Giardino");
  await page.selectOption("#sig-marking", "gs1:SecurityMarking-UVINK");
  await page.fill("#sig-pattern", "[A-Z0-9]{11}");
  await page.fill("#sig-code", "uv389");
  await expect(page.locator("details.sign .error")).toContainText("does not match [A-Z0-9]{11}");
  await page.fill("#sig-code", "UV389JKG4M2");
  await page.fill("#sig-where", "look on side of pack");
  await page.selectOption("#sig-hidden", "hidden");
  await expect(page.getByRole("button", { name: "Sign", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "New key" }).click();
  await expect(page.locator("details.sign .sign-row .hint").first()).toContainText("ECDSA P-256 · kid");
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await expect(page.locator("details.sign .hint.ok")).toContainText("✓ Verified here with the public key. The code is taken out of the payload");
  const [jws] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "JWS", exact: true }).click()]);
  const parts = readFileSync((await jws.path())!, "utf8").split(".");
  expect(parts).toHaveLength(3);
  expect(JSON.parse(Buffer.from(parts[0]!, "base64url").toString())).toMatchObject({ alg: "ES256", typ: "JOSE" });
  const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString());
  expect(payload).toMatchObject({
    id: "https://id.gs1.org/01/09506000134376/10/B42?17=271231", "gs1:gtin": "09506000134376", "gs1:hasBatchLotNumber": "B42",
    "gs1:authenticity": { "gs1:authenticitySecurityFeatureType": "gs1:SecurityMarking-UVINK", "gs1:authenticitySecurityFeatureValue": "" },
  });
  await expect(page.getByRole("button", { name: "Product data credential" })).toBeDisabled();
  await page.fill("#sig-issuer", "did:web:dalgiardino.com");
  const [vc] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Product data credential" }).click()]);
  expect(vc.suggestedFilename()).toMatch(/-product-credential\.jwt$/);
  const claims = JSON.parse(Buffer.from(readFileSync((await vc.path())!, "utf8").split(".")[1]!, "base64url").toString());
  expect(claims).toMatchObject({ iss: "did:web:dalgiardino.com", sub: payload.id, vc: { type: ["VerifiableCredential", "ProductDataCredential"] } });
});

// Item 1.19: writing an NFC tag through Web NFC, read back; elsewhere the NDEF message as a file.
test("NFC: without Web NFC, the NDEF file; with it, the URI written to a tag and read back", async ({ page }) => {
  const nfc = page.locator(".nfc");
  await expect(nfc.getByRole("button", { name: "Write to an NFC tag" })).toBeDisabled();
  await expect(nfc).toContainText("This browser cannot write NFC tags");
  const [file] = await Promise.all([page.waitForEvent("download"), nfc.getByRole("button", { name: "NDEF file" }).click()]);
  const bytes = readFileSync((await file.path())!);
  const rest = "id.gs1.org/01/09506000134376/10/B42?17=271231";
  expect([...bytes.subarray(0, 5)]).toEqual([0xd1, 0x01, 1 + rest.length, 0x55, 0x04]);
  expect(bytes.subarray(5).toString()).toBe(rest);
  // A phone's Web NFC, stood in for: the tag keeps what was written
  await page.addInitScript(() => {
    let tag = "";
    (window as unknown as { NDEFReader: unknown }).NDEFReader = class extends EventTarget {
      async write(message: { records: { data: string }[] }) { tag = message.records[0]!.data; }
      async scan() {
        setTimeout(() => {
          const event = Object.assign(new Event("reading"), { message: { records: [{ recordType: "url", data: new DataView(new TextEncoder().encode(tag).buffer) }] } });
          this.dispatchEvent(event);
        }, 10);
      }
    };
  });
  await page.reload();
  await nfc.getByRole("button", { name: "Write to an NFC tag" }).click();
  await expect(nfc.locator(".hint")).toHaveText("✓ Written. Read the tag back to check it.");
  await nfc.getByRole("button", { name: "Read the tag back" }).click();
  await expect(nfc.locator(".hint")).toHaveText("✓ The tag holds https://id.gs1.org/01/09506000134376/10/B42?17=271231");
  // With a serial number the key has an EPC, and its link for NFC is offered too
  await qualifier(page, "21", "S1001");
  await page.selectOption("#epc-prefix", "7");
  await expect(nfc.getByLabel("What to write on the NFC tag").locator("option")).toHaveText(["The GS1 Digital Link URI", "The link for NFC (EPC, hexadecimal)"]);
});
