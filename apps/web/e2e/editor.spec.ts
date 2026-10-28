import { execFileSync } from "node:child_process";
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

test("the label downloads as SVG, PNG, PDF and zip, named after the key", async ({ page }) => {
  const name = "dl-qrcode_01_09506000134376_10_B42";
  const files: [RegExp, string, number[]][] = [
    [/^Download SVG$/, `${name}.svg`, [0x3c, 0x3f, 0x78, 0x6d, 0x6c]], // <?xml
    [/^PNG \(616 dpi\)$/, `${name}.png`, [0x89, 0x50, 0x4e, 0x47]],
    [/^PDF$/, `${name}.pdf`, [0x25, 0x50, 0x44, 0x46]], // %PDF
    [/^Zip: /, `${name}.zip`, [0x50, 0x4b, 0x03, 0x04]],
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
        .toEqual([`${name}.svg`, `${name}.png`, `${name}.pdf`, "README.txt"]);
    }
  }
});
