import { check, checkGroup, readingFromText, surveyCounts, SyntaxEngine, type CheckedRecord } from "@gs1-label-studio/core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { VERDICTS } from "../src/checkWords.ts";
import { t } from "../src/i18n.ts";
import { itemShareText, readingShareText, sessionShareText } from "../src/reports.ts";
import { mailAddress, messageText, shareSheet, studioLink, whatsappAddress, workShareText, type ShareContent } from "../src/share.ts";

// Sharing (backlog 7.1 l; the check studio's project, section 7.4 and item l's acceptance): with a share sheet the file
// and the text go together; without one, WhatsApp's and e-mail's addresses carry the stated text (decoded and
// compared here); a link past 2,000 characters is not offered. The links' own round trip is the core's
// (packages/core/test/share.test.ts); the buttons and the menu, e2e/check-share.spec.ts.

let engine: SyntaxEngine;
beforeAll(async () => {
  engine = await SyntaxEngine.create();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
/** A browser with these share functions (none: a browser without a share sheet). */
const browser = (functions: Record<string, unknown> = {}) => vi.stubGlobal("navigator", { ...functions });

const text = (data: string) => readingFromText(data, { source: "paste", at: new Date("2026-11-17T01:00:00Z") });
const file = new File(["%PDF-1.4"], "check-report.pdf", { type: "application/pdf" });
const content: ShareContent = { title: "Check report: Data Matrix", text: "Error. 2 faults\n• A1 — ação", link: "https://example.com/#/check?r=abc", file };

describe("the fallbacks' addresses", () => {
  it("WhatsApp gets the text and the link, URL-encoded, and no contact", () => {
    const address = new URL(whatsappAddress(content));
    expect(address.origin + address.pathname).toBe("https://wa.me/");
    expect(address.searchParams.get("text")).toBe("Error. 2 faults\n• A1 — ação\n\nhttps://example.com/#/check?r=abc");
  });

  it("e-mail gets the title as its subject and a body that says to attach the file saved", () => {
    const address = mailAddress(content);
    expect(address.startsWith("mailto:?")).toBe(true);
    const params = new URLSearchParams(address.slice("mailto:?".length));
    expect(params.get("subject")).toBe("Check report: Data Matrix");
    expect(params.get("body")).toBe(`${messageText(content)}\n\nAttach the file just saved: check-report.pdf`);
    // Spaces as %20, not "+", which some mail programs show as it is
    expect(address).not.toContain("+");
    expect(new URLSearchParams(mailAddress({ ...content, file: null }).slice(8)).get("body")).toBe(messageText(content));
  });

  it("leaves the link out when there is none", () => {
    expect(messageText({ text: "x", link: null })).toBe("x");
  });
});

describe("the device's share sheet", () => {
  it("gets the file and the text together when it takes the file", async () => {
    const share = vi.fn(async () => undefined);
    browser({ share, canShare: vi.fn(() => true) });
    expect(await shareSheet(content)).toBe(true);
    expect(share).toHaveBeenCalledWith({ title: content.title, text: messageText(content), files: [file] });
  });

  it("is not used when it does not take the file, nor where there is none: the menu is offered", async () => {
    browser();
    expect(await shareSheet(content)).toBe(false);
    const share = vi.fn(async () => undefined);
    browser({ share, canShare: vi.fn(() => false) });
    expect(await shareSheet(content)).toBe(false);
    expect(share).not.toHaveBeenCalled();
  });

  it("counts a share cancelled by the person as done, and a failure as a reason for the menu", async () => {
    browser({ share: vi.fn(async () => { throw new DOMException("cancelled", "AbortError"); }), canShare: () => true });
    expect(await shareSheet(content)).toBe(true);
    browser({ share: vi.fn(async () => { throw new DOMException("no", "NotAllowedError"); }), canShare: () => true });
    expect(await shareSheet(content)).toBe(false);
  });
});

describe("links", () => {
  it("are offered up to 2,000 characters", () => {
    vi.stubGlobal("window", { location: { origin: "https://ricardomelo.github.io", pathname: "/gs1-label-studio/" } });
    const site = "https://ricardomelo.github.io/gs1-label-studio/#/check?r=";
    expect(studioLink("check", "r", "abc")).toBe(`${site}abc`);
    expect(studioLink("check", "r", "a".repeat(2000 - site.length))).toHaveLength(2000);
    expect(studioLink("check", "r", "a".repeat(2001 - site.length))).toBeNull();
  });
});

describe("the texts", () => {
  it("one reading: the verdict, the symbol, what the code says, each finding in one line with its code, the element string", () => {
    const reading = text("]d1010950600013435217271231" + "10ABC123");
    const result = check(engine, reading, {});
    const said = readingShareText(reading, result);
    const judged = [...new Set(result.findings.filter((f) => f.severity !== "not-assessed").map((f) => f.code))];
    expect(judged.length).toBeGreaterThan(0);
    for (const code of judged) expect(said).toMatch(new RegExp(`^• ${code} — \\S`, "m"));
    expect(said).toContain("(17): ");
    expect(said).toContain(`Element string: ${result.forms!.elementString}`);
    expect(said.split("\n")[0]).toBe(`${t(VERDICTS[result.verdict].word)}. ${t(VERDICTS[result.verdict].line)}`);
    expect(said.endsWith("Checked with GS1 Label Studio.")).toBe(true);
  });

  it("an item: its verdict, the codes compared, each code's verdict", () => {
    const readings = [text("]d20109506000134352"), text("]E00950600013435")];
    const results = readings.map((r) => check(engine, r, {}));
    const group = checkGroup(readings.map((reading, i) => ({ reading, result: results[i]! })), "consumer-pack");
    const said = itemShareText(readings.map((reading, i) => ({ reading, result: results[i]! })), group, "consumer-pack");
    expect(said).toContain("Codes compared: 2");
    expect(said).toMatch(/^1\. .+ — /m);
    expect(said).toMatch(/^2\. .+ — /m);
  });

  it("a session: the counts by verdict and the most frequent faults", () => {
    const records: CheckedRecord[] = ["]d2010950600013435217271300", "]d20109506000134352"].map((data) => {
      const reading = text(data);
      return { reading, at: reading.at, session: "Ala 3", group: null, environment: null, note: "", result: check(engine, reading, {}) };
    });
    const said = sessionShareText("Ala 3", surveyCounts(records));
    expect(said).toContain("Session report: Ala 3");
    expect(said).toContain("Readings: 2");
    expect(said).toContain("The most frequent faults:");
  });

  it("a label: each data title and value, the element string, the Digital Link URI", () => {
    const said = workShareText("GS1 DataMatrix", [{ ai: "01", title: "GTIN", value: "09506000134352" }], "(01)09506000134352", "https://id.gs1.org/01/09506000134352");
    expect(said).toBe("GS1 DataMatrix\nGTIN (01): 09506000134352\n\nElement string: (01)09506000134352\nGS1 Digital Link URI: https://id.gs1.org/01/09506000134352\n\nMade with GS1 Label Studio.");
  });
});
