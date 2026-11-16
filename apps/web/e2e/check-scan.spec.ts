import { expect, test, type Page } from "@playwright/test";

// The Check Studio's scanner in keyboard mode, NFC tags and EPCs (backlog 7.1 h; the check studio's project, sections
// 3.4 and 3.5, and item h's acceptance). A scanner is played by keystrokes a few milliseconds apart ended by Enter, its
// group separator as Ctrl+]; a phone's Web NFC by a stand-in NDEFReader; an RFID reader by an EPC pasted or typed.

const studio = (page: Page) => page.getByRole("main", { name: "Check Studio" });
const way = (page: Page, name: string) => studio(page).getByRole("button", { name, exact: true });

/** A scanner in keyboard mode: each character 5 ms apart, "|" standing for its group separator (Ctrl+]), then Enter. */
async function scan(page: Page, text: string) {
  for (const part of text.split(/(\|)/)) {
    if (part === "|") await page.keyboard.press("Control+BracketRight");
    else if (part) await page.keyboard.type(part, { delay: 5 });
  }
  await page.keyboard.press("Enter");
}

test("a scan with ]d2 and a separator is checked as the camera's reading of the same symbol, marked as a scanner's", async ({ page }) => {
  await page.goto("/#/check");
  await way(page, "Type or paste").click();
  await studio(page).getByRole("textbox").focus();
  await scan(page, "]d2010950600013435210ABC123|17271231");
  await expect(studio(page).getByText("Read from a scanner in keyboard mode.")).toBeVisible();
  await expect(studio(page).locator(".verdict")).toHaveAttribute("data-verdict", "follows");
  await expect(studio(page).locator(".says")).toContainText("BATCH/LOT");
  // The Enter ends the scan: no line break is left in the field
  await expect(studio(page).getByRole("textbox")).not.toHaveValue(/\n/);
  await studio(page).getByRole("radio", { name: "Expert" }).click();
  await expect(studio(page).locator(".expert .pairs").first()).toContainText("A scanner in keyboard mode");
});

test("a scan without its identifier asks for the symbol and says how to switch AIM ID on", async ({ page }) => {
  await page.goto("/#/check");
  await way(page, "Type or paste").click();
  await studio(page).getByRole("textbox").focus();
  await scan(page, "0109506000134352");
  await expect(studio(page).locator(".scanner-help")).toContainText("“AIM ID”");
  await studio(page).getByLabel("The symbol it came from").selectOption("]d2");
  await expect(studio(page).locator(".scanner-help")).toHaveCount(0);
  // Typed or pasted by hand, data is not a scanner's
  await studio(page).getByRole("textbox").fill("0195012345678903");
  await expect(studio(page).getByText("Read from a scanner in keyboard mode.")).toHaveCount(0);
});

test("Ctrl+] typed by hand puts a group separator where the cursor is", async ({ page }) => {
  await page.goto("/#/check");
  await way(page, "Type or paste").click();
  const field = studio(page).getByRole("textbox");
  await field.fill("]d2010950600013435210ABC123");
  await field.press("Control+BracketRight");
  await field.pressSequentially("17271231", { delay: 80 });
  await expect(field).toHaveValue("]d2010950600013435210ABC123\u001d17271231");
  await expect(studio(page).locator(".verdict")).toHaveAttribute("data-verdict", "follows");
});

test("a lost separator is told as the code's or the scanner's, with the scanner's set-up", async ({ page }) => {
  await page.goto("/#/check");
  await way(page, "Type or paste").click();
  await studio(page).getByRole("textbox").focus();
  await scan(page, "]d2010950600013435210ABC12317271231");
  const card = studio(page).locator('.finding[data-code="B3"]');
  await expect(card).toContainText("Either the code lacks a separator after a value whose length varies, or your scanner removes it.");
  await expect(card.locator(".scanner-help")).toContainText("Many scanners drop the separator in keyboard mode.");
});

test("a scan typed on another keyboard layout is offered as the scanner meant it", async ({ page }) => {
  await page.goto("/#/check");
  await way(page, "Type or paste").click();
  await studio(page).getByRole("textbox").fill("+d201095060001343521727123110ABC123");
  const help = studio(page).locator(".scanner-help").filter({ hasText: "another keyboard layout" });
  await expect(help).toContainText("QWERTZ (Germany, Austria), QWERTY (Spain), QWERTY (Italy)");
  await help.getByRole("button", { name: "Use this" }).click();
  await expect(studio(page).getByRole("textbox")).toHaveValue("]d201095060001343521727123110ABC123");
  await expect(studio(page).locator(".verdict")).toHaveAttribute("data-verdict", "follows");
});

test("an NFC tag held to the phone: its records listed, a link not first is fault I3", async ({ page }) => {
  await page.addInitScript(() => {
    const view = (s: string) => new DataView(new TextEncoder().encode(s).buffer);
    (window as unknown as { NDEFReader: unknown }).NDEFReader = class extends EventTarget {
      async write() {}
      async scan() {
        setTimeout(() => {
          const records = [
            { recordType: "text", data: view("Scan me"), lang: "en", encoding: "utf-8" },
            { recordType: "url", data: view("https://id.gs1.org/01/09506000134352/10/ABC123") },
          ];
          this.dispatchEvent(Object.assign(new Event("reading"), { message: { records }, serialNumber: "04:a2:3b:91" }));
        }, 20);
      }
    };
  });
  await page.goto("/#/check");
  await way(page, "Tag").click();
  await studio(page).getByRole("button", { name: "Read an NFC tag" }).click();
  const list = studio(page).locator(".tag-records");
  await expect(list).toContainText("The tag holds 2 records:");
  await expect(list.locator("li")).toHaveText(["Text Scan me", "Link (URI) https://id.gs1.org/01/09506000134352/10/ABC123"]);
  await expect(studio(page).locator('.finding[data-code="I3"]')).toBeVisible();
  await expect(studio(page).locator(".says")).toContainText("BATCH/LOT");
  await studio(page).getByRole("radio", { name: "Expert" }).click();
  await expect(studio(page).locator(".expert .pairs").first()).toContainText("NFC tag");
});

test("without Web NFC the screen says what works instead, shows no dead button, and opens an .ndef file", async ({ page }) => {
  await page.addInitScript(() => delete (window as unknown as { NDEFReader?: unknown }).NDEFReader);
  await page.goto("/#/check");
  await way(page, "Tag").click();
  await expect(studio(page).locator(".tag-absent")).toContainText("only Chrome on Android can");
  await expect(studio(page).getByRole("button", { name: "Read an NFC tag" })).toHaveCount(0);
  // An NDEF message of one URI record, as an NFC app saves it: https:// abbreviated as code 4
  const rest = "id.gs1.org/01/09506000134352";
  const ndef = Buffer.from([0xd1, 0x01, 1 + rest.length, 0x55, 0x04, ...Buffer.from(rest)]);
  await studio(page).getByLabel("An .ndef file").setInputFiles({ name: "tag.ndef", mimeType: "application/octet-stream", buffer: ndef });
  await expect(studio(page).locator(".tag-records li")).toHaveText(["Link (URI) https://id.gs1.org/01/09506000134352"]);
  await expect(studio(page).locator(".verdict")).toHaveAttribute("data-verdict", "follows");
});

test("a pasted SGTIN-96 shows its GTIN and serial, and its GS1 Digital Link URI in the expert view", async ({ page }) => {
  await page.goto("/#/check");
  await way(page, "Tag").click();
  await studio(page).getByLabel(/Paste the EPC/).fill("3034257BF7194E4000001A85");
  const says = studio(page).locator(".says");
  await expect(says).toContainText("80614141123458");
  await expect(says).toContainText("6789");
  await studio(page).getByRole("radio", { name: "Expert" }).click();
  await expect(studio(page).locator(".expert")).toContainText("https://id.gs1.org/01/80614141123458/21/6789");
});
