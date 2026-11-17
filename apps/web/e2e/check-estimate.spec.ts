import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// The Check Studio's size estimates from a picture (backlog 7.1 m; the check studio's project, section 4, group H, and
// item m's acceptance). A picture of an EAN-13 and a GS1 DataMatrix drawn by the core at an X-dimension of 0.5 mm
// (e2e/fixtures): the margins are estimated at once, the X-dimension once the printed width of one symbol is typed, and
// every value is labelled an estimate, never a grade.

const studio = (page: Page) => page.getByRole("main", { name: "Check Studio" });

function symbolSvg(file: string, width: number, height: number): string {
  const svg = readFileSync(new URL(`fixtures/${file}`, import.meta.url), "utf8").trim();
  return svg.replace(/<svg([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"`);
}

// Both at 4 pixels a module: the EAN-13 is 107 modules by 50 with its quiet zones, the GS1 DataMatrix 32 by 32; a
// rule 7.5 modules left of the EAN-13's bars, where 11 are needed
const PICTURE = `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="280"><rect width="100%" height="100%" fill="#fff"/><rect x="8" y="40" width="6" height="200"/>${symbolSvg("ean13.svg", 428, 200).replace("<svg", '<svg x="20" y="40"')}${symbolSvg("gs1-datamatrix.svg", 128, 128).replace("<svg", '<svg x="520" y="70"')}</svg>`;

async function openPicture(page: Page) {
  await page.goto("/#/check");
  await studio(page).getByRole("button", { name: "Picture", exact: true }).click();
  await studio(page).getByLabel("Picture", { exact: true }).setInputFiles({ name: "pack.svg", mimeType: "image/svg+xml", buffer: Buffer.from(PICTURE) });
  await expect(studio(page).locator(".picture-frame .outline")).toHaveCount(2);
  return studio(page).getByRole("region", { name: "Size estimates" });
}

test("the margins at once, the X-dimension from one symbol's printed width, each an estimate", async ({ page }) => {
  const estimates = await openPicture(page);
  const rows = estimates.getByRole("row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText("Give a printed width");
  // Measured in the picture: the EAN-13's bars are 50 modules high, short of the 69 a shop needs, and the rule is
  // too near; the GS1 DataMatrix's margins are more than 16 modules
  await expect(rows.nth(1).getByRole("cell").nth(3)).toContainText(/^(49|50|51) modules !/);
  await expect(rows.nth(1).getByRole("cell").nth(2)).toContainText(/^(7|8) modules !/);
  await expect(rows.nth(2).getByRole("cell").nth(2)).toContainText("16+ modules");
  await expect(estimates).toContainText("Estimate from a photograph. For a quality grade, have the symbol verified.");

  // 95 modules of 0.5 mm, typed with a comma
  await estimates.getByLabel("Symbol").selectOption({ label: "1 · EAN-13" });
  await estimates.getByLabel("Printed width (mm)").fill("47,5");
  await estimates.getByRole("button", { name: "Estimate" }).click();
  for (const row of [1, 2]) {
    const text = (await rows.nth(row).getByRole("cell").nth(1).textContent()) ?? "";
    const [, value, tolerance] = /([\d.]+) mm ± ([\d.]+)/.exec(text) ?? [];
    expect(Math.abs(Number(value) - 0.5), text).toBeLessThanOrEqual(Number(tolerance) + 0.005);
  }
  // A grade is named only in the sentence that says there is none
  expect(((await estimates.textContent()) ?? "").match(/grade/gi)).toHaveLength(1);

  await estimates.getByLabel("Printed width (mm)").fill("abc");
  await estimates.getByRole("button", { name: "Estimate" }).click();
  await expect(estimates.getByRole("alert")).toContainText("Type the width in millimetres");
  await estimates.getByLabel("Printed width (mm)").fill("");
  await estimates.getByRole("button", { name: "Estimate" }).click();
  await expect(rows.nth(1)).toContainText("Give a printed width");
});

test("a size outside the place's range is a finding with its estimate, and the place's table is named", async ({ page }) => {
  const estimates = await openPicture(page);
  // The EAN-13 said to be 20 mm wide: an X-dimension of about 0.21 mm, below the 0.264 mm a shop till needs
  await estimates.getByLabel("Printed width (mm)").fill("20");
  await estimates.getByRole("button", { name: "Estimate" }).click();
  await studio(page).getByRole("button", { name: "A product sold in a shop" }).click();
  const finding = studio(page).locator('.finding[data-code="H1"]');
  await expect(finding).toBeVisible();
  await expect(finding).toContainText("X-dimension estimated: 0.21");
  await expect(finding).toContainText("Table 1 asks a verifier for at least 1.5/06/660.");
  await expect(estimates.locator(".estimate-bad").first()).toBeVisible();
});
