import { beforeAll, describe, expect, it } from "vitest";
import {
  check, LINK_LIMIT, linkWithin, ndefUriMessage, packText, readingFromDecoder, readingFromEpc, readingFromNdef, readingFromParam, readingFromText, readingParam,
  readWork, SyntaxEngine, unpackText, workFile, workFromParam, workParam, type Reading, type Work,
} from "../src/index.ts";

// Shared links (backlog 7.1 l; the check studio's project, section 7.4 and item l's acceptance): a reading's link,
// opened elsewhere, gives the same reading and so the same result; a work's link opens the same work; a link that was
// cut or changed is refused with a message, never read as something else; a link past 2,000 characters is not offered.

let engine: SyntaxEngine;
beforeAll(async () => {
  engine = await SyntaxEngine.create();
});

const GS = "\u001d";
const at = new Date("2026-11-17T01:00:00.000Z");
const SITE = "https://ricardomelo.github.io/gs1-label-studio/#/check?r=";

const readings: [string, Reading][] = [
  ["a GS1 DataMatrix with a fault", readingFromDecoder({ format: "DataMatrix", symbologyIdentifier: "]d2", bytes: new TextEncoder().encode(`010950600013435217271300${GS}10ABÇ`), version: "16x16", isMirrored: true }, { source: "camera", at })],
  ["typed text without an identifier", readingFromText("(01)09506000134352(10)A1", { source: "paste", at })],
  ["an NFC tag", readingFromNdef(ndefUriMessage("https://id.gs1.org/01/09506000134352"), { at, serialNumber: "04:a2:b3" })],
  ["an RFID EPC", readingFromEpc("3074257BF7194E4000001A85", { source: "wedge", at })],
];

describe("a reading's link", () => {
  it.each(readings)("%s comes back the same, and is checked the same", async (_, reading) => {
    const back = await readingFromParam(await readingParam(reading, "retail"));
    expect(back.environment).toBe("retail");
    expect({ ...back.reading, position: reading.position, image: reading.image }).toEqual(reading);
    const before = check(engine, reading, { environment: "retail" });
    const after = check(engine, back.reading, { environment: "retail" });
    expect(after.verdict).toBe(before.verdict);
    expect(after.findings.map((f) => f.code)).toEqual(before.findings.map((f) => f.code));
  });

  it("carries no place when none was chosen, and fits well within the limit for a usual code", async () => {
    const param = await readingParam(readings[0]![1], null);
    expect((await readingFromParam(param)).environment).toBeNull();
    expect(/^[A-Za-z0-9_-]+$/.test(param)).toBe(true);
    expect(linkWithin(SITE + param)).toBe(SITE + param);
  });

  it("is refused with a message when it was cut, changed or made by a newer version", async () => {
    const param = await readingParam(readings[0]![1], null);
    await expect(readingFromParam(param.slice(0, param.length >> 1))).rejects.toThrow("This link is incomplete");
    await expect(readingFromParam(`${param}!`)).rejects.toThrow("This link is incomplete");
    await expect(readingFromParam(await packText('{"v":1,"b":"A"}'))).rejects.toThrow("This link is incomplete");
    await expect(readingFromParam(await packText("[]"))).rejects.toThrow("This link is incomplete");
    await expect(readingFromParam(await packText('{"v":2}'))).rejects.toThrow("newer version");
  });
});

describe("packing", () => {
  it("compresses: a repetitive text gets much shorter, and any text comes back", async () => {
    const text = "(01)09506000134352".repeat(50);
    const packed = await packText(text);
    expect(packed.length).toBeLessThan(text.length / 10);
    expect(await unpackText(packed)).toBe(text);
    expect(await unpackText(await packText("Ação · 日本 · ✓"))).toBe("Ação · 日本 · ✓");
  });

  it("offers a link of 2,000 characters and not one of 2,001", () => {
    expect(LINK_LIMIT).toBe(2000);
    expect(linkWithin("x".repeat(2000))).toHaveLength(2000);
    expect(linkWithin("x".repeat(2001))).toBeNull();
  });
});

describe("a work's link", () => {
  const work: Work = {
    mode: "one",
    identification: { key: "01", value: "09506000134376", qualifiers: { "10": "Lote ação €" }, attributes: [["17", "271231"]], parameters: [["linkType", "gs1:pip"]] },
    answers: { retail: true },
    picked: { symbol: "dl-qrcode", with: "ean13" },
    settings: { symbology: "dl-qrcode", size: 100, version: null, hriAsText: false, stem: "https://id.gs1.org" },
    page: null,
    printer: null,
    columns: null,
  };

  it("opens the same work as its file does", async () => {
    const saved = new Date("2026-11-17T01:00:00.000Z");
    expect(await workFromParam(await workParam(work, saved))).toEqual(readWork(workFile(work, saved)));
  });

  it("refuses a link that holds something other than a work", async () => {
    await expect(workFromParam(await packText('{"format":"other"}'))).rejects.toThrow("not a work saved by GS1 Label Studio");
  });
});
