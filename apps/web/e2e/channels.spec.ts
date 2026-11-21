import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { expect, test } from "@playwright/test";

// Backlog 0.4 (ADR 0010): the last release at the site's root and develop, the work in progress, under /develop/, on
// the same origin as GitHub Pages serves them. Both are built here as the Pages workflow builds them and served by a
// small server; develop names itself, keeps what it keeps apart from the stable site, and each site's service worker
// keeps its own page and files, so that both still open offline, each as itself.

const ROOT = "/gs1-label-studio/";
let dir = "";
let server: Server;
let origin = "";

const TYPES: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm",
  ".svg": "image/svg+xml", ".png": "image/png", ".ttf": "font/ttf", ".webmanifest": "application/manifest+json", ".xml": "text/xml",
};

test.beforeAll(async ({}, info) => {
  if (info.project.name !== "desktop") return;
  test.setTimeout(180_000);
  dir = mkdtempSync(join(tmpdir(), "gs1ls-channels-"));
  const build = (base: string, out: string, channel: string) =>
    execFileSync("pnpm", ["exec", "vite", "build", "--outDir", out, "--emptyOutDir"], {
      cwd: join(import.meta.dirname, ".."),
      env: { ...process.env, BASE_PATH: base, CHANNEL: channel },
      stdio: "pipe",
    });
  build(ROOT, join(dir, "site"), "stable");
  build(`${ROOT}develop/`, join(dir, "site", "develop"), "develop");
  server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    if (!path.startsWith(ROOT)) return void response.writeHead(404).end();
    let file = normalize(join(dir, "site", path.slice(ROOT.length)));
    if (path.endsWith("/")) file = join(file, "index.html");
    try {
      const body = readFileSync(file);
      response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  origin = `http://localhost:${typeof address === "object" && address ? address.port : 0}`;
});

test.afterAll(() => {
  server?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test("develop names itself, keeps its own storage, and both sites open offline each as itself", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop");
  test.setTimeout(120_000);
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const worker = () => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? "");

  // The stable site: its release in the header, a link to develop in About; its worker takes the page
  await page.goto(`${origin}${ROOT}#/label`);
  await expect(page).toHaveTitle("GS1 Label Studio");
  await expect(page.locator("header.top .version")).toHaveText(/^\d+\.\d+\.\d+ · \d{4}-\d{2}-\d{2}$/);
  await expect(page.getByTestId("about-channel").getByRole("link", { name: "develop" })).toHaveAttribute("href", "develop/");
  await expect.poll(worker).toBe(`${origin}${ROOT}sw.js`);
  await page.evaluate(() => localStorage.setItem("gs1-label-studio.assistant-seen", "1"));

  // Develop, first opened while the stable worker controls its scope: named apart, its own worker, its own storage
  await page.goto(`${origin}${ROOT}develop/#/label`);
  await expect(page).toHaveTitle("GS1 Label Studio (develop)");
  await expect(page.locator("meta[name='theme-color']")).toHaveAttribute("content", "#8a3b00");
  await expect(page.locator("header.top .version")).toHaveText(/^develop · [0-9a-f]{7,}$/);
  await expect(page.locator("header.top .version")).toHaveAttribute("data-channel", "develop");
  await expect(page.getByTestId("about-version")).toContainText("develop");
  await expect(page.getByTestId("about-channel").getByRole("link", { name: "Stable version" })).toHaveAttribute("href", "../");
  await expect.poll(worker).toBe(`${origin}${ROOT}develop/sw.js`);
  const manifest = await (await page.request.get(`${origin}${ROOT}develop/manifest.webmanifest`)).json();
  expect([manifest.name, manifest.short_name]).toEqual(["GS1 Label Studio (develop)", "GS1LS develop"]);
  // The stable site's 'assistant seen' is not develop's: develop's assistant opens on its first visit, and is kept
  // under develop's own name
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("gs1-label-studio-develop.assistant-seen"))).toBe("1");
  // Each site's caches are its own: develop's worker left the stable site's in place
  const caches = await page.evaluate(() => globalThis.caches.keys());
  expect(caches.filter((key) => key.startsWith(`gs1-label-studio ${"/gs1-label-studio/"} `))).toHaveLength(1);
  expect(caches.filter((key) => key.startsWith(`gs1-label-studio ${"/gs1-label-studio/develop/"} `))).toHaveLength(1);

  // Offline, each site opens as itself: the stable worker never kept develop's page as its own
  await context.setOffline(true);
  await page.goto(`${origin}${ROOT}#/label`);
  await expect(page).toHaveTitle("GS1 Label Studio");
  await expect(page.locator("header.top .version")).toHaveText(/^\d+\.\d+\.\d+ · /);
  await expect(page.locator(".preview .symbol svg")).toBeAttached();
  await page.goto(`${origin}${ROOT}develop/#/label`);
  await expect(page).toHaveTitle("GS1 Label Studio (develop)");
  await expect(page.locator("header.top .version")).toHaveText(/^develop · /);
  await context.close();
});
