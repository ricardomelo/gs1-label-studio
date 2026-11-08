import { afterEach, describe, expect, it, vi } from "vitest";
import { gridLines, keepGuides, keptGuides, rulerTicks } from "../src/guides.ts";

// The designer's grid and rulers (backlog 4.2, mock-up A of two, 8 November 2026): the grid's lines as fine as the label's
// drawn size allows (1, 2, 5 or 10 mm, at least 6 pixels apart), stronger every 10 mm; a ruler's ticks at least 3 pixels
// apart, numbered in millimetres at least 24 pixels apart; the choice kept in this browser.

const at = (lines: { atMm: number }[]) => lines.map((line) => line.atMm);

describe("the grid's lines", () => {
  it("every millimetre where a millimetre is drawn 6 pixels or more, stronger every 10 mm, the edges left out", () => {
    const lines = gridLines(30, 6);
    expect(at(lines)).toEqual(Array.from({ length: 29 }, (_, n) => n + 1));
    expect(lines.filter((line) => line.major).map((line) => line.atMm)).toEqual([10, 20]);
  });

  it("every 2, 5 or 10 mm as the label is drawn smaller; the major lines stay every 10 mm", () => {
    // A 100 mm label in the canvas's 420 pixels: 4.2 pixels a millimetre
    expect(at(gridLines(20, 4.2))).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18]);
    expect(gridLines(20, 4.2).filter((line) => line.major).map((line) => line.atMm)).toEqual([10]);
    expect(at(gridLines(20, 5.99))).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18]);
    expect(at(gridLines(30, 2.9))).toEqual([5, 10, 15, 20, 25]);
    expect(gridLines(30, 2.9).filter((line) => line.major).map((line) => line.atMm)).toEqual([10, 20]);
    expect(at(gridLines(40, 1))).toEqual([10, 20, 30]);
  });

  it("past 10 mm, a major line every five", () => {
    const lines = gridLines(120, 0.4); // 20 mm a step: 8 pixels
    expect(at(lines)).toEqual([20, 40, 60, 80, 100]);
    expect(lines.filter((line) => line.major).map((line) => line.atMm)).toEqual([100]);
  });

  it("none for a label not yet drawn or of no size", () => {
    expect(gridLines(100, 0)).toEqual([]);
    expect(gridLines(0, 4)).toEqual([]);
    expect(gridLines(100, Number.NaN)).toEqual([]);
  });
});

describe("a ruler's ticks", () => {
  it("from 0 to the label's end, numbered every 10 mm, longer at 5", () => {
    const ticks = rulerTicks(25, 4.2);
    expect(at(ticks)).toEqual(Array.from({ length: 26 }, (_, n) => n));
    expect(ticks.filter((tick) => tick.number !== undefined).map((tick) => tick.number)).toEqual([0, 10, 20]);
    expect(ticks.filter((tick) => tick.size === "middle").map((tick) => tick.atMm)).toEqual([5, 15, 25]);
    expect(ticks.find((tick) => tick.atMm === 3)).toEqual({ atMm: 3, size: "short" });
    expect(ticks.find((tick) => tick.atMm === 10)).toEqual({ atMm: 10, size: "long", number: 10 });
  });

  it("further apart, and numbered less often, as the label is drawn smaller", () => {
    // 2 pixels a millimetre: a tick every 2 mm, a number every 20 mm (10 mm would be 20 pixels)
    const ticks = rulerTicks(40, 2);
    expect(at(ticks)).toEqual(Array.from({ length: 21 }, (_, n) => n * 2));
    expect(ticks.filter((tick) => tick.number !== undefined).map((tick) => tick.atMm)).toEqual([0, 20, 40]);
    expect(ticks.filter((tick) => tick.size === "middle").map((tick) => tick.atMm)).toEqual([10, 30]);
    // 3.5 pixels a millimetre: a tick each millimetre; under 3, every 2 mm
    expect(at(rulerTicks(4, 3.5))).toEqual([0, 1, 2, 3, 4]);
    expect(at(rulerTicks(4, 2.9))).toEqual([0, 2, 4]);
    // 0.6 pixels a millimetre: a tick every 5 mm, a number every 50, the middle at 25
    const small = rulerTicks(100, 0.6);
    expect(at(small)).toEqual(Array.from({ length: 21 }, (_, n) => n * 5));
    expect(small.filter((tick) => tick.number !== undefined).map((tick) => tick.number)).toEqual([0, 50, 100]);
    expect(small.filter((tick) => tick.size === "middle").map((tick) => tick.atMm)).toEqual([25, 75]);
    // A phone's 2.54 pixels a millimetre: every 10 mm, 25 pixels apart
    expect(rulerTicks(30, 2.4).filter((tick) => tick.number !== undefined).map((tick) => tick.number)).toEqual([0, 10, 20, 30]);
  });

  it("numbered every 10 mm still when the label is drawn large", () => {
    const ticks = rulerTicks(30, 16); // 200 % zoom: a number could stand every 2 mm, but every 10 reads better
    expect(at(ticks)).toHaveLength(31);
    expect(ticks.filter((tick) => tick.number !== undefined).map((tick) => tick.number)).toEqual([0, 10, 20, 30]);
  });

  it("none for a label not yet drawn", () => {
    expect(rulerTicks(100, 0)).toEqual([]);
  });
});

describe("the choice kept", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("off at first, on once turned on, off again once turned off", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
    expect(keptGuides()).toBe(false);
    keepGuides(true);
    expect(keptGuides()).toBe(true);
    expect([...store.keys()]).toEqual(["gs1-label-studio.guides"]);
    keepGuides(false);
    expect(keptGuides()).toBe(false);
    expect(store.size).toBe(0);
    store.set("gs1-label-studio.guides", "off"); // anything but "on", as another version might have left it
    expect(keptGuides()).toBe(false);
  });

  it("off, and nothing thrown, where the browser keeps nothing", () => {
    const blocked = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked, removeItem: blocked });
    expect(() => keepGuides(true)).not.toThrow();
    expect(keptGuides()).toBe(false);
  });
});
