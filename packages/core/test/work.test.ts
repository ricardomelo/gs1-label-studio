import { describe, expect, it } from "vitest";
import { InputError, readWork, WORK_FORMAT, WORK_VERSION, workFile, zplWithWork, type Work } from "../src/index.ts";
import { GRAPHICS } from "./fixtures/graphics.ts";

// The work saved on one's own computer and opened again (backlog 4.3): a JSON work file, and the studio's own ZPL with
// the same work in ^FX comments. What is opened is what was saved; what the studio did not write is refused.

const WORK: Work = {
  mode: "one",
  identification: {
    key: "01", value: "09506000134376", qualifiers: { "10": "Lote ação €" }, attributes: [["17", "271231"], ["3103", "1,5"]],
    parameters: [["linkType", "gs1:pip"]],
  },
  answers: { retail: true, healthcare: false },
  picked: { symbol: "dl-qrcode", with: "ean13" },
  settings: { symbology: "dl-qrcode", size: 100, version: null, hriAsText: false, gs1128Starts: [0, 2], stem: "https://id.gs1.org", designer: true },
  page: {
    ...GRAPHICS,
    elements: [
      ...GRAPHICS.elements,
      { id: "t", kind: "text", text: "VAL {17:DD MMM YYYY}\nLOTE {10}", heightMm: 3, months: "pt", xMm: 8, yMm: 8 },
      { id: "q", kind: "symbol", symbology: "gs1-128", ais: ["01", "17"], size: 50, hri: true, xMm: 4, yMm: 4 },
    ],
  },
  printer: { profile: { id: "own-1", name: "Zebra ZD421", dpi: 300, widthMm: 104, language: "zpl" }, moduleDots: 4 },
  columns: { headers: ["GTIN", "Lote", "Notes"], mapping: ["01", "10", null], fixed: [["422", "076"]] },
};

const ZPL = "^XA\n^PW800\n^LL480\n^FO10,10^GB100,50,3^FS\n^XZ\n";

function refusal(text: string): string {
  try {
    readWork(text);
  } catch (error) {
    expect(error).toBeInstanceOf(InputError);
    return (error as Error).message;
  }
  throw new Error("not refused");
}

describe("the work saved and opened again (backlog 4.3)", () => {
  it("a work file opens as it was saved", () => {
    const file = workFile(WORK, new Date("2026-11-03T22:00:00Z"));
    const json = JSON.parse(file) as Record<string, unknown>;
    expect([json.format, json.version, json.saved]).toEqual([WORK_FORMAT, WORK_VERSION, "2026-11-03T22:00:00.000Z"]);
    expect(readWork(file)).toEqual(WORK);
    // What is optional may be left out, as an earlier file of the same version could
    const lean: Work = { ...WORK, picked: null, page: null, printer: null, columns: null, identification: { key: "00", value: "095060001343769984", qualifiers: {}, attributes: [] } };
    expect(readWork(workFile(lean))).toEqual(lean);
  });

  it("the studio's ZPL carries the work in comments and opens too, the commands unchanged", () => {
    const long: Work = { ...WORK, page: { ...WORK.page!, elements: [...WORK.page!.elements, { id: "n", kind: "text", text: "Ç".repeat(3000), heightMm: 2, xMm: 1, yMm: 50 }] } };
    const zpl = zplWithWork(ZPL, long);
    const comments = zpl.split("\n").filter((line) => line.startsWith("^FX "));
    expect(comments.length).toBeGreaterThan(5); // several parts of 1,000 characters
    expect(comments.every((c, i) => c.startsWith(`^FX GS1 Label Studio work ${i + 1}/${comments.length} `) && c.length <= 1040)).toBe(true);
    expect(comments.join("")).not.toMatch(/[~]|\^(?!FX )/); // nothing that would end a comment early
    expect(zpl.split("\n").filter((line) => !line.startsWith("^FX ")).join("\n")).toBe(ZPL);
    expect(zpl.startsWith("^XA\n^FX ")).toBe(true);
    expect(readWork(zpl)).toEqual(long);
    expect(readWork(zplWithWork(ZPL.replaceAll("\n", ""), WORK))).toEqual(WORK); // a ZPL in one line
  });

  it("refuses what the studio did not save, and says why", () => {
    const notOurs = "This file is not a work saved by GS1 Label Studio.";
    expect(refusal("GTIN;Lote\n09506000134376;B42")).toBe(notOurs);
    expect(refusal("{ not json")).toBe(notOurs);
    expect(refusal(JSON.stringify({ format: "something.else", version: 1 }))).toBe(notOurs);
    expect(refusal(JSON.stringify({ ...JSON.parse(workFile(WORK)), version: WORK_VERSION + 1 })))
      .toBe("This work was saved by a newer version of GS1 Label Studio: reload the page to update it, then open it again.");
    expect(refusal(ZPL)).toBe("This ZPL carries no work: only the ZPL that GS1 Label Studio downloads can be opened here.");
    const zpl = zplWithWork(ZPL, WORK).split("\n");
    const missing = "Part of the work in this ZPL is missing: download the ZPL again.";
    expect(refusal(zpl.filter((line, i) => !(line.startsWith("^FX ") && i === 2)).join("\n"))).toBe(missing);
    expect(refusal(zpl.map((line) => (line.startsWith("^FX ") ? line.replace(/.{8}$/, "") : line)).join("\n"))).toBe(missing);
    expect(refusal(zpl.map((line) => line.replace(/ 2\/(\d+) /, " 1/$1 ")).join("\n"))).toBe(missing); // a part twice, one lost
    expect(() => zplWithWork("^FO10,10^FS", WORK)).toThrow("The ZPL has no ^XA, so it cannot carry the work.");
  });

  it("refuses a work file with a part not as the studio writes it, naming the part", () => {
    const saved = JSON.parse(workFile(WORK)) as Record<string, unknown>;
    const page = saved.page as { elements: Record<string, unknown>[] };
    const changed = (change: (copy: Record<string, unknown>) => void) => {
      const copy = structuredClone(saved);
      change(copy);
      return refusal(JSON.stringify(copy));
    };
    const element = (i: number, change: Record<string, unknown>) =>
      changed((c) => Object.assign((c.page as typeof page).elements[i]!, change));
    const at = (what: string) => `The work file is damaged: ${what} is not as the studio writes it.`;
    expect(changed((c) => { c.mode = "many"; })).toBe(at("the mode"));
    expect(changed((c) => { (c.identification as Record<string, unknown>).attributes = [["17"]]; })).toBe(at("the data"));
    expect(changed((c) => { (c.answers as Record<string, unknown>).retail = "yes"; })).toBe(at("step 2's answers"));
    expect(changed((c) => { c.picked = { symbol: "aztec" }; })).toBe(at("the symbol picked in step 2"));
    expect(changed((c) => { (c.settings as Record<string, unknown>).size = { percent: 100 }; })).toBe(at("the label's settings"));
    expect(element(0, { kind: "circle" })).toBe(at("element 1 of the label's page"));
    expect(element(5, { symbology: "aztec" })).toBe(at("element 6 of the label's page"));
    expect(element(6, { months: "fr" })).toBe(at("element 7 of the label's page"));
    expect(element(1, { thicknessMm: "0.5" })).toBe(at("element 2 of the label's page"));
    expect(element(3, { filled: 1 })).toBe(at("element 4 of the label's page"));
    expect(element(2, { id: "frame" })).toBe(at("the label's page"));
    expect(changed((c) => { (c.page as Record<string, unknown>).widthMm = null; })).toBe(at("the label's page"));
    expect(changed((c) => { ((c.printer as Record<string, unknown>).profile as Record<string, unknown>).language = "pcl"; })).toBe(at("the printer"));
    expect(changed((c) => { (c.columns as Record<string, unknown>).mapping = ["01"]; })).toBe(at("the spreadsheet's columns"));
  });
});
