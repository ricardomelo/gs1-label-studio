import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// The RFID Studio (backlog 6.12 a to c, ADR 0008): the editor's step 1, then the encoding, the tag's memory word by
// word and writing: the bank's words, the control bits changing the StoredPC and its CRC, ZPL for an RFID printer
// alone and joined to the label, and the editor's card sharing the same choices.

/** On a phone, the destination's tab: Data, Encoding, Tag or Write (the RFID Studio's names); elsewhere nothing. */
async function show(page: Page, name: string) {
  const tab = page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name });
  if (await tab.isVisible()) await tab.click();
}

test("step 1's data, encoded, laid out in the tag's memory and written by an RFID printer", async ({ page }) => {
  await page.goto("/#/rfid");
  await show(page, "Encoding");
  await expect(page.getByRole("heading", { name: "How is it encoded?" })).toBeVisible();
  // the label's own steps and the mode are not there
  await expect(page.locator("#scan-title")).toHaveCount(0);
  await expect(page.locator(".mode")).toBeHidden();
  await show(page, "Data");
  await page.fill("#paste", "(01)09506000134376(21)6789");
  await page.press("#paste", "Enter");
  await show(page, "Encoding");
  await page.selectOption("#rfid-prefix", "7");
  await show(page, "Tag");
  const words = page.getByRole("list", { name: "The EPC memory bank, word by word" }).getByRole("listitem");
  await expect(words).toHaveCount(8); // CRC, PC and an SGTIN-96's six words
  await expect(words.nth(1)).toContainText("3000");
  const crc = await words.nth(0).locator("code").textContent();
  // the hazardous material bit: the PC's last byte, and the CRC that follows it
  await page.getByLabel("Hazardous material (attribute bit, Gen2 version 1 tags)").check();
  await expect(words.nth(1)).toContainText("3001");
  await expect(words.nth(0).locator("code")).not.toHaveText(crc!);
  await expect(page.locator(".rfid-tag")).toContainText(/urn:epc:tag:\[att=x01\]:sgtin-96:1\.9506000\.013437\.6789/);
  await show(page, "Write");
  // ZPL from bit 10h: the PC and the EPC, 14 bytes
  await expect(page.locator("pre.zpl-rfid")).toHaveText(/\^RS8\n\^RFW,H,1,14,1\^FD3001[0-9A-F]{24}\^FS/);
  const alone = page.waitForEvent("download");
  await page.getByRole("button", { name: "The tag and its EPC in text (.zpl)" }).click();
  const file = readFileSync((await (await alone).path())!, "utf8");
  expect(file).toMatch(/^\^XA\n\^RS8\n\^RFW,H,1,14,1\^FD3001/);
  expect(file).toContain("urn:epc:id:sgtin:9506000.013437.6789");
  const joined = page.waitForEvent("download");
  await page.getByRole("button", { name: "The tag with the Label Studio's label (.zpl)" }).click();
  const label = readFileSync((await (await joined).path())!, "utf8");
  expect(label).toMatch(/\^XA\n\^RS8\n\^RFW,H,1,14,1\^FD3001/);
  expect(label).toMatch(/\^FO\d+,\d+\^B[QX]/); // the label's own symbol still printed
  // from bit 20h: the EPC alone, the printer setting the PC
  await page.getByRole("radio", { name: /From bit 20h/ }).click();
  await expect(page.locator("pre.zpl-rfid")).toHaveText(/\^RFW,H,,,A\^FD30[0-9A-F]{22}\^FS/);
});

test("the editor's card and the RFID Studio share the scheme chosen", async ({ page }) => {
  await page.goto("/#/rfid");
  await page.fill("#paste", "(01)09506000134376(21)6789");
  await page.press("#paste", "Enter");
  await show(page, "Encoding");
  await page.locator("#rfid-form").getByRole("radio", { name: /EPC\+$/ }).click();
  await show(page, "Tag");
  await expect(page.locator(".rfid-tag")).toContainText("SGTIN+");
  await page.goto("/#/label");
  await show(page, "More");
  await expect(page.locator("details.epc")).toContainText("SGTIN+");
  await page.locator("details.epc").getByRole("link", { name: "Open in the RFID Studio" }).click();
  await expect(page).toHaveURL(/#\/rfid$/);
});

test("what a reader returned, pasted in step 4, compared with the tag meant", async ({ page }) => {
  await page.goto("/#/rfid");
  await page.fill("#paste", "(01)09506000134376(21)1001");
  await page.press("#paste", "Enter");
  await show(page, "Encoding");
  await page.selectOption("#rfid-prefix", "7");
  await show(page, "Write");
  const read = page.locator("#rfid-read");
  const box = page.locator(".read-back");
  // the EPC alone, as most readers report it
  await read.fill("3036 4433 400D 1F40 0000 03E9");
  await expect(box.getByRole("status")).toHaveText("✓ The tag holds what was meant (the EPC alone).");
  // the whole bank, CRC first: B7E6 is the CRC Python's binascii gives for 3000 and this EPC
  await read.fill("B7E6300030364433400D1F40000003E9");
  await expect(box.getByRole("status")).toContainText("the whole bank, CRC first");
  // the hazardous material bit meant but not written
  await show(page, "Tag");
  await page.getByLabel("Hazardous material (attribute bit, Gen2 version 1 tags)").check();
  await show(page, "Write");
  await expect(box.getByRole("alert")).toContainText("The attribute bits differ");
  // another serial number, and text that is no EPC
  await read.fill("30364433400D1F40000003EA");
  await expect(box.getByRole("alert")).toContainText("The EPC read is not the one meant");
  await read.fill("hello");
  await expect(box).toContainText("Not an EPC or an EPC bank");
});
