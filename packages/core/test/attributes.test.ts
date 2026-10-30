import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AttributeError,
  DICTIONARY,
  isDigitalLinkKey,
  offeredAttributes,
  pathAis,
  refuseDayZero,
  resolveDecimal,
  aiEntry,
} from "../src/index.ts";

// The resolver's answers, from its own code at a pinned commit (scripts/resolver-reference/golden.py; ADR 0004).
const reference = JSON.parse(readFileSync(new URL("./fixtures/resolver/attributes.json", import.meta.url), "utf8")) as {
  release: string;
  dictionaryDate: string;
  describe: { ais: { ai: string; title: string; family?: boolean; decimals?: number; members?: string[]; components: unknown }[] };
  pathAis: Record<string, string[]>;
  decimals: [string, string, { ok?: string[]; error?: string; params?: Record<string, unknown> }][];
  dayZero: [string, string, { ok?: string[]; error?: string; params?: Record<string, unknown> }][];
};

function outcome(call: () => unknown) {
  try {
    const ok = call();
    return { ok: Array.isArray(ok) ? ok : [] };
  } catch (error) {
    if (error instanceof AttributeError) return { error: error.code, params: error.params };
    throw error;
  }
}

describe("data attributes, as the resolver offered and converted them", () => {
  it("reads the same dictionary release", () => {
    expect([DICTIONARY.release, DICTIONARY.dictionary]).toEqual([reference.release, reference.dictionaryDate]);
  });

  it("offers the same AIs, families in place of their members, in the same order", () => {
    expect(JSON.parse(JSON.stringify(offeredAttributes()))).toEqual(reference.describe.ais);
  });

  it("puts the same qualifiers in each key's path", () => {
    const digitalLink = Object.entries(pathAis()).filter(([key]) => isDigitalLinkKey(key));
    expect(Object.fromEntries(digitalLink.map(([k, v]) => [k, [...v].sort()]))).toEqual(reference.pathAis);
    // Beyond the resolver: the Made-to-Order GTIN's batch/lot and serial number, in element strings only (1.11).
    expect([...pathAis()["03"]!]).toEqual(["10", "21"]);
  });

  it.each(reference.decimals)("decimal family %s with %j", (ai, value, expected) => {
    expect(outcome(() => resolveDecimal(ai, value))).toEqual(expected);
  });

  it.each(reference.dayZero)("day zero in (%s) %s", (ai, value, expected) => {
    expect(outcome(() => refuseDayZero(ai, value, aiEntry(ai)!.components))).toEqual(expected);
  });
});
