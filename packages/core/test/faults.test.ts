import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAULT_GROUPS, FAULTS, fault, REPAIR_PROVES } from "../src/index.ts";

// The Check Studio's catalogue of faults (backlog 7.1 b): the project's 77 codes, sections 4 and 5.4, and no other;
// each with its four texts and at least one source.

/** The project's codes, group by group: A1 to A9, B1 to B12, C1 to C9, D1 to D9, E1 to E3, F1 to F5, G1 to G11, H1 to H5, I1 to I4, J1 to J10. */
const PROJECT: Record<string, number> = { A: 9, B: 12, C: 9, D: 9, E: 3, F: 5, G: 11, H: 5, I: 4, J: 10 };
const CODES = Object.entries(PROJECT).flatMap(([group, n]) => Array.from({ length: n }, (_, i) => `${group}${i + 1}`));

describe("the catalogue of faults", () => {
  it("holds the project's 77 codes, in its order, and no other", () => {
    expect(CODES).toHaveLength(77);
    expect(FAULTS.map((f) => f.code)).toEqual(CODES);
  });

  it("gives every fault its group, a severity, four texts and at least one source", () => {
    for (const f of FAULTS) {
      expect(f.group, f.code).toBe(f.code[0]);
      expect(["error", "warning", "note", "not-assessed"], f.code).toContain(f.severity);
      for (const text of Object.values(f.texts)) expect(text.trim().length, f.code).toBeGreaterThan(2);
      expect(Object.keys(f.texts), f.code).toEqual(["what", "where", "why", "fix"]);
      expect(f.sections.length + (f.references?.length ?? 0), f.code).toBeGreaterThan(0);
      for (const section of f.sections) expect(section, f.code).toMatch(/^\d+(?:\.\d+)*$/);
      expect(f.detectedBy.length, f.code).toBeGreaterThan(2);
    }
  });

  it("names the backlog item that finds each group: A and B now, the others later", () => {
    const items = Object.fromEntries(FAULTS.map((f) => [f.group, f.item]));
    expect(items).toEqual({ A: "7.1 b", B: "7.1 b", C: "7.1 c", D: "7.1 c", E: "7.1 c", G: "7.1 c", F: "7.1 d", I: "7.1 d", J: "7.1 d", H: "7.1 m" });
    expect(Object.keys(FAULT_GROUPS)).toEqual(Object.keys(PROJECT));
  });

  it("keeps a severity's variants beside the usual one", () => {
    expect(fault("B3")).toMatchObject({ severity: "error", severityNote: "Error when the engine rejects; Warning when only the heuristic fires" });
    expect(fault("A7").severityNote).toBe("Error (length); Note (]I0)");
    expect(fault("B4").severityNote).toBeUndefined();
  });

  it("refuses a code that is not in it", () => {
    expect(() => fault("K1")).toThrow(/no fault K1/);
  });

  it("proves with every repair only faults it holds", () => {
    for (const codes of Object.values(REPAIR_PROVES)) for (const code of codes) expect(CODES).toContain(code);
  });

  it("names, in the checks' sources, only codes it holds", () => {
    const source = ["check.ts", "checkValues.ts", "checkUri.ts", "engineFaults.ts"].map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8")).join("\n");
    const named = new Set([...source.matchAll(/"([A-J]\d{1,2})"/g)].map((m) => m[1]!));
    expect(named.size).toBeGreaterThan(50);
    for (const code of named) expect(CODES, code).toContain(code);
  });

  it("copies no text of the standard: its texts cite section numbers, the General Specifications' sentences stay out", () => {
    // A guard against pasting: the catalogue's sentences are short paraphrases
    for (const f of FAULTS) for (const text of Object.values(f.texts)) expect(text.length, f.code).toBeLessThan(420);
  });
});

describe("docs/conformance.md, section 3.2", () => {
  it("lists every fault with its severity, its sections or source and the item that finds it", () => {
    const doc = readFileSync(new URL("../../../docs/conformance.md", import.meta.url), "utf8");
    const section = doc.slice(doc.indexOf("### 3.2 The Check Studio's faults"), doc.indexOf("## 4. EPC Tag Data Standard"));
    const rows = section.split("\n").filter((l) => /^\| [A-J]\d/.test(l)).map((l) => l.slice(2, -2).split(" | "));
    expect(rows.map((r) => r[0])).toEqual(CODES);
    for (const [code, , severity, sources, item] of rows) {
      const f = fault(code!);
      expect([severity, sources, item], code).toEqual([f.severity, [...f.sections, ...(f.references ?? [])].join("; "), f.item]);
    }
  });
});
