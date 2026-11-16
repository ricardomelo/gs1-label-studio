import { beforeAll, describe, expect, it } from "vitest";
import {
  check, FINDINGS_COLUMNS, findingsCsv, ndefUriMessage, parseReadingsJson, READINGS_COLUMNS, READINGS_FORMAT, readingFromDecoder, readingFromEpc, readingFromNdef,
  readingFromText, readingsCsv, readingsJson, recordVerdict, surveyCounts, symbologyName, SyntaxEngine, type CheckedRecord, type ReadingRecord,
} from "../src/index.ts";

// The Check Studio's readings as files (backlog 7.1 k; the check studio's project, section 7.2 and item k's
// acceptance): readings.json exported and opened again gives identical readings and, checked again, identical findings;
// readings.csv has one row per reading with its accents intact and fields quoted where they must be; findings.csv one
// row per finding; a session's counts equal what the history's filters count.

let engine: SyntaxEngine;
beforeAll(async () => {
  engine = await SyntaxEngine.create();
});

const GS = "\u001d";
const at = "2026-11-16T20:00:00.000Z";
const when = new Date(at);

/** Readings of every kind: a GS1 DataMatrix with a fault, a clean GS1-128, a plain QR Code, an NFC tag, an EPC, typed text. */
function records(): ReadingRecord[] {
  const symbol = (format: string, symbologyIdentifier: string, text: string) =>
    readingFromDecoder({ format, symbologyIdentifier, bytes: new TextEncoder().encode(text) }, { source: "camera", at: when });
  return [
    { reading: symbol("DataMatrix", "]d2", `01095060001343521727130010ABC123${GS}21SÉRIE`), at, session: "Ala 3, 15 de novembro", group: null, environment: "retail", note: "" },
    { reading: symbol("Code128", "]C1", "0109506000134352"), at, session: "Ala 3, 15 de novembro", group: "2026-11-16 20:00:00", environment: null, note: 'A "quoted", note\nover two lines' },
    { reading: symbol("QRCode", "]Q1", "https://example.com/não-gs1"), at, session: null, group: null, environment: null, note: "" },
    { reading: readingFromNdef(ndefUriMessage("https://id.gs1.org/01/09506000134352"), { at: when }), at, session: null, group: null, environment: null, note: "" },
    { reading: readingFromEpc("3074257BF7194E4000001A85", { source: "paste", at: when }), at, session: null, group: null, environment: null, note: "" },
    { reading: readingFromText("(01)09506000134369(10)ÄÖÜ", { source: "paste", at: when }), at, session: null, group: null, environment: null, note: "" },
    { reading: null, at, session: "Ala 3, 15 de novembro", group: null, environment: null, note: "Sem código" },
  ];
}

/** The first reading as a mirrored symbol would give it: every field of the reading travels. */
function mirroredFirst(list: ReadingRecord[]): ReadingRecord[] {
  list[0] = { ...list[0]!, reading: { ...list[0]!.reading!, mirrored: true, ecLevel: "M", position: [[1, 2], [3, 4], [5, 6], [7, 8]] } };
  return list;
}

const checked = (list: readonly ReadingRecord[]): CheckedRecord[] =>
  list.map((r) => ({ ...r, result: r.reading ? check(engine, r.reading, { environment: r.environment }) : null }));

/** A CSV's rows, as a spreadsheet reads RFC 4180 (quoted fields may hold the delimiter, quotes and line breaks). */
function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) row.push(field), (field = "");
    else if (c === "\r" && text[i + 1] === "\n") row.push(field), rows.push(row), (row = []), (field = ""), i++;
    else field += c;
  }
  return rows;
}

describe("readings.json", () => {
  it("opened again gives identical readings and, checked again, identical findings", () => {
    const before = mirroredFirst(records());
    const file = readingsJson(before);
    expect(JSON.parse(file)).toMatchObject({ format: READINGS_FORMAT, version: 1 });
    const after = parseReadingsJson(file);
    expect(after).toEqual(before);
    expect(checked(after).map((r) => r.result)).toEqual(checked(before).map((r) => r.result));
  });

  it("keeps the bytes as hexadecimal, so a group separator survives", () => {
    const file = JSON.parse(readingsJson(records().slice(0, 1)));
    expect(file.readings[0].reading.bytes).toMatch(/^[0-9A-F]+$/);
    expect(file.readings[0].reading.bytes).toContain("1D"); // the group separator
  });

  it("refuses what is not a readings file this release reads", () => {
    expect(() => parseReadingsJson("not json")).toThrow("This is not a readings file of GS1 Label Studio.");
    expect(() => parseReadingsJson(JSON.stringify({ format: "gs1-label-studio.work", version: 1, readings: [] }))).toThrow("This is not a readings file");
    expect(() => parseReadingsJson(JSON.stringify({ format: READINGS_FORMAT, version: 2, readings: [] }))).toThrow("later release");
    const bad = JSON.parse(readingsJson(records().slice(0, 1)));
    bad.readings[0].reading.bytes = "0G";
    expect(() => parseReadingsJson(JSON.stringify(bad))).toThrow("not hexadecimal");
    bad.readings[0].reading.source = "telepathy";
    expect(() => parseReadingsJson(JSON.stringify(bad))).toThrow("without its source");
  });
});

describe("readings.csv and findings.csv", () => {
  it("one row per reading, with the project's columns, a byte order mark and accents intact", () => {
    const list = checked(records());
    const csv = readingsCsv(list);
    expect(csv.startsWith("﻿")).toBe(true);
    const rows = parseCsv(csv.slice(1));
    expect(rows[0]).toEqual([...READINGS_COLUMNS]);
    expect(rows).toHaveLength(list.length + 1);
    const column = (name: (typeof READINGS_COLUMNS)[number]) => rows.slice(1).map((r) => r[READINGS_COLUMNS.indexOf(name)]);
    expect(column("Session")[0]).toBe("Ala 3, 15 de novembro"); // a comma, quoted
    expect(column("Note")[1]).toBe('A "quoted", note\nover two lines');
    expect(column("Raw text")[0]).toContain("{GS}21SÉRIE");
    expect(column("Symbology")).toEqual(["GS1 DataMatrix", "GS1-128", "QR Code", "NFC tag", "RFID tag", "", ""]);
    expect(column("Verdict")).toEqual(list.map(recordVerdict));
    expect(column("Verdict").at(-1)).toBe("no-barcode");
    expect(column("GTIN-14")[1]).toBe("09506000134352");
    expect(column("Group")[1]).toBe("2026-11-16 20:00:00");
    expect(column("Fault codes")[0]).toBe([...new Set(list[0]!.result!.findings.filter((f) => f.severity !== "not-assessed").map((f) => f.code))].join(" "));
  });

  it("a semicolon variant, quoting only what holds a semicolon", () => {
    const csv = readingsCsv(checked(records()), ";");
    const rows = parseCsv(csv.slice(1), ";");
    expect(rows[0]).toEqual([...READINGS_COLUMNS]);
    expect(rows).toHaveLength(records().length + 1);
    expect(csv).toContain(";Ala 3, 15 de novembro;"); // a comma needs no quotes here
  });

  it("findings.csv: one row per finding, numbered as its reading's row", () => {
    const list = checked(records());
    const rows = parseCsv(findingsCsv(list).slice(1));
    expect(rows[0]).toEqual([...FINDINGS_COLUMNS]);
    const findings = list.flatMap((r, i) => (r.result?.findings ?? []).map((f) => [String(i + 1), f.code, f.severity]));
    expect(findings.length).toBeGreaterThan(0);
    expect(rows.slice(1).map((r) => r.slice(0, 3))).toEqual(findings);
  });
});

describe("a session's counts", () => {
  it("equal what filtering by verdict counts, and GS1, non-GS1 and no barcode add up", () => {
    const list = checked(records());
    const counts = surveyCounts(list);
    expect(counts.total).toBe(list.length);
    for (const verdict of Object.keys(counts.verdicts) as (keyof typeof counts.verdicts)[]) {
      expect(counts.verdicts[verdict]).toBe(list.filter((r) => recordVerdict(r) === verdict).length);
    }
    expect(counts.noBarcode).toBe(1);
    expect(counts.nonGs1).toBe(1); // the plain QR Code's address
    expect(counts.gs1 + counts.nonGs1 + counts.noBarcode).toBe(list.length);
    expect(counts.symbologies.reduce((n, [, k]) => n + k, 0)).toBe(list.length - 1);
  });

  it("keeps the ten most frequent faults, the most first", () => {
    const counts = surveyCounts(checked(records()));
    expect(counts.faults.length).toBeLessThanOrEqual(10);
    const numbers = counts.faults.map(([, n]) => n);
    expect(numbers).toEqual([...numbers].sort((a, b) => b - a));
  });

  it("lists ten faults at most, when more are found", () => {
    const codes = ["A1", "B1", "B2", "B3", "C1", "C2", "D1", "D2", "D3", "E1", "E2", "G1"];
    const base = checked(records().slice(0, 1))[0]!;
    const list = codes.map((code, i) => ({ ...base, result: { ...base.result!, findings: codes.slice(i).map((c) => ({ ...base.result!.findings[0]!, code: c, severity: "error" as const })) } }));
    const counts = surveyCounts(list);
    expect(counts.faults).toHaveLength(10);
    expect(counts.faults[0]).toEqual(["G1", 12]);
  });

  it("counts by company prefix with a GCP table, by GS1 prefix without", () => {
    const list = checked(records());
    const byGs1 = surveyCounts(list);
    expect(byGs1.companyPrefixes).toBe(false);
    expect(byGs1.prefixes[0]![0]).toBe("950");
    const byCompany = surveyCounts(list, (part) => (part.startsWith("950600") ? 7 : null));
    expect(byCompany.companyPrefixes).toBe(true);
    expect(byCompany.prefixes.map(([p]) => p)).toContain("9506000");
  });

  it("names the symbologies as a person knows them", () => {
    const [dm, gs1128, qr, nfc, epc, typed] = records().map((r) => r.reading!);
    expect([dm, gs1128, qr, nfc, epc].map((r) => symbologyName(r!))).toEqual(["GS1 DataMatrix", "GS1-128", "QR Code", "NFC tag", "RFID tag"]);
    expect(symbologyName(typed!)).toBeNull();
    expect(symbologyName(readingFromText("]d10109506000134352", { source: "paste" }))).toBe("Data Matrix");
    expect(symbologyName(readingFromText("]E09506000134352", { source: "wedge" }))).toBe("EAN-13 / UPC-A");
  });
});
