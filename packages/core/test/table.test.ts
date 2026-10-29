import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { excelDate, excelNumber, parseDelimited, parseTableFile, parseXlsx, TableError, zipArchive } from "../src/index.ts";

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
  });
});
