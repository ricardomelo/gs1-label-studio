import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// The Check Studio's group on screen (backlog 7.1 i; the check studio's project, section 5, and item i's acceptance):
// every symbol of a picture checked as one item, a code read by the camera then a tag joining it, a code left out or
// removed re-running the group's checks, and the indicator question of J1. The symbols are the SVG files of
// e2e/fixtures the core drew: gs1-datamatrix.svg holds (01)09506000134352(17)271231(10)ABC123, ean13-other.svg the
// EAN-13 9506000134369 (another GTIN). The camera is a canvas stream, as in check-camera.spec.ts.

const studio = (page: Page) => page.getByRole("main", { name: "Check Studio" });
const group = (page: Page) => studio(page).locator(".check-group");

function symbolSvg(file: string, size = 320): string {
  const svg = readFileSync(new URL(`fixtures/${file}`, import.meta.url), "utf8").trim();
  return svg.replace(/<svg([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"`);
}

function pictureSvg(symbols: string[], size = 320): string {
  const inner = symbols.map((s, i) => s.replace("<svg", `<svg x="${20 + i * (size + 40)}" y="40"`)).join("");
  const width = 40 + symbols.length * (size + 40);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${size + 80}" viewBox="0 0 ${width} ${size + 80}"><rect width="100%" height="100%" fill="#fff"/>${inner}</svg>`;
}

/** A camera showing one symbol, as check-camera.spec.ts plays it. */
async function fakeCamera(page: Page, svg: string) {
  await page.addInitScript((s: string) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 600;
      const context = canvas.getContext("2d")!;
      const image = new Image();
      image.src = `data:image/svg+xml;base64,${btoa(s)}`;
      await image.decode();
      const draw = () => {
        context.fillStyle = "#fff";
        context.fillRect(0, 0, 800, 600);
        context.drawImage(image, 200, 100, 400, 400);
      };
      draw();
      setInterval(draw, 100);
      return canvas.captureStream(10);
    };
  }, svg);
}

test("a picture with an EAN-13 and a GS1 DataMatrix of different GTINs, checked as one item, gives J1; a code left out re-runs the checks", async ({ page }) => {
  await page.goto("/#/check");
  await studio(page).getByRole("button", { name: "Picture", exact: true }).click();
  await studio(page).getByLabel("Picture", { exact: true }).setInputFiles({
    name: "pack.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(pictureSvg([symbolSvg("gs1-datamatrix.svg"), symbolSvg("ean13-other.svg")])),
  });
  await studio(page).getByRole("button", { name: "Check all 2 as one item" }).click();
  await expect(group(page).getByRole("button", { name: "A consumer pack" })).toHaveAttribute("aria-pressed", "true");
  await expect(group(page).locator(".verdict")).toHaveAttribute("data-verdict", "does-not-follow");
  await expect(group(page).locator('.finding[data-code="J1"]')).toContainText("different GTINs");
  await expect(group(page).locator('.finding[data-code="J1"]')).toContainText("09506000134352, 09506000134369");
  // The matrix: the GTINs' row marked, both cells; the DataMatrix's batch carried by one code only, not marked
  const gtinRow = group(page).locator(".group-matrix tbody tr").filter({ hasText: "(01)" });
  await expect(gtinRow.locator("td[data-differs]")).toHaveCount(2);
  await expect(group(page).locator(".group-matrix tbody tr").filter({ hasText: "(10)" }).locator("td[data-differs]")).toHaveCount(0);
  // The distance between the symbols is listed as not checked (it needs a scale)
  await expect(group(page).locator(".unchecked")).toContainText("distance between symbols");
  // One code left out: fewer than two, no group check
  await group(page).getByRole("checkbox").nth(1).uncheck();
  await expect(group(page).getByRole("checkbox").nth(0)).toBeChecked();
  await expect(group(page).locator(".finding")).toHaveCount(0);
  await expect(group(page).getByText("Tick at least two codes to compare them.")).toBeVisible();
  await group(page).getByRole("checkbox").nth(1).check();
  await expect(group(page).locator('.finding[data-code="J1"]')).toBeVisible();
  // A symbol of the picture already in the group, chosen again while the next code is awaited, does not join twice
  await group(page).getByRole("button", { name: "Add another code from this item" }).click();
  await studio(page).locator(".picture-symbols .chip").nth(1).click();
  await studio(page).locator(".picture-symbols .chip").nth(0).click();
  await expect(group(page).locator(".group-members li")).toHaveCount(2);
});

test("the project's example 5.3 built by the camera then a tag shows J7 on the differing cells; removing the tag re-runs the checks", async ({ page }) => {
  await fakeCamera(page, symbolSvg("gs1-datamatrix.svg", 400));
  await page.goto("/#/check");
  await studio(page).getByRole("button", { name: "Camera", exact: true }).click();
  await studio(page).getByRole("button", { name: "Start the camera" }).click();
  await expect(studio(page).locator(".check-result .verdict")).toHaveAttribute("data-verdict", /follows|remarks/, { timeout: 15_000 });
  await studio(page).getByRole("button", { name: "Add another code from this item" }).click();
  await expect(group(page).getByRole("status")).toContainText("it joins this item");
  // The camera sees the same symbol again: it does not join twice
  await page.waitForTimeout(1500);
  await expect(group(page).locator(".group-members li")).toHaveCount(1);
  // The tag: an SGTIN-96 of another GTIN, typed as an RFID reader gives it, joins on a press
  await studio(page).getByRole("button", { name: "Tag", exact: true }).click();
  await studio(page).getByLabel(/Paste the EPC/).fill("30364433400d1f00000001a1");
  await studio(page).getByRole("button", { name: "Add this code to the item" }).click();
  await expect(group(page).locator(".group-members li")).toHaveCount(2);
  await expect(group(page).getByRole("button", { name: "A tag with its printed code" })).toHaveAttribute("aria-pressed", "true");
  await expect(group(page).locator(".group-members")).toContainText("RFID tag (SGTIN-96)");
  const j7 = group(page).locator('.finding[data-code="J7"]');
  await expect(j7).toContainText("The RFID tag and the barcode disagree.");
  await expect(j7).toContainText("Codes 1 and 2");
  await expect(j7).toContainText("The barcode: 09506000134352 · the tag: 09506000134369");
  await expect(group(page).locator(".group-matrix tbody tr").filter({ hasText: "(01)" }).locator("td[data-differs]")).toHaveCount(2);
  // A column's own result opens below
  await group(page).getByRole("button", { name: "Its own result" }).nth(1).click();
  await expect(studio(page).locator(".check-result")).toContainText("The result of one code of this item: RFID tag.");
  // The tag removed: one code left, the group checks gone
  await group(page).getByRole("button", { name: "Remove RFID tag (SGTIN-96)" }).click();
  await expect(group(page).locator(".group-members li")).toHaveCount(1);
  await expect(group(page).locator(".group-members")).toContainText("GS1 DataMatrix");
  await expect(group(page).locator(".finding")).toHaveCount(0);
  await group(page).getByRole("button", { name: "Check codes one at a time" }).click();
  await expect(group(page)).toHaveCount(0);
});

test("two GTINs that differ in the indicator only ask whether one is the box's code, and a scanner's code joins by itself", async ({ page }) => {
  await page.goto("/#/check");
  await studio(page).getByRole("button", { name: "Type or paste", exact: true }).click();
  await studio(page).getByRole("textbox", { name: /Paste or type it/ }).fill("]d20109506000134352");
  await studio(page).getByRole("button", { name: "Add another code from this item" }).click();
  await expect(studio(page).getByRole("textbox", { name: /Paste or type it/ })).toHaveValue("");
  // A scanner in keyboard mode: keystrokes a few milliseconds apart, ended by Enter
  await studio(page).getByRole("textbox", { name: /Paste or type it/ }).focus();
  await page.keyboard.type("]I119506000134359", { delay: 5 });
  await page.keyboard.press("Enter");
  await expect(group(page).locator(".group-members li")).toHaveCount(2);
  const j1 = group(page).locator('.finding[data-code="J1"]');
  await expect(j1).toContainText("Is one of these the code of the box and the other of the product inside?");
  await j1.getByRole("button", { name: "Yes" }).click();
  await expect(j1).toContainText("Then they are different items");
  await j1.getByRole("button", { name: "Check codes one at a time" }).click();
  await expect(group(page)).toHaveCount(0);
});
