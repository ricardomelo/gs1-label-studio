import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  checkRows,
  guessColumn,
  guessMapping,
  normaliseCell,
  parseDelimited,
  parseXlsx,
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

  it("checks pasted rows the same way, a date the engine refuses reported for its row", () => {
    const table = parseDelimited("GTIN\tValidade\n09506000134376\t31/12/2027\n09506000134376\t31/02/2027\n");
    const rows = checkRows(engine, table, guessMapping(table.headers));
    expect(rows[0]!.identified!.elementString).toBe("(01)09506000134376(17)271231");
    expect(rows[1]!.error).toMatch(/17/);
  });
});
