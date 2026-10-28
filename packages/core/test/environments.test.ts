import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkEnvironment,
  ENVIRONMENTS,
  environmentsFor,
  linearSizesFor,
  OutOfRange,
  RESOLVER_SYMBOLS,
  SIZES,
  sizesFor,
  type ResolverSymbol,
} from "../src/index.ts";

// The resolver's answers, from its own code at a pinned commit (scripts/resolver-reference/golden.py; ADR 0004).
const reference = JSON.parse(
  readFileSync(new URL("./fixtures/resolver/environments.json", import.meta.url), "utf8"),
) as {
  sizes: number[];
  symbols: string[];
  environments: Record<string, unknown>;
  environmentsFor: Record<string, string[]>;
  sizesFor: Record<string, number[]>;
  sizesForWithLinear: Record<string, number[]>;
  linearSizesFor: Record<string, number[]>;
  checks: [string, ResolverSymbol, number, boolean, number | null, string | null, string][];
};

describe("scanning environments, as the resolver had them", () => {
  it("has the same tables, sizes and symbols", () => {
    expect([...SIZES]).toEqual(reference.sizes);
    expect([...RESOLVER_SYMBOLS]).toEqual(reference.symbols);
    expect(JSON.parse(JSON.stringify(ENVIRONMENTS))).toEqual(reference.environments);
  });

  it("gives each key the same environments, its default first", () => {
    for (const [ai, expected] of Object.entries(reference.environmentsFor)) expect(environmentsFor(ai), ai).toEqual(expected);
  });

  it("offers the same sizes", () => {
    for (const name of Object.keys(ENVIRONMENTS)) {
      expect(sizesFor(name), name).toEqual(reference.sizesFor[name]);
      expect(sizesFor(name, true), name).toEqual(reference.sizesForWithLinear[name]);
      if (reference.linearSizesFor[name]) expect(linearSizesFor(name), name).toEqual(reference.linearSizesFor[name]);
    }
  });

  it(`answers the resolver's ${2970} checks of environment, symbol, sizes and key the same way`, () => {
    expect(reference.checks.length).toBe(2970);
    const differences = reference.checks.filter(([environment, symbol, size, linear, linearSize, ai, expected]) => {
      let got = "ok";
      try {
        checkEnvironment({ environment, symbol, size, linear, linearSize }, ai ?? undefined);
      } catch (error) {
        got = error instanceof OutOfRange ? error.code : String(error);
      }
      return got !== expected;
    });
    expect(differences).toEqual([]);
  });
});
