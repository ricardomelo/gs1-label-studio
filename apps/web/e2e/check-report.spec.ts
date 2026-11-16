import { inflateSync } from "node:zlib";
import { expect, test, type Download, type Page } from "@playwright/test";

// The Check Studio's reports and files (backlog 7.1 k; the check studio's project, sections 7.2 and 7.3, and item k's
// acceptance): the one-reading report in two pages at most, the item's report from a group, the history's exports of
// what is listed (the session report, readings.csv with one row per listed reading, findings.csv, readings.json) and a
// readings file opened again giving the same readings; an export with personal data asks once.

const studio = (page: Page) => page.getByRole("main", { name: "Check Studio" });
const history = (page: Page) => studio(page).locator(".check-history");
const items = (page: Page) => history(page).locator(".history-list li");

/** Types a code as a scanner in keyboard mode would: checked and kept at once. */
async function scan(page: Page, text: string) {
  await studio(page).getByRole("button", { name: "Type or paste", exact: true }).click();
  const field = studio(page).getByRole("textbox", { name: /Paste or type it/ });
  await field.fill("");
  await field.focus();
  await page.keyboard.type(text, { delay: 5 });
  await page.keyboard.press("Enter");
}

/** The file a press downloads, its name and its bytes. */
async function downloaded(page: Page, press: () => Promise<void>): Promise<{ name: string; bytes: Buffer }> {
  const [download] = await Promise.all([page.waitForEvent("download"), press()]) as [Download, void];
  const path = await download.path();
  const { readFileSync } = await import("node:fs");
  return { name: download.suggestedFilename(), bytes: readFileSync(path) };
}

/** A PDF's page count and the text of its content streams (strings in parentheses, octal escapes as Latin-1). */
function pdfOf(bytes: Buffer): { pages: number; text: string } {
  const raw = bytes.toString("latin1");
  const pages = Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(raw)![1]);
  let text = "";
  for (const m of raw.matchAll(/stream\n([\s\S]*?)\nendstream/g)) {
    const content = inflateSync(Buffer.from(m[1]!, "latin1")).toString("latin1");
    for (const s of content.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)) {
      text += s[1]!.replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8))).replace(/\\(.)/g, "$1") + "\n";
    }
  }
  return { pages, text };
}

test("one reading's report: its verdict, faults and print quality sentence, in two pages at most", async ({ page }) => {
  await page.goto("/#/check");
  await scan(page, "]d10109506000134352172713001" + "0ABC123");
  await expect(studio(page).locator(".check-result .verdict")).toHaveAttribute("data-verdict", "does-not-follow");
  const file = await downloaded(page, () => studio(page).getByRole("button", { name: "Report (PDF)", exact: true }).click());
  expect(file.name).toBe("check-report.pdf");
  const { pages, text } = pdfOf(file.bytes);
  expect(pages).toBeLessThanOrEqual(2);
  expect(text).toContain("Does not follow the GS1 rules");
  expect(text).toContain("Print quality: a phone or a page cannot grade it");
  expect(text).toContain("For experts");
});

test("the history exports what is listed: readings.csv has one row per listed reading; the session report counts the same", async ({ page }) => {
  await page.goto("/#/check");
  await scan(page, "]d20109506000134352");
  await expect(items(page)).toHaveCount(1);
  await scan(page, "]d10109506000134352");
  await expect(items(page)).toHaveCount(2);
  await history(page).getByRole("button", { name: "This item has no barcode" }).click();
  await expect(items(page)).toHaveCount(3);
  const exports = history(page).getByRole("group", { name: "Export what is listed" });
  const csv = await downloaded(page, () => exports.getByRole("button", { name: "Readings (CSV)" }).click());
  expect(csv.name).toBe("readings.csv");
  expect(csv.bytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf])); // the byte order mark
  expect(csv.bytes.toString("utf8").trim().split("\r\n")).toHaveLength(4);
  // Filtered by verdict: only what the list shows
  await history(page).getByLabel("Verdict").selectOption("does-not-follow");
  await expect(items(page)).toHaveCount(1);
  const filtered = await downloaded(page, () => exports.getByRole("button", { name: "Readings (CSV)" }).click());
  expect(filtered.bytes.toString("utf8").trim().split("\r\n")).toHaveLength(2);
  await history(page).getByLabel("Verdict").selectOption("");
  const report = await downloaded(page, () => exports.getByRole("button", { name: "Session report (PDF)" }).click());
  expect(report.name).toBe("session-report.pdf");
  const { text } = pdfOf(report.bytes);
  expect(text).toContain("Session report: All readings");
  expect(text).toMatch(/Follows the GS1 rules\n1\n/);
  expect(text).toMatch(/Does not follow the GS1 rules\n1\n/);
  expect(text).toMatch(/No barcode\n1\n/);
  const findings = await downloaded(page, () => exports.getByRole("button", { name: "Findings (CSV)" }).click());
  expect(findings.bytes.toString("utf8")).toContain("Reading,Code,Severity,AI,Position,Rule,Sections,Engine message");
});

test("readings.json opened again gives the same readings; an export with a serial number asks once", async ({ page }) => {
  await page.goto("/#/check");
  await scan(page, "]d201095060001343522112345");
  await expect(items(page)).toHaveCount(1);
  await scan(page, "]C10109506000134352");
  await expect(items(page)).toHaveCount(2);
  const exports = history(page).getByRole("group", { name: "Export what is listed" });
  await exports.getByRole("button", { name: "All the data (JSON)" }).click();
  await expect(exports.getByRole("alert")).toContainText("carry a serial number");
  const json = await downloaded(page, () => exports.getByRole("button", { name: "Yes, export" }).click());
  expect(json.name).toBe("readings.json");
  expect(JSON.parse(json.bytes.toString("utf8")).readings).toHaveLength(2);
  // Asked once: the next export goes at once
  await downloaded(page, () => exports.getByRole("button", { name: "Readings (CSV)" }).click());
  const before = await items(page).evaluateAll((li) => li.map((l) => l.textContent));
  await history(page).getByRole("button", { name: "Delete all" }).click();
  await history(page).getByRole("button", { name: "Yes, delete all" }).click();
  await expect(items(page)).toHaveCount(0);
  await history(page).locator('input[type="file"]').setInputFiles({ name: "readings.json", mimeType: "application/json", buffer: json.bytes });
  await expect(exports.getByRole("status")).toContainText("2 readings opened from the file.");
  await expect(items(page)).toHaveCount(2);
  expect(await items(page).evaluateAll((li) => li.map((l) => l.textContent))).toEqual(before);
  // A file that is not one says so
  await history(page).locator('input[type="file"]').setInputFiles({ name: "other.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await expect(exports.getByRole("status")).toContainText("This is not a readings file of GS1 Label Studio.");
});

test("an item's report: the matrix of the codes compared", async ({ page }) => {
  await page.goto("/#/check");
  await studio(page).getByRole("button", { name: "Type or paste", exact: true }).click();
  await studio(page).getByRole("textbox", { name: /Paste or type it/ }).fill("]d20109506000134352");
  await studio(page).getByRole("button", { name: "Add another code from this item" }).click();
  await studio(page).getByRole("textbox", { name: /Paste or type it/ }).focus();
  await page.keyboard.type("]E09506000134369", { delay: 5 });
  await page.keyboard.press("Enter");
  const group = studio(page).locator(".check-group");
  await expect(group.locator(".group-members li")).toHaveCount(2);
  const file = await downloaded(page, () => group.getByRole("button", { name: "Item report (PDF)" }).click());
  expect(file.name).toBe("item-report.pdf");
  const { text } = pdfOf(file.bytes);
  expect(text).toContain("Item report: A consumer pack");
  expect(text).toContain("09506000134352");
  expect(text).toContain("09506000134369");
  expect(text).toContain("J1");
});
