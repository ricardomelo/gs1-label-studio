import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { decodeEpc, decodeEpcPlus, encodeEpc, encoderCsv, epcBank, epcSchemes, pcWord, readEpcBank, readZplRfid, zplRfidLabel } from "@gs1-label-studio/core";
import { unzip } from "../../core/test/files.ts";
import { run } from "../src/main.ts";

// gs1ls epc and gs1ls bulk (backlog 5.1 b, ADR 0009): the tag the RFID Studio writes for one datum, and the editor's
// bulk generation for a CSV or a workbook; every symbol read back by ZXing, every tag decoded back to its identity.

const SERIALISED = "(01)09506000134352(21)12345";
const schemes = await epcSchemes();
const dir = mkdtempSync(join(tmpdir(), "gs1ls-"));

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
});

async function read(png: Uint8Array): Promise<string[]> {
  const results = await readBarcodes(new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }), {
    formats: [], textMode: "HRI", tryHarder: true, maxNumberOfSymbols: 4,
  });
  return results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort();
}

const svgPng = (svg: Uint8Array) => new Uint8Array(new Resvg(new TextDecoder().decode(svg), { fitTo: { mode: "zoom", value: 8 }, background: "white" }).render().asPng());
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** A run whose -o file is kept in memory rather than written. */
async function made(args: string[]): Promise<{ status: number; stdout: string | Uint8Array; stderr: string; name?: string; bytes?: Uint8Array }> {
  let written: { name: string; bytes: Uint8Array } | undefined;
  const result = await run(args, (name, bytes) => (written = { name, bytes }));
  return { ...result, ...(written ?? {}) };
}

describe("gs1ls epc", () => {
  it("gives the tag the RFID Studio writes: the core's EPC, bank and URIs, decoded back to the data", async () => {
    const out = await run(["epc", SERIALISED, "--prefix-length", "7"]);
    expect(out.status).toBe(0);
    const epc = encodeEpc(schemes, "01", "09506000134352", { "21": "12345" }, 7, 1);
    const bank = epcBank(epc.hex, epc.bits.length);
    expect(out.stdout).toBe([
      `EPC (from bit 20h): ${bank.fromEpc}`,
      `StoredPC and EPC (from bit 10h): ${bank.fromPc}`,
      "Scheme: sgtin-96, filter 1, 96 bits",
      `StoredCRC: ${bank.crc.toString(16).toUpperCase().padStart(4, "0")}  StoredPC: 3000`,
      "EPC Pure Identity URI: urn:epc:id:sgtin:9506000.013435.12345",
      "EPC Tag URI: urn:epc:tag:sgtin-96:1.9506000.013435.12345",
      "",
    ].join("\n"));
    expect(decodeEpc(schemes, bank.fromEpc)?.elements).toEqual([["01", "09506000134352"], ["21", "12345"]]);
    // the whole bank as a reader gives it from bit 00h reads back as the same EPC with a good CRC
    expect(readEpcBank(bank.hex)).toMatchObject({ crc: { ok: true }, epc: bank.epc });
  });

  it("writes EPC+ and EPC++ with the data's dates and +AIDC data, the StoredPC's bits, in JSON too", async () => {
    const json = JSON.parse((await run(["epc", `${SERIALISED}(17)271231(10)B42`, "--scheme", "plus", "--with-data", "--umi", "--hazmat", "--json"])).stdout as string);
    expect(json.scheme).toBe("epc+");
    // the StoredPC: the EPC's length in words, the user memory indicator and the hazardous material bit
    expect(json.storedPc).toBe(pcWord(json.bits, { umi: true, attributes: 1 }).toString(16).toUpperCase().padStart(4, "0"));
    expect(json.storedPc).not.toBe(pcWord(json.bits).toString(16).toUpperCase().padStart(4, "0"));
    expect(decodeEpcPlus(json.epc)?.digitalLink).toBe("https://id.gs1.org/01/09506000134352/10/B42/21/12345?17=271231");
    expect(json.digitalLinkUri).toBe(decodeEpcPlus(json.epc)?.digitalLink);
    expect(json.tag).toBeUndefined();
    const plusPlus = JSON.parse((await run(["epc", SERIALISED, "--scheme", "plusplus", "--stem", "https://example.com", "--json"])).stdout as string);
    expect(decodeEpcPlus(plusPlus.epc)?.digitalLink).toBe("https://example.com/01/09506000134352/21/12345");
  });

  it("takes the prefix length from GS1's GCP length table and says so", async () => {
    const gcp = join(dir, "gcp.xml");
    writeFileSync(gcp, '<GCPPrefixFormatList date="2026-01-01T00:00:00Z"><entry prefix="950" gcpLength="7"/></GCPPrefixFormatList>');
    const out = await run(["epc", SERIALISED, "--gcp", gcp]);
    expect(out.stdout).toContain("urn:epc:id:sgtin:9506000.013435.12345");
    expect(out.stdout).toContain("A company prefix of 7 digits, from GS1's list of 2026-01-01.");
  });

  it("writes a ZPL label for an RFID printer, the tag written from bit 10h or 20h", async () => {
    const out = await made(["epc", SERIALISED, "--prefix-length", "7", "--zpl", "--dpi", "300"]);
    const epc = encodeEpc(schemes, "01", "09506000134352", { "21": "12345" }, 7, 1);
    const bank = epcBank(epc.hex, epc.bits.length);
    expect(out.name).toBe(`epc_${bank.fromEpc}.zpl`);
    expect(text(out.bytes!)).toBe(zplRfidLabel(bank, [bank.fromEpc, epc.pureIdentity], { dpi: 300, from: "pc" }));
    expect(readZplRfid(text(out.bytes!))[0]).toMatchObject({ block: "1", hex: bank.fromPc });
    const auto = await run(["epc", SERIALISED, "--prefix-length", "7", "--zpl", "--write-from", "epc", "-o", "-"]);
    expect(readZplRfid(text(auto.stdout as Uint8Array))[0]).toMatchObject({ block: "", hex: bank.fromEpc });
  });

  it("gives the reason there is no EPC (1) and refuses a choice it cannot understand (2)", async () => {
    expect(await run(["epc", "(01)09506000134352", "--prefix-length", "7"])).toEqual({
      status: 1, stdout: "", stderr: "This key's EPC needs its qualifier (21), such as the serial number.\n",
    });
    expect((await run(["epc", SERIALISED])).stderr).toBe("Choose the company prefix length, or load GS1's GCP length table.\n");
    expect((await run(["epc", SERIALISED, "--scheme", "nfc"])).status).toBe(2);
    expect((await run(["epc", SERIALISED, "--prefix-length", "13"])).stderr).toBe("The company prefix length is 6 to 12 digits.\n");
    expect((await run(["epc", SERIALISED, "--prefix-length", "7", "--filter", "8"])).status).toBe(2);
    expect((await run(["epc", SERIALISED, "--prefix-length", "7", "--zpl", "--write-from", "crc"])).status).toBe(2);
  });
});

describe("gs1ls bulk", () => {
  const csv = join(dir, "products.csv");
  writeFileSync(csv, "GTIN,Serial,Batch,Produto\n09506000134352,1001,B1,Feijão\n09506000134352,1002,B2,Arroz\n123,1,x,bad\n");

  it("makes every row's label as the editor's bulk generation does, each read back, the row in error left out", async () => {
    const out = await made(["bulk", csv, "--files", "svg", "--symbol", "gs1-datamatrix", "--pattern", "{Produto}_{21}"]);
    expect(out.status).toBe(1);
    expect(out.name).toBe("labels.zip");
    expect(out.stderr).toBe("labels.zip\n2 of 3 rows generated; 1 left out (their reasons are in generated.csv)\n");
    const files = unzip(out.bytes!);
    expect([...files.keys()].sort()).toEqual(["Arroz_1002.svg", "Feijao_1001.svg", "generated.csv"]);
    expect(await read(svgPng(files.get("Feijao_1001.svg")!))).toEqual(["]d2 (01)09506000134352(21)1001(10)B1"]);
    expect(await read(svgPng(files.get("Arroz_1002.svg")!))).toEqual(["]d2 (01)09506000134352(21)1002(10)B2"]);
    expect(text(files.get("generated.csv")!).split("\r\n")[3]).toBe("4,error,,,,3 digits entered; this identifier has 14.");
  });

  it("reads a workbook, and writes one PDF and one print file for all the rows", async () => {
    const xlsx = new URL("../../core/test/fixtures/bulk/products.xlsx", import.meta.url).pathname;
    const out = await made(["bulk", xlsx, "--pdf", "--print", "zpl", "--dpi", "300", "--symbol", "gs1-datamatrix", "-o", "out.zip"]);
    expect(out.name).toBe("out.zip");
    const names = [...unzip(out.bytes!).keys()].sort();
    expect(names).toEqual(["generated.csv", "labels_gs1-datamatrix.pdf", "labels_gs1-datamatrix_300dpi.zpl"]);
    expect(text(unzip(out.bytes!).get("labels_gs1-datamatrix_300dpi.zpl")!).match(/\^XA/g)).toHaveLength(2);
    // a language that cannot print the symbol yet says so for each row, as the editor does (ADR 0002)
    const tspl = await made(["bulk", xlsx, "--print", "tspl"]);
    expect(text(unzip(tspl.bytes!).get("generated.csv")!)).toContain("TSPL: TSPL's RSS command is not offered yet for GS1 DataBar Expanded");
  });

  it("with --rfid, writes each row's tag after each ^XA of the ZPL and lists the tags in tags.csv", async () => {
    const out = await made(["bulk", csv, "--rfid", "--prefix-length", "7"]);
    const files = unzip(out.bytes!);
    const zpl = text(files.get("labels_dl-qrcode_203dpi.zpl")!);
    const writes = readZplRfid(zpl);
    expect(writes).toHaveLength(2);
    expect(writes.map((w) => decodeEpc(schemes, w.hex.slice(4))?.pureIdentity)).toEqual(["urn:epc:id:sgtin:9506000.013435.1001", "urn:epc:id:sgtin:9506000.013435.1002"]);
    const tags = text(files.get("tags.csv")!);
    const first = encodeEpc(schemes, "01", "09506000134352", { "21": "1001" }, 7, 1);
    expect(tags.split("\r\n")[1]).toBe(encoderCsv([{ row: 2, bank: epcBank(first.hex, 96), identity: first.pureIdentity, tagUri: first.tagUri }]).split("\r\n")[1]);
    expect(tags.split("\r\n")[3]).toBe("4,,,,,,3 digits entered; this identifier has 14.");
  });

  it("refuses what it cannot do as a usage error", async () => {
    expect((await made(["bulk"])).status).toBe(2);
    expect((await made(["bulk", csv, "--files", "gif"])).stderr).toBe("Unknown file kind: gif. Use svg, png, pdf or eps.\n");
    expect((await made(["bulk", csv, "--pattern", "{nothing}"])).status).toBe(2);
    expect((await made(["bulk", csv, "--rfid", "--prefix-length", "7", "--print", "tspl"])).stderr).toBe("RFID tags are written in ZPL only: use --print zpl.\n");
    expect((await made(["bulk", csv, "--print", "postscript"])).status).toBe(2);
  });
});
