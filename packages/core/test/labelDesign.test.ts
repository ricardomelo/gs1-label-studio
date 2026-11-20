import { beforeAll, describe, expect, it } from "vitest";
import { designFor, fieldsOf, identify, InputError, syntaxEngine, type DesignChoice, type SyntaxEngine } from "../src/index.ts";

// The design of one label from its data alone (backlog 5.1, ADR 0009): what step 2 recommends in the key's first
// scanning environment or the one named, or the symbol named, sized as the editor sizes it. The command line's tests
// read every symbol drawn from these designs back with ZXing.

let engine: SyntaxEngine;
beforeAll(async () => {
  engine = await syntaxEngine();
});

const design = (data: string, choice: DesignChoice = {}) => designFor(identify(engine, fieldsOf(engine.parse(data))), choice);

describe("a label's design from its data", () => {
  it("takes the symbol step 2 recommends in the key's first scanning environment", () => {
    expect(design("(01)09506000134376")).toMatchObject({ symbology: "ean13", environment: "retail", linear: "none", hri: "full", size: 100 });
    // a batch and a date at the point of sale: the QR code with the EAN-13 beside it
    expect(design("(01)09506000134376(10)B42(17)271231")).toMatchObject({ symbology: "dl-qrcode", environment: "retail", linear: "auto" });
    expect(design("(01)09506000134376(10)B42", { environment: "healthcare" })).toMatchObject({ symbology: "gs1-datamatrix", linear: "none" });
    // an SSCC: GS1-128 at table 5's row
    const sscc = design("(00)106141411234567897");
    expect([sscc.symbology, sscc.environment, sscc.table, sscc.spec?.symbol]).toEqual(["gs1-128", "logistics", 5, "gs1-128"]);
    expect(design("(8004)9506000ABC")).toMatchObject({ symbology: "gs1-128", environment: "assets", table: 9 });
  });

  it("takes the symbol named, a linear one at its table's row, a Digital Link one for a key no URI carries in DataMatrix", () => {
    expect(design("(01)09506000134376(10)B42", { symbology: "gs1-128", environment: "distribution" })).toMatchObject({ symbology: "gs1-128", table: 2 });
    expect(design("(01)09506000134376", { symbology: "dl-datamatrix", size: 150, hri: "none" })).toMatchObject({ symbology: "dl-datamatrix", size: 150, hri: "none", environment: "retail" });
    expect(design("(01)09506000134376", { symbology: "dl-datamatrix" }).spec).toBeUndefined();
    expect(design("(03)09506000134376", { symbology: "dl-qrcode" }).symbology).toBe("gs1-datamatrix");
  });

  it("names what to choose when nothing gives a symbol", () => {
    expect(() => design("(01)09506000134376", { symbology: "gs1-128", environment: "retail" })).toThrow(/table of retail has no row for GS1-128/);
    expect(() => design("(01)09506000134376", { environment: "moon" })).toThrow(/Unknown scanning environment: moon\. Use one of: retail, /);
    expect(() => design("(01)09506000134376", { environment: "logistics" })).toThrow("(01) is not scanned in the environment logistics: use retail,");
    expect(() => design("(01)09506000134376", { environment: "moon" })).toThrow(InputError);
  });
});
