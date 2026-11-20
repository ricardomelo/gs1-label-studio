import { readFileSync } from "node:fs";
import type { AddressInfo, Server } from "node:net";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { decodeEpc, epcSchemes, PRINTER_LANGUAGES, readZplRfid, syntaxEngine } from "@gs1-label-studio/core";
import { unzip } from "../../core/test/files.ts";
import { hriFont } from "../../core/test/font.ts";
import { FORMATS, checkData, epcData } from "../src/commands.ts";
import { OPENAPI } from "../src/openapi.ts";
import { MAX_BODY, serve } from "../src/serve.ts";

// gs1ls serve (backlog 5.1 c, ADR 0009 decision 3): every route through fetch, as an integrator calls it; each symbol
// read back by ZXing, each tag decoded back, the answers the commands' own; the refusals with their HTTP status; the
// OpenAPI document naming what the routes take.

let server: Server;
let base: string;
const engine = await syntaxEngine();
const schemes = await epcSchemes();

beforeAll(async () => {
  server = await serve(engine, hriFont(), { port: 0 }) as unknown as Server;
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function read(png: Uint8Array): Promise<string[]> {
  const results = await readBarcodes(new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }), {
    formats: [], textMode: "HRI", tryHarder: true, maxNumberOfSymbols: 4,
  });
  return results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort();
}

const svgPng = (svg: string) => new Uint8Array(new Resvg(svg, { fitTo: { mode: "zoom", value: 8 }, background: "white" }).render().asPng());
const post = (route: string, body: unknown) => fetch(`${base}${route}`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const bytes = async (response: Response) => new Uint8Array(await response.arrayBuffer());

describe("gs1ls serve", () => {
  it("listens on 127.0.0.1 unless told otherwise", () => {
    expect((server.address() as AddressInfo).address).toBe("127.0.0.1");
  });

  it("checks one reading as gs1ls check does", async () => {
    const response = await post("/check", { data: "(01)09506000134377(10)B42" });
    expect(response.status).toBe(200);
    const out = await response.json();
    expect(out).toEqual(JSON.parse(JSON.stringify(checkData(engine, "(01)09506000134377(10)B42"))));
    expect(out.findings[0]).toMatchObject({ code: "C1", details: { expected: "6" } });
  });

  it("draws a label in the format asked, read back, named in Content-Disposition", async () => {
    const png = await post("/label", { data: "(01)09506000134376(10)B42(17)271231", format: "png" });
    expect(png.headers.get("content-type")).toBe("image/png");
    expect(png.headers.get("content-disposition")).toBe('attachment; filename="dl-qrcode_09506000134376.png"');
    expect(await read(await bytes(png))).toEqual(["]E0 9506000134376", "]Q1 https://id.gs1.org/01/09506000134376/10/B42?17=271231"]);
    const svg = await post("/label", { data: "(01)09506000134376(10)B42", format: "svg", symbol: "gs1-datamatrix", size: 150, hri: "none" });
    expect(svg.headers.get("content-type")).toBe("image/svg+xml");
    expect(await read(svgPng(await svg.text()))).toEqual(["]d2 (01)09506000134376(10)B42"]);
    const stem = await post("/label", { data: "(01)09506000134376(10)B42", format: "svg", symbol: "dl-qrcode", stem: "https://example.com" });
    expect(await read(svgPng(await stem.text()))).toEqual(["]Q1 https://example.com/01/09506000134376/10/B42"]);
    const zpl = await post("/label", { data: "(00)095060001343000014", format: "zpl", dpi: 300 });
    expect(zpl.headers.get("content-disposition")).toMatch(/_300dpi\.zpl"$/);
    expect(await zpl.text()).toMatch(/^\^XA/);
  });

  it("gives the tag as gs1ls epc does, or the RFID printer's ZPL", async () => {
    const request = { data: "(01)09506000134352(21)12345", prefixLength: 7, umi: true };
    const json = await (await post("/epc", request)).json();
    const { tag: _tag, ...expected } = await epcData(engine, request.data, { prefixLength: 7, umi: true });
    expect(json).toEqual(expected);
    expect(decodeEpc(schemes, json.epc)?.pureIdentity).toBe("urn:epc:id:sgtin:9506000.013435.12345");
    const zpl = await post("/epc", { ...request, format: "zpl", writeFrom: "epc" });
    expect(zpl.headers.get("content-disposition")).toBe(`attachment; filename="epc_${json.epc}.zpl"`);
    expect(readZplRfid(await zpl.text())[0]).toMatchObject({ block: "", hex: json.epc });
    // GS1's GCP length table sent as XML
    const gcp = '<GCPPrefixFormatList date="2026-01-01T00:00:00Z"><entry prefix="950" gcpLength="7"/></GCPPrefixFormatList>';
    expect((await (await post("/epc", { data: request.data, gcp })).json()).source).toBe("A company prefix of 7 digits, from GS1's list of 2026-01-01.");
  });

  it("makes a CSV's labels in a zip, the counts in its headers, each tag in the ZPL", async () => {
    const csv = "GTIN,Serial,Batch\n09506000134352,1001,B1\n09506000134352,1002,B2\n123,1,x\n";
    const response = await fetch(`${base}/bulk?files=svg&symbol=gs1-datamatrix&pattern={21}&rfid=true&prefixLength=7`, { method: "POST", body: csv, headers: { "Content-Type": "text/csv" } });
    expect(response.status).toBe(200);
    expect([response.headers.get("x-rows"), response.headers.get("x-generated"), response.headers.get("x-left")]).toEqual(["3", "2", "1"]);
    const files = unzip(await bytes(response));
    expect([...files.keys()].sort()).toEqual(["1001.svg", "1002.svg", "generated.csv", "labels_gs1-datamatrix_203dpi.zpl", "tags.csv"]);
    expect(await read(svgPng(new TextDecoder().decode(files.get("1001.svg")!)))).toEqual(["]d2 (01)09506000134352(21)1001(10)B1"]);
    const writes = readZplRfid(new TextDecoder().decode(files.get("labels_gs1-datamatrix_203dpi.zpl")!));
    expect(writes.map((w) => decodeEpc(schemes, w.hex.slice(4))?.pureIdentity)).toEqual(["urn:epc:id:sgtin:9506000.013435.1001", "urn:epc:id:sgtin:9506000.013435.1002"]);
  });

  it("refuses with the status that says whose the fault is", async () => {
    const refused = async (response: Response) => [response.status, (await response.json()).error];
    expect(await refused(await post("/label", { data: "(01)09506000134376", format: "gif" }))).toEqual([400, expect.stringMatching(/^Unknown format: gif/)]);
    expect(await refused(await post("/label", { data: "(01)09506000134377" }))).toEqual([422, expect.stringContaining("check digit")]);
    expect(await refused(await post("/check", {}))).toEqual([400, "data is the element string, GS1 Digital Link URI or scanner's text."]);
    expect(await refused(await post("/label", { data: "(01)09506000134376", size: "big" }))).toEqual([400, "size is a number."]);
    expect(await refused(await fetch(`${base}/check`, { method: "POST", body: "not json" }))).toEqual([400, "The body is not JSON."]);
    expect(await refused(await post("/epc", { data: "(01)09506000134352", prefixLength: 7 }))).toEqual([422, "This key's EPC needs its qualifier (21), such as the serial number."]);
    expect(await refused(await post("/epc", { data: "(01)09506000134352(21)1", gcp: "<nothing/>" }))).toEqual([400, expect.any(String)]);
    expect(await refused(await fetch(`${base}/bulk?print=postscript`, { method: "POST", body: "GTIN\n09506000134352\n" }))).toEqual([400, expect.stringMatching(/^Unknown printer language/)]);
    expect(await refused(await fetch(`${base}/check`))).toEqual([405, "GET is not allowed here."]);
    expect(await refused(await fetch(`${base}/nothing`))).toEqual([404, "No such route: /v1/nothing. See /v1/openapi.json."]);
    expect(await refused(await fetch(`${base}/bulk`, { method: "POST", body: new Uint8Array(MAX_BODY + 1) }))).toEqual([413, "The request is larger than 32 MB."]);
  });

  it("describes itself in OpenAPI 3.1: the routes it serves, the formats and languages the commands take", async () => {
    const document = await (await fetch(`${base}/openapi.json`)).json();
    expect(document).toEqual(JSON.parse(JSON.stringify(OPENAPI)));
    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(document.paths).sort()).toEqual(["/v1/bulk", "/v1/check", "/v1/epc", "/v1/label", "/v1/openapi.json"]);
    const label = document.paths["/v1/label"].post.requestBody.content["application/json"].schema.properties;
    expect(label.format.enum).toEqual([...FORMATS]);
    const print = document.paths["/v1/bulk"].post.parameters.find((p: { name: string }) => p.name === "print");
    expect(print.schema.enum).toEqual(Object.keys(PRINTER_LANGUAGES));
    // every property the document names for a route is one the route reads: a request with all of them is taken
    const all = { data: "(01)09506000134376(10)B42", format: "png", symbol: "gs1-datamatrix", environment: "retail", size: 100, hri: "key", dpi: 300, stem: "https://example.com" };
    expect(Object.keys(all).sort()).toEqual(Object.keys(label).sort());
    expect((await post("/label", all)).status).toBe(200);
    const epc = document.paths["/v1/epc"].post.requestBody.content["application/json"].schema.properties;
    const allEpc = { data: "(01)09506000134352(21)1(17)271231", scheme: "plus", prefixLength: 7, gcp: undefined, filter: 3, date: "17", withData: true, umi: true, hazmat: true, stem: "https://example.com", format: "json", dpi: 300, writeFrom: "pc" };
    expect(Object.keys(allEpc).sort()).toEqual(Object.keys(epc).sort());
    expect((await post("/epc", allEpc)).status).toBe(200);
  });
});
