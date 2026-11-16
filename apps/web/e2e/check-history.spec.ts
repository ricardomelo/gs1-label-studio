import { expect, test, type Page } from "@playwright/test";

// The Check Studio's history (backlog 7.1 j; the check studio's project, section 7.1, and item j's acceptance): every
// code checked kept on this device in IndexedDB, through a reload; the upgrade from version 1 of the database keeping
// what it held; a reading kept under an older release marked when its verdict changes; Delete all read back from the
// database; a browser that keeps nothing; History off; sessions and an item with no barcode.

const studio = (page: Page) => page.getByRole("main", { name: "Check Studio" });
const history = (page: Page) => studio(page).locator(".check-history");
const items = (page: Page) => history(page).locator(".history-list li");

/** Types a code as a scanner in keyboard mode would: checked and kept at once. */
async function scan(page: Page, text: string) {
  await studio(page).getByRole("button", { name: "Type or paste", exact: true }).click();
  const field = studio(page).getByRole("textbox", { name: /Paste or type it/ });
  await field.fill("");
  await field.focus();
  await page.keyboard.type(text, { delay: 5 });
  await page.keyboard.press("Enter");
}

/** What the database holds, read back. */
const stored = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ stores: string[]; readings: number; sessions: number; kept: unknown }>((resolve, reject) => {
        const open = indexedDB.open("gs1-label-studio");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const stores = [...db.objectStoreNames];
          const t = db.transaction(stores, "readonly");
          const readings = t.objectStore("readings").count();
          const sessions = t.objectStore("sessions").count();
          const kept = t.objectStore("kept").get("gcp-test");
          t.oncomplete = () => {
            db.close();
            resolve({ stores, readings: readings.result, sessions: sessions.result, kept: kept.result });
          };
        };
      }),
  );

test("a code checked is kept, survives a reload, and opens its result again", async ({ page }) => {
  await page.goto("/#/check");
  await expect(history(page)).toContainText("kept on this device only, without pictures");
  await scan(page, "]d2010950600013435210ABC123");
  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toContainText("GS1 DataMatrix");
  await expect(items(page).first()).toContainText("(01) 09506000134352");
  await expect(items(page).first()).toHaveAttribute("data-verdict", /follows|remarks/);
  // The same code shown again is not kept twice; another one is
  await scan(page, "]d2010950600013435210ABC123");
  await scan(page, "]d20109506000134352172713311");
  await expect(items(page)).toHaveCount(2);
  // Text typed or pasted is kept once it has rested for two seconds, not at each keystroke
  await studio(page).getByRole("textbox", { name: /Paste or type it/ }).fill("]d20109506000134352");
  await studio(page).getByRole("textbox", { name: /Paste or type it/ }).fill("]d201095060001343521");
  await expect(items(page)).toHaveCount(2);
  await studio(page).getByRole("textbox", { name: /Paste or type it/ }).fill("]d2010950600013435210XYZ");
  await expect(items(page)).toHaveCount(3, { timeout: 6000 });
  await page.reload();
  await expect(items(page)).toHaveCount(3);
  await items(page).first().getByRole("button").click();
  await expect(studio(page).locator(".check-result .says")).toContainText("XYZ");
  // Newest first: then the month 13, then the first code
  await expect(items(page).nth(1)).toHaveAttribute("data-verdict", "does-not-follow");
  await items(page).nth(2).getByRole("button").click();
  await expect(studio(page).locator(".check-result")).toContainText("A reading from the history");
  await expect(studio(page).locator(".check-result .says")).toContainText("ABC123");
  await expect(history(page).getByRole("heading")).toContainText("History (3)");
  // The search finds a value, the verdict filter a verdict
  await history(page).getByLabel("Search a GTIN or any value").fill("abc1");
  await expect(items(page)).toHaveCount(1);
  await history(page).getByLabel("Search a GTIN or any value").fill("");
  await history(page).getByLabel("Verdict").selectOption("does-not-follow");
  await expect(items(page)).toHaveCount(1);
});

test("version 1 of the database is upgraded keeping what it held; Delete all leaves nothing", async ({ page }) => {
  // The application as it was: version 1, one store holding the GCP table
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    const open = indexedDB.open("gs1-label-studio", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("kept");
    open.onsuccess = () => {
      const t = open.result.transaction("kept", "readwrite");
      t.objectStore("kept").put("the table", "gcp-test");
      t.oncomplete = () => open.result.close();
    };
  });
  await page.goto("/#/check");
  await scan(page, "]d20109506000134352");
  await expect(items(page)).toHaveCount(1);
  await history(page).getByLabel(/Name a session/).fill("Ward 3");
  await history(page).getByRole("button", { name: "Start a session" }).click();
  await expect(history(page)).toContainText("Session: Ward 3");
  const db = await stored(page);
  expect([db.stores.sort(), db.readings, db.sessions, db.kept]).toEqual([["kept", "readings", "sessions"], 1, 1, "the table"]);
  await history(page).getByRole("button", { name: "Delete all" }).click();
  await history(page).getByRole("button", { name: "Yes, delete all" }).click();
  await expect(items(page)).toHaveCount(0);
  await expect(history(page)).not.toContainText("Ward 3");
  await expect.poll(async () => {
    const after = await stored(page);
    return [after.readings, after.sessions, after.kept];
  }).toEqual([0, 0, "the table"]);
});

test("a reading kept under an older release is marked when its verdict changes", async ({ page }) => {
  await page.goto("/#/check");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open("gs1-label-studio");
        open.onsuccess = () => {
          const text = "0109506000134352";
          const reading = {
            at: "2025-06-01T08:00:00.000Z", source: "wedge", carrier: "barcode", symbologyIdentifier: "]d2", format: null,
            bytes: new TextEncoder().encode(text), text, eci: false, ecLevel: null, version: null, mirrored: false, inverted: false,
            position: null, image: null, nfc: null, identifierAssumed: false,
          };
          const t = open.result.transaction("readings", "readwrite");
          t.objectStore("readings").add({
            reading, at: reading.at, session: null, environment: null, verdict: "does-not-follow", codes: ["B1"], errors: 1, warnings: 0,
            key: { ai: "01", value: "09506000134352" }, ais: ["01"], values: ["09506000134352"], releases: { engine: "0.1", dictionary: "old" }, note: "",
          });
          t.oncomplete = () => {
            open.result.close();
            resolve();
          };
        };
      }),
  );
  await page.reload();
  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toHaveAttribute("data-changed", "true");
  await expect(items(page).first()).toContainText("Checked again under the current release: Follows the GS1 rules");
});

test("a browser that keeps nothing still checks, says so and lists the visit's codes", async ({ page }) => {
  await page.addInitScript(() => {
    indexedDB.open = () => {
      throw new DOMException("blocked", "SecurityError");
    };
  });
  await page.goto("/#/check");
  await expect(history(page).getByRole("status")).toContainText("the history lasts only for this visit");
  await scan(page, "]d20109506000134352");
  await expect(studio(page).locator(".check-result .verdict")).toBeVisible();
  await expect(items(page)).toHaveCount(1);
});

test("History off keeps nothing; an item with no barcode is counted", async ({ page }) => {
  await page.goto("/#/check");
  await history(page).getByRole("button", { name: "This item has no barcode" }).click();
  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toContainText("No barcode");
  await history(page).getByRole("checkbox", { name: "History off" }).check();
  await expect(history(page)).toContainText("History is off");
  await scan(page, "]d20109506000134352");
  await expect(studio(page).locator(".check-result .verdict")).toBeVisible();
  await expect(items(page)).toHaveCount(1);
  // Remembered by this browser
  await page.reload();
  await expect(history(page).getByRole("checkbox", { name: "History off" })).toBeChecked();
  await expect(items(page)).toHaveCount(1);
  await history(page).getByRole("checkbox", { name: "History off" }).uncheck();
  await scan(page, "]d20109506000134352");
  await expect(items(page)).toHaveCount(2);
});
