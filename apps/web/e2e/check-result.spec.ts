import { expect, test, type Page } from "@playwright/test";

// The Check Studio's result (backlog 7.1 f; the check studio's project, section 6 and item f's acceptance): the
// project's worked example gives its verdict and three cards in order with the positions highlighted, the expert view
// its panels with copy buttons; the place re-runs the checks without re-reading; Make it right opens the Barcode
// Studio with the data made right; the texts follow the interface's language.

const studio = (page: Page) => page.getByRole("main", { name: "Check Studio" });
const data = (page: Page) => studio(page).getByRole("textbox", { name: /Paste or type it/ });
/** The studio with its text field: on a touch screen it opens on the camera (7.1 g), so Type or paste is chosen. */
async function openTyped(page: Page) {
  await page.goto("/#/check");
  await studio(page).getByRole("button", { name: "Type or paste" }).click();
}

test("the worked example: the verdict, three cards in order, the positions highlighted, then the expert panels", async ({ page }) => {
  await openTyped(page);
  await studio(page).getByRole("button", { name: "Try an example" }).click();
  const verdict = studio(page).locator(".verdict");
  await expect(verdict).toHaveAttribute("data-verdict", "does-not-follow");
  await expect(verdict).toContainText("Does not follow the GS1 rules");
  await expect(verdict.locator(".verdict-icon")).toHaveText("✕");
  const cards = studio(page).locator(".finding");
  await expect(cards).toHaveCount(3);
  expect(await cards.evaluateAll((li) => li.map((l) => l.getAttribute("data-code")))).toEqual(["A1", "B1", "D1"]);
  await expect(cards.nth(0)).toContainText("This is an ordinary Data Matrix, not a GS1 DataMatrix.");
  // B1 marks the six brackets; D1 the month 13
  expect(await cards.nth(1).locator("mark").allTextContents()).toEqual(["(", ")", "(", ")", "(", ")"]);
  expect(await cards.nth(2).locator("mark").allTextContents()).toEqual(["13"]);
  await expect(studio(page).locator(".says")).toContainText("BATCH/LOT");

  await studio(page).getByRole("radio", { name: "Expert" }).click();
  const expert = studio(page).locator(".expert");
  for (const panel of ["Reading", "Raw data", "Element strings", "Findings", "Context", "Versions"]) {
    await expect(expert.getByRole("heading", { name: panel, exact: true })).toBeVisible();
  }
  await expect(expert.locator(".bytes .hit").first()).toHaveText("28");
  await expect(expert).toContainText("AI (17): The date contains an illegal month of the year.");
  for (const name of ["Copy as hex", "Copy as text with {GS}", "Copy as an escaped string"]) {
    await expect(expert.getByRole("button", { name })).toBeVisible();
  }
});

test("choosing where the code is scanned re-runs the checks on the same data", async ({ page }) => {
  await openTyped(page);
  await data(page).fill("]d201095060001343521727123110ABC123");
  const verdict = studio(page).locator(".verdict");
  await expect(verdict).toHaveAttribute("data-verdict", "follows");
  // Not given: whether the symbol suits its place is listed as not checked
  await expect(studio(page).locator(".unchecked")).toContainText("that needs the place");
  await studio(page).getByRole("button", { name: "A product sold in a shop" }).click();
  await expect(verdict).toHaveAttribute("data-verdict", "remarks");
  await expect(studio(page).locator(".finding")).toHaveAttribute("data-code", "F3");
  await studio(page).getByRole("button", { name: "A case or outer box" }).click();
  await expect(verdict).toHaveAttribute("data-verdict", "follows");
  await expect(data(page)).toHaveValue("]d201095060001343521727123110ABC123");
});

test("Make it right opens the Barcode Studio with the data made right", async ({ page }) => {
  await openTyped(page);
  await data(page).fill("]d2(01)09506000134352(17)271231(10)ABC123");
  const card = studio(page).locator('.finding[data-code="B1"]');
  await card.getByRole("button", { name: "Make it right" }).click();
  await expect(page).toHaveURL(/#\/barcode$/);
  await expect(page.locator("#key-value")).toHaveValue("09506000134352");
  await expect.poll(() => page.locator("input").evaluateAll((all) => all.map((i) => (i as HTMLInputElement).value))).toContain("ABC123");
});

test("the result in Portuguese, the engine's English message beside its translation", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gs1-label-studio.locale", "pt-BR"));
  await page.goto("/#/check");
  const main = page.getByRole("main", { name: "Estúdio de verificação" });
  await main.getByRole("button", { name: "Digitar ou colar" }).click();
  await main.getByRole("button", { name: "Experimente um exemplo" }).click();
  await expect(main.locator(".verdict")).toContainText("Não segue as regras GS1");
  await main.getByRole("radio", { name: "Especialista" }).click();
  await expect(main.locator(".expert")).toContainText("AI (17): The date contains an illegal month of the year.");
  await expect(main.locator(".expert")).toContainText("AI (17): A data tem um mês inválido.");
});

test("the editor's Identify card links to the Check Studio with its data", async ({ page }) => {
  await page.goto("/#/barcode");
  await page.locator("#paste").fill("(01)09506000134352(10)ABC123(17)271231");
  await page.locator("#paste").press("Enter");
  await page.getByRole("link", { name: "Check this in the Check Studio" }).click();
  await expect(page).toHaveURL(/#\/check\?/);
  await expect(data(page)).toHaveValue("010950600013435210ABC123{GS}17271231");
  await expect(studio(page).locator(".verdict")).toHaveAttribute("data-verdict", "follows");
});
