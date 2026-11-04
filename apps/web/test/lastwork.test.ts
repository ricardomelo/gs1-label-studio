import { workFile, type Work } from "@gs1-label-studio/core";
import { describe, expect, it } from "vitest";
import { keptWork, workKey, workSummary, workToKeep } from "../src/lastwork.ts";

// The last work kept in this browser (backlog 4.3 (c)): kept only once it is not a first visit's, read back with the
// time it was kept, and nothing offered when what is kept cannot be read.

const START: Work = {
  mode: "one", identification: { key: "01", value: "09506000134376", qualifiers: { "10": "B42" }, attributes: [["17", "271231"]] },
  answers: {}, picked: null, settings: { symbology: "dl-qrcode", size: 100 }, page: null, printer: null, columns: null,
};

describe("the last work kept in this browser (backlog 4.3 (c))", () => {
  it("is not kept while it is a first visit's work, and kept with its time once it changes", () => {
    const start = workKey(START);
    expect(workToKeep(structuredClone(START), start)).toBeNull();
    const changed: Work = { ...START, identification: { ...START.identification, value: "09506000134352" } };
    const time = new Date("2026-11-04T14:30:00Z");
    const text = workToKeep(changed, start, time);
    expect(text).toBe(workFile(changed, time));
    expect(keptWork(text)).toEqual({ work: changed, saved: time });
    expect(workToKeep({ ...START, mode: "bulk" }, start)).not.toBeNull();
    expect(workToKeep({ ...START, settings: { ...START.settings, size: 80 } }, start)).not.toBeNull();
  });

  it("offers nothing when nothing is kept, or what is kept cannot be read", () => {
    expect(keptWork(null)).toBeNull();
    expect(keptWork("")).toBeNull();
    expect(keptWork("{not json")).toBeNull();
    expect(keptWork("^XA^FO50,50^FDHello^FS^XZ")).toBeNull();
    expect(keptWork(workFile(START).replace('"version": 1', '"version": 99'))).toBeNull();
    expect(keptWork(workFile(START).replace('"mode": "one"', '"mode": "many"'))).toBeNull();
    const timeless = keptWork(workFile(START).replace(/"saved": "[^"]+"/, '"saved": "yesterday"'));
    expect(timeless).toEqual({ work: START, saved: null });
  });

  it("is told apart by its key's element string", () => {
    expect(workSummary(START)).toBe("(01) 09506000134376");
    expect(workSummary({ ...START, identification: { ...START.identification, key: "00", value: " 095060001343760018 " } })).toBe("(00) 095060001343760018");
    expect(workSummary({ ...START, identification: { ...START.identification, value: "  " } })).toBe("");
  });
});
