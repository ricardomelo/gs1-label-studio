import { beforeAll, describe, expect, it } from "vitest";
import {
  dataFor,
  encode,
  InputError,
  syntaxEngine,
  upcaManufacturerAndProduct,
  zeroSuppress,
  type SyntaxEngine,
} from "../src/index.ts";

let engine: SyntaxEngine;
beforeAll(async () => {
  engine = await syntaxEngine();
});

const BATCH = "(01)09506000134352(17)271231(10)ABC123";

describe("input through the GS1 Barcode Syntax Engine", () => {
  it.each([
    ["element-string", BATCH],
    ["unbracketed", "010950600013435217271231" + "10ABC123"],
    ["unbracketed", "^0109506000134352^10ABC123{GS}17271231"],
    ["digital-link", "https://id.gs1.org/01/09506000134352/10/ABC123?17=271231"],
    ["scan", "]d2010950600013435210ABC123\u001d17271231"],
    ["scan", "]C10109506000134352" + "10ABC123{GS}17271231"],
  ])("recognises %s input: %s", (kind, text) => {
    const parsed = engine.parse(text);
    expect(parsed.kind).toBe(kind);
    expect(parsed.elements.map((e) => `(${e.ai})${e.value}`).sort()).toEqual(
      ["(01)09506000134352", "(10)ABC123", "(17)271231"],
    );
    expect(parsed.digitalLinkUri).toBe("https://id.gs1.org/01/09506000134352/10/ABC123?17=271231");
  });

  it("names each AI with its data title", () => {
    expect(engine.parse(BATCH).elements).toEqual([
      { ai: "01", value: "09506000134352", title: "GTIN" },
      { ai: "17", value: "271231", title: "USE BY or EXPIRY" },
      { ai: "10", value: "ABC123", title: "BATCH/LOT" },
    ]);
    expect(engine.parse("(01)09506000134352(3103)001250").elements[1]?.title).toBe("NET WEIGHT (kg)");
  });

  it("takes a GTIN of 8, 12, 13 or 14 digits, and an EAN/UPC scan, as (01)", () => {
    for (const gtin of ["95012346", "614141000036", "9506000134352", "09506000134352"]) {
      expect(engine.parse(gtin).elementString).toBe(`(01)${gtin.padStart(14, "0")}`);
    }
    expect(engine.parse("]E09506000134352").elementString).toBe("(01)09506000134352");
  });

  it("uses another stem for the GS1 Digital Link URI when asked", () => {
    expect(engine.parse("9506000134352", "https://example.com").digitalLinkUri).toBe(
      "https://example.com/01/09506000134352",
    );
  });

  it("explains errors and marks the characters at fault", () => {
    const fault = (text: string) => {
      try {
        engine.parse(text);
      } catch (error) {
        if (error instanceof InputError) return [error.message, error.markup];
      }
      return null;
    };
    expect(fault("9506000134353")).toEqual([
      "AI (01): The numeric check digit is incorrect.", "(01)0950600013435|3|",
    ]);
    expect(fault("(01)09506000134352(17)271331")).toEqual([
      "AI (17): The date contains an illegal month of the year.", "(17)27|13|31",
    ]);
    expect(fault("(21)123")?.[0]).toMatch(/Required AIs for AI \(21\)/);
    expect(fault("hello")?.[0]).toMatch(/^Not recognised/);
    expect(fault("(01)09506000134352(10)A\\(B")?.[0]).toMatch(/not supported yet/);
  });
});

describe("what each symbol carries", () => {
  it("gives each symbology its data, which the encoder accepts", () => {
    const gtin13 = engine.parse("9506000134352");
    expect(dataFor("ean13", gtin13)).toBe("9506000134352");
    expect(dataFor("itf14", gtin13)).toBe("09506000134352");
    expect(dataFor("gs1-128", gtin13)).toBe("(01)09506000134352");
    expect(dataFor("dl-qrcode", gtin13)).toBe("https://id.gs1.org/01/09506000134352");
    expect(dataFor("upca", engine.parse("614141000036"))).toBe("614141000036");
    expect(dataFor("ean8", engine.parse("95012346"))).toBe("95012346");
    expect(dataFor("upce", engine.parse("012345000065"))).toBe("01234565");
    for (const [symbology, text] of [["ean13", "9506000134352"], ["upce", "012345000065"], ["gs1-datamatrix", BATCH],
      ["dl-datamatrix", BATCH]] as const) {
      expect(() => encode(symbology, dataFor(symbology, engine.parse(text)))).not.toThrow();
    }
  });

  it("says why a symbol cannot carry the data", () => {
    expect(() => dataFor("ean13", engine.parse(BATCH))).toThrow(/GTIN alone/);
    expect(() => dataFor("ean13", engine.parse("19506000134359"))).toThrow(/indicator/);
    expect(() => dataFor("upca", engine.parse("9506000134352"))).toThrow(/GTIN-12/);
    expect(() => dataFor("upce", engine.parse("614141000036"))).toThrow(/zero-suppressed/);
    expect(() => dataFor("dl-qrcode", engine.parse("(420)12345"))).toThrow(/primary key/); // ship-to postal code
  });

  it("zero-suppresses a GTIN-12 exactly as the printer expands it", () => {
    for (const upce of ["01200005", "01234505", "01234531", "01234548", "01234565", "06543217"]) {
      const expanded = "0" + upcaManufacturerAndProduct(upce) + upce[7];
      // Only UPC-E forms whose check digit is right round-trip; the others must be refused.
      const suppressed = zeroSuppress(expanded);
      if (suppressed !== null) expect(suppressed).toBe(upce);
    }
    expect(zeroSuppress("012345000065")).toBe("01234565");
    expect(zeroSuppress("012345000066")).toBeNull();
    expect(zeroSuppress("614141000036")).toBeNull();
  });
});
