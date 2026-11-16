import { check, checkGroup, readingFromText, reportPdf, surveyCounts, SyntaxEngine, type CheckedRecord, type ReportBlock, type ReportDocument } from "@gs1-label-studio/core";
import { beforeAll, describe, expect, it } from "vitest";
import { itemReport, readingReport, sessionReport, verdictWord } from "../src/reports.ts";

// The Check Studio's reports (backlog 7.1 k; the check studio's project, section 7.3 and item k's acceptance): what
// each report holds, built from the words the screen uses. The PDF's own layout and text are the core's
// (packages/core/test/checkReport.test.ts); the buttons and downloads, e2e/check-report.spec.ts.

let engine: SyntaxEngine;
beforeAll(async () => {
  engine = await SyntaxEngine.create();
});

const releases = { engine: "1.0.0", dictionary: "2026-01-01" };
const text = (data: string) => readingFromText(data, { source: "paste", at: new Date("2026-11-16T20:00:00Z") });
const all = (doc: ReportDocument) =>
  doc.blocks.flatMap((b: ReportBlock) => (b.kind === "pairs" ? b.rows.flat() : b.kind === "table" ? [...b.head, ...b.rows.flat()] : "text" in b ? [b.text] : [])).join("\n");
const pages = (pdf: Uint8Array) => Number(/\/Count (\d+)/.exec(new TextDecoder("latin1").decode(pdf))![1]);

describe("the report of one reading", () => {
  it("has the verdict, what the code says, each fault with what, where, why and fix, the print quality sentence and the expert annex, in two pages", async () => {
    // The project's worked example (section 6.3): a plain Data Matrix, a month 13
    const reading = text("]d10109506000134352172713001" + "0ABC123");
    const result = check(engine, reading, {});
    const doc = readingReport(reading, result, null, releases);
    const words = all(doc);
    expect(words).toContain(verdictWord(result.verdict));
    expect(words).toContain("What the code says");
    for (const f of result.findings.filter((x) => x.severity !== "not-assessed")) expect(words).toContain(` · ${f.code} — `);
    expect(words).toContain("Why it matters:");
    expect(words).toContain("How to fix:");
    expect(words).toContain("Print quality: a phone or a page cannot grade it; that needs a barcode verifier.");
    expect(words).toContain("For experts");
    expect(words).toContain("30 31 30 39"); // the bytes in hexadecimal
    expect(doc.footer).toContain("GS1 Barcode Syntax Engine 1.0.0, dictionary 2026-01-01");
    expect(pages(await reportPdf(doc))).toBeLessThanOrEqual(2);
  });
});

describe("the report of an item", () => {
  it("has the matrix with the differing cells in bold, the group's faults and each code", () => {
    const a = text("]E09506000134352");
    const b = text("]d201095060001343691727123110ABC");
    const members = [a, b].map((reading) => ({ reading, result: check(engine, reading, {}) }));
    const group = checkGroup(members, "consumer-pack", {});
    const doc = itemReport(members, group, "consumer-pack", releases);
    const matrix = doc.blocks.find((x) => x.kind === "table")!;
    if (matrix.kind !== "table") throw new Error("no matrix");
    const gtin = group.matrix.findIndex((r) => r.ai === "01");
    expect(matrix.rows[gtin]!.slice(1)).toEqual(["09506000134352", "09506000134369"]);
    expect(matrix.bold![gtin]).toEqual([false, true, true]);
    expect(all(doc)).toContain(" · J1 — ");
    expect(all(doc)).toMatch(/J1 — [^\n]*\nWhere: Codes 1 and 2[^\n]*\nHow to fix: /);
    expect(all(doc)).toContain("A consumer pack");
  });
});

describe("the report of a session", () => {
  it("counts what is listed: by verdict, GS1, non-GS1 and no barcode, then one line per reading", () => {
    const readings = [text("]d20109506000134352"), text("]Q1https://example.com"), text("]d10109506000134352"), null];
    const records: CheckedRecord[] = readings.map((reading) => ({
      reading, at: "2026-11-16T20:00:00Z", session: "Ward 3", group: null, environment: null, note: "", result: reading ? check(engine, reading, {}) : null,
    }));
    const counts = surveyCounts(records);
    const doc = sessionReport("Ward 3", records, counts, releases);
    const tables = doc.blocks.filter((x) => x.kind === "table");
    const [byVerdict, kinds] = tables;
    if (byVerdict?.kind !== "table" || kinds?.kind !== "table") throw new Error("no tables");
    expect(byVerdict.rows.reduce((n, r) => n + Number(r[1]), 0)).toBe(4);
    expect(kinds.rows.map((r) => r[1])).toEqual([String(counts.gs1), String(counts.nonGs1), "1"]);
    const every = tables.at(-1)!;
    if (every.kind !== "table") throw new Error("no list");
    expect(every.rows).toHaveLength(4);
    expect(every.rows[3]![4]).toBe("No barcode");
    expect(doc.blocks[0]).toEqual({ kind: "title", text: "Session report: Ward 3" });
  });
});
