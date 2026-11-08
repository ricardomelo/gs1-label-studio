import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  checkRows,
  fieldColumns,
  guessColumn,
  guessMapping,
  normaliseCell,
  parseDelimited,
  parseXlsx,
  rowCells,
  rowIdentification,
  syntaxEngine,
  type SyntaxEngine,
} from "../src/index.ts";

// Bulk generation, item 2.1: columns mapped to AIs, values the same on every row, each row checked as a single code.

let engine: SyntaxEngine;
beforeAll(async () => {
  engine = await syntaxEngine();
});

describe("which AI a column holds, from its header", () => {
  it.each([
    ["GTIN", "01"], ["EAN-13", "01"], ["Código de barras", "01"], ["(01)", "01"], ["AI 10", "10"], ["17 - expiry", "17"],
    ["3103", "3103"], ["Lote", "10"], ["Batch/Lot", "10"], ["BATCH/LOT", "10"], ["Validade", "17"], ["Data de validade", "17"],
    ["USE BY or EXPIRY", "17"], ["Best before", "15"], ["Fabricação", "11"], ["Número de série", "21"], ["Serial", "21"],
    ["SSCC", "00"], ["Peso (kg)", "310n"], ["Net weight (kg)", "310n"], ["GLN", "414"], ["País de origem", "422"],
    // AIs as headers, for import files that work for every AI (the owner, 29 October 2026)
    ["00", "00"], ["(00) SSCC", "00"], ["(01) GTIN", "01"], ["(21) Número de série", "21"], ["AI (17) expiry", "17"],
    ["(310n)", "310n"], ["310n - net weight", "310n"], ["(3922) Price", "3922"], ["(8020)", "8020"],
  ])("%s → (%s)", (header, ai) => {
    expect(guessColumn(header)).toBe(ai);
  });

  it("leaves out what it does not know, and a second column for an AI already taken", () => {
    expect(guessColumn("Descrição")).toBeNull();
    expect(guessColumn("99999")).toBeNull();
    expect(guessColumn("10 kg")).toBeNull(); // a number in a header is not an AI without brackets or a dash
    expect(guessColumn("(399n)")).toBeNull(); // no such decimal family
    expect(guessColumn("(99)")).toBe("99");
    expect(guessMapping(["GTIN", "EAN", "Lote", "Notes"])).toEqual(["01", null, "10", null]);
  });
});

describe("cells as the AI takes them", () => {
  it("writes dates as YYMMDD from Excel's ISO form and from day-first forms; leaves other values as they are", () => {
    expect(normaliseCell("17", "2027-12-31")).toBe("271231");
    expect(normaliseCell("17", "2027-12-31 00:00:00")).toBe("271231");
    expect(normaliseCell("15", "5/1/2028")).toBe("280105");
    expect(normaliseCell("11", "31.12.27")).toBe("271231");
    expect(normaliseCell("17", "271231")).toBe("271231");
    expect(normaliseCell("17", "31/02/2027")).toBe("270231"); // the Syntax Engine refuses it, with its reason
    expect(normaliseCell("10", "2027-12-31")).toBe("2027-12-31");
    expect(normaliseCell("17", "31/12/2027 15:30")).toBe("271231"); // a time after a date that carries none is dropped
    expect(normaliseCell("17", "2027-12-31 15:30:20")).toBe("271231");
  });

  it("keeps a time after a YYMMDD date as HHMM when the AI carries one, its seconds when the AI takes them", () => {
    expect(normaliseCell("7003", "2027-12-31 15:30")).toBe("2712311530");
    expect(normaliseCell("7003", "2027-12-31T15:30:20")).toBe("2712311530"); // (7003) takes no seconds
    expect(normaliseCell("7003", "31/12/2027 8:05")).toBe("2712310805");
    expect(normaliseCell("7003", "31.12.27 08:05")).toBe("2712310805");
    expect(normaliseCell("7003", "2027-12-31 00:00:00")).toBe("2712310000"); // its time is not optional
    expect(normaliseCell("7003", "2027-12-31")).toBe("271231"); // its time missing: the Syntax Engine says so
    expect(normaliseCell("7003", "2712311530")).toBe("2712311530");
    expect(normaliseCell("4324", "2027-12-00 06:00")).toBe("2712000600"); // a day 00, as YYMMD0 allows
    expect(normaliseCell("4325", "31/12/2027 18:00")).toBe("2712311800");
    expect(normaliseCell("8008", "2026-10-01 08:05:09")).toBe("261001080509");
    expect(normaliseCell("8008", "01/10/2026 08:05:09")).toBe("261001080509");
    expect(normaliseCell("8008", "2026-10-01 08:05")).toBe("2610010805");
    expect(normaliseCell("8008", "2026-10-01 00:00:00")).toBe("261001000000"); // its hour is not optional
    expect(normaliseCell("7011", "2027-06-30 10:15")).toBe("2706301015");
    expect(normaliseCell("7011", "2027-06-30 00:00")).toBe("2706300000"); // midnight typed
    expect(normaliseCell("7011", "2027-06-30 00:00:00")).toBe("270630"); // a date alone, exported: its time optional
    expect(normaliseCell("7011", "30/06/2027 00:00:00")).toBe("270630");
  });

  it("reads a time on a 12-hour clock with AM or PM: 12 AM is 00, 12 PM is 12", () => {
    expect(normaliseCell("7011", "2027-06-30 10:15 AM")).toBe("2706301015");
    expect(normaliseCell("7003", "31/12/2027 3:30 PM")).toBe("2712311530");
    expect(normaliseCell("7003", "31/12/2027 3:30PM")).toBe("2712311530");
    expect(normaliseCell("7003", "31/12/2027 03:30 p.m.")).toBe("2712311530");
    expect(normaliseCell("7003", "31/12/2027 9:05 am")).toBe("2712310905");
    expect(normaliseCell("7003", "31/12/2027 12:10 AM")).toBe("2712310010");
    expect(normaliseCell("7003", "31/12/2027 12:10 PM")).toBe("2712311210");
    expect(normaliseCell("7003", "2027-12-31 11:59 PM")).toBe("2712312359");
    expect(normaliseCell("8008", "01/10/2026 8:05:09 PM")).toBe("261001200509");
    expect(normaliseCell("7011", "2027-06-30 12:00:00 AM")).toBe("270630"); // midnight with its seconds, as exported
    expect(normaliseCell("7003", "31/12/2027 13:30 PM")).toBe("31/12/2027 13:30 PM"); // left for the engine to refuse
    expect(normaliseCell("7003", "31/12/2027 0:30 AM")).toBe("31/12/2027 0:30 AM");
    expect(normaliseCell("17", "31/12/2027 3:30 PM")).toBe("271231"); // (17) carries no time: dropped
    expect(normaliseCell("17", "31/12/2027 0:30 AM")).toBe("271231");
  });

  it("reads (7007)'s harvest period as two dates, YYMMDDYYMMDD, and its first date alone as YYMMDD", () => {
    expect(normaliseCell("7007", "01/09/2027 - 15/09/2027")).toBe("270901270915");
    expect(normaliseCell("7007", "01/09/2027–15/09/2027")).toBe("270901270915");
    expect(normaliseCell("7007", "2027-09-01 — 2027-09-15")).toBe("270901270915");
    expect(normaliseCell("7007", "2027-09-01 to 2027-09-15")).toBe("270901270915");
    expect(normaliseCell("7007", "1/9/27 a 15/9/27")).toBe("270901270915");
    expect(normaliseCell("7007", "01.09.2027 até 15.09.2027")).toBe("270901270915");
    expect(normaliseCell("7007", "01/09/2027 AL 15/09/2027")).toBe("270901270915");
    expect(normaliseCell("7007", "01/09/2027 hasta 15/09/2027")).toBe("270901270915");
    expect(normaliseCell("7007", "2027-09-01 2027-09-15")).toBe("270901270915");
    expect(normaliseCell("7007", "270901 - 15/09/2027")).toBe("270901270915");
    expect(normaliseCell("7007", "270901270915")).toBe("270901270915");
    expect(normaliseCell("7007", "01/09/2027")).toBe("270901");
    expect(normaliseCell("7007", "2027-09-01 00:00:00")).toBe("270901"); // an Excel date: (7007) carries no time
    expect(normaliseCell("7007", "01/09/2027 - soon")).toBe("01/09/2027 - soon"); // left for the engine to refuse
    expect(normaliseCell("7007", "01/09/2027 - 15/09/2027 - 30/09/2027")).toBe("01/09/2027 - 15/09/2027 - 30/09/2027");
    expect(normaliseCell("7003", "2027-09-01 2027-09-15")).toBe("2027-09-01 2027-09-15"); // (7003)'s second part is a time
    expect(normaliseCell("17", "01/09/2027 - 15/09/2027")).toBe("01/09/2027 - 15/09/2027");
  });

  it("writes a date of birth as YYYYMMDD, its century never guessed, and (7251)'s time as HHMM", () => {
    expect(normaliseCell("7250", "1980-01-15")).toBe("19800115");
    expect(normaliseCell("7250", "1980-01-15 00:00:00")).toBe("19800115"); // an Excel date: no time for (7250)
    expect(normaliseCell("7250", "15/1/1980")).toBe("19800115");
    expect(normaliseCell("7250", "15.01.1980")).toBe("19800115");
    expect(normaliseCell("7250", "19800115")).toBe("19800115");
    expect(normaliseCell("7250", "15/01/80")).toBe("15/01/80"); // 1980 or 2080: left for the Syntax Engine to refuse
    expect(normaliseCell("7250", "800115")).toBe("800115");
    expect(normaliseCell("7251", "1980-01-15 08:30")).toBe("198001150830");
    expect(normaliseCell("7251", "1980-01-15T08:30:00")).toBe("198001150830");
    expect(normaliseCell("7251", "15/01/1980 8:30")).toBe("198001150830");
    expect(normaliseCell("7251", "1980-01-15")).toBe("19800115"); // its time missing: the Syntax Engine says so
    expect(normaliseCell("7251", "198001150830")).toBe("198001150830");
  });
});

describe("a row's cells by their column's header", () => {
  // For a label of one's own's {column} fields (backlog 4.2)
  it("keeps each cell trimmed under its header, leaves out a column without one and keeps the first of two", () => {
    const headers = ["GTIN", "Description", "", "Description", " Price "];
    expect(rowCells(headers, ["09506000134376", "  Tapenade ", "x", "second", "4,50"])).toEqual({ GTIN: "09506000134376", Description: "Tapenade", " Price ": "4,50" });
    expect(rowCells(headers, ["09506000134376"])).toEqual({ GTIN: "09506000134376", Description: "", " Price ": "" });
  });

  it("offers as fields the columns holding no AI, by a header a field can name, the first of two alike", () => {
    const headers = ["GTIN", " Description ", "", "description", "Price {BRL}", "10", "Lote", "2024"];
    expect(fieldColumns(headers, ["01", null, null, null, null, null, "10", null])).toEqual([{ column: 1, name: "Description" }]);
    expect(fieldColumns(["Origin", "Origin "], [null, null])).toEqual([{ column: 0, name: "Origin" }]);
  });
});

describe("rows as identifications", () => {
  it("takes the key, its qualifiers and the attributes, with the fixed values last", () => {
    const id = rowIdentification(["0,5", "09506000134376", "B42", "2027-12-31", "x"], ["310n", "01", "10", "17", null], [["422", "076"]]);
    expect(id).toEqual({ key: "01", value: "09506000134376", qualifiers: { "10": "B42" }, attributes: [["310n", "0,5"], ["17", "271231"], ["422", "076"]] });
  });

  it("says why a row has no key", () => {
    expect(() => rowIdentification(["B42"], ["10"])).toThrow(/No column holds a key/);
    expect(() => rowIdentification(["", "B42"], ["01", "10"])).toThrow(/key's column is empty/);
  });

  it("checks every row of a workbook with the Syntax Engine, numbering rows as the spreadsheet does", async () => {
    const table = await parseXlsx(new Uint8Array(readFileSync(new URL("./fixtures/bulk/products.xlsx", import.meta.url))));
    const mapping = guessMapping(table.headers);
    expect(mapping).toEqual(["01", "10", "17", "310n", null, "11"]);
    const rows = checkRows(engine, table, mapping, [], "https://id.gs1.org");
    expect(rows.map((r) => [r.row, r.identified?.elementString ?? r.error])).toEqual([
      [2, "(01)09506000134376(10)B42(17)271231(3101)000005(11)261001"],
      [3, "(01)09506000134352(10)L-7(17)280105(3102)000125(11)261001"],
      [4, "The check digit does not match: it should be 2."],
      [5, "The key's column is empty on this row."],
    ]);
    expect(rows[0]!.identified!.digitalLinkUri).toBe("https://id.gs1.org/01/09506000134376/10/B42?17=271231&3101=000005&11=261001");
  });

  it("keeps the time of a workbook's date cells for the AIs that carry one, as each cell's format shows it", async () => {
    const table = await parseXlsx(new Uint8Array(readFileSync(new URL("./fixtures/bulk/times.xlsx", import.meta.url))));
    const mapping = guessMapping(table.headers);
    expect(mapping).toEqual(["01", "7003", "8008", "7011", "17", "7007", null]);
    const rows = checkRows(engine, table, mapping);
    expect(rows.map((r) => r.identified?.elementString ?? r.error)).toEqual([
      "(01)09506000134376(7003)2712311530(8008)261001080509(7011)270630(17)271231(7007)270901270915",
      "(01)09506000134352(7003)2801050000(8008)261001235959(7011)270630(17)280105(7007)270901270915",
    ]);
  });

  it("checks pasted rows the same way, a date the engine refuses reported for its row", () => {
    const table = parseDelimited("GTIN\tValidade\n09506000134376\t31/12/2027\n09506000134376\t31/02/2027\n");
    const rows = checkRows(engine, table, guessMapping(table.headers));
    expect(rows[0]!.identified!.elementString).toBe("(01)09506000134376(17)271231");
    expect(rows[1]!.error).toMatch(/17/);
  });
});
