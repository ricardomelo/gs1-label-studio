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
  // Start over: a round icon at the right of the live preview's bar, not in the header
  const reload = page.locator(".mini-bar").getByRole("button", { name: "Start over" });
  await expect(reload).toBeVisible();
  const [bar0, icon] = [(await page.locator(".mini-bar").boundingBox())!, (await reload.boundingBox())!];
  expect(icon.x + icon.width).toBeGreaterThan(bar0.x + bar0.width - 24);
  expect(icon.width).toBe(icon.height);
  await expect(page.locator("header.top").getByRole("button", { name: "Start over" })).toHaveCount(0);
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
  await expect(page.locator(".settings").getByRole("button", { name: "Install the app" })).toBeVisible();
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
  // The engine with the release that checks the data (backlog 0.6)
  await expect(made).toHaveText(["bwip-js", /^GS1 Barcode Syntax Engine \d+\.\d+\.\d+$/, "node-qrcode", "dijkstrajs", "opentype.js", "zxing-wasm", "zxing-cpp", "React", "Liberation Sans"]);
  for (const href of await made.evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href))) expect(href).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
  await expect(about).toContainText("not maintained by GS1");
});

test("More offers to install the studio: the browser's dialog where it has one, otherwise how", async ({ page }, info) => {
  test.skip(info.project.name === "desktop");
  await tabs(page).getByRole("button", { name: "More" }).click();
  const button = page.getByRole("button", { name: "Install the app" });
  // A browser without the install event (Safari on a computer, Firefox, this test's Chromium): the menu's way
  await expect(button).toBeDisabled();
  await expect(page.locator(".install .hint")).toHaveText("This browser installs it from its menu: Install app, or Add to Home screen.");
  // The browser's offer, stood in for: the button shows its dialog; accepted, the studio says it is installed
  await page.evaluate(() => {
    const offer = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => { (window as unknown as { prompted: boolean }).prompted = true; },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(offer);
  });
  await expect(button).toBeEnabled();
  await expect(page.locator(".install .hint")).toHaveText("On the home screen, offline, without the browser's bars.");
  await button.click();
  expect(await page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(true);
  await expect(page.locator(".install .hint.ok")).toHaveText("✓ Installed: open GS1 Label Studio from the home screen; it works offline.");
});

test("an iPhone is told to install from Share, Add to Home Screen; the name on the home screen is GS1 Label Studio", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "phone");
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  await page.goto(baseURL!);
  await tabs(page).getByRole("button", { name: "More" }).click();
  await expect(page.locator(".install .hint")).toHaveText("On an iPhone or iPad: tap Share, then Add to Home Screen.");
  await expect(page.locator("meta[name='apple-mobile-web-app-title']")).toHaveAttribute("content", "GS1 Label Studio");
  const manifest = await (await page.request.get(new URL("manifest.webmanifest", baseURL).href)).json();
  expect([manifest.name, manifest.short_name]).toEqual(["GS1 Label Studio", "GS1 Label Studio"]);
  await context.close();
});

// Backlog 6.1, mock-up A of two (13 November 2026): the version under the name, linking to About, on every device.
test("the version under the name, the same as About's, links to About", async ({ page }, info) => {
  const version = page.locator("header.top .version");
  await expect(version).toBeVisible();
  await expect(version).toHaveText(/^[0-9a-f]{7,} · \d{4}-\d{2}-\d{2}$/);
  const about = page.locator("footer.about");
  const commit = (await version.textContent())!.split(" · ")[0]!;
  await expect(about.locator("a.mono")).toHaveText(commit);
  await expect(about).toContainText(`${commit} · ${(await version.textContent())!.split(" · ")[1]}`);
  await version.click();
  await expect(about.getByRole("heading", { name: "About GS1 Label Studio" })).toBeInViewport();
  if (info.project.name === "phone") await expect(tabs(page).getByRole("button", { name: "More" })).toHaveAttribute("aria-current", "page");
});

// Backlog 6.1: a new release found by itself. The page asks for a new service worker whenever it comes back to the
// screen; a new worker taking over a page that already had one is a new release, offered in a bar as a reload, which
// loses nothing (the last work is offered on the next visit). A first visit's worker takes over too, but is no release.
test("a new version found by itself is offered as a reload that loses nothing; a first visit's worker is not", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  const bar = page.getByRole("status").filter({ hasText: "A new version of GS1 Label Studio is ready." });
  // The first visit's worker takes the page over: no new version
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await expect(bar).toHaveCount(0);
  // Back on the screen, the page asks for a new worker
  await page.evaluate(() => {
    const w = window as unknown as { asked: number };
    w.asked = 0;
    ServiceWorkerRegistration.prototype.update = async function () { w.asked++; return this; };
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(await page.evaluate(() => (window as unknown as { asked: number }).asked)).toBe(1);
  // A new worker takes over the page: a new release, put off with Later until the next visit
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event("controllerchange")));
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Later" }).click();
  await expect(bar).toHaveCount(0);
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event("controllerchange")));
  await expect(bar).toHaveCount(0);

  // On the next visit, work typed and then a new release: Reload brings the new page and offers the work back
  await page.reload();
  await expect(page.locator(".preview .symbol svg")).toBeAttached();
  await page.fill("#paste", "(01)09506000134352(10)LOT9");
  await page.getByRole("button", { name: "Fill in" }).click();
  await page.waitForTimeout(800);
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event("controllerchange")));
  await bar.getByRole("button", { name: "Reload" }).click();
  await expect(page.getByRole("region", { name: "Your last work" })).toContainText("(01) 09506000134352");
  await expect(bar).toHaveCount(0);
});

// Backlog 6.2, mock-up A of two (13 November 2026): Android 12 and later open an installed app on the icon alone, so the
// page's own opening screen gives the icon and the name, on the manifest's background colour, until the page is drawn;
// in a browser's tab it is never shown. Chromium cannot pretend to be an installed app (display-mode is not among the
// media features it emulates), so the installed app is stood in for by the page with its display-mode rule always true.
test("the installed app opens on the icon with the name until the page is drawn; a browser's tab never shows it", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "phone");
  for (const installed of [false, true]) {
    const context = await browser.newContext({ ...info.project.use, serviceWorkers: "block" });
    const page = await context.newPage();
    if (installed) {
      await page.route(baseURL!, async (route) => {
        const response = await route.fetch();
        const html = await response.text();
        expect(html).toMatch(/@media ?\(display-mode: ?standalone\)/);
        await route.fulfill({ response, body: html.replace(/\(display-mode: ?standalone\)/g, "all") });
      });
    }
    // The application's script held back: the page not drawn yet
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/assets\/index-[\w-]+\.js$/, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(baseURL!, { waitUntil: "commit" });
    const launch = page.locator("#launch");
    await expect(launch).toBeAttached();
    if (installed) {
      await expect(launch).toBeVisible();
      await expect(launch).toHaveText("GS1 Label Studio");
      await expect(launch).toHaveCSS("background-color", "rgb(238, 242, 246)"); // the manifest's background_color
      expect(await launch.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    } else {
      await expect(launch).toBeHidden();
    }
    // Drawn, the page takes its place at once
    release();
    await expect(page.locator(".preview .symbol svg")).toBeAttached();
    await expect(launch).toHaveCount(0);
    await context.close();
  }
});
