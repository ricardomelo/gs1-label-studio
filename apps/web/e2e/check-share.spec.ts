import { expect, test, type Page } from "@playwright/test";

// Sharing (backlog 7.1 l; the check studio's project, section 7.4, and item l's acceptance): with a share sheet the
// PDF and the text are offered together; without one, a menu of WhatsApp, e-mail, copy and download, each with the
// stated text; a shared check link, opened elsewhere, shows the same result; a shared work link opens the same label;
// a share that includes a serial asks once. The share sheet, the clipboard and window.open are fakes kept on the page.

const studio = (page: Page) => page.getByRole("main", { name: "Check Studio" });
const result = (page: Page) => studio(page).locator(".check-result");

interface Kept {
  shared: { title: string; text: string; files: { name: string; type: string; size: number }[] }[];
  copied: string[];
  opened: string[];
}

/** The page's share sheet (or none), clipboard and window.open replaced by fakes that keep what they are given. */
async function fakes(page: Page, sheet: boolean) {
  await page.addInitScript((withSheet) => {
    const kept = { shared: [] as unknown[], copied: [] as string[], opened: [] as string[] };
    (window as unknown as { kept: typeof kept }).kept = kept;
    delete (Navigator.prototype as { share?: unknown }).share;
    delete (Navigator.prototype as { canShare?: unknown }).canShare;
    if (withSheet) {
      Object.defineProperty(navigator, "canShare", { value: () => true });
      Object.defineProperty(navigator, "share", {
        value: async (data: ShareData) => {
          kept.shared.push({ title: data.title, text: data.text, files: (data.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size })) });
        },
      });
    }
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text: string) => void kept.copied.push(text) } });
    window.open = (url?: string | URL) => {
      kept.opened.push(String(url));
      return null;
    };
  }, sheet);
}
const kept = (page: Page) => page.evaluate(() => (window as unknown as { kept: Kept }).kept);

/** Opens the Check Studio with a code typed: a plain Data Matrix carrying GS1 data, so with a fault. */
async function checked(page: Page, data = "0109506000134352172712311" + "0ABC123") {
  await page.goto(`/#/check?s=]d1&d=${encodeURIComponent(data)}`);
  await expect(result(page).locator(".verdict")).toBeVisible();
}

test("without a share sheet: the menu sends the text and the link to WhatsApp, copies them and downloads the PDF", async ({ page }) => {
  await fakes(page, false);
  await checked(page);
  await result(page).getByRole("button", { name: "Share…" }).click();
  const menu = result(page).getByRole("menu", { name: "Share…" });
  await expect(menu.getByRole("menuitem")).toHaveText([/^WhatsApp/, /^E-mail/, /^Copy the text/, /^Copy the link/, /^Download check-report\.pdf/]);
  await menu.getByRole("menuitem", { name: /^WhatsApp/ }).click();
  await expect(menu).toBeHidden();
  const address = new URL((await kept(page)).opened[0]!);
  expect(address.host).toBe("wa.me");
  const text = address.searchParams.get("text")!;
  expect(text).toMatch(/^Does not follow the GS1 rules\./);
  expect(text).toContain("Checked with GS1 Label Studio.");
  expect(text).toMatch(/\n\nhttp:\/\/localhost:4173\/#\/check\?r=[A-Za-z0-9_-]+$/);

  await result(page).getByRole("button", { name: "Share…" }).click();
  await menu.getByRole("menuitem", { name: /^Copy the text/ }).click();
  await expect(result(page).locator(".share-done")).toHaveText("Text copied");
  expect((await kept(page)).copied[0]).toBe(text);

  await result(page).getByRole("button", { name: "Share…" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), menu.getByRole("menuitem", { name: /^Download/ }).click()]);
  expect(download.suggestedFilename()).toBe("check-report.pdf");

  // Escape closes the menu and gives the focus back to the button
  await result(page).getByRole("button", { name: "Share…" }).click();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(result(page).getByRole("button", { name: "Share…" })).toBeFocused();
});

test("with a share sheet: the PDF and the text go together; the link, opened elsewhere, shows the same result", async ({ page, browser }) => {
  await fakes(page, true);
  await checked(page);
  const verdict = await result(page).locator(".verdict").textContent();
  const codes = await result(page).locator(".finding").evaluateAll((list) => list.map((f) => f.getAttribute("data-code")));
  expect(codes.length).toBeGreaterThan(0);
  await result(page).getByRole("button", { name: "Share…" }).click();
  await expect.poll(async () => (await kept(page)).shared.length).toBe(1);
  const [shared] = (await kept(page)).shared;
  expect(shared!.files).toEqual([expect.objectContaining({ name: "check-report.pdf", type: "application/pdf" })]);
  expect(shared!.files[0]!.size).toBeGreaterThan(1000);
  expect(shared!.title).toMatch(/^Check report: /);
  const link = /http:\/\/localhost:4173\/#\/check\?r=[A-Za-z0-9_-]+$/.exec(shared!.text)![0];
  expect(link.length).toBeLessThanOrEqual(2000);
  await expect(result(page).getByRole("menu")).toHaveCount(0);

  // Another device: a browser of its own, with nothing kept
  const other = await (await browser.newContext()).newPage();
  await other.goto(link);
  await expect(result(other).locator(".verdict")).toHaveText(verdict!);
  expect(await result(other).locator(".finding").evaluateAll((list) => list.map((f) => f.getAttribute("data-code")))).toEqual(codes);
  await other.context().close();
});

test("a link cut on its way is refused with a message", async ({ page }) => {
  await page.goto("/#/check?r=AAAA");
  await expect(studio(page).getByRole("alert")).toHaveText("This link is incomplete: ask for it again, or copy all of it.");
});

test("a share that includes a serial number asks once a visit", async ({ page }) => {
  await fakes(page, true);
  await checked(page, "010950600013435221SN1");
  const share = result(page).getByRole("button", { name: "Share…" });
  await share.click();
  const ask = result(page).getByRole("alertdialog", { name: "Personal data" });
  await expect(ask).toContainText("This includes a serial number or a person's number. Share it anyway?");
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(ask).toBeHidden();
  expect((await kept(page)).shared).toHaveLength(0);
  await share.click();
  await ask.getByRole("button", { name: "Yes, share" }).click();
  await expect.poll(async () => (await kept(page)).shared.length).toBe(1);
  await share.click();
  await expect.poll(async () => (await kept(page)).shared.length).toBe(2);
  await expect(ask).toBeHidden();
});

test("the editor's Share sends the PNG and a link that opens the same work", async ({ page, browser }) => {
  await fakes(page, true);
  await page.goto("/#/label");
  await expect(page.locator(".preview .symbol svg")).toBeAttached();
  // Data of its own, so that the link cannot open a new browser's example by chance
  const bar = page.locator("nav.tabs");
  if (await bar.isVisible()) await bar.locator("button").nth(0).click();
  await page.fill("#paste", "(01)09506000134352(17)281130(10)SHARED7");
  await page.getByRole("button", { name: "Fill in" }).click();
  if (await bar.isVisible()) await bar.locator("button").nth(3).click();
  await page.locator(".exportbar").getByRole("button", { name: "Share…" }).click();
  await expect.poll(async () => (await kept(page)).shared.length).toBe(1);
  const [shared] = (await kept(page)).shared;
  expect(shared!.files).toEqual([expect.objectContaining({ type: "image/png" })]);
  expect(shared!.files[0]!.name).toMatch(/\.png$/);
  expect(shared!.text).toContain("Made with GS1 Label Studio.");
  expect(shared!.text).toContain("GS1 Digital Link URI: https://");
  const link = /http:\/\/localhost:4173\/#\/label\?w=[A-Za-z0-9_-]+$/.exec(shared!.text)![0];
  const elementString = /^Element string: (.+)$/m.exec(shared!.text)![1]!;
  expect(elementString).toContain("(10)SHARED7");
  await expect(page.locator(".es code")).toHaveText(elementString);

  const other = await (await browser.newContext()).newPage();
  await other.goto(link);
  await expect(other.locator(".preview .symbol svg")).toBeAttached();
  await expect(other.locator(".work-note")).toContainText("Opened the work the link carries.");
  await expect(other.locator(".es code")).toHaveText(elementString);
  await other.context().close();
});
