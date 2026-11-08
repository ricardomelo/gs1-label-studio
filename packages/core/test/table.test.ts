import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { excelDate, excelNumber, excelTimeOfDay, parseDelimited, parseTableFile, parseXlsx, TableError, zipArchive } from "../src/index.ts";

// Rows for bulk generation (item 2.1): CSV, rows pasted from a spreadsheet and Excel workbooks, read without a library.

describe("delimited text", () => {
  it("reads a CSV with quotes, doubled quotes, line breaks inside quotes and CRLF", () => {
    const table = parseDelimited('GTIN,Description\r\n09506000134376,"Chocolate, 100 g ""dark"""\r\n09506000134352,"two\nlines"\r\n');
    expect(table.headers).toEqual(["GTIN", "Description"]);
    expect(table.rows).toEqual([["09506000134376", 'Chocolate, 100 g "dark"'], ["09506000134352", "two\nlines"]]);
  });

  it("takes the delimiter the first line has most of: a semicolon (decimal commas), a tab (pasted rows)", () => {
    expect(parseDelimited("GTIN;Peso (kg)\n09506000134376;0,5\n").rows).toEqual([["09506000134376", "0,5"]]);
    expect(parseDelimited("GTIN\tLote\n09506000134376\tB42\n\n").rows).toEqual([["09506000134376", "B42"]]);
  });

  it("keeps leading zeros, trims cells, fills short rows, names empty headers and drops empty lines", () => {
    const table = parseDelimited("﻿GTIN,,Lote\n 09506000134376 ,x\n,,\n");
    expect(table.headers).toEqual(["GTIN", "Column 2", "Lote"]);
    expect(table.rows).toEqual([["09506000134376", "x", ""]]);
  });

  it("refuses an unclosed quote and an empty file", () => {
    expect(() => parseDelimited('GTIN\n"0950')).toThrow(TableError);
    expect(() => parseDelimited("\n\n")).toThrow(TableError);
  });
});

describe("Excel workbooks", () => {
  const bytes = new Uint8Array(readFileSync(new URL("./fixtures/bulk/products.xlsx", import.meta.url)));

  it("reads the first worksheet of a workbook openpyxl wrote: shared and rich text, dates, numbers", async () => {
    const table = await parseXlsx(bytes);
    expect(table.sheet).toBe("Produtos");
    expect(table.headers).toEqual(["GTIN", "Lote", "Validade", "Peso (kg)", "Descrição", "Fabricação"]);
    // Validade has a format of its own (dd/mm/yyyy), Fabricação Excel's built-in date format 14.
    expect(table.rows).toEqual([
      ["09506000134376", "B42", "2027-12-31", "0.5", "Chocolate & cacau <100 g>", "2026-10-01"],
      ["09506000134352", "L-7", "2028-01-05", "1.25", "Rich text", "2026-10-01"],
      ["09506000134353", "X1", "2027-06-30", "2", "bad check digit", "2026-10-01"],
      ["", "Y", "2027-06-30", "2", "no GTIN", "2026-10-01"],
    ]);
  });

  it("tells a workbook from text by its signature", async () => {
    expect((await parseTableFile(bytes)).sheet).toBe("Produtos");
    expect((await parseTableFile(new TextEncoder().encode("GTIN\n09506000134376"))).rows).toEqual([["09506000134376"]]);
    // A CSV saved by a spreadsheet in Windows-1252.
    expect((await parseTableFile(Uint8Array.from([0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0xe7, 0xe3, 0x6f, 0x0a, 0x78]))).headers)
      .toEqual(["Descrição"]);
  });

  it("refuses a zip that is not a workbook", async () => {
    const zip = await zipArchive([{ name: "a.txt", bytes: new TextEncoder().encode("a") }]);
    await expect(parseXlsx(zip)).rejects.toThrow(/no xl\/workbook.xml/);
  });

  it("shows numbers as Excel does, to 15 significant digits", () => {
    expect(excelNumber("0.30000000000000004")).toBe("0.3");
    expect(excelNumber("9506000134376")).toBe("9506000134376");
    expect(excelNumber("1.25")).toBe("1.25");
  });

  it("counts Excel's dates from its 1900 system", () => {
    expect(excelDate(46387)).toBe("2026-12-31");
    expect(excelDate(25569)).toBe("1970-01-01");
    expect(excelDate(46387.75)).toBe("2026-12-31"); // a format that shows no time
  });

  it("writes the time of day a date's format shows, to the nearest second", () => {
    expect(excelDate(46387.75, "minutes")).toBe("2026-12-31 18:00");
    expect(excelDate(46387.75, "seconds")).toBe("2026-12-31 18:00:00");
    expect(excelDate(46296.33690972222, "seconds")).toBe("2026-10-01 08:05:09");
    expect(excelDate(46296.99999999, "seconds")).toBe("2026-10-02 00:00:00"); // 23:59:59.999 rounds to the next day
    expect(excelDate(46296.99999999)).toBe("2026-10-01");
    expect(excelDate(46387, "minutes")).toBe("2026-12-31 00:00");
  });

  it("writes a time alone on a 24-hour clock, to the nearest second, any whole days left out", () => {
    expect(excelTimeOfDay(0.6458333333333334, "minutes")).toBe("15:30");
    expect(excelTimeOfDay(0.6458333333333334, "seconds")).toBe("15:30:00");
    expect(excelTimeOfDay(0.999988425925926, "seconds")).toBe("23:59:59");
    expect(excelTimeOfDay(0.99999999, "seconds")).toBe("00:00:00"); // 23:59:59.999 rounds to midnight
    expect(excelTimeOfDay(0.33690972222, "seconds")).toBe("08:05:09");
    expect(excelTimeOfDay(0.33690972222, "minutes")).toBe("08:05");
    expect(excelTimeOfDay(0, "minutes")).toBe("00:00");
    expect(excelTimeOfDay(46387.75, "minutes")).toBe("18:00");
  });

  it("reads a workbook's date cells with the time their format shows: its own, Excel's built-in 22, or none", async () => {
    const table = await parseXlsx(new Uint8Array(readFileSync(new URL("./fixtures/bulk/times.xlsx", import.meta.url))));
    expect(table.rows.map((row) => row.slice(0, 5))).toEqual([
      ["09506000134376", "2027-12-31 15:30", "2026-10-01 08:05:09", "2027-06-30", "2027-12-31 15:30"],
      ["09506000134352", "2028-01-05 00:00", "2026-10-01 23:59:59", "2027-06-30", "2028-01-05 23:59"],
    ]);
  });

  it("tells a time alone from a date by each style's format: built-in or custom, AM/PM and brackets left out", async () => {
    // One column per style: the format, then how 1.75 (a day and 18:00) or 46387.75 (31/12/2026 18:00) reads.
    const formats: [number | string, number, string][] = [
      [20, 0.75, "18:00"], [21, 0.75, "18:00:00"], [18, 0.75, "18:00"], [19, 0.75, "18:00:00"],
      [45, 0.75, "18:00:00"], [46, 1.75, "18:00:00"], [47, 0.75, "18:00:00"], // mm:ss, [h]:mm:ss, mmss.0
      ["h:mm AM/PM", 0.75, "18:00"], ["hh:mm A/P", 0.75, "18:00"], ["[h]:mm", 1.75, "18:00"], ["mm:ss", 0.75, "18:00:00"],
      ["[$-409]h:mm:ss AM/PM;@", 0.75, "18:00:00"], ['h"h"mm', 0.75, "18:00"],
      [14, 46387.75, "2026-12-31"], ["dd/mm/yyyy h:mm AM/PM", 46387.75, "2026-12-31 18:00"], ["mmm-yy", 46387, "2026-12-31"],
      [0, 0.75, "0.75"], ["0.00", 0.75, "0.75"], ["[Red]0.00;[Blue]-0.00", 0.75, "0.75"], ['0 "pcs"', 3, "3"],
    ];
    const custom = formats.flatMap(([f], i) => (typeof f === "string" ? [`<numFmt numFmtId="${164 + i}" formatCode="${f.replace(/"/g, "&quot;")}"/>`] : []));
    const xfs = formats.map(([f], i) => `<xf numFmtId="${typeof f === "string" ? 164 + i : f}"/>`);
    const cells = formats.map(([, v], i) => `<c r="${String.fromCharCode(65 + i)}2" s="${i}"><v>${v}</v></c>`);
    const header = formats.map((_, i) => `<c r="${String.fromCharCode(65 + i)}1" t="inlineStr"><is><t>c${i}</t></is></c>`);
    const encode = (text: string) => new TextEncoder().encode(text);
    const zip = await zipArchive([
      { name: "xl/workbook.xml", bytes: encode('<workbook><sheets><sheet name="T" sheetId="1"/></sheets></workbook>') },
      { name: "xl/styles.xml", bytes: encode(`<styleSheet><numFmts>${custom.join("")}</numFmts><cellXfs>${xfs.join("")}</cellXfs></styleSheet>`) },
      { name: "xl/worksheets/sheet1.xml", bytes: encode(`<worksheet><sheetData><row r="1">${header.join("")}</row><row r="2">${cells.join("")}</row></sheetData></worksheet>`) },
    ]);
    expect((await parseXlsx(zip)).rows[0]).toEqual(formats.map(([, , out]) => out));
  });

  it("reads a workbook's time cells as HH:MM or HH:MM:SS: Excel's built-in 18, a custom format with AM/PM", async () => {
    const table = await parseXlsx(new Uint8Array(readFileSync(new URL("./fixtures/bulk/times.xlsx", import.meta.url))));
    expect(table.rows.map((row) => row.slice(5))).toEqual([
      ["01/09/2027 - 15/09/2027", "15:30"],
      ["2027-09-01 to 2027-09-15", "23:59:59"],
    ]);
  });
});
