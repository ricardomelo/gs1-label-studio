import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { lz_render_lang } from "@goodboy008/labelize-wasm";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { hriFont } from "./font.ts";
import { textFile } from "./files.ts";
import {
  designLabel,
  dplLabel,
  dplPage,
  dplTestLabel,
  eplLabel,
  eplLogisticLabel,
  eplPage,
  eplTestLabel,
  GENERIC_PROFILES,
  logisticLabel,
  logisticPage,
  pplaLabel,
  pplaPage,
  pplaTestLabel,
  PplaUnsupportedError,
  pplbLabel,
  pplbLogisticLabel,
  pplbPage,
  pplbTestLabel,
  PplbUnsupportedError,
  printFileBytes,
  printLabel,
  PRINTER_LANGUAGES,
  printPageFor,
  printTestLabel,
  PrinterUnsupportedError,
  profileProblem,
  snapToDots,
  specificationFor,
  syntaxEngine,
  type DesignPage,
  type Identified,
  type PrintFile,
  type SymbologyId,
} from "../src/index.ts";

// Argox's PPLA and PPLB (backlog 3.4 and 3.5; ADR 0002). Argox's programmer's manual (49.20002.001, December 2000) gives
// PPLA as compatible with Datamax's DPL and PPLB with Eltron's EPL2, and the same syntax for every command the studio
// writes; so each file is the DPL or EPL2 writer's, refusing what the manual does not have. Each is printed here in
// Labelize 1.10.0 as DPL or EPL2 (an emulator, not a printer, and not Argox's firmware) and read back by ZXing.

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
});

/** Labelize's PNG of a PPLA file as DPL (rows from the bottom: the canvas the label's dots high) or a PPLB file as EPL2. */
function render(language: "ppla" | "pplb", file: PrintFile, widthDots: number, heightDots: number, dpi: number): Uint8Array {
  const dpmm = Math.round(dpi / 25.4);
  const mm = (dots: number) => (language === "ppla" ? dots / dpmm : (dots / dpi) * 25.4);
  return lz_render_lang(printFileBytes(file), mm(widthDots), mm(heightDots), dpmm, false, false, language === "ppla" ? "dpl" : "epl");
}

async function reads(png: Uint8Array): Promise<string[]> {
  const results = await readBarcodes(new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }), {
    formats: [], textMode: "HRI", tryHarder: true, maxNumberOfSymbols: 4,
  });
  return results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort();
}

function options(xMm: number, dpi: number) {
  const { dots } = snapToDots(xMm, dpi);
  const margin = 15 * dots;
  return {
    x: margin, y: margin, dotsPerModule: dots, barHeightDots: Math.round((22.85 / 25.4) * dpi), dpi,
    widthDots: Math.round(6 * dpi), heightDots: Math.round(2.5 * dpi), hri: true,
  };
}

const ARGOX = { ppla: { label: pplaLabel, test: pplaTestLabel, base: dplLabel, baseTest: dplTestLabel }, pplb: { label: pplbLabel, test: pplbTestLabel, base: eplLabel, baseTest: eplTestLabel } };

type Case = ["ppla" | "pplb", SymbologyId, string, number, number, string];
const CASES: Case[] = [
  ["ppla", "ean13", "9506000134352", 0.33, 203, "]E0 9506000134352"],
  ["ppla", "ean8", "95012346", 0.33, 300, "]E4 95012346"],
  ["ppla", "upca", "614141000036", 0.33, 203, "]E0 0614141000036"],
  ["ppla", "upce", "01234565", 0.33, 203, "]E0 0012345000065"],
  ["ppla", "itf14", "19506000134359", 0.5, 203, "]I1 19506000134359"],
  ["ppla", "gs1-128", "(00)106141411234567897", 0.33, 203, "]C1 (00)106141411234567897"],
  ["ppla", "gs1-128", "(00)095060001343520000", 0.495, 300, "]C1 (00)095060001343520000"],
  ["ppla", "dl-datamatrix", "https://id.gs1.org/01/09506000134352/10/A~B", 0.495, 300, "]d1 https://id.gs1.org/01/09506000134352/10/A~B"],
  ["pplb", "ean13", "9506000134352", 0.33, 203, "]E0 9506000134352"],
  ["pplb", "ean8", "95012346", 0.33, 300, "]E4 95012346"],
  ["pplb", "upca", "614141000036", 0.33, 203, "]E0 0614141000036"],
  ["pplb", "upce", "01234565", 0.33, 203, "]E0 0012345000065"],
  ["pplb", "itf14", "19506000134359", 0.5, 203, "]I1 19506000134359"],
  ["pplb", "gs1-128", "(00)106141411234567897", 0.33, 203, "]C1 (00)106141411234567897"],
  ["pplb", "gs1-128", "(01)09506000134352(17)271231(10)AB-12", 0.33, 300, "]C1 (01)09506000134352(17)271231(10)AB-12"],
];

describe("PPLA and PPLB: the DPL and EPL2 commands Argox's manual gives alike, read back", () => {
  it.each(CASES)("%s %s %s at %s mm, %i dpi", async (language, symbology, data, xMm, dpi, read) => {
    const o = options(xMm, dpi);
    const file = ARGOX[language].label(symbology, data, o);
    // The same commands as DPL's or EPL2's, which Argox's manual writes alike
    expect(file).toBe(ARGOX[language].base(symbology, data, o));
    expect(await reads(render(language, file, o.widthDots, o.heightDots, dpi))).toEqual([read]);
  });

  it("PPLA's records as Argox's manual writes them: STX L, m, D11, z, then EAN-13 as F, UCC/EAN-128 as q, the quantity, E", () => {
    const o = { ...options(0.33, 203), hri: true };
    expect(pplaLabel("ean13", "9506000134352", o)).toMatch(/^\x02L\rm\rD11\rz\r1F33\d{3}\d{8}950600013435\rQ0001\rE\r$/);
    // Q's data: the AI and the SSCC's first 17 digits, the printer adding the check digit (manual, figure A10-17)
    expect(pplaLabel("gs1-128", "(00)106141411234567897", o)).toMatch(/\r1q33\d{3}\d{8}0010614141123456789\r/);
    expect(pplaLabel("dl-datamatrix", "https://id.gs1.org/01/09506000134352", { ...options(0.495, 203), hri: false })).toMatch(/\r1W1c44000\d{8}2000\d{6}https:\/\/id\.gs1\.org\/01\/09506000134352\r/);
  });

  it("PPLB's commands as Argox's manual writes them: N, q, B with E30 and 1E, P", () => {
    const o = options(0.33, 203);
    const file = pplbLabel("ean13", "9506000134352", o);
    expect(file.split("\r\n")).toEqual(["", "N", `q${o.widthDots}`, `B${o.x},${o.y},0,E30,3,3,${o.barHeightDots},B,"950600013435"`, "P1", ""]);
    expect(pplbLabel("gs1-128", "(00)106141411234567897", o)).toContain(",0,1E,3,3,");
  });

  it.each(["ppla", "pplb"] as const)("%s: the test label, its ruler and settings, as the base language writes it", (language) => {
    const o = options(0.33, 203);
    const notes = ["Printer: Desk printer", "203 dpi"];
    const file = ARGOX[language].test("ean13", "9506000134352", o, notes);
    expect(file).toBe(ARGOX[language].baseTest("ean13", "9506000134352", o, notes));
    expect(file).toContain("50 mm: measure this line");
  });

  // A label of one's own (backlog 4.2): text, a box, a line and a barcode, as DPL and EPL2 write them; the barcode read back
  it.each([["ppla", 304.8], ["pplb", 203]] as const)("%s: a label of one's own at %s dpi, its barcodes read back", async (language, dpi) => {
    const engine = await syntaxEngine();
    const elements = [
      { id: "e", kind: "symbol", symbology: "ean13", ais: ["01"], size: 100, hri: true, xMm: 4, yMm: 30 },
      { id: "t", kind: "text", text: "BATCH {10}", heightMm: 3, xMm: 4, yMm: 4 },
      { id: "b", kind: "box", widthMm: 60, heightMm: 20, thicknessMm: 0.5, filled: false, xMm: 70, yMm: 4 },
      { id: "l", kind: "line", vertical: false, lengthMm: 60, thicknessMm: 0.5, xMm: 70, yMm: 30 },
    ];
    const page = { widthMm: 140, heightMm: 70, elements: elements as unknown as DesignPage["elements"] };
    const designed = designLabel(page, engine.parse("(01)09506000134376(10)B42") as Identified, hriFont(), { environment: "retail" });
    expect(designed.problems).toEqual([]);
    const printed = printPageFor(designed, dpi);
    const file = language === "ppla" ? pplaPage(printed) : pplbPage(printed);
    expect(file).toEqual(language === "ppla" ? dplPage(printed) : eplPage(printed));
    expect(textFile(file)).toContain("BATCH B42");
    expect(await reads(render(language, file, printed.widthDots, printed.heightDots, dpi))).toEqual(designed.expected);
  });

  // The GS1 Logistic Label (backlog 4.1): PPLA as DPL's page of an SSCC alone, PPLB as EPL2's label; both read back
  it.each(["ppla", "pplb"] as const)("%s: the GS1 Logistic Label, every GS1-128 read back", async (language) => {
    const dpi = language === "ppla" ? 203.2 : 203;
    const elementString = language === "ppla" ? "(00)106141411234567897" : "(00)106141411234567897(02)09506000134376(37)24";
    const label = logisticLabel({
      elementString, size: "4x6", spec: specificationFor(5, "gs1-128")!, table: 5, percent: 100,
      from: ["Dal Giardino S.p.A."], to: ["Supermarket DC 12"],
    }, hriFont());
    const d = snapToDots(0.495, dpi).dots;
    if (language === "ppla") {
      const page = logisticPage(label, dpi, d);
      const file = pplaPage(page);
      expect(file).toBe(dplPage(page));
      expect(await reads(render("ppla", file, page.widthDots, page.heightDots, dpi))).toEqual(label.parts.map((p) => `]C1 ${p}`).sort());
    } else {
      const file = pplbLogisticLabel(label, dpi, d);
      expect(file).toBe(eplLogisticLabel(label, dpi, d));
      const width = Math.round((label.layout.width * label.layout.xMm / 25.4) * dpi);
      const height = Math.round((label.layout.height * label.layout.xMm / 25.4) * dpi);
      expect(await reads(render("pplb", file, width, height, dpi))).toEqual(label.parts.map((p) => `]C1 ${p}`).sort());
    }
  });
});

describe("what PPLA and PPLB refuse, with the reason", () => {
  const o = options(0.495, 203);
  const uri = "https://id.gs1.org/01/09506000134352";

  it("PPLA has no QR code; PPLB has no Data Matrix and no QR code (Argox's manual)", () => {
    for (const symbology of ["dl-qrcode", "gs1-qrcode"] as const) {
      expect(() => pplaLabel(symbology, uri, o)).toThrow(PplaUnsupportedError);
      expect(() => pplaLabel(symbology, uri, o)).toThrow(/^PPLA has no QR code: Argox's manual gives 20 linear bar codes, MaxiCode, PDF-417 and Data Matrix/);
    }
    expect(() => pplbLabel("dl-datamatrix", uri, o)).toThrow(/^PPLB has no Data Matrix: Argox's manual gives PDF-417 and MaxiCode as its only 2D bar codes/);
    expect(() => pplbLabel("gs1-datamatrix", "(01)09506000134352", o)).toThrow(/^PPLB has no Data Matrix/);
    expect(() => pplbLabel("dl-qrcode", uri, o)).toThrow(/^PPLB has no QR code/);
    expect(() => pplbTestLabel("dl-qrcode", uri, o, [])).toThrow(PplbUnsupportedError);
    expect(() => pplaTestLabel("dl-qrcode", uri, o, [])).toThrow(PplaUnsupportedError);
  });

  it("a refusal of DPL or EPL2 is said in PPLA's or PPLB's name, its reason kept", () => {
    const wide = { ...options(0.33, 203), dotsPerModule: 25 };
    expect(() => pplaLabel("ean13", "9506000134352", wide)).toThrow(
      "PPLA is written with DPL's commands, which its manual gives alike: DPL takes a module of 1 to 24 dots; this one needs 25. Choose another size or printer.",
    );
    expect(() => pplbLabel("ean13", "9506000134352", { ...options(0.33, 203), dotsPerModule: 5 })).toThrow(
      /^PPLB is written with EPL2's commands, which its manual gives alike: EPL2 prints EAN-13 with a narrow bar of 2 to 4 dots/,
    );
    try {
      pplaLabel("gs1-datamatrix", "(01)09506000134352", o);
    } catch (error) {
      expect(error).toBeInstanceOf(PplaUnsupportedError);
      expect(error).toBeInstanceOf(PrinterUnsupportedError);
      expect((error as Error).message).toMatch(/^PPLA is written with DPL's commands, which its manual gives alike: DPL's Data Matrix \(W1c\) has no FNC1/);
    }
  });

  it("PPLB refuses a Data Matrix beside the GS1 Logistic Label's data; PPLA a QR code on a page", () => {
    const label = logisticLabel({
      elementString: "(00)106141411234567897", size: "a5", spec: specificationFor(5, "gs1-128")!, table: 5, percent: 100,
      from: ["Dal Giardino S.p.A."], to: [], twoD: { symbology: "dl-datamatrix", data: "https://id.gs1.org/00/106141411234567897" },
    }, hriFont());
    expect(() => pplbLogisticLabel(label, 203, 4)).toThrow(/^PPLB has no Data Matrix/);
    const qr = logisticLabel({
      elementString: "(00)106141411234567897", size: "a5", spec: specificationFor(5, "gs1-128")!, table: 5, percent: 100,
      from: [], to: [], twoD: { symbology: "dl-qrcode", data: "https://id.gs1.org/00/106141411234567897" },
    }, hriFont());
    expect(() => pplaPage(logisticPage(qr, 203.2, 4))).toThrow(/^PPLA has no QR code/);
  });
});

describe("PPLA and PPLB among the printer languages", () => {
  it("each written with DPL's or EPL2's commands and checked in Labelize as that language, at 203 and 300 dpi", () => {
    expect(PRINTER_LANGUAGES.ppla).toMatchObject({ name: "PPLA", as: "dpl", extension: "ppla", checkedWith: "Labelize", templates: false });
    expect(PRINTER_LANGUAGES.pplb).toMatchObject({ name: "PPLB", as: "epl2", extension: "pplb", checkedWith: "Labelize", templates: false });
    expect(GENERIC_PROFILES.filter((p) => p.language === "ppla" || p.language === "pplb").map((p) => p.id)).toEqual(["ppla-203", "ppla-300", "pplb-203", "pplb-300"]);
    expect(profileProblem({ name: "Argox OS-214", dpi: 203, widthMm: 104, language: "pplb" })).toBeNull();
    expect(profileProblem({ name: "x", dpi: 203, widthMm: 104, language: "ppx" as never })).toBe("The printer's language is ZPL, TSPL, EPL2, DPL, PPLA or PPLB.");
    const o = options(0.33, 203);
    expect(printLabel("ppla", "ean13", "9506000134352", o)).toBe(pplaLabel("ean13", "9506000134352", o));
    expect(printTestLabel("pplb", "ean13", "9506000134352", o, ["n"])).toBe(pplbTestLabel("ean13", "9506000134352", o, ["n"]));
  });
});
