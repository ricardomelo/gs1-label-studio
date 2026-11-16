import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// The Check Studio's camera and pictures (backlog 7.1 g; the check studio's project, sections 3.2 and 3.3, and item
// g's acceptance). The camera is a canvas stream put in the place of getUserMedia(), showing symbols the core draws:
// it runs in the three projects, and a refused or missing camera can be played as well as a working one. The frames
// go through the real path (the video, the decoding worker, ZXing, check()). A picture is an SVG file of several
// symbols, chosen, dropped or pasted. The symbols are SVG files the core drew (encode() and toSvg(), x-dimension 0.5 mm,
// a quiet zone of 6 modules), in e2e/fixtures: a GS1 DataMatrix of (01)09506000134352(17)271231(10)ABC123, a plain
// Data Matrix with "(01)09506000134352(10)ABC123" and its brackets encoded, an EAN-13 of 9506000134352.

const studio = (page: Page) => page.getByRole("main", { name: "Check Studio" });

/** A symbol of e2e/fixtures, as an SVG of the given size in pixels with its white quiet zone. */
function symbolSvg(file: string, width: number, height: number): string {
  const svg = readFileSync(new URL(`fixtures/${file}`, import.meta.url), "utf8").trim();
  return svg.replace(/<svg([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"`);
}

/** A picture of several symbols side by side on white. */
function pictureSvg(symbols: string[], size = 320): string {
  const inner = symbols.map((s, i) => s.replace("<svg", `<svg x="${20 + i * (size + 40)}" y="40"`)).join("");
  const width = 40 + symbols.length * (size + 40);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${size + 80}" viewBox="0 0 ${width} ${size + 80}"><rect width="100%" height="100%" fill="#fff"/>${inner}</svg>`;
}

const goodMatrix = () => symbolSvg("gs1-datamatrix.svg", 320, 320);
const bracketed = () => symbolSvg("datamatrix-brackets.svg", 320, 320);
const ean = () => symbolSvg("ean13.svg", 320, 320);

type Fake = { svg?: string; refuse?: string; controls?: boolean };

/** Puts a canvas stream in the place of the camera; its tracks and the constraints applied are kept on window. */
async function fakeCamera(page: Page, fake: Fake) {
  await page.addInitScript((f: Fake) => {
    const w = window as unknown as { __tracks: MediaStreamTrack[]; __applied: unknown[] };
    w.__tracks = [];
    w.__applied = [];
    navigator.mediaDevices.getUserMedia = async () => {
      if (f.refuse) throw new DOMException("refused", f.refuse);
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 600;
      const context = canvas.getContext("2d")!;
      const image = new Image();
      if (f.svg) {
        image.src = `data:image/svg+xml;base64,${btoa(f.svg)}`;
        await image.decode();
      }
      const draw = () => {
        context.fillStyle = "#fff";
        context.fillRect(0, 0, 800, 600);
        if (f.svg) context.drawImage(image, 200, 100, 400, 400);
      };
      draw();
      setInterval(draw, 100);
      const stream = canvas.captureStream(10);
      for (const track of stream.getVideoTracks()) {
        if (f.controls) {
          (track as unknown as { getCapabilities: () => unknown }).getCapabilities = () => ({ torch: true, zoom: { min: 1, max: 4, step: 0.5 } });
          track.applyConstraints = async (c?: MediaTrackConstraints) => {
            w.__applied.push(c);
          };
        }
        w.__tracks.push(track);
      }
      return stream;
    };
  }, fake);
}

const live = (page: Page) => page.evaluate(() => (window as unknown as { __tracks: MediaStreamTrack[] }).__tracks.filter((t) => t.readyState === "live").length);

test("on a touch screen the studio opens on the camera, with a mouse on the text", async ({ page }, info) => {
  await page.goto("/#/check");
  const first = info.project.name === "desktop" ? "Type or paste" : "Camera";
  await expect(studio(page).getByRole("button", { name: first, exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("the camera reads a code, opens its result and stops; Scan another starts it again", async ({ page }) => {
  await fakeCamera(page, { svg: goodMatrix() });
  await page.goto("/#/check");
  await studio(page).getByRole("button", { name: "Camera", exact: true }).click();
  await studio(page).getByRole("button", { name: "Start the camera" }).click();
  const verdict = studio(page).locator(".verdict");
  await expect(verdict).toHaveAttribute("data-verdict", "follows", { timeout: 15_000 });
  await expect(studio(page).locator(".says")).toContainText("BATCH/LOT");
  // The result opened: every track of the stream is stopped
  await expect.poll(() => live(page)).toBe(0);
  await expect(studio(page).getByText("The camera is paused while the result is shown.")).toBeVisible();
  // The reading says where it came from, with the decoder's identifier
  await studio(page).getByRole("radio", { name: "Expert" }).click();
  await expect(studio(page).locator(".expert")).toContainText("]d2");
  await expect(studio(page).locator(".expert .pairs").first()).toContainText("Camera (DataMatrix)");
  await studio(page).getByRole("button", { name: "Scan another" }).click();
  await expect.poll(() => live(page)).toBe(1);
});

test("the camera stops when the tab is hidden, starts again when it is shown, and stops when the studio is left", async ({ page }) => {
  await fakeCamera(page, {});
  await page.goto("/#/check");
  await studio(page).getByRole("button", { name: "Camera", exact: true }).click();
  await studio(page).getByRole("button", { name: "Start the camera" }).click();
  await expect.poll(() => live(page)).toBe(1);
  const visibility = (state: string) =>
    page.evaluate((s) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => s });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);
  await visibility("hidden");
  await expect.poll(() => live(page)).toBe(0);
  await visibility("visible");
  await expect.poll(() => live(page)).toBe(1);
  await page.evaluate(() => (window.location.hash = "#/"));
  await expect.poll(() => live(page)).toBe(0);
});

test("a torch and a zoom where the camera offers them", async ({ page }) => {
  await fakeCamera(page, { controls: true });
  await page.goto("/#/check");
  await studio(page).getByRole("button", { name: "Camera", exact: true }).click();
  await studio(page).getByRole("button", { name: "Start the camera" }).click();
  const torch = studio(page).getByRole("button", { name: "Torch" });
  await torch.click();
  await expect(torch).toHaveAttribute("aria-pressed", "true");
  await studio(page).getByRole("slider", { name: "Zoom" }).fill("2.5");
  const applied = await page.evaluate(() => JSON.stringify((window as unknown as { __applied: unknown[] }).__applied));
  expect(applied).toContain('{"torch":true}');
  expect(applied).toContain('{"zoom":2.5}');
});

test("a refused camera says so and offers a picture; a missing one says there is none", async ({ page }) => {
  await fakeCamera(page, { refuse: "NotAllowedError" });
  await page.goto("/#/check");
  await studio(page).getByRole("button", { name: "Camera", exact: true }).click();
  await studio(page).getByRole("button", { name: "Start the camera" }).click();
  await expect(studio(page).getByRole("alert")).toContainText("The camera was not allowed.");
  const chooser = page.waitForEvent("filechooser");
  await studio(page).getByRole("alert").getByRole("button", { name: "Take or choose a picture" }).click();
  await chooser;
  await expect(studio(page).getByRole("button", { name: "Picture", exact: true })).toHaveAttribute("aria-pressed", "true");

  const other = await page.context().newPage();
  await fakeCamera(other, { refuse: "NotFoundError" });
  await other.goto("/#/check");
  await studio(other).getByRole("button", { name: "Camera", exact: true }).click();
  await studio(other).getByRole("button", { name: "Start the camera" }).click();
  await expect(studio(other).getByRole("alert")).toContainText("No camera was found on this device.");
  await expect(studio(other).getByRole("button", { name: "Try again" })).toHaveCount(0);
});

test("a picture of three symbols: each outlined and numbered with its verdict, one chosen shows its result", async ({ page }) => {
  await page.goto("/#/check");
  await studio(page).getByRole("button", { name: "Picture", exact: true }).click();
  await studio(page).getByLabel("Picture", { exact: true }).setInputFiles({
    name: "pack.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(pictureSvg([goodMatrix(), bracketed(), ean()])),
  });
  await expect(studio(page).locator(".picture-frame .outline")).toHaveCount(3);
  await expect(studio(page).locator(".picture figcaption")).toContainText("3 symbols found");
  const list = studio(page).getByRole("list", { name: "The symbols found" });
  await expect(list.getByRole("button")).toHaveCount(3);
  // The numbers on the picture are the list's
  expect(await studio(page).locator(".picture-frame .outline text").allTextContents()).toEqual(["1", "2", "3"]);

  await list.getByRole("button", { name: /\bData Matrix/ }).click();
  await expect(studio(page).locator(".verdict")).toHaveAttribute("data-verdict", "does-not-follow");
  await expect(studio(page).locator(".finding").first()).toHaveAttribute("data-code", "A1");
  await expect(studio(page).locator(".picture-frame .outline[data-chosen]")).toHaveAttribute("data-verdict", "does-not-follow");

  await list.getByRole("button", { name: /GS1 DataMatrix/ }).click();
  await expect(studio(page).locator(".verdict")).toHaveAttribute("data-verdict", "follows");

  // An EAN-13 read from a picture: its Composite part, if any, is said not to be read
  await list.getByRole("button", { name: /EAN-13/ }).click();
  await expect(studio(page).locator(".unchecked")).toContainText("a Composite Component");
});

test("a picture with no barcode says what cannot be read; There is a code here gives fault A9", async ({ page }) => {
  await page.goto("/#/check");
  await studio(page).getByRole("button", { name: "Picture", exact: true }).click();
  await studio(page).getByLabel("Picture", { exact: true }).setInputFiles({ name: "blank.svg", mimeType: "image/svg+xml", buffer: Buffer.from(pictureSvg([])) });
  await expect(studio(page).getByText("No barcode was found in this picture.")).toBeVisible();
  await expect(studio(page).locator(".picture-none")).toContainText("GS1 DotCode");
  await studio(page).getByRole("button", { name: "There is a code here that is not read" }).click();
  await expect(studio(page).locator(".verdict")).toHaveAttribute("data-verdict", "not-assessed");
  await expect(studio(page).locator(".unchecked")).toContainText("This type of symbol cannot be read here.");
});

test("a picture pasted or dropped on the studio is read", async ({ page }) => {
  await page.goto("/#/check");
  const svg = pictureSvg([goodMatrix()]);
  await page.evaluate((s) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([s], "pasted.svg", { type: "image/svg+xml" }));
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer }));
  }, svg);
  await expect(studio(page).getByRole("button", { name: "Picture", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(studio(page).locator(".verdict")).toHaveAttribute("data-verdict", "follows");
  await expect(studio(page).locator(".picture figcaption")).toContainText("One symbol found.");

  const dropped = await page.evaluateHandle((s) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([s], "dropped.svg", { type: "image/svg+xml" }));
    return transfer;
  }, pictureSvg([bracketed()]));
  await studio(page).locator(".picture").dispatchEvent("drop", { dataTransfer: dropped });
  await expect(studio(page).locator(".verdict")).toHaveAttribute("data-verdict", "does-not-follow");
});
