import { beforeAll, describe, expect, it } from "vitest";
import {
  checkRows,
  guessMapping,
  hasValidCheckDigit,
  MAX_SEQUENCE,
  sequenceProblem,
  sequenceTable,
  sequenceValues,
  ssccFor,
  syntaxEngine,
  withSequence,
  type Sequence,
  type SyntaxEngine,
} from "../src/index.ts";

// Generated sequences (backlog 2.3): serial numbers and SSCCs, as rows or as a column, each checked by the engine.

let engine: SyntaxEngine;
beforeAll(async () => {
  engine = await syntaxEngine();
});

const SERIAL: Sequence = { kind: "serial", first: 1, count: 3, prefix: "S-", digits: 6 };
const SSCC: Sequence = { kind: "sscc", first: 123456789, count: 3, extension: "1", companyPrefix: "0614141" };

describe("serial numbers", () => {
  it("writes the prefix and the number padded, with a step", () => {
    expect(sequenceValues(SERIAL)).toEqual(["S-000001", "S-000002", "S-000003"]);
    expect(sequenceValues({ ...SERIAL, prefix: "", digits: 0, first: 98, step: 2 })).toEqual(["98", "100", "102"]);
  });

  it("refuses what AI (21) cannot hold, before anything is made", () => {
    expect(sequenceProblem({ ...SERIAL, prefix: "LOT(" })).toMatch(/character set 82/);
    expect(sequenceProblem({ ...SERIAL, prefix: "Lote ç" })).toMatch(/character set 82/);
    expect(sequenceProblem({ ...SERIAL, prefix: "ABCDEFGHIJKLMNO", digits: 6 })).toMatch(/at most 20 characters; the last would have 21/);
    expect(sequenceProblem({ ...SERIAL, first: 999_998, count: 3 })).toMatch(/1000000, has more than 6 digits/);
    expect(sequenceProblem({ ...SERIAL, count: 0 })).toMatch(/from 1 to 100,000/);
    expect(sequenceProblem({ ...SERIAL, count: MAX_SEQUENCE + 1 })).toMatch(/from 1 to/);
    expect(sequenceProblem({ ...SERIAL, step: 0 })).toMatch(/whole numbers/);
    expect(sequenceProblem({ ...SERIAL, first: 1.5 })).toMatch(/whole numbers/);
    expect(() => sequenceValues({ ...SERIAL, count: 0 })).toThrow(RangeError);
  });
});

describe("SSCCs", () => {
  it("fills the serial reference to 17 digits and adds the check digit (the General Specifications' example)", () => {
    expect(ssccFor("1", "0614141", 123456789)).toBe("106141411234567897");
    const values = sequenceValues(SSCC);
    expect(values).toEqual(["106141411234567897", "106141411234567903", "106141411234567910"]);
    expect(values.every((v) => v.length === 18 && hasValidCheckDigit(v))).toBe(true);
    expect(sequenceValues({ ...SSCC, first: 0, count: 1, companyPrefix: "950600013437" })).toEqual(["195060001343700003"]);
  });

  it("refuses an extension of more than a digit, a company prefix outside 4 to 12 digits, a reference that does not fit", () => {
    expect(sequenceProblem({ ...SSCC, extension: "10" })).toMatch(/one digit/);
    expect(sequenceProblem({ ...SSCC, companyPrefix: "123" })).toMatch(/4 to 12 digits/);
    expect(sequenceProblem({ ...SSCC, companyPrefix: "0614141A" })).toMatch(/4 to 12 digits/);
    expect(sequenceProblem({ ...SSCC, companyPrefix: "950600013437", first: 9999, count: 2 })).toMatch(/serial reference has 4: the last, 10000, does not fit/);
    expect(sequenceProblem({ ...SSCC, companyPrefix: "950600013437", first: 9998, count: 2 })).toBeNull();
  });
});

describe("as rows or as a column", () => {
  it("makes rows whose header the studio maps to its AI, each accepted by the engine", () => {
    const table = sequenceTable(SSCC);
    expect(table.headers).toEqual(["(00) SSCC"]);
    expect(guessMapping(table.headers)).toEqual(["00"]);
    const rows = checkRows(engine, table, ["00"], [], "https://id.gs1.org");
    expect(rows.map((r) => r.identified?.digitalLinkUri)).toEqual(table.rows.map(([v]) => `https://id.gs1.org/00/${v}`));
  });

  it("adds a serial number to every row of a file, with the GTIN of each row", () => {
    const file = { headers: ["GTIN"], rows: [["09506000134376"], ["09506000134352"]] };
    const table = withSequence(file, { ...SERIAL, count: 1 }); // the count is the file's
    expect(table).toEqual({ headers: ["GTIN", "(21) Serial number"], rows: [["09506000134376", "S-000001"], ["09506000134352", "S-000002"]] });
    expect(guessMapping(table.headers)).toEqual(["01", "21"]);
    const rows = checkRows(engine, table, ["01", "21"], [], "https://id.gs1.org");
    expect(rows.map((r) => r.identified?.elementString)).toEqual(["(01)09506000134376(21)S-000001", "(01)09506000134352(21)S-000002"]);
  });
});
