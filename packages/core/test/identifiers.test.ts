import { beforeAll, describe, expect, it } from "vitest";
import {
  attributeByCode,
  attributesForKey,
  dataFor,
  exclusiveQualifiers,
  identifierKeys,
  identify,
  isDigitalLinkKey,
  primaryKeys,
  qualifiersOf,
  rowIdentification,
  shownQualifiers,
  syntaxEngine,
  type SyntaxEngine,
} from "../src/index.ts";

// Item 1.11: every GS1 identifier of the General Specifications 26.0, section 1.3 — the GS1 Digital Link keys and the
// Made-to-Order GTIN (03) of element strings only —, the qualifiers behind "+ Add qualifier", the attributes of
// element strings only.

let engine: SyntaxEngine;
beforeAll(async () => {
  engine = await syntaxEngine();
});

describe("every identifier", () => {
  it("offers the 16 GS1 Digital Link keys and the Made-to-Order GTIN (03), whose batch or serial number qualify it", () => {
    expect(primaryKeys()).toHaveLength(16);
    expect(identifierKeys()).toEqual([...primaryKeys(), "03"]);
    expect([isDigitalLinkKey("01"), isDigitalLinkKey("03"), isDigitalLinkKey("17")]).toEqual([true, false, false]);
    expect(qualifiersOf("03")).toEqual(["10", "21"]); // sections 1.3.1.6 and 1.3.1.8
    expect(exclusiveQualifiers("03", "10", "21")).toBe(false);
  });

  it("carries (03) in element strings and refuses it in a GS1 Digital Link URI, and beside (01), (02) or (37)", () => {
    const id = { key: "03", value: "09506000134376", qualifiers: { "10": "B1" }, attributes: [["17", "271231"]] as [string, string][] };
    const identified = identify(engine, id);
    expect(identified.elementString).toBe("(03)09506000134376(10)B1(17)271231");
    expect(identified.digitalLinkUri).toBe("");
    expect(dataFor("gs1-datamatrix", identified)).toBe("(03)09506000134376(10)B1(17)271231");
    expect(() => dataFor("dl-qrcode", identified)).toThrow(/cannot be one/);
    expect(() => identify(engine, { ...id, attributes: [["37", "10"]] })).toThrow(/\(03\) with AI \(37\)/);
    expect(() => identify(engine, { ...id, value: "09506000134377" })).toThrow(/check digit/);
  });

  it("takes (03) as the key of a bulk row", () => {
    expect(rowIdentification(["09506000134376", "S1"], ["03", "21"])).toEqual({ key: "03", value: "09506000134376", qualifiers: { "21": "S1" }, attributes: [] });
  });
});

describe("qualifiers and attributes", () => {
  it("shows the first four qualifiers and any other chosen; the rest are behind + Add qualifier", () => {
    const all = ["22", "10", "21", "235", "9x"];
    expect(shownQualifiers(all, [])).toEqual({ shown: ["22", "10", "21", "235"], more: ["9x"] });
    expect(shownQualifiers(all, ["9x"])).toEqual({ shown: all, more: [] });
    expect(shownQualifiers(qualifiersOf("01"), [])).toEqual({ shown: ["22", "10", "21", "235"], more: [] });
  });

  it("offers the attributes of element strings only, marked so, besides the GS1 Digital Link ones", () => {
    const offered = attributesForKey("01");
    expect(offered.find((a) => a.ai === "8014")).toMatchObject({ title: "MUDI", elementStringOnly: true });
    expect(offered.find((a) => a.ai === "8200")?.elementStringOnly).toBe(true);
    expect(offered.find((a) => a.ai === "17")?.elementStringOnly).toBeUndefined();
    expect(offered.map((a) => a.ai)).not.toContain("03"); // a key, not an attribute
    expect(offered.map((a) => a.ai)).not.toContain("21");
    expect(attributesForKey("03").map((a) => a.ai)).toEqual(expect.arrayContaining(["17", "8014"]));
    expect(attributesForKey("03").map((a) => a.ai)).not.toContain("10");
    expect(attributeByCode("8040")?.elementStringOnly).toBe(true);
  });
});
