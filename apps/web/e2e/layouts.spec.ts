import { expect, test } from "@playwright/test";

// The layouts (backlog 1.21, mock-up A of three, 31 October 2026): a computer keeps the editor as it was; a phone shows
// one destination at a time, chosen in a tab bar at the bottom; a tablet held horizontally a navigation rail, the
// destination beside it and the label always on the right. And About at the foot of the page (the owner, 31 October
// 2026). Each test runs in the project it is about.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".preview .symbol svg")).toBeAttached();
});

const tabs = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Sections" });

test("a computer shows every step at once, without the destinations' bar", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await expect(tabs(page)).toBeHidden();
  for (const title of ["#identify-title", "#scan-title", "#label-title"]) await expect(page.locator(title)).toBeVisible();
  await expect(page.locator(".exportbar")).toBeVisible();
  await expect(page.locator("details.epc")).toBeVisible();
  await expect(page.locator("header.top #language")).toBeVisible();
  await expect(page.locator("header.top").getByRole("button", { name: "Start over" })).toBeVisible();
  await expect(page.locator(".mini")).toBeHidden();
});

test("a phone shows one destination at a time, chosen in the tab bar at the bottom", async ({ page }, info) => {
  test.skip(info.project.name !== "phone");
  const bar = tabs(page);
  await expect(bar).toBeVisible();
  const box = (await bar.boundingBox())!;
  expect(box.y + box.height).toBeCloseTo(page.viewportSize()!.height, 0); // at the bottom
  await expect(bar.getByRole("button")).toHaveText(["Data", "Scan", "Label", "Export", "More"]);
  await expect(bar.getByRole("button", { name: "Data" })).toHaveAttribute("aria-current", "page");
  // Data: step 1 alone, with the live preview above it
  await expect(page.locator("#identify-title")).toBeVisible();
  await expect(page.locator("#scan-title")).toBeHidden();
  await expect(page.locator("#label-title")).toBeHidden();
  await expect(page.locator(".mini")).toBeVisible();
  // The live preview opens the label
  await page.locator(".mini").click();
  await expect(bar.getByRole("button", { name: "Label" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".canvas .preview")).toBeVisible();
  await expect(page.locator("#identify-title")).toBeHidden();
  await expect(page.locator(".exportbar")).toBeHidden();
  await expect(page.locator(".mini")).toBeHidden();
  // A link to step 2 from the label's options opens Scan
  await bar.getByRole("button", { name: "Scan" }).click();
  await page.getByRole("group", { name: "Is it scanned at a general retail point of sale?" }).getByRole("button", { name: "Yes" }).click();
  await page.getByRole("group", { name: "Is it scanned in general distribution?" }).getByRole("button", { name: "No" }).click();
  await bar.getByRole("button", { name: "Label" }).click();
  await page.getByRole("link", { name: "Change in step 2" }).click();
  await expect(bar.getByRole("button", { name: "Scan" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#scan-title")).toBeInViewport();
  // Export: the downloads in two columns, the printer profiles below them
  await bar.getByRole("button", { name: "Export" }).click();
  await expect(page.getByRole("heading", { name: "Export" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download SVG" })).toBeVisible();
  await expect(page.locator("details.printer")).toBeVisible();
  await expect(page.locator(".canvas")).toBeHidden();
  // More: the language, Start over, the EPC, the signature and About
  await bar.getByRole("button", { name: "More" }).click();
  await expect(page.locator("header.top #language")).toHaveCount(0);
  await expect(page.locator(".settings #language")).toBeVisible();
  await expect(page.locator(".settings").getByRole("button", { name: "Start over" })).toBeVisible();
  await expect(page.locator("details.epc")).toBeVisible();
  await expect(page.locator("footer.about")).toBeVisible();
  // Nothing wider than the screen, in any destination
  for (const name of ["Data", "Scan", "Label", "Export", "More"]) {
    await bar.getByRole("button", { name }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
});

test("on a phone each destination keeps where it was scrolled to, and an error is marked on its tab", async ({ page }, info) => {
  test.skip(info.project.name !== "phone");
  const bar = tabs(page);
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  await bar.getByRole("button", { name: "Label" }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await bar.getByRole("button", { name: "Data" }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  await expect(bar.locator(".alert")).toHaveCount(0);
  await page.fill("#key-value", "09506000134377");
  await expect(bar.getByRole("button", { name: "Data" }).locator(".alert")).toBeVisible();
});

test("a tablet held horizontally: a rail on the left, the destination beside it, the label always on the right", async ({ page }, info) => {
  test.skip(info.project.name !== "tablet");
  const rail = tabs(page);
  const box = (await rail.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.height).toBeCloseTo(page.viewportSize()!.height, 0);
  const label = page.locator(".canvas .preview");
  for (const [name, shown] of [["Data", "#identify-title"], ["Scan", "#scan-title"], ["Label", "#opt-size"], ["Export", "details.printer"], ["More", "details.epc"]] as const) {
    await rail.getByRole("button", { name }).click();
    await expect(page.locator(shown)).toBeVisible();
    await expect(label).toBeVisible();
    await expect(page.getByRole("button", { name: "Download SVG" })).toBeVisible();
    expect((await page.locator(shown).boundingBox())!.x).toBeLessThan((await label.boundingBox())!.x); // on the left of the label
  }
  await rail.getByRole("button", { name: "Data" }).click();
  await expect(page.locator("#scan-title")).toBeHidden();
  await expect(page.locator("header.top #language")).toBeVisible();
  await expect(page.locator(".mini")).toBeHidden();
  // What is typed shows beside it at once
  const before = await page.locator(".canvas .preview .symbol").innerHTML();
  await page.fill("#key-value", "09506000134352");
  await expect.poll(() => page.locator(".canvas .preview .symbol").innerHTML()).not.toBe(before);
  await expect(label).toBeVisible();
});

test("About: the repository, the licence, the version and the software it is made with, each with its repository", async ({ page }, info) => {
  if (info.project.name === "phone") await tabs(page).getByRole("button", { name: "More" }).click();
  const about = page.locator("footer.about");
  await about.scrollIntoViewIfNeeded();
  await expect(about.getByRole("heading", { name: "About GS1 Label Studio" })).toBeVisible();
  await expect(about.getByRole("link", { name: "github.com/ricardomelo/gs1-label-studio" })).toHaveAttribute("href", "https://github.com/ricardomelo/gs1-label-studio");
  await expect(about.getByRole("link", { name: "Apache License 2.0" })).toHaveAttribute("href", /\/blob\/main\/LICENSE$/);
  await expect(about.getByRole("link", { name: "user guide" })).toHaveAttribute("href", /docs\/user-guide\.md$/);
  await expect(about.locator("a.mono")).toHaveAttribute("href", /\/commit\/[0-9a-f]{7,}$/);
  const made = about.locator(".made-with a");
  await expect(made).toHaveText(["bwip-js", "GS1 Barcode Syntax Engine", "node-qrcode", "dijkstrajs", "opentype.js", "zxing-wasm", "zxing-cpp", "React", "Liberation Sans"]);
  for (const href of await made.evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href))) expect(href).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
  await expect(about).toContainText("not maintained by GS1");
});
