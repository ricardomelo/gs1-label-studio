import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { lz_render_lang } from "@goodboy008/labelize-wasm";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { decodePng } from "./png.ts";
import {
  eplLabel,
  eplTestLabel,
  EplUnsupportedError,
  PrinterUnsupportedError,
  snapToDots,
  splitGs1128,
  tsplLabel,
  tsplTestLabel,
  TsplUnsupportedError,
  type SymbologyId,
} from "../src/index.ts";

// TSPL and EPL2 with the printer's own commands (ADR 0002, backlog 3.3 and 3.6), rendered by Labelize 1.10.0, an
// open-source emulator of both languages (MIT; not a printer, and not the printers' firmware), and read back by ZXing:
// the symbology identifier and the data, as ZPL is through Labelary. What Labelize does not print as the manual says is
// refused by the writers; the refusals are tested below.

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
});

type Language = "tspl" | "epl";
const WRITERS = { tspl: tsplLabel, epl: eplLabel };

/** Labelize's PNG of a print file, at the printer's dots a millimetre. */
function render(language: Language, file: string, widthDots: number, heightDots: number, dpi: number): Uint8Array {
  const mm = (dots: number) => (dots / dpi) * 25.4;
  return lz_render_lang(new TextEncoder().encode(file), mm(widthDots), mm(heightDots), Math.round(dpi / 25.4), false, false, language);
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

type Case = [Language, SymbologyId, string, number, number, string];
const CASES: Case[] = [
  ["tspl", "ean13", "9506000134352", 0.33, 203, "]E0 9506000134352"],
  ["tspl", "itf14", "19506000134359", 0.5, 203, "]I1 19506000134359"],
  ["tspl", "gs1-datamatrix", "(01)09506000134352(10)AB-C(17)271231(21)123", 0.38, 300, "]d2 (01)09506000134352(10)AB-C(17)271231(21)123"],
  ["tspl", "gs1-datamatrix", "(01)09506000134352(21)ABCDEFGH12345", 0.5, 203, "]d2 (01)09506000134352(21)ABCDEFGH12345"],
  ["tspl", "dl-datamatrix", "https://id.gs1.org/01/09506000134352/10/A~B", 0.495, 300, "]d1 https://id.gs1.org/01/09506000134352/10/A~B"],
  ["tspl", "dl-qrcode", "https://id.gs1.org/01/09506000134352/10/ABC123", 0.495, 203, "]Q1 https://id.gs1.org/01/09506000134352/10/ABC123"],
  ["tspl", "dl-qrcode", 'https://example.com/a"b', 0.495, 300, ']Q1 https://example.com/a"b'],
  ["epl", "ean13", "9506000134352", 0.33, 203, "]E0 9506000134352"],
  ["epl", "ean8", "95012346", 0.33, 300, "]E4 95012346"],
  ["epl", "upca", "614141000036", 0.33, 203, "]E0 0614141000036"],
  ["epl", "upce", "01234565", 0.33, 203, "]E0 0012345000065"],
  ["epl", "itf14", "19506000134359", 0.5, 203, "]I1 19506000134359"],
  ["epl", "gs1-128", "(00)106141411234567897", 0.33, 203, "]C1 (00)106141411234567897"],
  ["epl", "gs1-128", "(01)09506000134352(17)271231(10)Ab-1/2.%+'", 0.33, 300, "]C1 (01)09506000134352(17)271231(10)Ab-1/2.%+'"],
  ["epl", "dl-datamatrix", "https://id.gs1.org/01/09506000134352/10/A%22B", 0.495, 203, "]d1 https://id.gs1.org/01/09506000134352/10/A%22B"],
];

describe("TSPL and EPL2 rendered by Labelize and read back", () => {
  it.each(CASES)("%s %s %s at %s mm, %i dpi", async (language, symbology, data, xMm, dpi, read) => {
    const o = options(xMm, dpi);
    expect(await reads(render(language, WRITERS[language](symbology, data, o), o.widthDots, o.heightDots, dpi))).toEqual([read]);
  });

  it.each([["tspl", "frame"], ["tspl", "bars"], ["epl", "frame"], ["epl", "bars"]] as const)("%s: ITF-14 with its bearer %s, read back", async (language, kind) => {
    const o = { ...options(0.5, 203), bearer: { kind, thicknessDots: kind === "frame" ? 39 : 8 }, x: 150, y: 120 };
    const file = WRITERS[language]("itf14", "19506000134359", o);
    expect(file).toMatch(language === "tspl" ? (kind === "frame" ? /\nBOX / : /\nBAR /) : kind === "frame" ? /\nX\d/ : /\nLO\d/);
    expect(await reads(render(language, file, o.widthDots, o.heightDots, 203))).toEqual(["]I1 19506000134359"]);
  });

  // The symbol starts where the label's layout puts it. EPL2's printer draws a Data Matrix's quiet zone itself, a module
  // wide (guide, b command), so the command starts a module earlier; Labelize draws no such quiet zone, so there the
  // symbol shows a module before the corner — the difference between the guide and the emulator, kept in sight
  it.each([["tspl", "dl-datamatrix"], ["epl", "dl-datamatrix"], ["tspl", "dl-qrcode"], ["epl", "ean13"], ["tspl", "ean13"]] as const)(
    "%s: %s starts at the layout's corner", (language, symbology) => {
      const o = { ...options(0.495, 203), hri: false };
      const data = symbology === "ean13" ? "9506000134352" : "https://id.gs1.org/01/09506000134352";
      const { grey, width } = decodePng(render(language, WRITERS[language](symbology, data, o), o.widthDots, o.heightDots, 203));
      let left = width;
      let top = Infinity;
      grey.forEach((value, index) => {
        if (value >= 128) return;
        left = Math.min(left, index % width);
        top = Math.min(top, Math.floor(index / width));
      });
      const early = language === "epl" && symbology === "dl-datamatrix" ? o.dotsPerModule : 0;
      expect([left, top]).toEqual([o.x - early, o.y - early]);
    },
  );

  it("EPL2: GS1-128 in two symbols, stacked, each read back", async () => {
    const data = "(00)106141411234567897(02)09506000134376(37)24(15)271231(3102)001250(10)ABCDEFGHIJ";
    const parts = splitGs1128(data);
    expect(parts).toHaveLength(2);
    const o = { ...options(0.495, 203), parts, widthDots: Math.round(8 * 203), heightDots: Math.round(3 * 203) };
    const file = eplLabel("gs1-128", data, o);
    expect(file.match(/,1E,/g)).toHaveLength(2);
    expect(await reads(render("epl", file, o.widthDots, o.heightDots, 203))).toEqual(parts.map((p) => `]C1 ${p}`).sort());
  });

  it.each([["tspl", tsplTestLabel], ["epl", eplTestLabel]] as const)("%s: a test label, the symbol read and the ruler 50 mm", async (language, test) => {
    const o = { ...options(0.495, 203), heightDots: 400 };
    const file = test(language === "epl" ? "dl-datamatrix" : "dl-qrcode", "https://id.gs1.org/01/09506000134352", o, ["Printer: any printer, 203 dpi"]);
    const height = o.heightDots + 200;
    const png = render(language, file, o.widthDots, height, 203);
    expect((await reads(png)).length).toBe(1);
    // The ruler's line: the longest run of black on a row below the label
    const { grey, width } = decodePng(png);
    let longest = 0;
    for (let row = o.heightDots; row < grey.length / width; row++) {
      let run = 0;
      for (let col = 0; col < width; col++) {
        run = grey[row * width + col]! < 128 ? run + 1 : 0;
        longest = Math.max(longest, run);
      }
    }
    expect(longest).toBe(400); // 50 mm at 8 dots a millimetre
  });
});

describe("what TSPL and EPL2 refuse, with the reason", () => {
  const o = options(0.33, 203);
  it.each([
    ["tspl", "gs1-128", "(01)09506000134352(10)ABC", /encodes "!102" as text/],
    ["tspl", "ean8", "95012346", /does not draw it/],
    ["tspl", "upca", "614141000036", /does not draw it/],
    ["tspl", "databar-omni", "(01)09506000134352", /RSS command/],
    ["tspl", "gs1-qrcode", "(01)09506000134352", /no FNC1/],
    ["epl", "gs1-datamatrix", "(01)09506000134352", /has no FNC1/],
    ["epl", "dl-qrcode", "https://id.gs1.org/01/09506000134352", /Japanese printer models only/],
    ["epl", "gs1-128", "(01)09506000134352(10)ABC(17)271231", /only last/],
    ["epl", "databar-omni", "(01)09506000134352", /RSS-14/],
    ["epl", "dl-datamatrix", 'https://example.com/a"b', /double quote or a backslash/],
    ["epl", "gs1-128", '(01)09506000134352(10)a"b', /double quote or a backslash/],
  ] as const)("%s refuses %s %s", (language, symbology, data, reason) => {
    const error = (() => {
      try {
        WRITERS[language](symbology, data, o);
      } catch (e) {
        return e;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(language === "tspl" ? TsplUnsupportedError : EplUnsupportedError);
    expect(error).toBeInstanceOf(PrinterUnsupportedError);
    expect((error as Error).message).toMatch(reason);
  });

  it("EPL2 prints EAN and UPC with a narrow bar of 2 to 4 dots only", () => {
    expect(() => eplLabel("ean13", "9506000134352", { ...o, dotsPerModule: 5 })).toThrow(/2 to 4 dots/);
    expect(() => eplLabel("ean13", "9506000134352", { ...o, dotsPerModule: 1 })).toThrow(/2 to 4 dots/);
  });

  it("text beside a symbol is refused: the printer's font sets its width", () => {
    expect(() => tsplLabel("gs1-datamatrix", "(01)09506000134352(10)ABC", { ...o, hriPosition: "left" })).toThrow(/below or above/);
    expect(() => eplLabel("gs1-128", "(01)09506000134352(10)ABC", { ...o, hriPosition: "right" })).toThrow(/below or above/);
  });

  it("TSPL quotes a double quote as \\[\"], as its manual says (read back above)", () => {
    expect(tsplLabel("dl-qrcode", 'https://example.com/a"b', options(0.495, 203))).toContain('"https://example.com/a\\["]b"');
  });
});
