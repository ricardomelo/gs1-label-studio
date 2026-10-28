import { beforeAll, describe, expect, it } from "vitest";
import {
  AttributeError,
  attributeHint,
  attributeByCode,
  attributesForKey,
  checkKeyValue,
  dataFor,
  exclusiveQualifiers,
  fieldsOf,
  identify,
  InputError,
  qualifiersOf,
  syntaxEngine,
  type Identification,
  type SyntaxEngine,
} from "../src/index.ts";

let engine: SyntaxEngine;
beforeAll(async () => {
  engine = await syntaxEngine();
});

const BASE: Identification = { key: "01", value: "09506000134376", qualifiers: {}, attributes: [] };

describe("the editor's identification", () => {
  it("knows each key's qualifiers, in path order, and which exclude each other", () => {
    expect(qualifiersOf("01")).toEqual(["22", "10", "21", "235"]);
    expect(qualifiersOf("414")).toEqual(["254", "7040"]);
    expect(qualifiersOf("00")).toEqual([]);
    expect(exclusiveQualifiers("01", "10", "235")).toBe(true);
    expect(exclusiveQualifiers("01", "10", "21")).toBe(false);
  });

  it("checks the key's value and says what the check digit should be", () => {
    expect(checkKeyValue("01", "09506000134376")).toBeNull();
    expect(checkKeyValue("01", "09506000134377")).toBe("The check digit does not match: it should be 6.");
    expect(checkKeyValue("00", "1234")).toBe("4 digits entered; this identifier has 18.");
    expect(checkKeyValue("01", "0950600013437A")).toBe("Use digits only.");
    expect(identify(engine, { ...BASE, value: "9506000134376" }).elementString).toBe("(01)09506000134376");
  });

  it("writes key, qualifiers in path order and attributes in the order chosen, decimals resolved", () => {
    const id: Identification = {
      ...BASE, qualifiers: { "21": "S1001", "10": "B42", "22": "V1" }, attributes: [["17", "271231"], ["3103", "0,5"]],
    };
    const result = identify(engine, id);
    expect(result.elementString).toBe("(01)09506000134376(22)V1(10)B42(21)S1001(17)271231(3103)000500");
    expect(result.digitalLinkUri).toBe("https://id.gs1.org/01/09506000134376/22/V1/10/B42/21/S1001?17=271231&3103=000500");
    expect(result.resolvedAttributes).toEqual([["17", "271231"], ["3103", "000500"]]);
    expect(identify(engine, { ...BASE, attributes: [["310n", "1,25"]] }).elementString).toBe("(01)09506000134376(3102)000125");
  });

  it("refuses with the resolver's codes, naming the AI as chosen", () => {
    const code = (id: Identification) => {
      try {
        identify(engine, id);
      } catch (error) {
        if (error instanceof AttributeError) return error.code;
        if (error instanceof InputError) return error.message;
      }
      return "ok";
    };
    expect(code({ ...BASE, attributes: [["10", "B42"]] })).toBe("attr.inPath");
    expect(code({ ...BASE, attributes: [["17", "271231"], ["17", "271230"]] })).toBe("attr.duplicate");
    expect(code({ ...BASE, attributes: [["310n", "1,5"], ["3101", "2"]] })).toBe("attr.duplicate");
    expect(code({ ...BASE, attributes: [["17", ""]] })).toBe("attr.valueRequired");
    expect(code({ ...BASE, attributes: [["17", "271200"]] })).toBe("attr.dayZero");
    expect(code({ ...BASE, attributes: [["17", "271331"]] })).toBe("AI (17): The date contains an illegal month of the year.");
    expect(code({ ...BASE, qualifiers: { "10": "B42", "235": "X" } })).toBe(
      "Qualifiers (10) and (235) cannot be used together: (01) takes 22, 10, 21 or 235.",
    );
  });

  it("keeps an AI a GS1 Digital Link URI cannot carry for the element string symbols, and says why the URI cannot", () => {
    // (8200) PRODUCT URL: a valid element string with a GTIN, not a GS1 Digital Link data attribute
    const result = identify(engine, { ...BASE, attributes: [["8200", "https://example.com"]] });
    expect(result.elementString).toBe("(01)09506000134376(8200)https://example.com");
    expect(result.digitalLinkUri).toBe("");
    expect(dataFor("gs1-datamatrix", result)).toBe("(01)09506000134376(8200)https://example.com");
    expect(() => dataFor("dl-qrcode", result)).toThrow(/cannot be one/);
  });

  it("splits what was pasted into the fields, and back", () => {
    const pasted = engine.parse("https://id.gs1.org/01/09506000134376/10/B42/21/S1001?17=271231&3103=000500");
    const fields = fieldsOf(pasted);
    expect(fields).toEqual({
      key: "01", value: "09506000134376", qualifiers: { "10": "B42", "21": "S1001" },
      attributes: [["17", "271231"], ["3103", "000500"]],
    });
    expect(identify(engine, fields).digitalLinkUri).toBe(pasted.digitalLinkUri);
    expect(fieldsOf(engine.parse("(00)106141411234567897(02)09506000134352(37)10")).key).toBe("00");
  });

  it("offers a key's attributes without its own path AIs, with the resolver's hints", () => {
    const offered = attributesForKey("01").map((a) => a.ai);
    expect(offered).not.toContain("10");
    expect(offered).toContain("310n");
    expect(attributeHint(attributeByCode("17")!)).toBe("6 digits · date YYMMDD");
    expect(attributeHint(attributeByCode("3103")!)).toBe("3 decimal places: type with a comma or point (e.g. 1.5) or the digits only");
  });
});
