import { expect, test, type Page } from "@playwright/test";

// The start page and the studios' addresses (backlog 7.1 e; the check studio's project, section 8.3 and item e's
// acceptance): an old bookmark of the root reaches the editor in one tap, back and forward move between studios, what
// was typed survives a visit to another studio, and the start page works with the keyboard, each studio named.

const studios = (page: Page) => page.getByRole("main", { name: "Choose a studio" });

test("the root offers the four studios, each named and a link; one tap reaches the editor", async ({ page }) => {
  await page.goto("/");
  const start = studios(page);
  await expect(start.getByRole("listitem")).toHaveCount(4);
  await expect(start.getByRole("link")).toHaveCount(4);
  await expect(start.getByRole("link", { name: /^Label Studio/ })).toHaveAttribute("href", "#/label");
  await expect(start.getByRole("link", { name: /^Barcode Studio/ })).toHaveAttribute("href", "#/barcode");
  await expect(start.getByRole("link", { name: /^Check Studio/ })).toHaveAttribute("href", "#/check");
  await expect(start.getByRole("link", { name: /^RFID Studio/ })).toHaveAttribute("href", "#/rfid");
  await expect(start).not.toContainText("Coming soon");
  // The editor's controls are not shown beside the start page
  await expect(page.locator("#paste")).toBeHidden();
  await start.getByRole("link", { name: /^Label Studio/ }).click();
  await expect(page).toHaveURL(/#\/label$/);
  await expect(studios(page)).toHaveCount(0);
  await expect(page.locator(".preview .symbol svg")).toBeAttached();
  // Coming from the start page, the Label Studio shows the kinds of label; the Barcode Studio, the barcode alone
  await expect(page.locator(".segments")).toBeAttached();
  await page.getByRole("link", { name: "GS1 Label Studio" }).click();
  await studios(page).getByRole("link", { name: /^Barcode Studio/ }).click();
  await expect(page.locator(".segments")).toHaveCount(0);
});

test("the keyboard reaches each studio, and Enter opens it", async ({ page }) => {
  await page.goto("/#/");
  const barcode = studios(page).getByRole("link", { name: /^Barcode Studio/ });
  for (let i = 0; i < 12 && !(await barcode.evaluate((a) => a === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(barcode).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/barcode$/);
  // The Barcode Studio: the barcode alone
  await expect(page.locator("#opt-label [role=radio]").first()).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".segments")).toHaveCount(0);
});

test("back and forward move between studios, and what was typed survives the visit", async ({ page }) => {
  await page.goto("/#/label");
  await page.fill("#paste", "(01)09506000134352(10)LOT42");
  await page.getByRole("link", { name: "GS1 Label Studio" }).click();
  await expect(studios(page)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/label$/);
  await expect(page.locator("#paste")).toHaveValue("(01)09506000134352(10)LOT42");
  await page.goForward();
  await expect(studios(page)).toBeVisible();
  await studios(page).getByRole("link", { name: /^Barcode Studio/ }).click();
  await expect(page.locator("#paste")).toHaveValue("(01)09506000134352(10)LOT42");
});

test("the installed application offers each studio as a shortcut", async ({ page, baseURL }) => {
  const manifest = await (await page.request.get(`${baseURL}/manifest.webmanifest`)).json();
  expect(manifest.shortcuts.map((s: { name: string; url: string }) => [s.name, s.url])).toEqual([
    ["Label Studio", "./#/label"],
    ["Barcode Studio", "./#/barcode"],
    ["RFID Studio", "./#/rfid"],
    ["Check Studio", "./#/check"],
  ]);
});
