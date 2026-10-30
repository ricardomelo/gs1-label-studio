import { beforeAll, describe, expect, it } from "vitest";
import {
  checkDigit,
  gs1128DataCharacters,
  guidance,
  PARTS,
  QUESTIONS,
  syntaxEngine,
  TREE,
  walk,
  type Answers,
  type SyntaxEngine,
} from "../src/index.ts";

let engine: SyntaxEngine;
beforeAll(async () => {
  engine = await syntaxEngine();
});

const withCheck = (body: string) => body + checkDigit(body);
const GTIN13 = "09506000134352";
const GTIN12 = withCheck("0061414100003");
const GTIN8 = withCheck("0000009506000");
const CASE = withCheck("1950600013435"); // indicator 1: a GTIN-14 that no EAN/UPC carries
const SSCC = withCheck("10950600000000001");
const GIAI = "9506000134352ABC";
const GSRN = withCheck("95060001343520000");
const GLN = withCheck("950600013435");

// Every leaf of figure 5-68 (General Specifications 26.0, section 5.12.2): the key, the answers, the table reached and
// the nodes asked on the way (null: table 12's own question). Nodes answered by the key are listed with an asterisk.
const LEAVES: [key: string, answers: Answers, table: number, nodes: string, part?: string][] = [
  ["8004", { dpm: true, "long-distance": true }, 13, "1* 2 3"],
  ["8004", { dpm: true, "long-distance": false }, 7, "1* 2 3", PARTS.t7Other],
  ["8003", { dpm: false }, 9, "1* 2"],
  ["414", { dpm: false }, 9, "1* 2", PARTS.t9Location],
  ["8018", {}, 11, "1* 4*"],
  ["01", { retail: true, distribution: true }, 3, "1* 4* 5 6", PARTS.t3TwoD],
  ["01", { retail: true, distribution: false }, 1, "1* 4* 5 6", PARTS.t1TwoD],
  ["01", { retail: false, "healthcare-retail": true, distribution: true }, 8, "1* 4* 5 7 8"],
  ["01", { retail: false, "healthcare-retail": true, distribution: false }, 10, "1* 4* 5 7 8"],
  ["01", { retail: false, "healthcare-retail": false, distribution: true, tobacco: true, "tobacco-unit-pack": true }, 12,
    "1* 4* 5 7 9 10 null", PARTS.t12Unit],
  ["01", { retail: false, "healthcare-retail": false, distribution: true, tobacco: true, "tobacco-unit-pack": false }, 12,
    "1* 4* 5 7 9 10 null", PARTS.t12Grouping],
  ["00", { distribution: true, tobacco: true }, 12, "1* 4* 5* 7* 9 10", PARTS.t12Logistic],
  ["00", { distribution: true, tobacco: false }, 5, "1* 4* 5* 7* 9 10 11*"],
  ["01", { retail: false, "healthcare-retail": false, distribution: true, tobacco: false, "healthcare-non-retail": true },
    8, "1* 4* 5 7 9 10 11* 12"],
  ["01", { retail: false, "healthcare-retail": false, distribution: true, tobacco: false, "healthcare-non-retail": false },
    2, "1* 4* 5 7 9 10 11* 12"],
  ["01", { retail: false, "healthcare-retail": false, distribution: false, healthcare: true, dpm: true }, 7,
    "1* 4* 5 7 9 13 14", PARTS.t7Ink],
  ["01", { retail: false, "healthcare-retail": false, distribution: false, healthcare: true, dpm: false }, 6,
    "1* 4* 5 7 9 13 14"],
  ["01", { retail: false, "healthcare-retail": false, distribution: false, healthcare: false, dpm: true, "long-distance": true },
    13, "1* 4* 5 7 9 13 15 16"],
  ["01", { retail: false, "healthcare-retail": false, distribution: false, healthcare: false, dpm: true, "long-distance": false },
    7, "1* 4* 5 7 9 13 15 16", PARTS.t7Other],
  ["01", { retail: false, "healthcare-retail": false, distribution: false, healthcare: false, dpm: false }, 4,
    "1* 4* 5 7 9 13 15"],
];

describe("the decision tree (General Specifications 26.0, figure 5-68)", () => {
  it.each(LEAVES)("key %s, %j → table %i", (key, answers, table, nodes, part) => {
    const { leaf, steps, next } = walk(key, answers);
    expect(next).toBeUndefined();
    expect(leaf!.table).toBe(table);
    expect(steps.map((s) => `${s.node}${s.byKey ? "*" : ""}`).join(" ")).toBe(nodes);
    if (part) expect(leaf!.parts).toContain(part);
  });

  it("reaches all thirteen tables", () => {
    expect([...new Set(LEAVES.map(([, , table]) => table))].sort((a, b) => a - b)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    );
  });

  it("asks one question at a time, and only those the key does not answer", () => {
    expect(walk("01", {}).next).toBe("retail");
    expect(walk("01", { retail: false }).next).toBe("healthcare-retail");
    expect(walk("01", { retail: true }).next).toBe("distribution");
    expect(walk("00", {}).next).toBe("distribution"); // a logistic unit is not sold at a till
    expect(walk("8004", {}).next).toBe("dpm");
    expect(walk("8017", {}).leaf?.table).toBe(11);
    expect(walk("01", { retail: false, "healthcare-retail": false, distribution: true, tobacco: true }).next).toBe(
      "tobacco-unit-pack",
    );
  });

  it("has a question for every node the key does not answer, in the figure's words too", () => {
    for (const node of Object.values(TREE)) {
      if (!node.question.startsWith("key-")) expect(QUESTIONS[node.question as keyof typeof QUESTIONS].figure).toMatch(/\?$/);
    }
  });
});

describe("the symbols a leaf allows, and the one recommended", () => {
  const at = (key: string, answers: Answers, data: string) => guidance(walk(key, answers).leaf!, engine.parse(data));
  const RETAIL: Answers = { retail: true, distribution: false };
  const DISTRIBUTION: Answers = { retail: false, "healthcare-retail": false, distribution: true, tobacco: false, "healthcare-non-retail": false };
  const HOSPITAL: Answers = { retail: false, "healthcare-retail": false, distribution: false, healthcare: true, dpm: false };

  it("lists every carrier and every symbol in addition with its rows of the table", () => {
    for (const [key, answers] of LEAVES) {
      const { leaf } = walk(key, answers);
      const g = guidance(leaf!, engine.parse(key === "01" ? `(01)${GTIN13}` : key === "00" ? `(00)${SSCC}` : `(8004)${GIAI}`));
      for (const symbol of [...leaf!.carriers, ...leaf!.inAddition]) {
        expect(g.options.find((o) => o.symbol === symbol)?.specs.length, `table ${leaf!.table}: ${symbol}`).toBeGreaterThan(0);
      }
    }
  });

  it("at a retail till: the EAN/UPC of the GTIN's length", () => {
    expect(at("01", RETAIL, `(01)${GTIN13}`).recommended).toEqual({ symbol: "ean13" });
    expect(at("01", RETAIL, `(01)${GTIN12}`).recommended).toEqual({ symbol: "upca" });
    expect(at("01", RETAIL, `(01)${GTIN8}`).recommended).toEqual({ symbol: "ean8" });
    const g = at("01", RETAIL, `(01)${GTIN13}`);
    expect(g.environment).toBe("retail");
    expect(g.options.find((o) => o.symbol === "upca")).toMatchObject({ carries: "no", reason: "carries a GTIN-12" });
  });

  it("at a retail till with a batch and a date: the EAN/UPC, and a QR code with a GS1 Digital Link URI in addition", () => {
    const g = at("01", RETAIL, `(01)${GTIN13}(17)271231(10)B42`);
    expect(g.recommended).toEqual({ symbol: "ean13", with: "dl-qrcode" });
    const qr = g.options.find((o) => o.symbol === "dl-qrcode")!;
    expect(qr).toMatchObject({ role: "in-addition", carries: "all" });
    expect(qr.specs[0]!.x).toEqual([0.396, 0.495, 0.99]); // table 1, addendum 2
    expect(g.options.find((o) => o.symbol === "ean13")).toMatchObject({ carries: "key" });
  });

  it("at a retail till with a GTIN-14 of a case: GS1 DataBar Omnidirectional, the first of the family", () => {
    const g = at("01", RETAIL, `(01)${CASE}`);
    expect(g.recommended).toEqual({ symbol: "databar-omni" });
    expect(g.waiting).toBeUndefined();
  });

  it("at a retail till with a case's GTIN-14 and a batch: GS1 DataBar with a QR code, not laid out together yet", () => {
    const g = at("01", RETAIL, `(01)${CASE}(10)B42`);
    expect(g.recommended).toBeNull();
    expect(g.together).toEqual({ symbol: "databar-omni", with: "dl-qrcode" });
  });

  it("at a retail till, GS1 DataBar Expanded carries the attributes of a variable measure item only (2.1.3, 2.1.12.1)", () => {
    const fixed = at("01", RETAIL, `(01)${GTIN13}(17)271231(10)B42`);
    expect(fixed.options.find((o) => o.symbol === "databar-expanded")).toMatchObject({ carries: "key", drawn: true });
    const variable = at("01", RETAIL, `(01)${GTIN13}(3103)001250(15)271231`);
    expect(variable.recommended).toEqual({ symbol: "databar-expanded" });
    expect(variable.options.find((o) => o.symbol === "databar-expanded-stacked")).toMatchObject({ carries: "all" });
    // Out of retail, the rule does not apply: a GSRN with its service relation instance number.
    expect(at("8018", {}, `(8018)${GSRN}(8019)12`).recommended).toEqual({ symbol: "databar-expanded" });
  });

  it("in general distribution: EAN-13 or ITF-14 for a GTIN, GS1-128 with attributes, a 2D symbol beyond 48 characters", () => {
    expect(at("01", DISTRIBUTION, `(01)${GTIN13}`).recommended).toEqual({ symbol: "ean13" });
    const itf = at("01", DISTRIBUTION, `(01)${CASE}`);
    expect(itf.recommended).toEqual({ symbol: "itf14" });
    expect(itf.options.find((o) => o.symbol === "itf14")!.specs[0]!.x).toEqual([0.495, 0.495, 1.016]);
    expect(at("01", DISTRIBUTION, `(01)${CASE}(10)B42(17)271231`).recommended).toEqual({ symbol: "gs1-128" });
    // Beyond 48 characters GS1-128 carries it all in two symbols (backlog 1.13)
    const long = at("01", DISTRIBUTION, `(01)${CASE}(10)ABCDEFGHIJKLMNOPQRST(21)ABCDEFGHIJKL`);
    expect(long.options.find((o) => o.symbol === "gs1-128")).toMatchObject({ carries: "all", reason: "in 2 symbols: 53 data characters, 48 at most in each" });
    expect(long.recommended).toEqual({ symbol: "gs1-128" });
  });

  it("a logistic unit: GS1-128 (section 2.2.1), table 5", () => {
    const g = at("00", { distribution: true, tobacco: false }, `(00)${SSCC}`);
    expect(g.recommended).toEqual({ symbol: "gs1-128" });
    expect(g.options.find((o) => o.symbol === "gs1-128")!.specs[0]!.x).toEqual([0.495, 0.495, 0.94]);
    expect(g.environment).toBe("logistics");
  });

  it("regulated healthcare: GS1 DataMatrix for hospitals (table 2-11), GS1-128 first in distribution (table 2-15)", () => {
    expect(at("01", HOSPITAL, `(01)${GTIN13}(17)271231(10)B42(21)S1`).recommended).toEqual({ symbol: "gs1-datamatrix" });
    const gd = at("01", { ...DISTRIBUTION, "healthcare-non-retail": true }, `(01)${CASE}(17)271231(10)B42`);
    expect(gd.leaf.table).toBe(8);
    expect(gd.recommended).toEqual({ symbol: "gs1-128" });
  });

  it("assets, locations and service relationships", () => {
    expect(at("8004", { dpm: true, "long-distance": false }, `(8004)${GIAI}`).recommended).toEqual({ symbol: "gs1-datamatrix" });
    const location = at("414", { dpm: false }, `(414)${GLN}`);
    expect(location.recommended).toEqual({ symbol: "gs1-128" });
    expect(location.options.find((o) => o.symbol === "gs1-128")!.specs.map((s) => s.x[2])).toEqual([0.495, 1.016]);
    const gsrn = at("8018", {}, `(8018)${GSRN}`);
    expect(gsrn.options[0]).toMatchObject({ symbol: "databar-expanded", carries: "all", drawn: true });
    expect(gsrn.recommended).toEqual({ symbol: "databar-expanded" }); // section 2.5's first carrier choice
  });

  it("tobacco unit packs: GS1 DotCode first, GS1 DataMatrix while the studio does not draw DotCode", () => {
    const g = at("01", { ...DISTRIBUTION, tobacco: true, "tobacco-unit-pack": true }, `(01)${GTIN13}(21)ABC123`);
    expect(g.options.map((o) => o.symbol)).toEqual(["gs1-dotcode", "gs1-datamatrix", "gs1-qrcode"]);
    expect(g.recommended).toEqual({ symbol: "gs1-datamatrix" });
    expect(g.environment).toBeNull();
  });

  it("lists the symbols a table allows beyond the application's carriers", () => {
    const g = at("01", DISTRIBUTION, `(01)${GTIN13}`);
    expect(g.options.filter((o) => o.role === "table").map((o) => o.symbol)).toEqual([]);
    const mro = at("01", { ...HOSPITAL, healthcare: false, dpm: false }, `(01)${GTIN13}`);
    expect(mro.leaf.table).toBe(4);
    expect(mro.options.filter((o) => o.role === "table").map((o) => o.symbol)).toContain("ean13");
    expect(mro.recommended).toEqual({ symbol: "gs1-128" });
  });

  it("knows what DataBar Limited and the Digital Link symbols cannot carry", () => {
    const g = at("01", HOSPITAL, `(01)${withCheck("2950600013435")}`);
    expect(g.options.find((o) => o.symbol === "databar-limited")).toMatchObject({ carries: "no" });
    expect(g.options.find((o) => o.symbol === "databar-omni")).toMatchObject({ carries: "all" });
  });
});

describe("GS1-128's data characters (section 5.4.4.3)", () => {
  it("counts the AIs, the values and the FNC1 separators", () => {
    expect(gs1128DataCharacters(engine.parse(`(01)${GTIN13}`))).toBe(16);
    expect(gs1128DataCharacters(engine.parse(`(01)${GTIN13}(10)ABC(21)XYZ`))).toBe(16 + 5 + 1 + 5);
    expect(gs1128DataCharacters(engine.parse(`(01)${GTIN13}(17)271231(10)ABC`))).toBe(16 + 8 + 5);
  });

  it("allows 48 and refuses 49", () => {
    const at = (data: string) => guidance(walk("01", { retail: false, "healthcare-retail": false, distribution: true,
      tobacco: false, "healthcare-non-retail": false }).leaf!, engine.parse(data)).options.find((o) => o.symbol === "gs1-128")!;
    // 16 + (10) and 9 characters + FNC1 + (21) and 18 characters = 48
    expect(at(`(01)${GTIN13}(10)ABCDEFGHI(21)ABCDEFGHIJKLMNOPQR`).carries).toBe("all");
    // Beyond, in several symbols (backlog 1.13), unless one element string alone has more than 48
    expect(at(`(01)${GTIN13}(10)ABCDEFGHI(21)ABCDEFGHIJKLMNOPQRS`)).toMatchObject({
      carries: "all", reason: "in 2 symbols: 49 data characters, 48 at most in each",
    });
    expect(at(`(01)${GTIN13}(8200)https://example.com/a-very-long-product-page-address-0001`)).toMatchObject({
      carries: "no", reason: expect.stringMatching(/at most 48 data characters .*\(8200\)https:.* has 61/),
    });
  });
});
