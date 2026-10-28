import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  companyPart,
  encodeEpc,
  EpcError,
  epcSchemes,
  GcpError,
  gcpLengthOf,
  GcpTable,
  KEY_SCHEMES,
  parseGcpTable,
  type EpcScheme,
} from "../src/index.ts";

// The resolver's answers, from its own code at a pinned commit (scripts/resolver-reference/golden.py; ADR 0004).
type Outcome = Record<string, unknown>;
type Case = [string, string, Record<string, string>, number, number, Outcome];
const reference = JSON.parse(readFileSync(new URL("./fixtures/resolver/epc.json", import.meta.url), "utf8")) as {
  keySchemes: Record<string, string[]>;
  encodings: Case[];
  refusals: Case[];
  gcp: { xml: string; parsed: Outcome; lengths: Record<string, number | null>; bad: Record<string, Outcome> };
};

let schemes: Record<string, EpcScheme>;
beforeAll(async () => {
  schemes = await epcSchemes();
});

function outcome(key: string, value: string, qualifiers: Record<string, string>, length: number, filter: number): Outcome {
  try {
    const e = encodeEpc(schemes, key, value, qualifiers, length, filter);
    // The resolver's "hex" is the link's form; the tag's is the same filled to the 16-bit word (ADR 0004).
    expect(e.hex).toBe(e.linkHex.padEnd(Math.ceil(e.bits.length / 16) * 4, "0"));
    return { scheme: e.scheme, filter: e.filter, bits: e.bits, hex: e.linkHex, base64: e.base64, tagUri: e.tagUri, pureIdentity: e.pureIdentity };
  } catch (error) {
    if (error instanceof EpcError) return { error: error.code, params: error.params };
    throw error;
  }
}

describe("EPC, as the resolver encoded it", () => {
  it("tries the same schemes for each key", () => {
    expect(KEY_SCHEMES).toEqual(reference.keySchemes);
  });

  it.each(reference.encodings)("(%s) %s %j, prefix of %i digits, filter %i", (key, value, qualifiers, length, filter, expected) => {
    expect(outcome(key, value, qualifiers, length, filter)).toEqual(expected);
  });

  it.each(reference.refusals)("refuses (%s) %s %j, prefix %i, filter %i", (key, value, qualifiers, length, filter, expected) => {
    expect(outcome(key, value, qualifiers, length, filter)).toEqual(expected);
  });

  it("starts the company part after a GTIN's indicator, an SSCC's extension and a GRAI's filler zero", () => {
    expect(companyPart("01", "09506000134376")).toBe("9506000134376");
    expect(companyPart("00", "106141411234567897")).toBe("06141411234567897");
    expect(companyPart("8003", "09506000134376123")).toBe("9506000134376123");
    expect(companyPart("414", "9506000134376")).toBe("9506000134376");
  });
});

describe("GS1's GCP length table, as the resolver read it", () => {
  it("reads the list and finds the longest prefix", () => {
    const table = parseGcpTable(reference.gcp.xml);
    expect({ date: table.date, count: table.size }).toEqual(reference.gcp.parsed);
    for (const [digits, length] of Object.entries(reference.gcp.lengths)) {
      expect(gcpLengthOf(table, digits), digits).toBe(length);
    }
    const kept = GcpTable.fromCompact(table.compact());
    expect([kept.date, kept.size, kept.lengthFor("9506000134376")]).toEqual([table.date, table.size, 9]);
  });

  it.each(Object.entries(reference.gcp.bad))("refuses a list: %s", (_name, expected) => {
    let got: Outcome = {};
    try {
      parseGcpTable(BAD_XML[_name]!);
    } catch (error) {
      if (error instanceof GcpError) got = { error: error.code, params: error.params };
    }
    expect(got).toEqual(expected);
  });
});

// The same files the fixture was made from (golden.py's GCP_BAD).
const BAD_XML: Record<string, string> = {
  notXml: "hello",
  root: '<Other date="2026-01-01T00:00:00Z"/>',
  doctype: '<!DOCTYPE x [<!ENTITY a "b">]><GCPPrefixFormatList date="2026-01-01T00:00:00Z"/>',
  element: '<GCPPrefixFormatList date="2026-01-01T00:00:00Z"><x/></GCPPrefixFormatList>',
  entry: '<GCPPrefixFormatList date="2026-01-01T00:00:00Z"><entry prefix="95" gcpLength="5"/></GCPPrefixFormatList>',
  duplicate: '<GCPPrefixFormatList date="2026-01-01T00:00:00Z"><entry prefix="95" gcpLength="7"/><entry prefix="95" gcpLength="8"/></GCPPrefixFormatList>',
  empty: '<GCPPrefixFormatList date="2026-01-01T00:00:00Z"></GCPPrefixFormatList>',
};

// An independent decoder (epc-tds, as the resolver's tests used): the tag's hexadecimal read back as its tag URI. Not
// for the schemes epc-tds lacks (GSRNP, CPI-var, ITIP). Two known faults of epc-tds are allowed for: it does not
// escape "/", "%" and "&" in the URI as TDS section 7 requires, so the URIs are compared unescaped; and with a
// 12-digit company prefix it writes an empty asset type, location or document type as "0" (the resolver's ADR 0010,
// section 8.2, item 6).
describe("EPC read back by an independent decoder (epc-tds)", async () => {
  const tds = (await import("epc-tds")) as unknown as { valueOf(hex: string): { toTagURI(): string } };
  const decodable = reference.encodings.filter(([, , , length, , e]) =>
    typeof e.scheme === "string" && !["gsrnp-96", "cpi-var", "itip-110", "itip-212"].includes(e.scheme) &&
    !(length === 12 && /^(grai|sgln|gdti|sgcn)/.test(e.scheme)));
  it.each(decodable)("(%s) %s %j, prefix of %i digits", (key, value, qualifiers, length, filter, expected) => {
    const epc = encodeEpc(schemes, key, value, qualifiers, length, filter);
    expect(tds.valueOf(epc.hex).toTagURI()).toBe(decodeURIComponent(expected.tagUri as string));
  });
});
