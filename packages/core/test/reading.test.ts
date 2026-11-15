import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import bwipjs from "bwip-js";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
  bytesToHex, bytesToText, ndefUriMessage, readingFromDecoder, readingFromEpc, readingFromNdef, readingFromText, SYMBOLOGIES,
  withControlPictures, type DecodedSymbol,
} from "../src/index.ts";

// The Check Studio's reading record (backlog 7.1 a): what ZXing gives of every GS1 carrier the studio makes, and of the
// plain carriers a faulty label may use instead, measured here and written down in docs/conformance.md, which this
// test holds to the measure; and the reading built from a scanner's text, an NFC tag's NDEF message and an EPC.

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
});

const GS = "\u001d";
const ELEMENTS = "(01)09506000134376(10)B42(17)271231";
const ENCODED = `010950600013437610B42${GS}17271231`; // no FNC1 first: the identifier says GS1; a separator after (10)
const GTIN = "0109506000134376";

interface Case {
  /** The carrier's name, as the first column of docs/conformance.md writes it. */
  name: string;
  bcid: string;
  text: string;
  extra?: Record<string, unknown>;
  /** What ZXing gives: its format and identifier and the bytes, or null when it reads nothing. */
  read: { format: string; identifier: string; bytes: string; partial?: true } | null;
}

const CASES: Case[] = [
  { name: "EAN-13", bcid: "ean13", text: "9506000134376", read: { format: "EAN13", identifier: "]E0", bytes: "9506000134376" } },
  { name: "UPC-A", bcid: "upca", text: "950600013439", read: { format: "EAN13", identifier: "]E0", bytes: "0950600013439" } },
  { name: "EAN-8", bcid: "ean8", text: "95060002", read: { format: "EAN8", identifier: "]E4", bytes: "95060002" } },
  { name: "UPC-E", bcid: "upce", text: "01234565", read: { format: "UPCE", identifier: "]E0", bytes: "0012345000065" } },
  { name: "ITF-14", bcid: "itf14", text: "09506000134376", read: { format: "ITF", identifier: "]I1", bytes: "09506000134376" } },
  { name: "GS1-128", bcid: "gs1-128", text: ELEMENTS, read: { format: "Code128", identifier: "]C1", bytes: ENCODED } },
  { name: "GS1 DataMatrix", bcid: "gs1datamatrix", text: ELEMENTS, read: { format: "DataMatrix", identifier: "]d2", bytes: ENCODED } },
  { name: "GS1 QR Code", bcid: "gs1qrcode", text: ELEMENTS, read: { format: "QRCode", identifier: "]Q3", bytes: ENCODED } },
  {
    name: "QR code (GS1 Digital Link)", bcid: "qrcode", text: "https://id.gs1.org/01/09506000134376/10/B42",
    read: { format: "QRCode", identifier: "]Q1", bytes: "https://id.gs1.org/01/09506000134376/10/B42" },
  },
  {
    name: "Data Matrix (GS1 Digital Link)", bcid: "datamatrix", text: "https://id.gs1.org/01/09506000134376",
    read: { format: "DataMatrix", identifier: "]d1", bytes: "https://id.gs1.org/01/09506000134376" },
  },
  { name: "GS1 DataBar Omnidirectional", bcid: "databaromni", text: "(01)09506000134376", read: { format: "DataBarOmni", identifier: "]e0", bytes: GTIN } },
  { name: "GS1 DataBar Truncated", bcid: "databartruncated", text: "(01)09506000134376", read: { format: "DataBarOmni", identifier: "]e0", bytes: GTIN } },
  { name: "GS1 DataBar Stacked", bcid: "databarstacked", text: "(01)09506000134376", read: { format: "DataBarStk", identifier: "]e0", bytes: GTIN } },
  { name: "GS1 DataBar Stacked Omnidirectional", bcid: "databarstackedomni", text: "(01)09506000134376", read: { format: "DataBarStk", identifier: "]e0", bytes: GTIN } },
  { name: "GS1 DataBar Limited", bcid: "databarlimited", text: "(01)09506000134376", read: { format: "DataBarLtd", identifier: "]e0", bytes: GTIN } },
  { name: "GS1 DataBar Expanded", bcid: "databarexpanded", text: ELEMENTS, read: { format: "DataBarExp", identifier: "]e0", bytes: ENCODED } },
  { name: "GS1 DataBar Expanded Stacked", bcid: "databarexpandedstacked", text: ELEMENTS, read: { format: "DataBarExpStk", identifier: "]e0", bytes: ENCODED } },
  // Plain carriers a faulty label uses instead of the GS1 one: their identifier tells them apart
  { name: "Code 128 (not GS1-128)", bcid: "code128", text: "0109506000134376", read: { format: "Code128", identifier: "]C0", bytes: GTIN } },
  {
    name: "Data Matrix with the parentheses encoded", bcid: "datamatrix", text: "(01)09506000134376(10)B42",
    read: { format: "DataMatrix", identifier: "]d1", bytes: "(01)09506000134376(10)B42" },
  },
  {
    name: "QR code with element strings, no FNC1", bcid: "qrcode", text: `${GTIN}${GS}10B42`, extra: { parse: false },
    read: { format: "QRCode", identifier: "]Q1", bytes: `${GTIN}${GS}10B42` },
  },
  // What ZXing cannot read: no DotCode decoder, and a Composite Component's 2D part is left out
  { name: "GS1 DotCode", bcid: "gs1dotcode", text: ELEMENTS, read: null },
  {
    name: "EAN-13 with a Composite Component", bcid: "ean13composite", text: "9506000134376|(10)B42",
    read: { format: "EAN13", identifier: "]E0", bytes: "9506000134376", partial: true },
  },
  {
    name: "GS1-128 with a Composite Component", bcid: "gs1-128composite", text: "(01)09506000134376|(10)B42",
    read: { format: "Code128", identifier: "]C1", bytes: GTIN, partial: true },
  },
];

/** The symbol drawn by bwip-js and read by ZXing, its bytes untouched by a text mode. */
async function decode(c: Case): Promise<DecodedSymbol[]> {
  const svg = bwipjs.toSVG({ bcid: c.bcid, text: c.text, scale: 3, includetext: false, ...(c.extra ?? {}) } as never);
  const png = new Resvg(svg, { fitTo: { mode: "zoom", value: 4 }, background: "#fff" }).render().asPng();
  return readBarcodes(new Blob([png as Uint8Array<ArrayBuffer>]), { formats: [], textMode: "Plain", tryHarder: true, maxNumberOfSymbols: 4 });
}

/** The rows of the table in docs/conformance.md, section 3.1: carrier, bwip-js's name, read, format and identifier. */
function conformanceRows(): string[][] {
  const doc = readFileSync(new URL("../../../docs/conformance.md", import.meta.url), "utf8");
  const section = doc.slice(doc.indexOf("### 3.1 What a reader gives back"), doc.indexOf("## 4. EPC Tag Data Standard"));
  return section
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| Carrier") && !line.startsWith("| ---"))
    .map((line) => line.slice(2, -2).split(" | ").map((cell) => cell.replaceAll("`", "").trim()));
}

describe("what ZXing reads of each carrier (docs/conformance.md)", () => {
  it("covers every symbology the studio makes", () => {
    const names = CASES.map((c) => c.name);
    for (const symbology of Object.values(SYMBOLOGIES)) expect(names, symbology.name).toContain(symbology.name);
  });

  it.each(CASES.map((c) => [c.name, c] as const))("%s", async (_name, c) => {
    const results = await decode(c);
    if (!c.read) {
      expect(results).toEqual([]);
      return;
    }
    expect(results).toHaveLength(1);
    const reading = readingFromDecoder(results[0]!, { source: "image", at: new Date("2026-11-15T22:00:00Z") });
    expect([reading.format, reading.symbologyIdentifier]).toEqual([c.read.format, c.read.identifier]);
    expect(reading.bytes).toEqual(new TextEncoder().encode(c.read.bytes));
    expect(reading.identifierAssumed).toBe(false);
  });

  it("the table says what was measured, row by row", () => {
    const rows = conformanceRows();
    expect(rows.map((r) => r[0])).toEqual(CASES.map((c) => c.name));
    for (const [row, c] of rows.map((r, i) => [r, CASES[i]!] as const)) {
      const read = !c.read ? "no" : c.read.partial ? "the linear part only" : "yes";
      expect([row[1], row[2], row[3]], c.name).toEqual([c.bcid, read, c.read ? `${c.read.format}, ${c.read.identifier}` : "—"]);
    }
  });

  it("keeps the bytes as decoded: parentheses really encoded are bytes 28 and 29, a separator is 1D", async () => {
    const parentheses = (await decode(CASES.find((c) => c.name === "Data Matrix with the parentheses encoded")!))[0]!;
    const reading = readingFromDecoder(parentheses, { source: "camera" });
    expect(bytesToHex(reading.bytes).split(" ")).toContain("28");
    expect(bytesToHex(reading.bytes).split(" ")).toContain("29");
    const gs1 = readingFromDecoder((await decode(CASES.find((c) => c.name === "GS1 DataMatrix")!))[0]!, { source: "camera" });
    expect(bytesToHex(gs1.bytes)).toContain("32 1D 31 37"); // B42, the separator, (17)
    expect(withControlPictures(gs1.text)).toBe("010950600013437610B42␝17271231");
  });
});

describe("a reading from a decoder's result", () => {
  it("takes the symbol's identifier, bytes and what the decoder reports, the corners as points", () => {
    const symbol: DecodedSymbol = {
      format: "DataMatrix", symbologyIdentifier: "]d2", bytes: new TextEncoder().encode(ENCODED), hasECI: false, ecLevel: "", version: "18x18",
      isMirrored: true, isInverted: false,
      position: { topLeft: { x: 1, y: 2 }, topRight: { x: 30, y: 2 }, bottomRight: { x: 30, y: 31 }, bottomLeft: { x: 1, y: 31 } },
    };
    const reading = readingFromDecoder(symbol, { source: "camera", at: new Date("2026-11-15T22:00:00Z"), image: { width: 640, height: 480 } });
    expect(reading).toEqual({
      at: "2026-11-15T22:00:00.000Z", source: "camera", carrier: "barcode", symbologyIdentifier: "]d2", format: "DataMatrix",
      bytes: symbol.bytes, text: ENCODED, eci: false, ecLevel: null, version: "18x18", mirrored: true, inverted: false,
      position: [[1, 2], [30, 2], [30, 31], [1, 31]], image: { width: 640, height: 480 }, nfc: null, identifierAssumed: false,
    });
    // A copy of the bytes, not the decoder's own buffer
    expect(reading.bytes).not.toBe(symbol.bytes);
    // No identifier given: null, never an empty string
    expect(readingFromDecoder({ ...symbol, symbologyIdentifier: "" }, { source: "image" }).symbologyIdentifier).toBeNull();
  });
});

describe("a reading from a scanner's or pasted text", () => {
  const at = new Date("2026-11-15T22:00:00Z");
  it("takes a symbology identifier at the start, and says when there is none", () => {
    const scanned = readingFromText(`]d2${ENCODED}\r\n`, { source: "wedge", at });
    expect([scanned.symbologyIdentifier, scanned.text, scanned.identifierAssumed, scanned.carrier, scanned.source]).toEqual(["]d2", ENCODED, false, "barcode", "wedge"]);
    expect(scanned.bytes).toEqual(new TextEncoder().encode(ENCODED));
    const bare = readingFromText(ENCODED, { source: "paste", at });
    expect([bare.symbologyIdentifier, bare.identifierAssumed]).toEqual([null, true]);
    // Only at the start, and only ] with a flag character and a modifier
    expect(readingFromText(`01${GTIN}]d2`, { source: "paste" }).symbologyIdentifier).toBeNull();
    expect(readingFromText("]d", { source: "paste" }).symbologyIdentifier).toBeNull();
  });

  it("makes every written form of the group separator byte 29", () => {
    for (const form of ["{GS}", "{gs}", "<GS>", "[GS]", "␝", "\\x1d", "\\x1D", "\\u001d", "^]", GS]) {
      expect(readingFromText(`]C1${GTIN}10B42${form}17271231`, { source: "paste" }).text, form).toBe(`${GTIN}10B42${GS}17271231`);
    }
  });

  it("leaves everything else as it is: parentheses, spaces, a line ending only at the end", () => {
    expect(readingFromText(`${ELEMENTS}\n`, { source: "paste" }).text).toBe(ELEMENTS);
    expect(readingFromText("(01) 0950\n6000", { source: "paste" }).text).toBe("(01) 0950\n6000");
    expect(readingFromText("01095\r", { source: "wedge" }).text).toBe("01095");
  });
});

describe("a reading from a tag", () => {
  it("an NFC tag: its NDEF message's URI, the tag's serial number", () => {
    const uri = "https://id.gs1.org/01/09506000134376/21/1001";
    const reading = readingFromNdef(ndefUriMessage(uri), { serialNumber: "04:a2:6b:1c", at: new Date("2026-11-15T22:00:00Z") });
    expect([reading.carrier, reading.source, reading.text, reading.symbologyIdentifier, reading.identifierAssumed]).toEqual(["nfc", "nfc", uri, null, false]);
    expect(reading.nfc).toEqual({ serialNumber: "04:a2:6b:1c", recordIndex: 0, recordType: "U" });
    expect(() => readingFromNdef(Uint8Array.from([0xd2, 1, 1, 0x54, 0]), {})).toThrow(/not of a well-known type|not a URI/);
  });

  it("an RFID tag's EPC: its hexadecimal as the memory's bytes, or a URI as text", () => {
    const hex = readingFromEpc("3074 257b f7194e4000001a85\n", { source: "wedge" });
    expect([hex.carrier, hex.text]).toEqual(["rfid", "3074257BF7194E4000001A85"]);
    expect(bytesToHex(hex.bytes)).toBe("30 74 25 7B F7 19 4E 40 00 00 1A 85");
    const uri = readingFromEpc(" urn:epc:id:sgtin:0614141.812345.6789 ", { source: "paste" });
    expect([uri.text, bytesToText(uri.bytes)]).toEqual(["urn:epc:id:sgtin:0614141.812345.6789", "urn:epc:id:sgtin:0614141.812345.6789"]);
    // An odd number of digits is not a memory's bytes
    const odd = readingFromEpc("307", { source: "paste" });
    expect([odd.text, bytesToText(odd.bytes)]).toEqual(["307", "307"]);
  });
});

describe("the bytes' forms", () => {
  it("as text: UTF-8 when valid, else a character a byte", () => {
    expect(bytesToText(new TextEncoder().encode("Ação"))).toBe("Ação");
    expect(bytesToText(Uint8Array.from([0x41, 0xe7, 0x42]))).toBe("AçB");
  });
  it("as hexadecimal pairs, and control characters as pictures", () => {
    expect(bytesToHex(Uint8Array.from([0, 0x1d, 0xab]))).toBe("00 1D AB");
    expect(withControlPictures(`A${GS}B\u0000\u0004\u007f\r`)).toBe("A␝B␀␄␡␍");
  });
});
