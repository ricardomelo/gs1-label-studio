import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// The editor (ADR 0004, mock-ups of 28 October 2026): what the code identifies on the left, the label redrawn beside
// it as anything changes. On a phone and a tablet (backlog 1.21) the same tests move between the destinations as a
// person would, through the tab bar or the rail (on()).

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  await page.goto("/");
  await expect(page.locator(".preview .symbol svg")).toBeAttached(); // behind another destination on a phone
});

const PANES = ["data", "scan", "label", "export", "more"] as const;
/**
 * On a phone or a tablet, the destination that holds what the test does next, tapped in the tab bar or the rail as a
 * person would (backlog 1.21); a computer shows every destination at once. By position: the names change with the
 * language.
 */
async function on(page: Page, pane: (typeof PANES)[number]) {
  const bar = page.locator("nav.tabs");
  if (await bar.isVisible()) await bar.locator("button").nth(PANES.indexOf(pane)).click();
}

/** A qualifier's value: its row added from the key's qualifiers first if it is not in the list yet (backlog 1.15). */
async function qualifier(page: Page, ai: string, value: string) {
  await on(page, "data");
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
  await on(page, "label");
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

// A long barcode, as a GSRN's DataBar Expanded with a date of birth, once drew the phone's live preview wider than the
// screen, and the tab bar could no longer be tapped.
test("the page fits the screen's width with a long barcode in the live preview", async ({ page }) => {
  await page.fill("#paste", "(8018)950600013435200008(7250)19600115");
  await page.getByRole("button", { name: "Fill in" }).click();
  await expect(page.locator("#key")).toHaveValue("8018");
  // The screen's width, not the window's: a phone widens its window to a page wider than the screen
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await on(page, "scan");
});

test("the EPC asks for a serial number, then writes every format", async ({ page }) => {
  const section = page.locator("details.epc");
  await expect(section.locator(".epc-message")).toHaveText("This key's EPC needs its qualifier (21), such as the serial number.");
  await qualifier(page, "21", "S1001");
  await on(page, "more");
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
  await on(page, "more");
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
  await on(page, "export");
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
async function answer(page: Page, question: string, value: "Yes" | "No") {
  await on(page, "scan");
  await page.getByRole("group", { name: question }).getByRole("button", { name: value }).click();
}

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
  await on(page, "export");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ZPL (203 dpi)" }).click()]);
  expect(download.suggestedFilename()).toBe("gs1-128_00_106141411234567897.zpl");
  // In TSPL too: an SSCC alone as EAN128, its 20 digits with the check digit, and the studio's text below
  await page.locator("details.printer summary").click();
  await page.selectOption("#prn-profile", "tspl-203");
  const [tspl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "TSPL (203 dpi)" }).click()]);
  expect(tspl.suggestedFilename()).toBe("gs1-128_00_106141411234567897.prn");
  const tsplFile = readFileSync((await tspl.path())!, "utf8");
  expect(tsplFile).toMatch(/^BARCODE \d+,\d+,"EAN128",\d+,0,0,4,4,"00106141411234567897"\r$/m);
  expect(tsplFile).toMatch(/^TEXT \d+,\d+,"\d",0,\d+,\d+,2,"\(00\)106141411234567897"\r$/m);
  await page.selectOption("#prn-profile", "zpl-203");
  await on(page, "label");
  await page.selectOption("#opt-size", "150");
  await expect(page.locator(".caption")).toContainText("GS1-128 · bars 31.75 mm · X 0.743 mm");
  await expect(page.locator(".preview svg path[aria-label]")).toHaveAttribute("aria-label", "(00)106141411234567897");
  // Wider than a four-inch printer prints (backlog 3.1)
  await on(page, "export");
  await page.getByRole("button", { name: "ZPL (203 dpi)" }).click();
  await expect(page.locator(".error.small")).toContainText("mm wide; Any ZPL printer, 203 dpi, 104 mm prints 104 mm");
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
  await on(page, "label");
  await page.selectOption("#opt-bearer", "bars");
  await expect(page.locator(".caption")).toContainText("label 71.5 × 39.6 mm at 100 %");
  await on(page, "export");
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
  await on(page, "export");
  await page.getByRole("button", { name: "ZPL (203 dpi)" }).click();
  await expect(page.locator(".error.small")).toContainText("^BR prints GS1 DataBar Omnidirectional 33 modules high");
  await qualifier(page, "10", "B42");
  const step = page.locator("section[aria-labelledby='scan-title']");
  await expect(step).toContainText(
    "This data needs two symbols: GS1 DataBar Omnidirectional with a QR code (GS1 Digital Link) beside it.");
  await expect(page.locator(".preview .error")).toContainText("This data needs two symbols");
  await on(page, "scan");
  await step.getByRole("radio", { name: /^GS1 DataBar Stacked Omnidirectional/ }).click();
  await expect(page.locator(".caption")).toContainText("GS1 DataBar Stacked Omnidirectional · bars 31.37 mm");
});

test("choosing ITF-14 yourself offers the key's scanning environments whose table allows it", async ({ page }) => {
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
  await page.selectOption("#opt-symbol", "itf14");
  const environments = await page.locator("#opt-env").evaluate((select: HTMLSelectElement) => [...select.options].map((o) => o.value));
  expect(environments).toEqual(["distribution", "pharmacy", "pharmacy-gd", "healthcare", "other"]);
  await expect(page.locator(".preview .error")).toContainText("ITF-14 carries the GTIN alone");
});

// Item 1.6 (mock-up A of 29 October 2026): the preview at real size with rulers, the screen's calibration, the scan test.
test("the scan test reads the label back as intended, with ZXing in the browser", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await on(page, "label");
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toHaveText(
    "✓ Read as intended: ]Q1 https://id.gs1.org/01/09506000134376/10/B42?17=271231", { timeout: 30_000 });
  // An ITF-14 with its bearer bars, from step 2.
  await on(page, "data");
  await page.fill("#paste", "(01)19506000134373");
  await page.getByRole("button", { name: "Fill in" }).click();
  await expect(page.locator(".scan-result")).toHaveText("Reads the label back with ZXing, here in the browser.");
  await answer(page, "Is it scanned at a general retail point of sale?", "No");
  await answer(page, "Is it a regulated healthcare item sold in a retail pharmacy?", "No");
  await answer(page, "Is it scanned in general distribution?", "Yes");
  await answer(page, "Is it a tobacco product under the EU traceability regulation?", "No");
  await answer(page, "Is it a regulated healthcare item not sold at retail?", "No");
  await on(page, "label");
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toHaveText("✓ Read as intended: ]I1 19506000134373", { timeout: 30_000 });
  // Nothing leaves the browser: the reader and its WebAssembly come from the application.
  expect(requests.filter((url) => !url.startsWith("http://localhost:4173/") && !url.startsWith("blob:"))).toEqual([]);
});

test("at real size the label is drawn between rulers in millimetres, at the screen's calibration", async ({ page }) => {
  await on(page, "label");
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
  await on(page, "label");
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
  await on(page, "label");
  await page.selectOption("#opt-linear", "auto");
  await page.selectOption("#opt-reduction", "0.02");
  await expect(page.locator(".preview svg desc")).toContainText("bars reduced by 0.020 mm (bar width reduction)");
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toContainText("✓ Read as intended", { timeout: 30_000 });
  await expect(page.locator("#opt-png option").nth(1)).toHaveText("300 dpi — 6 pixels a module, X 0.508 mm");
  await page.selectOption("#opt-png", "300");
  await on(page, "export");
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
    await on(page, "label");
    await expect(page.locator(".preview .symbol svg")).toBeVisible();
    // The GS1 Barcode Syntax Engine and the encoder still answer…
    await qualifier(page, "21", "S1");
    await expect(page.locator(".uri")).toHaveText("https://id.gs1.org/01/09506000134376/10/B42/21/S1?17=271231");
    // …and ZXing's WebAssembly, never loaded before, comes from the cache.
    await on(page, "label");
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
  await on(page, "label");
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toContainText("✓ Read as intended: ]d2 (01)09506000134376(10)B42(17)271231", { timeout: 30_000 });
});

// Item 4.2's fields bound to spreadsheet columns (mock-up A of two, 6 November 2026): in bulk, "Insert a field from the
// data" also offers the columns holding no AI, each with the row shown's value; each row's label and print file show
// its own cell, and a name no column has stays as typed.
test("a label of one's own in bulk: a {column} field shows each row's cell, on the label and in the print file", async ({ page }) => {
  await page.getByRole("button", { name: "In bulk" }).click();
  await page.fill("#rows-paste", "GTIN\tLote\tProduto\tRegião\n09506000134376\tB42\tFinest Truffle Tapenade\tLiguria\n09506000134352\tB43\tPesto alla genovese\t\n");
  await page.getByRole("button", { name: "Use the pasted rows" }).click();
  await expect(page.locator(".summary")).toContainText("2 rows ready");
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
  await page.selectOption("#opt-logistic", "designer");
  await page.selectOption("#page-env", "distribution");
  await page.getByRole("button", { name: "+ Text" }).click();
  await page.fill("#el-x", "48");
  await page.fill("#el-y", "8");
  await expect(page.locator("#el-field optgroup[label='Columns of the spreadsheet'] option")).toHaveText(["{Produto} — Finest Truffle Tapenade", "{Região} — Liguria"]);
  await expect(page.locator(".designer .hint", { hasText: "column's header in braces" })).toHaveText("A column's header in braces, such as {Produto}, shows that column's cell on each row's label.");
  await page.fill("#el-text", "");
  await page.selectOption("#el-field", "{Produto}");
  await expect(page.locator("#el-text")).toHaveValue("{Produto}");
  await page.fill("#el-text", "{Produto}\n{Região} · {Cor}");
  await expect(page.locator('.preview .symbol svg [aria-label="Finest Truffle Tapenade"]')).toHaveCount(1);
  await expect(page.locator('.preview .symbol svg [aria-label="Liguria · {Cor}"]')).toHaveCount(1);
  // The next row's own cells, an empty one leaving nothing
  await page.getByRole("button", { name: "Next row" }).click();
  await expect(page.locator('.preview .symbol svg [aria-label="Pesto alla genovese"]')).toHaveCount(1);
  await expect(page.locator("#el-field option[value='{Região}']")).toHaveText("{Região} — (empty on this row)");
  // Generated: each row's label in the print file with its own cells
  await on(page, "export");
  await page.locator(".generate label.check", { hasText: "One ZPL file" }).locator("input").check();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Generate 2 labels" }).click()]);
  const zpl = execFileSync("unzip", ["-p", (await download.path())!, "labels_dl-qrcode_203dpi.zpl"], { encoding: "utf8" });
  expect(zpl.match(/\^FD[^^]*(Tapenade|genovese|Liguria|\{Cor\})[^^]*\^FS/g)).toEqual(["^FDFinest Truffle Tapenade^FS", "^FDLiguria · {Cor}^FS", "^FDPesto alla genovese^FS", "^FD · {Cor}^FS"]);
});

// Backlog 4.2: a column's header in braces names the generated files by each row's cell, on any label
test("in bulk: a column's header in the file names pattern names each row's files by its cell", async ({ page }) => {
  await page.getByRole("button", { name: "In bulk" }).click();
  await page.fill("#rows-paste", "GTIN\tLote\tProduto\tRegião\n09506000134376\tB42\tFeijão Tropeiro\tSul\n09506000134352\tB43\tPesto alla genovese\t\n");
  await page.getByRole("button", { name: "Use the pasted rows" }).click();
  await expect(page.locator(".summary")).toContainText("2 rows ready");
  await on(page, "export");
  const panel = page.locator(".generate");
  await expect(panel.locator(".hint", { hasText: "column's header" })).toContainText("or a column's header such as {Produto}");
  await page.locator("#gen-pattern").fill("{produto}_{Cor}");
  await expect(panel.locator(".error")).toHaveText(
    "Not a name the pattern knows: {Cor}. Use {row}, {symbol}, {key}, an AI such as {01} or {10}, or a column's header such as {Produto}.");
  await expect(page.getByRole("button", { name: "Generate 2 labels" })).toBeDisabled();
  await page.locator("#gen-pattern").fill("{produto}_{ REGIÃO }_{10}");
  await expect(panel).toContainText("First: Feijao-Tropeiro_Sul_B42.svg");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Generate 2 labels" }).click()]);
  expect(execFileSync("unzip", ["-Z1", (await download.path())!], { encoding: "utf8" }).split("\n").filter(Boolean)).toEqual([
    "Feijao-Tropeiro_Sul_B42.svg", "Pesto-alla-genovese__B43.svg", "labels_dl-qrcode.pdf", "generated.csv",
  ]);
  // In Portuguese, the message too
  await on(page, "more");
  await page.selectOption("#language", "pt-BR");
  await on(page, "export");
  await page.locator("#gen-pattern").fill("{Cor}");
  await expect(panel.locator(".error")).toHaveText(
    "O nome não é conhecido pelo padrão: {Cor}. Use {row}, {symbol}, {key}, um AI como {01} ou {10}, ou o cabeçalho de uma coluna como {Produto}.");
});

// Item 4.2 (mock-up A of two, 7 November 2026): the names a pattern may take offered in a list, as the designer's fields.
test("in bulk: a name inserted from a list into the file names pattern, with the first row's value", async ({ page }) => {
  await page.getByRole("button", { name: "In bulk" }).click();
  await page.fill("#rows-paste", "GTIN\tLote\tProduto\tRegião\n09506000134352\t\tPesto\t\n09506000134376\tB42\tFeijão Tropeiro\tSul\n");
  await page.getByRole("button", { name: "Use the pasted rows" }).click();
  await expect(page.locator(".summary")).toContainText("2 rows ready");
  await on(page, "export");
  const panel = page.locator(".generate");
  const list = page.locator("#gen-field");
  // The studio's names and the first row's AIs, then the columns holding no AI; the lot's column is (10), not a column
  await expect(list.locator("option")).toHaveText([
    "Choose…", "{row} — 2", "{symbol} — dl-qrcode", "{key} — 09506000134352", "{01} — 09506000134352",
    "{Produto} — Pesto", "{Região} — (empty on the first row)",
  ]);
  await expect(list.locator("optgroup")).toHaveAttribute("label", "Columns of the spreadsheet");
  await expect(list.locator("optgroup option")).toHaveText(["{Produto} — Pesto", "{Região} — (empty on the first row)"]);
  await page.locator("#gen-pattern").fill("{01}");
  await list.selectOption("{Produto}");
  await expect(page.locator("#gen-pattern")).toHaveValue("{01}_{Produto}");
  await expect(list).toHaveValue(""); // ready for the next name
  await page.locator("#gen-pattern").fill("{Produto}-");
  await list.selectOption("{row}");
  await expect(page.locator("#gen-pattern")).toHaveValue("{Produto}-{row}");
  await expect(panel).toContainText("First: Pesto-2.svg");
  await page.locator("#gen-pattern").fill("");
  await list.selectOption("{Região}");
  await expect(page.locator("#gen-pattern")).toHaveValue("{Região}");
  await expect(panel.locator(".error")).toHaveCount(0);
  // In Portuguese
  await on(page, "more");
  await page.selectOption("#language", "pt-BR");
  await on(page, "export");
  await expect(page.locator("label[for=gen-field]")).toHaveText("Inserir um nome");
  await expect(list.locator("optgroup")).toHaveAttribute("label", "Colunas da planilha");
  await expect(list.locator("option").last()).toHaveText("{Região} — (vazio na primeira linha)");
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
  await on(page, "label");
  await page.getByRole("button", { name: "Next row" }).click();
  await expect(page.locator(".row-nav")).toContainText("Row 3 · 2 of 4 · ready");
  await expect(page.locator(".uri")).toHaveText("https://id.gs1.org/01/09506000134352/10/L-7?17=280105&3102=000125&11=261001");
  await on(page, "data");
  await page.locator(".rrow[data-row='5']").getByRole("button", { name: "Show" }).click();
  await expect(page.locator(".row-nav")).toContainText("Row 5 · 4 of 4 · error");
  if (page.viewportSize()!.width <= 900) await expect(page.locator(".row-nav")).toBeVisible(); // a phone opens the row's label
  await expect(page.locator(".preview .error")).toHaveText("Row 5: The key's column is empty on this row.");
  // A column left out: the production date goes.
  await on(page, "label");
  await page.getByRole("button", { name: "Previous row" }).click();
  await page.getByRole("button", { name: "Previous row" }).click();
  await on(page, "data");
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
  await on(page, "data"); // a phone showed the row's label
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
  test.skip(await page.locator("nav.tabs").isVisible(), "a phone and a tablet show them in destinations of their own");
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
  await on(page, "label");
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
  await on(page, "label");
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
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
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
  await on(page, "label");
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
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
  await page.selectOption("#opt-symbol", "gs1-datamatrix");
  await page.getByRole("button", { name: "Real size" }).click();
  await on(page, "more");
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.locator("#q-21")).toHaveCount(0);
  await expect(page.locator(".caption")).toContainText("QR code version 4");
  await on(page, "label");
  await expect(page.getByRole("button", { name: "Fit" })).toHaveAttribute("aria-pressed", "true");
  // In bulk, with rows loaded, it asks first.
  await page.getByRole("button", { name: "In bulk" }).click();
  await on(page, "data");
  await page.fill("#rows-paste", "GTIN\n9506000134376\n");
  await page.getByRole("button", { name: "Use the pasted rows" }).click();
  page.once("dialog", (dialog) => void dialog.dismiss());
  await on(page, "more");
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
  await on(page, "export");
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
  await on(page, "label");
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toHaveText("✓ Read as intended: ]Q1 https://id.gs1.org/01/09506000134376/10/B42?17=271231&20=12&a=1&b=2&c=3", { timeout: 30_000 });
  // Element strings have no place for them
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
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
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
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
  await on(page, "label");
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
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
  await page.selectOption("#opt-symbol", "ean13");
  await expect(page.locator("#opt-hri-position")).toHaveCount(0);
});

// Item 1.13: GS1-128 over several symbols (General Specifications 5.4.4.3), split automatically or where the person chooses.
test("GS1-128 beyond 48 data characters in several symbols, each read back; the person moves where one starts", async ({ page }) => {
  await page.fill("#paste", "(00)106141411234567897(02)09506000134376(37)24(10)ABCDEFGHIJ(15)271231(3102)001250");
  await page.getByRole("button", { name: "Fill in" }).click();
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
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
  await on(page, "export");
  await page.getByRole("button", { name: "Generate 3000 labels" }).click();
  await expect(page.locator(".generate progress")).toBeVisible();
  await expect(page.locator(".generate-go .hint")).toContainText(/Drawing \d+ of 3000/);
  // The page answers while the worker draws
  await on(page, "label");
  await page.getByRole("button", { name: "Next row" }).click();
  await expect(page.locator(".row-nav")).toContainText("2 of 3000");
  await on(page, "export");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".generate-go .hint")).toHaveText("Stopped: nothing was downloaded.");
  await expect(page.locator(".generate progress")).toHaveCount(0);
});

// Item 1.14: QR Code's encoding modes, one for the whole data (ISO/IEC 18004).
test("QR Code's encoding mode: alphanumeric with the domain in capitals, byte; each read back", async ({ page }) => {
  await on(page, "label");
  await page.selectOption("#opt-qr-mode", "alphanumeric");
  await expect(page.locator(".preview .error")).toContainText("alphanumeric mode cannot encode “h”");
  await page.selectOption("#opt-qr-upper", "upper");
  await expect(page.locator(".preview .error")).toContainText("cannot encode “?”"); // the query string of (17)
  await on(page, "data");
  await page.locator(".attr").nth(1).getByRole("button", { name: "Remove attribute" }).click();
  await expect(page.locator(".caption")).toContainText("QR code version 3 · 29 × 29 = 841 modules · correction M · alphanumeric mode");
  await on(page, "label");
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toHaveText("✓ Read as intended: ]Q1 HTTPS://ID.GS1.ORG/01/09506000134376/10/B42", { timeout: 30_000 });
  await page.selectOption("#opt-qr-mode", "byte");
  await expect(page.locator(".caption")).toContainText("QR code version 4 · 33 × 33 = 1,089 modules · correction M · byte mode");
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toHaveText("✓ Read as intended: ]Q1 HTTPS://ID.GS1.ORG/01/09506000134376/10/B42", { timeout: 30_000 });
  await on(page, "export");
  await page.getByRole("button", { name: "ZPL (203 dpi)" }).click();
  await expect(page.locator(".error.small")).toContainText("ZPL writes the QR code in the printer's automatic mode");
});

// Item 1.18 (mock-up A of two, 31 October 2026): a JWS of the code's data, a security marking's code read from the marking.
test("digital signature: a key made here, a JWS with the marking's code taken out, verified; credentials need an issuer", async ({ page }) => {
  await on(page, "more");
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
  await on(page, "more");
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
  await on(page, "more");
  await nfc.getByRole("button", { name: "Write to an NFC tag" }).click();
  await expect(nfc.locator(".hint")).toHaveText("✓ Written. Read the tag back to check it.");
  await nfc.getByRole("button", { name: "Read the tag back" }).click();
  await expect(nfc.locator(".hint")).toHaveText("✓ The tag holds https://id.gs1.org/01/09506000134376/10/B42?17=271231");
  // With a serial number the key has an EPC, and its link for NFC is offered too
  await qualifier(page, "21", "S1001");
  await on(page, "more");
  await page.selectOption("#epc-prefix", "7");
  await expect(nfc.getByLabel("What to write on the NFC tag").locator("option")).toHaveText(["The GS1 Digital Link URI", "The link for NFC (EPC, hexadecimal)"]);
});

// Item 3.1 (mock-up A of two, 31 October 2026): printer profiles, the module in whole dots within the table's range, a test label.
test("printer profiles: a profile of one's own, the module's dots within the range, the width checked, a test print", async ({ page }) => {
  await on(page, "export");
  const section = page.locator("details.printer");
  await section.locator("summary").click();
  await expect(section.locator(".hint.ok")).toContainText("✓ X 0.500 mm (4 dots at 203 dpi) is within the table's 0.396 to 0.990 mm.");
  await page.selectOption("#prn-module", "6");
  await expect(section.locator(".hint.ok")).toContainText("X 0.751 mm (6 dots at 203 dpi)");
  await on(page, "export");
  const [zpl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ZPL (203 dpi)" }).click()]);
  expect(readFileSync((await zpl.path())!, "utf8")).toContain("^BQN,2,6^FD");
  // A narrow printer of one's own: the label no longer fits
  await page.selectOption("#prn-profile", "new");
  await page.fill("#prn-name", "Desk printer");
  await page.fill("#prn-dpi", "300");
  await page.fill("#prn-width", "15");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.locator("#prn-profile")).toHaveValue(/^own-/);
  await expect(page.getByRole("button", { name: "ZPL (300 dpi)" })).toBeVisible();
  await expect(section.locator(".hint.error")).toContainText("Desk printer prints 15 mm");
  await expect(section.getByRole("button", { name: "Test print (ZPL)" })).toBeDisabled();
  await page.getByRole("button", { name: "Edit profile" }).click();
  await page.fill("#prn-width", "104");
  await page.getByRole("button", { name: "Save profile" }).click();
  const [test] = await Promise.all([page.waitForEvent("download"), section.getByRole("button", { name: "Test print (ZPL)" }).click()]);
  const text = readFileSync((await test.path())!, "utf8");
  expect(text).toContain("^FD50 mm: measure this line^FS");
  expect(text).toContain("^FDPrinter: Desk printer^FS");
  // Kept in this browser
  await page.reload();
  await on(page, "export");
  await page.locator("details.printer summary").click();
  await expect(page.locator("#prn-profile option", { hasText: "Desk printer" })).toHaveCount(1);
});

// Backlog 3.3 and 3.6 (ADR 0002): the print file in the profile's language, TSPL or EPL2 besides ZPL, checked in Labelize.
test("printer languages: a TSPL or EPL2 profile writes its own file, says it is checked in an emulator, refuses what it cannot print", async ({ page }) => {
  await on(page, "export");
  await page.locator("details.printer summary").click();
  await page.selectOption("#prn-profile", "tspl-203");
  await expect(page.locator("details.printer .hint.error")).toContainText("TSPL files are checked in Labelize, an emulator, not yet on a TSPL printer");
  await expect(page.getByRole("button", { name: "ZPL template" })).toHaveCount(0);
  const [tspl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "TSPL (203 dpi)" }).click()]);
  expect(tspl.suggestedFilename()).toBe("dl-qrcode_01_09506000134376_10_B42.prn");
  const text = readFileSync((await tspl.path())!, "utf8");
  expect(text).toMatch(/^SIZE [\d.]+ mm,[\d.]+ mm\r\n/);
  expect(text).toContain('QRCODE ');
  expect(text).toContain('"https://id.gs1.org/01/09506000134376/10/B42?17=271231"');
  const [test] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Test print (TSPL)" }).click()]);
  expect(test.suggestedFilename()).toBe("dl-qrcode_01_09506000134376_10_B42-test-203dpi.prn");
  expect(readFileSync((await test.path())!, "utf8")).toContain('"50 mm: measure this line"');
  // EPL2 has no QR code but on Japanese models: refused, with the reason
  await page.selectOption("#prn-profile", "epl2-203");
  await page.getByRole("button", { name: "EPL2 (203 dpi)" }).click();
  await expect(page.locator(".error.small")).toContainText("EPL2's QR code is for Japanese printer models only");
  // A profile of one's own in EPL2, kept
  await page.selectOption("#prn-profile", "new");
  await page.fill("#prn-name", "Old warehouse printer");
  await page.selectOption("#prn-language", "epl2");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("button", { name: "EPL2 (203 dpi)" })).toBeVisible();
});

// Backlog 3.7 (ADR 0002): DPL for Datamax-O'Neil and Honeywell printers, checked in Labelize as TSPL and EPL2 are.
test("printer languages: a DPL profile writes a label format in tenths of a millimetre, and refuses a GS1 DataMatrix", async ({ page }) => {
  await on(page, "export");
  await page.locator("details.printer summary").click();
  await page.selectOption("#prn-profile", "dpl-300");
  await expect(page.locator("details.printer .hint.error")).toContainText("DPL files are checked in Labelize, an emulator, not yet on a DPL printer");
  const [dpl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "DPL (300 dpi)" }).click()]);
  expect(dpl.suggestedFilename()).toBe("dl-qrcode_01_09506000134376_10_B42.dpl");
  const text = readFileSync((await dpl.path())!, "latin1");
  expect(text.startsWith("\x02L\rm\rD11\rz\r")).toBe(true);
  expect(text).toMatch(/\r1W1D(\w)\1(?:000)\d{8}MA,https:\/\/id\.gs1\.org\/01\/09506000134376\/10\/B42\?17=271231\r\r/);
  expect(text.endsWith("\rQ0001\rE\r")).toBe(true);
  const [test] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Test print (DPL)" }).click()]);
  expect(test.suggestedFilename()).toBe("dl-qrcode_01_09506000134376_10_B42-test-300dpi.dpl");
  expect(readFileSync((await test.path())!, "latin1")).toContain("50 mm: measure this line");
  // A GS1 DataMatrix: DPL's Data Matrix has no FNC1 in the manual, refused with the reason
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
  await page.selectOption("#opt-symbol", "gs1-datamatrix");
  await on(page, "export");
  await page.getByRole("button", { name: "DPL (300 dpi)" }).click();
  await expect(page.locator(".error.small")).toContainText("DPL's Data Matrix (W1c) has no FNC1 in the manual");
});

// Item 4.1 (mock-up A of two, 31 October 2026): the GS1 Logistic Label for an SSCC (General Specifications 6.6).
test("the GS1 Logistic Label: free text, data titles, GS1-128 with the SSCC lowest, each symbol read back", async ({ page }) => {
  await expect(page.locator('#opt-logistic option[value="a6"]')).toHaveCount(0); // a GTIN: no logistic label
  await page.fill("#paste", "(00)106141411234567897(02)09506000134376(37)24(10)ABC123");
  await page.getByRole("button", { name: "Fill in" }).click();
  await on(page, "label");
  await page.selectOption("#opt-logistic", "a6");
  await expect(page.locator(".preview .error")).toContainText("the A6 label is 148 mm high");
  await page.selectOption("#opt-logistic", "a5");
  await page.fill("#opt-from", "Dal Giardino S.p.A.\nVia Roma 1, Milano");
  await page.fill("#opt-to", "Supermarket DC 12");
  await expect(page.locator(".caption")).toContainText("GS1 Logistic Label A5 · 2 GS1-128 symbols");
  await expect(page.locator(".caption")).toContainText("label 148.0 × 210.0 mm");
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toHaveText(
    "✓ Read as intended: ]C1 (00)106141411234567897 and ]C1 (02)09506000134376(37)24(10)ABC123", { timeout: 30_000 });
  await on(page, "export");
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PDF", exact: true }).click()]);
  expect(readFileSync((await pdf.path())!).subarray(0, 4).toString()).toBe("%PDF");
  // In ZPL (backlog 3.2): A5 is wider than a 4-inch printer prints, refused; a 6-inch printer of one's own writes it, each
  // GS1-128 a ^BC, the label's text and rules with it; its test label too. Another language refuses it, with the reason.
  await page.getByRole("button", { name: "ZPL (203 dpi)" }).click();
  await expect(page.locator(".error.small")).toContainText("The label is 148.0 mm wide");
  await page.locator("details.printer summary").click();
  await page.selectOption("#prn-profile", "new");
  await page.fill("#prn-name", "Six-inch printer");
  await page.fill("#prn-width", "168");
  await page.getByRole("button", { name: "Save profile" }).click();
  const [zpl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ZPL (203 dpi)" }).click()]);
  const text = readFileSync((await zpl.path())!, "utf8");
  expect(text.match(/\^BCN/g)).toHaveLength(2);
  expect(text).toContain("^PW1183\n^LL1678"); // 148 × 210 mm at 203 dpi
  expect(text).toContain("^FDDal Giardino S.p.A.^FS");
  expect(text).toMatch(/\^GB1183,2,2\^FS/);
  const [test] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Test print (ZPL)" }).click()]);
  expect(readFileSync((await test.path())!, "utf8")).toContain("50 mm: measure this line");
  await page.selectOption("#prn-profile", "tspl-203");
  await page.getByRole("button", { name: "TSPL (203 dpi)" }).click();
  await expect(page.locator(".error.small")).toContainText("TSPL's GS1-128 is offered for an SSCC (00) alone");
});

// Item 4.1 in TSPL and DPL (6 November 2026): the GS1 Logistic Label of an SSCC alone, which their GS1-128 carries.
test("the GS1 Logistic Label of an SSCC alone in TSPL and DPL", async ({ page }) => {
  await page.fill("#paste", "(00)106141411234567897");
  await page.getByRole("button", { name: "Fill in" }).click();
  await on(page, "label");
  await page.selectOption("#opt-logistic", "4x6");
  await page.fill("#opt-from", "Dal Giardino S.p.A.");
  await expect(page.locator(".caption")).toContainText("GS1 Logistic Label 4 × 6 in · 1 GS1-128 symbol");
  await on(page, "export");
  await page.locator("details.printer summary").click();
  await page.selectOption("#prn-profile", "tspl-203");
  const [tspl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "TSPL (203 dpi)" }).click()]);
  const tsplFile = readFileSync((await tspl.path())!, "utf8");
  expect(tsplFile).toMatch(/^SIZE 101\.6 mm,152\.4 mm\r$/m);
  expect(tsplFile).toMatch(/^BARCODE \d+,\d+,"EAN128",\d+,0,0,4,4,"00106141411234567897"\r$/m);
  expect(tsplFile).toMatch(/^TEXT \d+,\d+,"\d",0,\d+,\d+,"Dal Giardino S\.p\.A\."\r$/m);
  expect(tsplFile).toMatch(/^BAR 0,\d+,812,2\r$/m);
  await page.selectOption("#prn-profile", "dpl-203");
  const [dpl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "DPL (203 dpi)" }).click()]);
  const dplFile = readFileSync((await dpl.path())!, "latin1");
  expect(dplFile).toMatch(/\r1q\d\d\d{3}\d{8}0010614141123456789\r/);
  expect(dplFile).toMatch(/\r1\d{3}000\d{8}Dal Giardino S\.p\.A\.\r/);
});

// Item 4.1 (mock-up A of two, 2 November 2026): a 2D symbol to the right of the GS1 Logistic Label's middle block
// (General Specifications 6.6.4.1.1), read back with the GS1-128 symbols, and in the ZPL as ^BQ.
test("the GS1 Logistic Label with a QR code beside its data, read back, and in ZPL", async ({ page }) => {
  await page.fill("#paste", "(00)106141411234567897(02)09506000134376(37)24(10)ABC123");
  await page.getByRole("button", { name: "Fill in" }).click();
  await on(page, "label");
  await page.selectOption("#opt-logistic", "a5");
  await expect(page.locator("#opt-logistic-2d")).toHaveValue("none");
  await page.selectOption("#opt-logistic-2d", "dl-qrcode");
  await expect(page.locator(".caption")).toContainText("GS1 Logistic Label A5 · 2 GS1-128 symbols · QR code (GS1 Digital Link) · 33 × 33 = 1,089 modules");
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toHaveText(
    "✓ Read as intended: ]C1 (00)106141411234567897 and ]C1 (02)09506000134376(37)24(10)ABC123 and " +
      "]Q1 https://id.gs1.org/00/106141411234567897?02=09506000134376&37=24&10=ABC123", { timeout: 30_000 });
  await on(page, "export");
  await page.locator("details.printer summary").click();
  await page.selectOption("#prn-profile", "new");
  await page.fill("#prn-name", "Six-inch printer");
  await page.fill("#prn-width", "168");
  await page.getByRole("button", { name: "Save profile" }).click();
  const [zpl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ZPL (203 dpi)" }).click()]);
  expect(readFileSync((await zpl.path())!, "utf8")).toMatch(/\^BY1,3\.0,1\^FO\d+,\d+\^BQN,2,6\^FDMA,https:\/\/id\.gs1\.org\/00\/106141411234567897\?02=/);
  // A GS1 DataMatrix instead: the element string
  await on(page, "label");
  await page.selectOption("#opt-logistic-2d", "gs1-datamatrix");
  await expect(page.locator(".caption")).toContainText("· GS1 DataMatrix ·");
});

// The interface's languages (the owner, 31 October 2026; ADR 0003): English, Brazilian Portuguese and Spanish, the
// language chosen kept for the next visit; the core's and the Syntax Engine's messages translated too.
test("the interface in Brazilian Portuguese and Spanish, kept for the next visit, messages included", async ({ page }) => {
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await on(page, "more");
  await page.selectOption("#language", "pt-BR");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await expect(page.locator("#identify-title")).toHaveText("1 O que o código identifica?");
  await expect(page.locator("#scan-title")).toHaveText("2 Onde é lido?");
  await on(page, "scan");
  await expect(page.getByRole("group", { name: "É lido num ponto de venda do varejo geral?" })).toBeVisible();
  await on(page, "data");
  await expect(page.locator(".attr").first().getByRole("combobox")).toHaveValue("(10) Lote");
  // What was typed stays; a core message and an engine message in Portuguese
  await expect(page.locator("#key-value")).toHaveValue("09506000134376");
  await page.fill("#key-value", "09506000134377");
  await expect(page.locator("#key-hint")).toHaveText("O dígito verificador não confere: deveria ser 6.");
  await page.fill("#key-value", "09506000134376");
  await on(page, "data");
  await page.fill("#paste", "(01)09506000134352(17)271331");
  await page.getByRole("button", { name: "Preencher" }).click();
  await expect(page.locator(".paste .hint")).toContainText("A data tem um mês inválido.");
  // Kept for the next visit
  await page.reload();
  await expect(page.locator("#identify-title")).toHaveText("1 O que o código identifica?");
  await on(page, "more");
  await page.selectOption("#language", "es");
  await expect(page.locator("#identify-title")).toHaveText("1 ¿Qué identifica el código?");
  await expect(page.getByRole("button", { name: "Empezar de nuevo" })).toBeVisible();
  await page.selectOption("#language", "en");
  await expect(page.locator("#identify-title")).toHaveText("1 What does the code identify?");
});

test("a browser in Portuguese opens the studio in Portuguese", async ({ browser }) => {
  const context = await browser.newContext({ locale: "pt-BR" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("#identify-title")).toHaveText("1 O que o código identifica?");
  await context.close();
});

// A text block's month names start in the interface's language (the owner, 3 November 2026): DEZ in Portuguese.
test("a label of one's own in Portuguese: a new text block writes its months in Portuguese", async ({ browser }) => {
  const context = await browser.newContext({ locale: "pt-BR", viewport: { width: 1400, height: 950 } });
  const page = await context.newPage();
  await page.goto("/");
  await page.fill("#paste", "(01)09506000134376(10)B42(17)271231");
  await page.getByRole("button", { name: "Preencher" }).click();
  await page.getByRole("button", { name: "Escolher o símbolo você mesmo" }).click();
  await page.selectOption("#opt-logistic", "designer");
  await page.getByRole("button", { name: "+ Texto" }).click();
  await page.fill("#el-text", "VAL {17:MMM YYYY}");
  await expect(page.locator("#el-months")).toHaveValue("pt");
  await expect(page.locator('.preview .symbol svg [aria-label="VAL DEZ 2027"]')).toHaveCount(1);
  await expect(page.locator("label[for=el-months]")).toHaveText("Nomes dos meses");
  await context.close();
});

// Item 4.2 (mock-up A of two, 3 November 2026): a label of one's own, barcodes and text blocks placed on a page, each
// chosen by a click or in the list and moved by dragging; every barcode read back by the scan test.
test("a label of one's own: barcodes and text placed and moved, read back, exported", async ({ page }) => {
  await page.fill("#paste", "(01)09506000134376(10)B42(17)271231");
  await page.getByRole("button", { name: "Fill in" }).click();
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
  await page.selectOption("#opt-logistic", "designer");
  await page.selectOption("#page-env", "distribution");
  await expect(page.locator(".caption")).toHaveText("A label of my own 100 × 60 mm · QR code (GS1 Digital Link)");
  await page.fill("#page-width", "150");
  await page.fill("#page-height", "90");
  // A text block with a field from the data, then a GS1-128 with two of the three element strings
  await page.getByRole("button", { name: "+ Text" }).click();
  await page.fill("#el-text", "BATCH ");
  await page.selectOption("#el-field", "{10}");
  await expect(page.locator("#el-text")).toHaveValue("BATCH {10}");
  await page.fill("#el-x", "70");
  await page.fill("#el-y", "6");
  await expect(page.locator('.preview .symbol svg [aria-label="BATCH B42"]')).toHaveCount(1);
  // A date field in a format (step c): each date offered in the formats with the value it gives
  await page.fill("#el-text", "BATCH {10}\nEXP ");
  await expect(page.locator('#el-field option[value="{17:DD.MM.YYYY}"]')).toHaveText("{17:DD.MM.YYYY} — 31.12.2027");
  await page.selectOption("#el-field", "{17:DD.MM.YYYY}");
  await expect(page.locator("#el-text")).toHaveValue("BATCH {10}\nEXP {17:DD.MM.YYYY}");
  await expect(page.locator('.preview .symbol svg [aria-label="EXP 31.12.2027"]')).toHaveCount(1);
  // The month's abbreviation in the text block's language: English here, Portuguese or Spanish when chosen
  await expect(page.locator("#el-months")).toHaveCount(0);
  await page.fill("#el-text", "VAL {17:DD MMM YYYY}");
  await expect(page.locator('.preview .symbol svg [aria-label="VAL 31 DEC 2027"]')).toHaveCount(1);
  await expect(page.locator("#el-months")).toHaveValue("en");
  await page.selectOption("#el-months", "pt");
  await expect(page.locator('.preview .symbol svg [aria-label="VAL 31 DEZ 2027"]')).toHaveCount(1);
  await expect(page.locator('#el-field option[value="{17:DD MMM YYYY}"]')).toHaveText("{17:DD MMM YYYY} — 31 DEZ 2027");
  await page.selectOption("#el-months", "es");
  await expect(page.locator('.preview .symbol svg [aria-label="VAL 31 DIC 2027"]')).toHaveCount(1);
  // A format after an AI that is not a date is refused, naming it
  await page.fill("#el-text", "BATCH {10:DD/MM/YYYY}");
  await expect(page.locator("p.error", { hasText: "(10) is not a date, so its field takes no date format." })).toBeVisible();
  await page.fill("#el-text", "BATCH {10}\nEXP {17:DD.MM.YYYY}");
  await page.getByRole("button", { name: "+ Barcode" }).click();
  await page.selectOption("#el-symbol", "gs1-128");
  await page.getByRole("checkbox", { name: "(10)B42" }).uncheck();
  await page.fill("#el-x", "10");
  await page.fill("#el-y", "48");
  await expect(page.locator(".caption")).toHaveText("A label of my own 150 × 90 mm · QR code (GS1 Digital Link), GS1-128");
  // The first text block lies under the QR code: named, then moved out of the way by dragging it
  await expect(page.locator(".design-problems")).toContainText("overlap: a barcode's quiet zones must stay clear");
  const overlay = page.locator(".design-overlay");
  await page.locator(".design-list button", { hasText: "“{01}”" }).click();
  await page.fill("#el-y", "40");
  await page.fill("#el-x", "60");
  await expect(page.locator(".design-problems")).toHaveCount(0);
  const qr = page.locator('.design-overlay rect[data-id="e1"]');
  await qr.scrollIntoViewIfNeeded();
  const box = (await qr.boundingBox())!;
  const pxPerMm = (await overlay.boundingBox())!.width / 150;
  await page.mouse.move(box.x + 4, box.y + 4);
  await page.mouse.down();
  await page.mouse.move(box.x + 4 + 5 * pxPerMm, box.y + 4, { steps: 3 });
  await page.mouse.move(box.x + 4 + 110 * pxPerMm, box.y + 4, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".design-list button[aria-pressed=true]")).toHaveText(/QR code/);
  await expect(page.locator("#el-x")).toHaveValue("112");
  await page.getByRole("button", { name: "Scan test" }).click();
  await expect(page.locator(".scan-result")).toHaveText(
    "✓ Read as intended: ]C1 (01)09506000134376(17)271231 and ]Q1 https://id.gs1.org/01/09506000134376/10/B42?17=271231", { timeout: 30_000 });
  // Exported as PDF; in ZPL a 150 mm label is wider than the 104 mm printer prints
  await on(page, "export");
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PDF", exact: true }).click()]);
  expect(readFileSync((await pdf.path())!).subarray(0, 4).toString()).toBe("%PDF");
  await page.getByRole("button", { name: "ZPL (203 dpi)" }).click();
  await expect(page.locator(".error.small")).toContainText("The label is 150.0 mm wide");
  // Deleting the selected element takes it off the page
  await on(page, "label");
  await page.locator(".design-list button", { hasText: "GS1-128" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".caption")).toHaveText("A label of my own 150 × 90 mm · QR code (GS1 Digital Link)");
  // On a 100 mm label the QR code, at 112 mm, would print past the edge: refused; moved inside, the ZPL has the printer's
  // own commands, each element where the page puts it
  await page.fill("#page-width", "100");
  await on(page, "export");
  await page.getByRole("button", { name: "ZPL (203 dpi)" }).click();
  await expect(page.locator(".error.small")).toContainText("runs past the label's edge");
  await on(page, "label");
  await page.locator(".design-list button", { hasText: "QR code" }).click();
  await page.fill("#el-x", "5");
  await page.fill("#el-y", "5");
  await on(page, "export");
  const [zpl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ZPL (203 dpi)" }).click()]);
  const file = readFileSync((await zpl.path())!, "utf8");
  const dots = (mm: number) => Math.round((mm / 25.4) * 203);
  expect(file).toContain(`^PW${dots(100)}\n^LL${dots(90)}`);
  expect(file).toContain(`^FO${dots(70)},${dots(6)}^A0N`);
  expect(file).toContain("^FDBATCH B42^FS");
  expect(file).toContain("^FDEXP 31.12.2027^FS");
  expect(file).toMatch(/\^BQN,2,\d+\^FDMA,https:\/\/id\.gs1\.org\/01\/09506000134376\/10\/B42\?17=271231\^FS/);
  await expect(page.locator(".error.small")).toHaveCount(0);
  // In DPL: records by their bottom left corner, rows up from the label's bottom in tenths of a millimetre (the text at
  // 70 mm, 559 dots at 203 dpi, so column 0699), the text in the printer's internal fonts, the QR code with W1D
  await page.locator("details.printer summary").click();
  await page.selectOption("#prn-profile", "dpl-203");
  const [dpl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "DPL (203 dpi)" }).click()]);
  const dplFile = readFileSync((await dpl.path())!, "latin1");
  expect(dplFile).toMatch(/\r1[0-2](\w)\1(?:000)\d{4}0699BATCH B42\r/);
  expect(dplFile).toMatch(/\r1[0-2](\w)\1(?:000)\d{4}0699EXP 31\.12\.2027\r/);
  expect(dplFile).toMatch(/\r1W1D\w\w000\d{8}MA,https:\/\/id\.gs1\.org\/01\/09506000134376\/10\/B42\?17=271231\r\r/);
  expect(dplFile.endsWith("\rQ0001\rE\r")).toBe(true);
  await expect(page.locator(".error.small")).toHaveCount(0);
});

// Item 4.2, step b (mock-up B of two, the owner's choice of 3 November 2026): lines and boxes on a label of one's own,
// one "+ Shape" beside the barcodes and text, the shape chosen in its properties; a frame clear of the barcodes is not
// an overlap, a line across one is; in ZPL each with ^GB where the page puts it.
test("a label of one's own: shapes added, changed, sized, named, and written in ZPL", async ({ page }) => {
  await page.fill("#paste", "(01)09506000134376(10)B42(17)271231");
  await page.getByRole("button", { name: "Fill in" }).click();
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
  await page.selectOption("#opt-logistic", "designer");
  // The QR code at the top left
  await page.locator(".design-list button", { hasText: "QR code" }).press("Enter"); // under a phone's tab bar
  await page.fill("#el-x", "5");
  await page.fill("#el-y", "5");
  // A shape starts as a line across: its width is its length, its height its thickness (not typed)
  await page.getByRole("button", { name: "+ Shape" }).click();
  await expect(page.locator(".design-list button[aria-pressed=true]")).toHaveText("◇ Line across 40 mm");
  await expect(page.locator("#el-shape")).toHaveValue("across");
  await expect(page.locator("#el-height-mm")).toBeDisabled();
  await expect(page.locator("#el-height-mm")).toHaveValue("0.5");
  // Made a box: the line's length its width; then a frame around the label
  await page.selectOption("#el-shape", "box");
  await expect(page.locator(".design-list button[aria-pressed=true]")).toHaveText("◇ Box 40 × 20 mm");
  await page.fill("#el-width", "96");
  await page.fill("#el-height-mm", "56");
  await page.fill("#el-thickness", "0.8");
  await page.fill("#el-x", "2");
  await page.fill("#el-y", "2");
  await expect(page.locator(".design-list button[aria-pressed=true]")).toHaveText("◇ Box 96 × 56 mm");
  await expect(page.locator(".design-problems")).toHaveCount(0);
  // A filled box: its outline's thickness no longer asked
  await page.selectOption("#el-shape", "filled");
  await expect(page.locator("#el-thickness")).toBeDisabled();
  await page.selectOption("#el-shape", "box");
  // A line down across the QR code overlaps it; moved to the right it does not
  await page.getByRole("button", { name: "+ Shape" }).click();
  await page.selectOption("#el-shape", "down");
  await expect(page.locator("#el-width")).toBeDisabled();
  await page.fill("#el-height-mm", "30");
  await page.fill("#el-x", "10");
  await page.fill("#el-y", "6");
  await expect(page.locator(".design-list button[aria-pressed=true]")).toHaveText("◇ Line down 30 mm");
  await expect(page.locator(".design-problems")).toContainText("Line down 30 mm");
  await page.fill("#el-x", "60");
  await expect(page.locator(".design-problems")).toHaveCount(0);
  // Drawn on the page: the frame's four sides and the line among its rectangles
  await expect(page.locator(".preview .symbol svg")).toBeAttached();
  await on(page, "export");
  const [zpl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ZPL (203 dpi)" }).click()]);
  const file = readFileSync((await zpl.path())!, "utf8");
  const dots = (mm: number) => Math.round((mm / 25.4) * 203);
  expect(file).toContain(`^FO${dots(2)},${dots(2)}^GB${dots(98) - dots(2)},${dots(58) - dots(2)},${dots(0.8)}^FS`);
  expect(file).toContain(`^FO${dots(60)},${dots(6)}^GB${dots(60.5) - dots(60)},${dots(36) - dots(6)},${dots(60.5) - dots(60)}^FS`);
  // Past the label's edge, a line is named on the page and refused in the print file
  await on(page, "label");
  await page.fill("#el-height-mm", "60");
  await expect(page.locator(".design-problems")).toContainText("Line down 60 mm goes past the label's edge.");
  await on(page, "export");
  await page.getByRole("button", { name: "ZPL (203 dpi)" }).click();
  await expect(page.locator(".error.small")).toContainText("A line or box runs past the label's edge");
});

// Item 4.3 (mock-up A of two, 3 November 2026): Save downloads the work, Open… takes it back after Start over — the data,
// the choices and a label of one's own; the ZPL downloaded here carries the same work and opens too; a ZPL made
// elsewhere is refused, saying why.
test("the work saved and opened again, from its file or from the ZPL; a ZPL made elsewhere refused", async ({ page }) => {
  await page.fill("#paste", "(01)09506000134376(10)LOT7(17)280930");
  await page.getByRole("button", { name: "Fill in" }).click();
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
  await page.selectOption("#opt-logistic", "designer");
  await page.locator(".design-list button", { hasText: "QR code" }).press("Enter");
  await page.fill("#el-x", "5");
  await page.fill("#el-y", "5");
  await page.getByRole("button", { name: "+ Text" }).click();
  await page.fill("#el-text", "VAL {17:DD MMM YYYY}");
  await page.selectOption("#el-months", "pt");
  await page.fill("#el-x", "50");
  await page.fill("#el-y", "40");
  const drawn = '.preview .symbol svg [aria-label="VAL 30 SET 2028"]';
  await expect(page.locator(drawn)).toHaveCount(1);
  const caption = "A label of my own 100 × 60 mm · QR code (GS1 Digital Link)";
  await expect(page.locator(".caption")).toHaveText(caption);
  await on(page, "more");
  const [saved] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save", exact: true }).click()]);
  expect(saved.suggestedFilename()).toBe("dl-qrcode_01_09506000134376_10_LOT7.gs1-work.json");
  const savedPath = (await saved.path())!;
  const work = JSON.parse(readFileSync(savedPath, "utf8")) as { format: string; identification: { qualifiers: Record<string, string> }; page: { elements: unknown[] } };
  expect([work.format, work.identification.qualifiers["10"], work.page.elements.length]).toEqual(["gs1-label-studio.work", "LOT7", 3]);
  await expect(page.locator(".work-note")).toContainText(`Saved as ${saved.suggestedFilename()}: Open… takes it back`);
  await on(page, "export");
  const [zpl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ZPL (203 dpi)" }).click()]);
  const zplPath = (await zpl.path())!;
  expect(readFileSync(zplPath, "utf8")).toMatch(/^\^XA\n\^FX GS1 Label Studio work 1\/\d+ /);
  for (const file of [savedPath, zplPath]) {
    await on(page, "more");
    await page.getByRole("button", { name: "Start over" }).click();
    await on(page, "data");
    await expect(page.locator("#q-10")).toHaveValue("B42");
    await on(page, "more");
    await page.getByLabel("Open a saved work").setInputFiles(file);
    await expect(page.locator(".work-note")).toContainText("Opened");
    await on(page, "data");
    await expect(page.locator("#q-10")).toHaveValue("LOT7");
    await on(page, "label");
    await expect(page.locator(".caption")).toHaveText(caption);
    await expect(page.locator(drawn)).toHaveCount(1);
    await page.locator(".design-list button", { hasText: "VAL" }).press("Enter");
    await expect(page.locator("#el-months")).toHaveValue("pt");
  }
  await on(page, "more");
  await page.getByLabel("Open a saved work").setInputFiles({ name: "hello.zpl", mimeType: "text/plain", buffer: Buffer.from("^XA^FO50,50^A0N,50^FDHello^FS^XZ") });
  await expect(page.locator(".work-note.error")).toHaveText(
    "hello.zpl: This ZPL carries no work: only the ZPL that GS1 Label Studio downloads can be opened here.×");
  await page.locator(".work-note").getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".work-note")).toHaveCount(0);
});

// Item 4.2, time parts (7 November 2026): a date followed by a time, such as (7003), offered in its date and time
// formats too, hh and mm in lower case beside the date's capitals; a time after a date that carries none refused.
test("a label of one's own: a date's time in hh and mm, in the drawing and the ZPL", async ({ page }) => {
  await page.fill("#paste", "(01)09506000134376(17)271231(7003)2712311530(8008)271231064512");
  await page.getByRole("button", { name: "Fill in" }).click();
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
  await page.selectOption("#opt-logistic", "designer");
  await page.getByRole("button", { name: "+ Text" }).click();
  await expect(page.locator(".designer .hint", { hasText: "A date with a time" })).toHaveText(
    "A date with a time, such as {7003:DD/MM/YYYY hh:mm}, takes hh, mm and ss in lower case, so that MM stays the month.");
  // (7003) offers its date's formats and its date and time's; (17) its date's only
  await expect(page.locator('#el-field option[value="{7003:DD/MM/YYYY hh:mm}"]')).toHaveText("{7003:DD/MM/YYYY hh:mm} — 31/12/2027 15:30");
  await expect(page.locator('#el-field option[value="{7003:hh:mm}"]')).toHaveText("{7003:hh:mm} — 15:30");
  await expect(page.locator('#el-field option[value="{7003:DD.MM.YYYY}"]')).toHaveText("{7003:DD.MM.YYYY} — 31.12.2027");
  await expect(page.locator('#el-field option[value^="{17:"]')).toHaveCount(5);
  await expect(page.locator('#el-field option[value^="{7003:"][value$="ss}"]')).toHaveCount(0); // (7003) carries no seconds
  await expect(page.locator('#el-field option[value="{8008:YYYY-MM-DD hh:mm:ss}"]')).toHaveText("{8008:YYYY-MM-DD hh:mm:ss} — 2027-12-31 06:45:12");
  await page.fill("#el-text", "EXP ");
  await page.selectOption("#el-field", "{7003:YYYY-MM-DD hh:mm}");
  await expect(page.locator("#el-text")).toHaveValue("EXP {7003:YYYY-MM-DD hh:mm}");
  await expect(page.locator('.preview .symbol svg [aria-label="EXP 2027-12-31 15:30"]')).toHaveCount(1);
  // A time after a date that carries none is refused, naming the AI
  await page.fill("#el-text", "EXP {17:DD/MM/YYYY hh:mm}");
  await expect(page.locator("p.error", { hasText: "(17) carries no time, so its field takes no hh, mm or ss." })).toBeVisible();
  await page.fill("#el-text", "EXP {7003:DD/MM/YYYY hh.mm}");
  await expect(page.locator('.preview .symbol svg [aria-label="EXP 31/12/2027 15.30"]')).toHaveCount(1);
  await page.fill("#el-y", "52");
  await expect(page.locator(".design-problems")).toHaveCount(0);
  await on(page, "export");
  const [zpl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ZPL (203 dpi)" }).click()]);
  expect(readFileSync((await zpl.path())!, "utf8")).toContain("^FDEXP 31/12/2027 15.30^FS");
});

test("a label of one's own: a date of birth, YYYYMMDD, in its century, and (7251)'s time, in the drawing and the ZPL", async ({ page }) => {
  await page.fill("#paste", "(8018)950600013435200008(7250)19600115");
  await page.getByRole("button", { name: "Fill in" }).click();
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
  await page.selectOption("#opt-symbol", "gs1-datamatrix"); // smaller than the GSRN's DataBar Expanded
  await page.selectOption("#opt-logistic", "designer");
  await page.getByRole("button", { name: "+ Text" }).click();
  // (7250) offers its date's five formats, its year as given (by the rule for YYMMDD, 60 would be 2060), no time
  await expect(page.locator('#el-field option[value^="{7250:"]')).toHaveCount(5);
  await expect(page.locator('#el-field option[value="{7250:DD/MM/YYYY}"]')).toHaveText("{7250:DD/MM/YYYY} — 15/01/1960");
  await expect(page.locator('#el-field option[value="{7250:DD MMM YYYY}"]')).toHaveText("{7250:DD MMM YYYY} — 15 JAN 1960");
  await expect(page.locator(".designer .hint", { hasText: "A date with a time" })).toHaveCount(0);
  await page.fill("#el-text", "DOB ");
  await page.selectOption("#el-field", "{7250:DD/MM/YYYY}");
  await expect(page.locator("#el-text")).toHaveValue("DOB {7250:DD/MM/YYYY}");
  await expect(page.locator('.preview .symbol svg [aria-label="DOB 15/01/1960"]')).toHaveCount(1);
  await page.fill("#el-text", "DOB {7250:DD/MM/YYYY hh:mm}");
  await expect(page.locator("p.error", { hasText: "(7250) carries no time, so its field takes no hh, mm or ss." })).toBeVisible();
  // (7251) DOB TIME: its date and time's formats too, the time from the digits after the eight of the date
  await on(page, "data");
  await page.fill("#paste", "(8018)950600013435200008(7251)196001150830");
  await page.getByRole("button", { name: "Fill in" }).click();
  await on(page, "label");
  await expect(page.locator(".designer .hint", { hasText: "A date with a time" })).toBeVisible();
  await expect(page.locator('#el-field option[value="{7251:DD/MM/YYYY hh:mm}"]')).toHaveText("{7251:DD/MM/YYYY hh:mm} — 15/01/1960 08:30");
  await expect(page.locator('#el-field option[value="{7251:hh:mm}"]')).toHaveText("{7251:hh:mm} — 08:30");
  await expect(page.locator('#el-field option[value^="{7251:"][value$="ss}"]')).toHaveCount(0);
  await page.fill("#el-text", "DOB {7251:DD/MM/YYYY hh:mm}");
  await expect(page.locator('.preview .symbol svg [aria-label="DOB 15/01/1960 08:30"]')).toHaveCount(1);
  await page.fill("#el-y", "52");
  await expect(page.locator(".design-problems")).toHaveCount(0);
  await on(page, "export");
  const [zpl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ZPL (203 dpi)" }).click()]);
  expect(readFileSync((await zpl.path())!, "utf8")).toContain("^FDDOB 15/01/1960 08:30^FS");
});

/** The work this browser keeps for the next visit (backlog 4.3 (c)), read from IndexedDB; null when nothing is kept. */
async function keptWorkText(page: Page): Promise<string | null> {
  return page.evaluate(() => new Promise<string | null>((resolve) => {
    const request = indexedDB.open("gs1-label-studio", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("kept");
    request.onsuccess = () => {
      const get = request.result.transaction("kept", "readonly").objectStore("kept").get("work");
      get.onsuccess = () => {
        request.result.close();
        resolve((get.result as string | undefined) ?? null);
      };
    };
  }));
}

// Backlog 4.3 (c), mock-up A of two (4 November 2026): the last work is kept in this browser as it changes and offered
// on the next visit in a bar under the header, never brought back unasked; a first visit's work, Start anew and Start
// over keep nothing to offer.
test("the last work kept in this browser and offered on the next visit; Start anew and Start over forget it", async ({ page }) => {
  const offer = page.getByRole("region", { name: "Your last work" });
  // A first visit's work, untouched, is not kept
  await page.waitForTimeout(800);
  expect(await keptWorkText(page)).toBeNull();
  await page.reload();
  await expect(page.locator(".preview .symbol svg")).toBeAttached();
  await expect(offer).toHaveCount(0);

  await page.fill("#paste", "(01)09506000134352(10)LOT9(17)280930");
  await page.getByRole("button", { name: "Fill in" }).click();
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
  await page.selectOption("#opt-logistic", "designer");
  await page.getByRole("button", { name: "+ Text" }).click();
  await page.fill("#el-text", "LOTE {10}");
  await expect.poll(async () => (await keptWorkText(page))?.includes("LOTE {10}") ?? false).toBe(true);
  expect(JSON.parse((await keptWorkText(page))!) as { format: string }).toMatchObject({ format: "gs1-label-studio.work" });

  await page.reload();
  await expect(offer).toBeVisible();
  await expect(offer).toContainText(/^Your last work, of .+, is kept in this browser\. \(01\) 09506000134352 · a label of your own/);
  // Nothing brought back unasked, and nothing kept over it while the question is open
  await on(page, "data");
  await expect(page.locator("#q-10")).toHaveValue("B42");
  await page.fill("#q-10", "OTHER");
  await page.waitForTimeout(800);
  expect(await keptWorkText(page)).toContain("LOT9");
  await offer.getByRole("button", { name: "Continue it" }).click();
  await expect(offer).toHaveCount(0);
  await expect(page.locator(".work-note")).toHaveText("Your last work is back.×");
  await expect(page.locator("#q-10")).toHaveValue("LOT9");
  await on(page, "label");
  await expect(page.locator(".caption")).toHaveText("A label of my own 100 × 60 mm · QR code (GS1 Digital Link)");
  await expect(page.locator('.preview .symbol svg [aria-label="LOTE LOT9"]')).toHaveCount(1);

  // Still kept after it came back; Start anew forgets it
  await page.reload();
  await expect(offer).toBeVisible();
  await offer.getByRole("button", { name: "Start anew" }).click();
  await expect(offer).toHaveCount(0);
  await expect.poll(() => keptWorkText(page)).toBeNull();
  await page.reload();
  await expect(page.locator(".preview .symbol svg")).toBeAttached();
  await expect(offer).toHaveCount(0);

  // Start over forgets it too, and the new visit asks nothing
  await on(page, "data");
  await page.fill("#q-10", "LOT10");
  await expect.poll(async () => (await keptWorkText(page))?.includes("LOT10") ?? false).toBe(true);
  await on(page, "more");
  await page.getByRole("button", { name: "Start over" }).click();
  await on(page, "data");
  await expect(page.locator("#q-10")).toHaveValue("B42");
  await expect(offer).toHaveCount(0);
  expect(await keptWorkText(page)).toBeNull();
  await page.reload();
  await expect(page.locator(".preview .symbol svg")).toBeAttached();
  await expect(offer).toHaveCount(0);
});

// Item 4.2, step d (mock-up A of two, 3 November 2026): + Image takes a file at once and places it 20 mm wide, as high as
// its proportions make it, in black and white; it prints in ZPL as a graphic field, in EPL2 with GW's raw bytes, in TSPL
// with BITMAP's, and is kept in the work file.
test("a label of one's own: an image added, sized, refused when not an image, printed in ZPL, EPL2 and TSPL, refused in DPL, and kept in the work", async ({ page }) => {
  await page.fill("#paste", "(01)09506000134376(10)B42(17)271231");
  await page.getByRole("button", { name: "Fill in" }).click();
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
  await page.selectOption("#opt-logistic", "designer");
  await expect(page.getByRole("button", { name: "+ Image" })).toBeVisible();
  const drawing = () => page.locator(".preview .symbol svg").evaluate((svg) => svg.outerHTML.length);
  const before = await drawing();
  await page.getByTestId("image-file").setInputFiles(new URL("./fixtures/logo.png", import.meta.url).pathname);
  await expect(page.locator(".design-list button[aria-pressed=true]")).toHaveText("▨ Image logo");
  await expect(page.locator(".image-file")).toContainText("360 × 150 pixels");
  await expect(page.locator("#el-width")).toHaveValue("20");
  await expect(page.locator("#el-height-mm")).toBeDisabled();
  await expect(page.locator("#el-height-mm")).toHaveValue("8.3");
  await expect.poll(drawing).toBeGreaterThan(before + 2000); // the logo's dark rectangles drawn
  await page.fill("#el-width", "40");
  await expect(page.locator("#el-height-mm")).toHaveValue("16.7");
  await page.fill("#el-x", "50");
  await expect(page.locator(".design-problems")).toHaveCount(0);
  // A file that is not an image is refused with the reason, the image kept
  await page.getByTestId("image-replace").setInputFiles({ name: "notes.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await expect(page.getByRole("alert")).toHaveText("“notes.png” is not an image this browser can read: choose a PNG, JPEG, GIF, WebP or SVG file.");
  await expect(page.locator(".design-list button[aria-pressed=true]")).toHaveText("▨ Image logo");
  // In ZPL, a graphic field at its corner, 40 mm wide at 203 dpi
  await on(page, "export");
  const [zpl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ZPL (203 dpi)" }).click()]);
  const file = readFileSync((await zpl.path())!, "utf8");
  const dots = (mm: number) => Math.round((mm / 25.4) * 203);
  expect(file).toContain(`^FO${dots(50)},${dots(4)}^GFA,`);
  expect(file).toMatch(new RegExp(`\\^GFA,(\\d+),\\1,${Math.ceil((dots(90) - dots(50)) / 8)},`));
  // In EPL2, GW with the dots as raw bytes, each byte as it was sent (a file of bytes, not of text); EPL2 has no QR
  // code, so the page's becomes a Data Matrix first
  await on(page, "label");
  await page.locator(".design-list button", { hasText: "QR code" }).press("Enter");
  await page.selectOption("#el-symbol", "dl-datamatrix");
  await expect(page.locator(".design-problems")).toHaveCount(0);
  await on(page, "export");
  await page.locator("details.printer summary").click();
  await page.selectOption("#prn-profile", "epl2-203");
  const [epl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "EPL2 (203 dpi)" }).click()]);
  const bytes = readFileSync((await epl.path())!);
  const latin1 = bytes.toString("latin1");
  const gw = /\r\nGW(\d+),(\d+),(\d+),(\d+),/.exec(latin1)!;
  expect([Number(gw[1]), Number(gw[2]), Number(gw[3])]).toEqual([dots(50), dots(4), Math.ceil((dots(90) - dots(50)) / 8)]);
  const end = gw.index + gw[0].length + Number(gw[3]) * Number(gw[4]);
  expect(latin1.slice(end)).toMatch(/^\r\n(?:B|A|LO|X)/);
  expect(latin1.endsWith("P1\r\n")).toBe(true);
  // In TSPL, BITMAP with the same bytes (a dark dot a 0 bit in both), then the text and the Data Matrix
  await page.selectOption("#prn-profile", "tspl-203");
  const [tspl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "TSPL (203 dpi)" }).click()]);
  const tsplBytes = readFileSync((await tspl.path())!);
  const tsplText = tsplBytes.toString("latin1");
  const bitmap = /\r\nBITMAP (\d+),(\d+),(\d+),(\d+),0,/.exec(tsplText)!;
  expect(bitmap.slice(1).map(Number)).toEqual(gw.slice(1).map(Number));
  const from = bitmap.index + bitmap[0].length;
  const length = Number(gw[3]) * Number(gw[4]);
  expect(tsplBytes.subarray(from, from + length).equals(bytes.subarray(gw.index + gw[0].length, end))).toBe(true);
  expect(tsplText.slice(from + length)).toMatch(/^\r\nTEXT [^]*\r\nDMATRIX /);
  expect(tsplText.endsWith("PRINT 1\r\n")).toBe(true);
  // In DPL an image is refused with the reason: DPL prints a stored image, which Labelize does not draw
  await page.selectOption("#prn-profile", "dpl-203");
  await page.getByRole("button", { name: "DPL (203 dpi)" }).click();
  await expect(page.locator(".error.small")).toContainText("an image is not offered in DPL yet");
  // Kept in the work file and opened again
  await on(page, "more");
  const [saved] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save", exact: true }).click()]);
  const work = JSON.parse(readFileSync((await saved.path())!, "utf8")) as { page: { elements: { kind: string; widthMm?: number }[] } };
  expect(work.page.elements.find((e) => e.kind === "image")?.widthMm).toBe(40);
  await page.getByRole("button", { name: "Start over" }).click();
  await page.getByLabel("Open a saved work").setInputFiles((await saved.path())!);
  await on(page, "label");
  await page.locator(".design-list button", { hasText: "Image logo" }).press("Enter");
  await expect(page.locator("#el-height-mm")).toHaveValue("16.7");
});

// An image's darkness (backlog 4.2, mock-up A of two, 6 November 2026): a slider from lighter to darker makes the black
// and white again from the file's grey levels, kept in this page's memory only; the work keeps the picture and its
// threshold, so after a reload the slider waits for the file to be chosen again, which keeps the darkness chosen.
test("a label of one's own: an image's darkness changed by its slider, printed and kept, and changed again after a reload once its file is chosen again", async ({ page }) => {
  const shades = new URL("./fixtures/shades.png", import.meta.url).pathname; // a black circle, squares at grey 110 and 180, a grey ramp
  await page.fill("#paste", "(01)09506000134376(10)B42");
  await page.getByRole("button", { name: "Fill in" }).click();
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
  await page.selectOption("#opt-logistic", "designer");
  await page.getByTestId("image-file").setInputFiles(shades);
  await expect(page.locator(".design-list button[aria-pressed=true]")).toHaveText("▨ Image shades");
  await page.fill("#el-x", "50");
  const slider = page.locator("#el-darkness");
  await expect(slider).toBeEnabled();
  await expect(slider).toHaveValue("50");
  await expect(page.locator(".darkness output")).toHaveText("50 %");
  await expect(page.getByText("Darker prints more of the image's light colours in black; lighter, fewer.")).toBeVisible();
  /** The image's pixels as the kept work holds them: whether (x, y) is dark, and how many are. */
  const kept = async () => {
    const work = JSON.parse((await keptWorkText(page))!) as { page: { elements: { kind: string; threshold?: number; picture?: { width: number; bits: string } }[] } };
    const image = work.page.elements.find((e) => e.kind === "image")!;
    const bytes = Buffer.from(image.picture!.bits, "base64");
    const row = Math.ceil(image.picture!.width / 8);
    const dark = (x: number, y: number) => (bytes[y * row + (x >> 3)]! & (0x80 >> (x & 7))) !== 0;
    let count = 0;
    for (const byte of bytes) for (let bit = 0; bit < 8; bit++) count += (byte >> bit) & 1;
    return { threshold: image.threshold, circle: dark(55, 55), mid: dark(175, 55), light: dark(297, 55), count };
  };
  await expect.poll(async () => (await keptWorkText(page))?.includes("shades") ?? false).toBe(true);
  const usual = await kept();
  expect(usual).toMatchObject({ threshold: undefined, circle: true, mid: true, light: false });
  const zplOf = async () => {
    await on(page, "export");
    const [zpl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ZPL (203 dpi)" }).click()]);
    await on(page, "label");
    return /\^GFA,[^]*?\^FS/.exec(readFileSync((await zpl.path())!, "utf8"))![0];
  };
  const usualZpl = await zplOf();
  // Darker: the light grey square prints too, and the drawing and the ZPL follow
  await page.locator(".design-list button", { hasText: "Image shades" }).press("Enter");
  await slider.fill("80");
  await expect(page.locator(".darkness output")).toHaveText("80 %");
  await expect.poll(async () => (await kept()).light).toBe(true);
  const darker = await kept();
  expect(darker).toMatchObject({ threshold: 205, circle: true, mid: true });
  expect(darker.count).toBeGreaterThan(usual.count);
  expect(await zplOf()).not.toBe(usualZpl);
  // Lighter: the grey 110 square goes as well; back at 50 % the picture is the first one, no threshold kept
  await page.locator(".design-list button", { hasText: "Image shades" }).press("Enter");
  await slider.fill("25");
  await expect.poll(async () => (await kept()).mid).toBe(false);
  expect(await kept()).toMatchObject({ threshold: 64, circle: true, light: false });
  await slider.fill("50");
  await expect.poll(async () => (await kept()).threshold).toBeUndefined();
  expect(await kept()).toEqual(usual);
  await slider.fill("80");
  await expect.poll(async () => (await kept()).threshold).toBe(205);
  // After a reload the work is back with its darkness, but its grey levels are not: the slider waits for the file
  await page.reload();
  await page.getByRole("region", { name: "Your last work" }).getByRole("button", { name: "Continue it" }).click();
  await on(page, "label");
  await page.locator(".design-list button", { hasText: "Image shades" }).press("Enter");
  await expect(slider).toBeDisabled();
  await expect(slider).toHaveValue("80");
  await expect(page.getByText("To change its darkness or its dots, choose its file again with Replace…: the work keeps only the black and white.")).toBeVisible();
  expect(await kept()).toEqual(darker);
  // Chosen again, the file is made at the darkness kept, and the slider works again
  await page.getByTestId("image-replace").setInputFiles(shades);
  await expect(slider).toBeEnabled();
  await expect(slider).toHaveValue("80");
  await page.waitForTimeout(800); // the work is kept half a second after it changes
  expect(await kept()).toEqual(darker);
  await slider.fill("50");
  await expect.poll(async () => (await kept()).light).toBe(false);
  // In Portuguese
  await on(page, "more");
  await page.selectOption("#language", "pt-BR");
  await on(page, "label");
  await expect(page.locator('label[for="el-darkness"]')).toHaveText("Escurecimento");
  await expect(page.getByText("Mais escura imprime em preto mais das cores claras da imagem; mais clara, menos.")).toBeVisible();
});

// Dithering (backlog 4.2, mock-up A of two, 7 November 2026, taken under the owner's rule): a box under the darkness
// makes the image's greys dots, the darker the closer, for a photo; the darkness then darkens the greys; kept in the
// work, and after a reload waiting for the file, as the darkness does.
test("a label of one's own: an image's greys as dots for a photo, at its darkness, printed and kept", async ({ page }) => {
  const photo = new URL("./fixtures/photo.png", import.meta.url).pathname; // 300 × 200: a shaded sphere, a sky, a square at grey 128
  await page.fill("#paste", "(01)09506000134376(10)B42");
  await page.getByRole("button", { name: "Fill in" }).click();
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
  await page.selectOption("#opt-logistic", "designer");
  await page.getByTestId("image-file").setInputFiles(photo);
  await expect(page.locator(".design-list button[aria-pressed=true]")).toHaveText("▨ Image photo");
  await page.fill("#el-x", "40");
  const dither = page.locator("#el-dither");
  await expect(dither).toBeEnabled();
  await expect(dither).not.toBeChecked();
  /** The image as the kept work holds it: its threshold, whether it is dithered, and the share of the grey square that is dark. */
  const kept = async () => {
    const work = JSON.parse((await keptWorkText(page))!) as { page: { elements: { kind: string; threshold?: number; dither?: boolean; picture?: { width: number; bits: string } }[] } };
    const image = work.page.elements.find((e) => e.kind === "image")!;
    const bytes = Buffer.from(image.picture!.bits, "base64");
    const row = Math.ceil(image.picture!.width / 8);
    let dark = 0;
    for (let y = 130; y < 190; y++) for (let x = 20; x < 80; x++) dark += (bytes[y * row + (x >> 3)]! & (0x80 >> (x & 7))) !== 0 ? 1 : 0;
    return { threshold: image.threshold, dither: image.dither, square: dark / 3600 };
  };
  await expect.poll(async () => (await keptWorkText(page))?.includes("photo") ?? false).toBe(true);
  expect(await kept()).toEqual({ threshold: undefined, dither: undefined, square: 0 }); // grey 128 is not below half way
  const zplOf = async () => {
    await on(page, "export");
    const [zpl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ZPL (203 dpi)" }).click()]);
    await on(page, "label");
    return /\^GFA,[^]*?\^FS/.exec(readFileSync((await zpl.path())!, "utf8"))![0];
  };
  const plainZpl = await zplOf();
  // Dots: half the grey square prints, and the drawing and the ZPL follow
  await page.locator(".design-list button", { hasText: "Image photo" }).press("Enter");
  await dither.check();
  await expect(page.getByText("Its greys print as dots, closer together where it is darker. Darker prints all its greys darker; lighter, lighter.")).toBeVisible();
  await expect.poll(async () => (await kept()).dither).toBe(true);
  const dots = await kept();
  expect(dots.threshold).toBeUndefined();
  expect(dots.square).toBeGreaterThan(0.45);
  expect(dots.square).toBeLessThan(0.55);
  expect(await zplOf()).not.toBe(plainZpl);
  // Darker: the greys darker, still dots
  await page.locator(".design-list button", { hasText: "Image photo" }).press("Enter");
  await page.locator("#el-darkness").fill("80");
  await expect.poll(async () => (await kept()).threshold).toBe(205);
  const darker = await kept();
  expect(darker.dither).toBe(true);
  expect(darker.square).toBeGreaterThan(dots.square + 0.15);
  expect(darker.square).toBeLessThan(1);
  // Unticked: black and white at that darkness, the whole square dark
  await dither.uncheck();
  await expect.poll(async () => (await kept()).dither).toBeUndefined();
  expect(await kept()).toEqual({ threshold: 205, dither: undefined, square: 1 });
  await expect(page.getByText("Darker prints more of the image's light colours in black; lighter, fewer.")).toBeVisible();
  await dither.check();
  await expect.poll(async () => (await kept()).dither).toBe(true);
  expect(await kept()).toEqual(darker);
  // After a reload the box waits for the file, as the darkness does; chosen again, it keeps both
  await page.reload();
  await page.getByRole("region", { name: "Your last work" }).getByRole("button", { name: "Continue it" }).click();
  await on(page, "label");
  await page.locator(".design-list button", { hasText: "Image photo" }).press("Enter");
  await expect(dither).toBeDisabled();
  await expect(dither).toBeChecked();
  await expect(page.getByText("To change its darkness or its dots, choose its file again with Replace…: the work keeps only the black and white.")).toBeVisible();
  await page.getByTestId("image-replace").setInputFiles(photo);
  await expect(dither).toBeEnabled();
  await page.waitForTimeout(800); // the work is kept half a second after it changes
  expect(await kept()).toEqual(darker);
  // In Portuguese
  await on(page, "more");
  await page.selectOption("#language", "pt-BR");
  await on(page, "label");
  await expect(page.getByText("Cinzas em pontos, para uma foto")).toBeVisible();
  await expect(page.getByText("Os cinzas saem em pontos, mais juntos onde a imagem é mais escura.", { exact: false })).toBeVisible();
});

// Item 4.2 (mock-up A of two, 7 November 2026, taken under the owner's rule): the chosen element's handle at its bottom
// right corner resizes it by dragging, its top left corner kept: a barcode and a text block to the sizes their
// properties offer, an image in its proportions, a box to the corner; the files follow.
test("a label of one's own: an element resized by dragging its corner, its top left corner kept", async ({ page }) => {
  await page.fill("#paste", "(01)09506000134376(10)B42(17)271231");
  await page.getByRole("button", { name: "Fill in" }).click();
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
  await page.selectOption("#opt-logistic", "designer");
  const handle = page.getByTestId("resize-handle");
  const overlay = page.locator(".design-overlay");
  await expect(handle).toHaveCount(0);
  await expect(page.getByText("drag it on the label to move it, or drag its corner, or press the arrow keys on its corner, to resize it.")).toBeVisible();
  /** Drags the handle by (dx, dy) pixels, or in mm when `mm` is set, and lets go. */
  const drag = async (dx: number, dy: number, mm = false) => {
    await overlay.evaluate((element) => element.scrollIntoView({ block: "center" }));
    const scale = mm ? (await overlay.boundingBox())!.width / 100 : 1;
    const h = (await handle.boundingBox())!;
    const [x, y] = [h.x + h.width / 2, h.y + h.height / 2];
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx * scale, y + dy * scale, { steps: 6 });
    await page.mouse.up();
  };
  /** The handle's centre and the chosen element's box, in pixels from the label's top left corner. */
  const corner = async () => {
    const o = (await overlay.boundingBox())!;
    const h = (await handle.boundingBox())!;
    const r = (await overlay.locator("rect.selected").boundingBox())!;
    const box = { x: r.x - o.x, y: r.y - o.y, width: r.width, height: r.height };
    return { handle: [h.x + h.width / 2 - o.x, h.y + h.height / 2 - o.y], corner: [box.x + box.width, box.y + box.height], box };
  };
  // The QR code in general distribution: its handle at its box's corner; dragged 10 mm, its modules about 10 mm larger,
  // 150 %; dragged far back, never smaller than the 100 % that general distribution allows
  await page.selectOption("#page-env", "distribution");
  await page.locator(".design-list button", { hasText: "QR code" }).press("Enter");
  await expect(handle).toHaveAttribute("title", "Drag this corner, or press the arrow keys, to resize the element");
  const qr = await corner();
  expect(Math.abs(qr.handle[0]! - qr.corner[0]!)).toBeLessThan(1);
  expect(Math.abs(qr.handle[1]! - qr.corner[1]!)).toBeLessThan(1);
  await drag(10, 10, true);
  await expect(page.locator("#el-size")).toHaveValue("150");
  await drag(-40, -40, true);
  await expect(page.locator("#el-size")).toHaveValue("100");
  // At retail point of sale: 80 % dragged far back, 200 % dragged far on, its top left corner kept
  await page.selectOption("#page-env", "retail");
  await drag(-40, -40, true);
  await expect(page.locator("#el-size")).toHaveValue("80");
  const smaller = await corner();
  await drag(40, 40, true);
  await expect(page.locator("#el-size")).toHaveValue("200");
  await expect(page.locator("#el-x")).toHaveValue("2");
  await expect(page.locator("#el-y")).toHaveValue("2");
  await expect.poll(async () => (await corner()).box.height / smaller.box.height).toBeGreaterThan(1.5);
  const larger = await corner();
  expect(Math.abs(larger.box.x - smaller.box.x)).toBeLessThan(1);
  expect(Math.abs(larger.box.y - smaller.box.y)).toBeLessThan(1);
  expect(Math.abs(larger.handle[0]! - larger.corner[0]!)).toBeLessThan(1);
  expect(Math.abs(larger.handle[1]! - larger.corner[1]!)).toBeLessThan(1);
  // The text block twice as high: 3 mm becomes 6 mm
  await page.locator(".design-list button", { hasText: "“{01}”" }).press("Enter");
  await page.fill("#el-y", "40");
  const text = await corner();
  await drag(text.box.width, text.box.height);
  await expect(page.locator("#el-height")).toHaveValue("6");
  await expect(page.locator("#el-y")).toHaveValue("40");
  // The logo, 20 mm wide, made 30 mm wide in its proportions (360 × 150 pixels), and printed so in ZPL
  await page.getByTestId("image-file").setInputFiles(new URL("./fixtures/logo.png", import.meta.url).pathname);
  await expect(page.locator(".design-list button[aria-pressed=true]")).toHaveText("▨ Image logo");
  await page.fill("#el-x", "60");
  await drag(10, (10 * 150) / 360, true);
  await expect(page.locator("#el-width")).toHaveValue("30");
  await expect(page.locator("#el-height-mm")).toHaveValue("12.5");
  await expect(page.locator("#el-x")).toHaveValue("60");
  await on(page, "export");
  const [zpl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ZPL (203 dpi)" }).click()]);
  const dots = (mm: number) => Math.round((mm / 25.4) * 203);
  expect(readFileSync((await zpl.path())!, "utf8")).toMatch(new RegExp(`\\^GFA,(\\d+),\\1,${Math.ceil((dots(90) - dots(60)) / 8)},`));
  await on(page, "label");
  // A box takes the corner's width and height: 40 × 20 mm made 30 × 25 mm
  await page.getByRole("button", { name: "+ Shape" }).click();
  await page.selectOption("#el-shape", "box");
  await expect(page.locator("#el-width")).toHaveValue("40");
  await expect(page.locator("#el-height-mm")).toHaveValue("20");
  await drag(-10, 5, true);
  await expect(page.locator("#el-width")).toHaveValue("30");
  await expect(page.locator("#el-height-mm")).toHaveValue("25");
  await expect(page.locator(".design-list button[aria-pressed=true]")).toHaveText("◇ Box 30 × 25 mm");
  // Nothing chosen, no handle
  await overlay.click({ position: { x: 1, y: 1 } });
  await expect(page.locator(".design-list button[aria-pressed=true]")).toHaveCount(0);
  await expect(handle).toHaveCount(0);
});

// Item 4.2 (mock-up A of two, 7 November 2026, taken under the owner's rule): an element run past the label's edge keeps
// its handle at the edge, where it is cut, in red; dragging it puts the corner under the pointer, so it shrinks back.
test("a label of one's own: the handle of an element past the label's edge held at the edge, and dragged back", async ({ page }) => {
  await page.fill("#paste", "(01)09506000134376(10)B42");
  await page.getByRole("button", { name: "Fill in" }).click();
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
  await page.selectOption("#opt-logistic", "designer");
  const handle = page.getByTestId("resize-handle");
  const overlay = page.locator(".design-overlay");
  /** The handle's centre, the label's box and the chosen element's outline, in pixels on the screen. */
  const where = async () => {
    await overlay.evaluate((element) => element.scrollIntoView({ block: "center" }));
    const h = (await handle.boundingBox())!;
    return { x: h.x + h.width / 2, y: h.y + h.height / 2, label: (await overlay.boundingBox())!, outline: (await overlay.locator("rect.selected").boundingBox())! };
  };
  /** Drags the handle by (dx, dy) mm and lets go. */
  const drag = async (dx: number, dy: number) => {
    const { x, y, label } = await where();
    const scale = label.width / 100;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx * scale, y + dy * scale, { steps: 6 });
    await page.mouse.up();
  };
  // The QR code at retail, 100 %, moved 78 mm across: past the right edge, its handle at the edge level with its bottom
  await page.selectOption("#page-env", "retail");
  await page.locator(".design-list button", { hasText: "QR code" }).press("Enter");
  await expect(handle).not.toHaveClass(/past/);
  await page.fill("#el-x", "78");
  await expect(handle).toHaveClass(/past/);
  await expect(handle).toHaveAttribute("title", "The element runs past the label's edge: drag this corner, or press the arrow keys, to make it smaller");
  const qr = await where();
  expect(Math.abs(qr.x - (qr.label.x + qr.label.width))).toBeLessThan(1);
  expect(Math.abs(qr.y - (qr.outline.y + qr.outline.height))).toBeLessThan(1);
  expect(await handle.evaluate((element) => getComputedStyle(element).borderTopColor)).toBe("rgb(217, 48, 37)");
  // Pulled 1 mm in, its corner comes under the pointer at once: the smallest size retail allows, its corner kept
  await drag(-1, 0);
  await expect(page.locator("#el-size")).toHaveValue("80");
  await expect(page.locator("#el-x")).toHaveValue("78");
  // A box 40 × 20 mm at 80 mm across: its handle held at the edge; pulled 5 mm in, 15 mm wide, on the label, blue again
  await page.getByRole("button", { name: "+ Shape" }).click();
  await page.selectOption("#el-shape", "box");
  await page.fill("#el-x", "80");
  await page.fill("#el-y", "30");
  await expect(handle).toHaveClass(/past/);
  await drag(-5, 0);
  await expect(page.locator("#el-width")).toHaveValue("15");
  await expect(page.locator("#el-height-mm")).toHaveValue("20");
  await expect(handle).not.toHaveClass(/past/);
  await expect(handle).toHaveAttribute("title", "Drag this corner, or press the arrow keys, to resize the element");
  const box = await where();
  expect(Math.abs(box.x - (box.outline.x + box.outline.width))).toBeLessThan(1);
  expect(Math.abs(box.y - (box.outline.y + box.outline.height))).toBeLessThan(1);
  // Past the bottom edge too: held at the label's bottom right corner
  await page.fill("#el-y", "50");
  await page.fill("#el-x", "90");
  const corner = await where();
  expect(Math.abs(corner.x - (corner.label.x + corner.label.width))).toBeLessThan(1);
  expect(Math.abs(corner.y - (corner.label.y + corner.label.height))).toBeLessThan(1);
  // In Portuguese
  await on(page, "more");
  await page.selectOption("#language", "pt-BR");
  await on(page, "label");
  await expect(handle).toHaveAttribute("title", "O elemento passa da borda da etiqueta: arraste este canto, ou use as setas, para diminuí-lo");
});

// Item 4.2 (mock-up A of two, 7 November 2026, taken under the owner's rule): the chosen element's handle takes the
// keyboard: Tab reaches it, a hint under it says what the keys do, and the arrow keys move its corner, Shift by 5 mm; a
// barcode and a text block go to their next size; the page does not scroll and the handle keeps the focus.
test("a label of one's own: an element resized from the keyboard, by the arrow keys on its handle", async ({ page }) => {
  await page.fill("#paste", "(01)09506000134376(10)B42");
  await page.getByRole("button", { name: "Fill in" }).click();
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
  await page.selectOption("#opt-logistic", "designer");
  await page.selectOption("#page-env", "distribution");
  const handle = page.getByTestId("resize-handle");
  // Chosen from the list with Enter, then back with Shift and Tab to its handle on the label, before the list
  await page.locator(".design-list button", { hasText: "QR code" }).press("Enter");
  for (let n = 0; n < 40 && !(await handle.evaluate((element) => element === document.activeElement)); n++) await page.keyboard.press("Shift+Tab");
  await expect(handle).toBeFocused();
  await expect(handle).toHaveAttribute("title", "Drag this corner, or press the arrow keys, to resize the element");
  expect(await handle.evaluate((element) => getComputedStyle(element, "::after").content)).toBe('"Arrow keys: resize · Shift: larger steps"');
  expect(await handle.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
  // The QR code to its next size and back; general distribution allows nothing under 100 %, so it stays there
  const scrolled = await page.evaluate(() => [window.scrollX, window.scrollY, document.querySelector(".canvas")!.scrollTop]);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#el-size")).toHaveValue("120");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#el-size")).toHaveValue("150");
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(page.locator("#el-size")).toHaveValue("120");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#el-size")).toHaveValue("100");
  await expect(handle).toBeFocused();
  expect(await page.evaluate(() => [window.scrollX, window.scrollY, document.querySelector(".canvas")!.scrollTop])).toEqual(scrolled);
  await expect(page.locator("#el-x")).toHaveValue("2");
  await expect(page.locator("#el-y")).toHaveValue("2");
  // A box, 40 × 20 mm: half a millimetre across, 5 mm down with Shift, half a millimetre up; Ctrl and an arrow do nothing
  await page.getByRole("button", { name: "+ Shape" }).click();
  await page.selectOption("#el-shape", "box");
  await page.fill("#el-x", "50");
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#el-width")).toHaveValue("41");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(page.locator("#el-height-mm")).toHaveValue("25");
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#el-height-mm")).toHaveValue("24.5");
  await page.keyboard.press("Control+ArrowUp");
  await expect(page.locator("#el-height-mm")).toHaveValue("24.5");
  await expect(page.locator(".design-list button[aria-pressed=true]")).toHaveText("◇ Box 41 × 24.5 mm");
  await expect(page.locator("#el-x")).toHaveValue("50");
  // Run past the right edge, at 70 mm to 111 mm, its handle held there in red; three times Shift and Left make it 26 mm
  // wide, within the label
  await page.fill("#el-x", "70");
  await expect(handle).toHaveClass(/past/);
  await expect(handle).toHaveAttribute("title", "The element runs past the label's edge: drag this corner, or press the arrow keys, to make it smaller");
  await handle.focus();
  for (let n = 0; n < 3; n++) await page.keyboard.press("Shift+ArrowLeft");
  await expect(page.locator("#el-width")).toHaveValue("26");
  await expect(handle).not.toHaveClass(/past/);
  await expect(handle).toBeFocused();
  // In the ZPL, a box 26 × 24.5 mm: 208 × 196 dots at 203 dpi
  await on(page, "export");
  const [zpl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ZPL (203 dpi)" }).click()]);
  expect(readFileSync((await zpl.path())!, "utf8")).toMatch(/\^GB208,196,/);
  await on(page, "label");
  // The text block: 3 mm to 3.5 mm, then down four heights and more, never under 2 mm
  await page.locator(".design-list button", { hasText: "“{01}”" }).press("Enter");
  await handle.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#el-height")).toHaveValue("3.5");
  for (let n = 0; n < 4; n++) await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#el-height")).toHaveValue("2");
  // In Portuguese, the hint and the title
  await on(page, "more");
  await page.selectOption("#language", "pt-BR");
  await on(page, "label");
  await expect(handle).toHaveAttribute("title", "Arraste este canto, ou use as setas, para redimensionar o elemento");
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#el-height")).toHaveValue("2.5");
  expect(await handle.evaluate((element) => getComputedStyle(element, "::after").content)).toBe('"Setas: redimensionam · Shift: passos maiores"');
});

// Rotation (backlog 4.2, mock-up A of two): a barcode and a text block turned from their properties, their box on the
// label turned with them, printed in ZPL with its field orientation and in EPL2 and TSPL with their rotation, and kept
// in the work; a QR code stays upright.
test("a label of one's own: a barcode and a text turned, printed in ZPL, EPL2, TSPL and DPL and kept in the work", async ({ page }) => {
  await page.fill("#paste", "(01)09506000134376(10)B42");
  await page.getByRole("button", { name: "Fill in" }).click();
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
  await page.selectOption("#opt-logistic", "designer");
  await page.fill("#page-height", "110");
  await page.selectOption("#page-env", "distribution");
  await page.locator(".design-list button").first().click();
  const rotation = page.getByRole("group", { name: "Rotation" });
  // A QR code reads in any direction: no rotation offered, and one turned before stands upright
  await page.selectOption("#el-symbol", "gs1-128");
  await rotation.getByRole("button", { name: "180°", exact: true }).click();
  await page.selectOption("#el-symbol", "dl-qrcode");
  await expect(rotation).toHaveCount(0);
  await expect(page.getByText("A QR code reads in any direction, so it stays upright.")).toBeVisible();
  await page.selectOption("#el-symbol", "gs1-128");
  await expect(rotation.getByRole("button", { name: "0°", exact: true })).toHaveAttribute("aria-pressed", "true");
  const box = async () => {
    const rect = page.locator(".design-overlay rect.selected");
    return [Number(await rect.getAttribute("width")), Number(await rect.getAttribute("height"))];
  };
  const [w, h] = await box();
  expect(w).toBeGreaterThan(h!);
  await rotation.getByRole("button", { name: "90°", exact: true }).click();
  await expect(rotation.getByRole("button", { name: "90°", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(box).toEqual([h, w]);
  await expect(page.locator("#el-x")).toHaveValue("2");
  // A text block read upwards
  await page.locator(".design-list button").nth(1).click();
  await page.fill("#el-text", "BATCH {10}");
  await page.fill("#el-x", "80");
  await rotation.getByRole("button", { name: "270°", exact: true }).click();
  await expect(page.locator(".design-problems")).toHaveCount(0);
  await on(page, "export");
  const [zpl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ZPL (203 dpi)" }).click()]);
  const file = readFileSync((await zpl.path())!, "utf8");
  expect(file).toMatch(/\^BCR,/);
  expect(file).toMatch(/\^A0B,\d+,\d+\^FB\d+,1,0,L\^FDBATCH B42\^FS/);
  // In EPL2 too, B and A with their rotation (1 a quarter, 3 three quarters)
  await page.locator("details.printer summary").click();
  await page.selectOption("#prn-profile", "epl2-203");
  const [epl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "EPL2 (203 dpi)" }).click()]);
  const eplFile = readFileSync((await epl.path())!, "utf8");
  expect(eplFile).toMatch(/^B\d+,\d+,1,1E,/m);
  expect(eplFile).toMatch(/^A\d+,\d+,3,\d,\d,\d,N,"BATCH B42"/m);
  // In TSPL, DMATRIX's r90 and TEXT's 270 (TSPL's GS1-128 carries an SSCC alone: the barcode becomes a GS1 DataMatrix,
  // still turned)
  await on(page, "label");
  await page.locator(".design-list button").first().click();
  await page.selectOption("#el-symbol", "gs1-datamatrix");
  await expect(rotation.getByRole("button", { name: "90°", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".design-problems")).toHaveCount(0);
  await on(page, "export");
  const printer = page.locator("details.printer");
  if ((await printer.getAttribute("open")) === null) await printer.locator("summary").click();
  await page.selectOption("#prn-profile", "tspl-203");
  const [tspl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "TSPL (203 dpi)" }).click()]);
  const tsplFile = readFileSync((await tspl.path())!, "utf8");
  expect(tsplFile).toMatch(/^DMATRIX \d+,\d+,\d+,\d+,c126,x\d+,r90,/m);
  expect(tsplFile).toMatch(/^TEXT \d+,\d+,"\d",270,\d+,\d+,"BATCH B42"\r$/m);
  // In DPL, each record with its rotation, 2 for 90° and 4 for 270° clockwise (DPL turns no Data Matrix in Labelize: the
  // barcode becomes an ITF-14, still turned)
  await on(page, "label");
  await page.locator(".design-list button").first().click();
  await page.selectOption("#el-symbol", "itf14");
  await page.getByRole("checkbox", { name: "(10)B42" }).uncheck(); // ITF-14 carries the GTIN alone
  await expect(rotation.getByRole("button", { name: "90°", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".design-problems")).toHaveCount(0);
  await on(page, "export");
  if ((await printer.getAttribute("open")) === null) await printer.locator("summary").click();
  await page.selectOption("#prn-profile", "dpl-203");
  const [dpl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "DPL (203 dpi)" }).click()]);
  const dplFile = readFileSync((await dpl.path())!, "latin1");
  expect(dplFile).toMatch(/\r2d\w\w\d{3}\d{8}09506000134376\r/);
  expect(dplFile).toMatch(/\r4[0-2](\w)\1(?:000)\d{8}BATCH B42\r/);
  // Kept in the work file and opened again
  await on(page, "more");
  const [saved] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save", exact: true }).click()]);
  const work = JSON.parse(readFileSync((await saved.path())!, "utf8")) as { page: { elements: { kind: string; rotation?: number }[] } };
  expect(work.page.elements.map((e) => e.rotation)).toEqual([90, 270]);
  await page.getByRole("button", { name: "Start over" }).click();
  await page.getByLabel("Open a saved work").setInputFiles((await saved.path())!);
  await on(page, "label");
  await page.locator(".design-list button").first().press("Enter");
  await expect(page.getByRole("group", { name: "Rotation" }).getByRole("button", { name: "90°", exact: true })).toHaveAttribute("aria-pressed", "true");
});

// The owner, 3 November 2026: a new element never lands exactly on another, so that the person sees it was made — a
// step of 5 mm right and down from one at its corner.
test("a label of one's own: each new element a step right and down from one already at its corner", async ({ page }) => {
  await on(page, "scan");
  await page.getByRole("button", { name: "Choose a symbol yourself" }).click();
  await on(page, "label");
  await page.selectOption("#opt-logistic", "designer");
  const corner = async () => [await page.locator("#el-x").inputValue(), await page.locator("#el-y").inputValue()];
  for (const expected of [["4", "4"], ["9", "9"], ["14", "14"]]) {
    await page.getByRole("button", { name: "+ Text" }).click();
    expect(await corner()).toEqual(expected);
  }
  // The QR code of the starting page is at (2, 2): a new barcode goes beside it
  await page.getByRole("button", { name: "+ Barcode" }).click();
  expect(await corner()).toEqual(["7", "7"]);
  // A shape's corner (4, 4) is taken by the first text, (9, 9) by the second, (14, 14) by the third
  await page.getByRole("button", { name: "+ Shape" }).click();
  expect(await corner()).toEqual(["19", "19"]);
  await expect(page.locator(".design-list button")).toHaveCount(7);
});
