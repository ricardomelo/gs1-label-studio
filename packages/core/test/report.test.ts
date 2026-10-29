import { beforeAll, describe, expect, it } from "vitest";
import {
  applyEdits,
  cellHint,
  checkRows,
  correctedCsv,
  editCell,
  parseDelimited,
  reportCounts,
  reportCsv,
  rowStatus,
  syntaxEngine,
  toDelimited,
  type CellEdits,
  type SyntaxEngine,
  type Table,
} from "../src/index.ts";

// The validation report, item 2.2: the column each error is about, what may have spoilt a value, values fixed in the
// studio, rows skipped, and the report and the corrected rows as CSV.

let engine: SyntaxEngine;
beforeAll(async () => {
  engine = await syntaxEngine();
});

const PASTED = "GTIN\tLote\tValidade\tPeso\n" +
  "09506000134376\tA1\t31/12/2027\t0,5\n" + // row 2: ready
  "09506000134352\tA2\t31/02/2028\t0,5\n" + // row 3: no 31 February
  "09506000134377\tA3\t30/06/2028\t0,5\n" + // row 4: check digit
  "\tA4\t30/06/2028\t0,5\n" + // row 5: no key
  "09506000134376\tB1\t01/01/2029\t0,1234567\n"; // row 6: too many decimal places for (310n)
const MAPPING = ["01", "10", "17", "310n"];

describe("the column each error is about", () => {
  it("finds the column of the AI the error names, or the key's column", () => {
    const rows = checkRows(engine, parseDelimited(PASTED), MAPPING);
    expect(rows.map((r) => [r.row, r.columns ?? []])).toEqual([[2, []], [3, [2]], [4, [0]], [5, [0]], [6, [3]]]);
    expect(rows[1]!.error).toBe("AI (17): The date contains an illegal day of the month.");
    expect(rows[2]!.error).toBe("The check digit does not match: it should be 6.");
  });

  it("names both qualifiers that cannot go together", () => {
    const table = parseDelimited("GTIN,Variant,Pack\n09506000134376,7,ABC\n");
    expect(checkRows(engine, table, ["01", "22", "235"])[0]!.columns).toEqual([1, 2]);
  });

  it("points at a value for every row rather than a column when the error is there", () => {
    const rows = checkRows(engine, parseDelimited("GTIN\n09506000134376\n"), ["01"], [["422", "076"], ["17", "270231"]]);
    expect(rows[0]).toMatchObject({ columns: [], fixedAt: [1] });
  });

  it("finds no column when no column holds a key", () => {
    expect(checkRows(engine, parseDelimited("Lote\nA1\n"), ["10"])[0]!.columns).toEqual([]);
  });
});

describe("what may have spoilt a value", () => {
  it("says when Excel kept 15 digits of a long code, or a CSV wrote it in scientific notation", () => {
    expect(cellHint("395060001343700000", true)).toMatch(/Excel keeps 15 digits/);
    expect(cellHint("1234567890123450", true)).toMatch(/Excel keeps 15 digits/); // 16 digits, the last one lost
    expect(cellHint("395060001343700001", true)).toBeUndefined(); // more than 15 digits kept: not Excel's number
    expect(cellHint("395060001343700000", false)).toBeUndefined(); // typed so in a CSV: no reason to think so
    expect(cellHint("9,50600E+12", false)).toMatch(/scientific notation/);
    expect(cellHint("9.506E+12", true)).toMatch(/scientific notation/);
    expect(cellHint("09506000134376", true)).toBeUndefined();
  });

  it("gives the hint with a workbook's SSCC refused by its check digit", () => {
    const table: Table = { headers: ["SSCC"], rows: [["395060001343700000"]], sheet: "Pallets" };
    const [row] = checkRows(engine, table, ["00"]);
    expect(row!.error).toMatch(/check digit/);
    expect(row!.hint).toMatch(/Excel keeps 15 digits/);
  });
});

describe("values fixed in the studio, rows skipped", () => {
  const table = parseDelimited(PASTED);

  it("fixes a cell without changing the file, and undoes the fix when the file's value comes back", () => {
    let edits: CellEdits = {};
    edits = editCell(edits, table, 1, 2, "28/02/2028");
    edits = editCell(edits, table, 2, 0, "09506000134376");
    expect(edits).toEqual({ 1: { 2: "28/02/2028" }, 2: { 0: "09506000134376" } });
    expect(applyEdits(table, edits).rows[1]).toEqual(["09506000134352", "A2", "28/02/2028", "0,5"]);
    expect(table.rows[1]![2]).toBe("31/02/2028");
    expect(editCell(edits, table, 2, 0, "09506000134377")).toEqual({ 1: { 2: "28/02/2028" } });
  });

  it("counts each row as ready, fixed, in error or skipped", () => {
    const edits = editCell({}, table, 1, 2, "28/02/2028");
    const rows = checkRows(engine, applyEdits(table, edits), MAPPING);
    const skipped = new Set([3]);
    expect(rows.map((r, i) => rowStatus(r, i, edits, skipped))).toEqual(["ready", "fixed", "error", "skipped", "error"]);
    expect(reportCounts(rows, edits, skipped)).toEqual({ ready: 1, fixed: 1, error: 2, skipped: 1, generated: 2 });
    // An edit that leaves the row in error is still an error.
    const wrong = editCell({}, table, 1, 2, "30/02/2028");
    expect(rowStatus(checkRows(engine, applyEdits(table, wrong), MAPPING)[1]!, 1, wrong, new Set())).toBe("error");
  });
});

describe("the report and the corrected rows as CSV", () => {
  it("quotes a field as RFC 4180 does", () => {
    expect(toDelimited([["a", "b,c", 'say "hi"', "two\nlines"]])).toBe('a,"b,c","say ""hi""","two\nlines"\r\n');
    expect(toDelimited([["a;b", "c,d"]], ";")).toBe('"a;b";c,d\r\n');
  });

  it("writes each row's status, reason, columns at fault and values", () => {
    const table = parseDelimited(PASTED);
    const edits = editCell({}, table, 1, 2, "28/02/2028");
    const rows = checkRows(engine, applyEdits(table, edits), MAPPING);
    const report = parseDelimited(reportCsv(table, MAPPING, rows, edits, new Set([3])));
    expect(report.headers).toEqual(["Row", "Status", "Reason", "Columns at fault", "Fixed in the studio", "GTIN (01)", "Lote (10)",
      "Validade (17)", "Peso (310n)"]);
    expect(report.rows.map((r) => r.slice(0, 5))).toEqual([
      ["2", "ready", "", "", ""],
      ["3", "fixed", "", "", "Validade"],
      ["4", "error", "The check digit does not match: it should be 6.", "GTIN", ""],
      ["5", "skipped", "The key's column is empty on this row.", "GTIN", ""],
      ["6", "error", "(310n): at most 5 decimal places.", "Peso", ""],
    ]);
    expect(report.rows[1]!.slice(5)).toEqual(["09506000134352", "A2", "28/02/2028", "0,5"]);
  });

  it("writes the file's rows with the fixes, read back as they were written", () => {
    const table = parseDelimited(PASTED);
    const edits = editCell(editCell({}, table, 1, 2, "28/02/2028"), table, 0, 1, 'A1, "first"');
    const corrected = parseDelimited(correctedCsv(table, edits));
    expect(corrected).toEqual(applyEdits(table, edits));
  });
});
