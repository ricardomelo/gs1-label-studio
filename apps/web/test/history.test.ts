import { check, readingFromText, SyntaxEngine, type Reading } from "@gs1-label-studio/core";
import { beforeAll, describe, expect, it } from "vitest";
import { changedOnRecheck, entryOf, filterHistory, isPersonal, overLimit, sameAsLast, type HistoryEntry } from "../src/history.ts";

// The Check Studio's history (backlog 7.1 j; the check studio's project, section 7.1): what is kept of a reading, the
// list's filters and search, the limit, the re-check and the same code not kept twice. The database itself (a reload,
// the upgrade from version 1, Delete all read back, a browser that keeps nothing) is e2e/check-history.spec.ts.

let engine: SyntaxEngine;
beforeAll(async () => {
  engine = await SyntaxEngine.create();
});

const GS = "\u001d";
const RELEASES = { engine: "1.0", dictionary: "2026-01" };
const read = (text: string, at = "2026-11-16T10:00:00.000Z"): Reading => readingFromText(text, { source: "wedge", at: new Date(at) });
let id = 0;
const kept = (reading: Reading | null, over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  ...entryOf(reading, reading ? check(engine, reading, { environment: null }) : null, null, null, RELEASES),
  id: ++id,
  ...over,
});

describe("what is kept of a reading", () => {
  it("the reading with its bytes, the verdict, the codes, the counts, the key and every value", () => {
    const reading = read(`]d20109506000134352${GS}17271331`);
    const entry = entryOf(reading, check(engine, reading, { environment: "retail" }), "retail", 3, RELEASES);
    expect(entry.reading).toBe(reading);
    expect([entry.verdict, entry.codes, entry.errors, entry.warnings, entry.environment, entry.session]).toEqual(["does-not-follow", ["D1", "B4", "F3"], 1, 2, "retail", 3]);
    expect(entry.key).toEqual({ ai: "01", value: "09506000134352" });
    expect([entry.ais, entry.values]).toEqual([["01", "17"], ["09506000134352", "271331"]]);
    expect(entry.releases).toBe(RELEASES);
  });
  it("an item with no barcode, for a survey's count", () => {
    const entry = entryOf(null, null, null, null, RELEASES);
    expect([entry.reading, entry.verdict, entry.codes, entry.key]).toEqual([null, "no-barcode", [], null]);
  });
  it("marks a serial number or a person's number", () => {
    expect(isPersonal(kept(read("]d20109506000134352211234")))).toBe(true);
    expect(isPersonal(kept(read("]d2801895060001234567891")))).toBe(true);
    expect(isPersonal(kept(read("]d20109506000134352")))).toBe(false);
  });
});

describe("the list", () => {
  let a: HistoryEntry, b: HistoryEntry, c: HistoryEntry, d: HistoryEntry, all: HistoryEntry[];
  beforeAll(() => {
  a = kept(read("]d20109506000134352", "2026-11-16T09:00:00.000Z"), { session: 1 });
  b = kept(read("]d2010950600013435210ABC", "2026-11-16T11:00:00.000Z"), { session: null });
  c = kept(read("]d10109506000134352", "2026-11-16T10:00:00.000Z"), { session: 1 });
  d = kept(null, { at: "2026-11-16T12:00:00.000Z" });
  all = [a, b, c, d];
  });
  it("is newest first, filtered by verdict, session and fault, searched by any value", () => {
    expect(filterHistory(all, {}).map((e) => e.id)).toEqual([d.id, b.id, c.id, a.id]);
    expect(filterHistory(all, { verdict: "follows" }).map((e) => e.id)).toEqual([b.id, a.id]);
    expect(filterHistory(all, { verdict: "no-barcode" }).map((e) => e.id)).toEqual([d.id]);
    expect(filterHistory(all, { session: 1 }).map((e) => e.id)).toEqual([c.id, a.id]);
    expect(filterHistory(all, { session: "none" }).map((e) => e.id)).toEqual([d.id, b.id]);
    expect(filterHistory(all, { code: c.codes[0] }).map((e) => e.id)).toEqual([c.id]);
    expect(filterHistory(all, { search: "abc" }).map((e) => e.id)).toEqual([b.id]);
    expect(filterHistory(all, { search: " 9506000134352 " }).map((e) => e.id)).toEqual([b.id, c.id, a.id]);
  });
  it("offers the oldest past the limit for deletion", () => {
    expect(overLimit(all, 4)).toEqual([]);
    expect(overLimit(all, 2).map((e) => e.id)).toEqual([a.id, c.id]);
    expect(overLimit(all, 3).map((e) => e.id)).toEqual([a.id]);
  });
});

describe("the re-check", () => {
  it("marks a verdict the current release changes, and only then", () => {
    const entry = kept(read("]d20109506000134352"), { verdict: "does-not-follow", releases: { engine: "0.9", dictionary: "2025-07" } });
    expect(changedOnRecheck(entry, "follows", RELEASES)).toBe(true);
    expect(changedOnRecheck(entry, "does-not-follow", RELEASES)).toBe(false);
    expect(changedOnRecheck({ ...entry, releases: RELEASES }, "follows", RELEASES)).toBe(false);
    expect(changedOnRecheck({ ...entry, releases: { engine: "1.0", dictionary: "2025-07" } }, "follows", RELEASES)).toBe(true);
    expect(changedOnRecheck(entry, null, RELEASES)).toBe(false);
    expect(changedOnRecheck(kept(null), "follows", RELEASES)).toBe(false);
  });
});

describe("the same code shown again", () => {
  it("is not kept twice in a row, unless checked against another place", () => {
    const first = kept(read("]d20109506000134352"));
    expect(sameAsLast([first], read("]d20109506000134352"), null)).toBe(true);
    expect(sameAsLast([first], read("]d20109506000134352"), "retail")).toBe(false);
    expect(sameAsLast([first], read("]Q30109506000134352"), null)).toBe(false);
    expect(sameAsLast([first], read("]d20109506000134369"), null)).toBe(false);
    expect(sameAsLast([first, kept(read("]d20109506000134369"))], read("]d20109506000134352"), null)).toBe(false);
    expect(sameAsLast([], read("]d20109506000134352"), null)).toBe(false);
  });
});
