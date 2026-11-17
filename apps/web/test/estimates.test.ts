import { ESTIMATE_NOTE, readingFromDecoder, type Measure, type Reading } from "@gs1-label-studio/core";
import { describe, expect, it } from "vitest";
import { detailLines } from "../src/checkWords.ts";
import { estimateLines, NOTE, parseMm, scaledReadings } from "../src/estimates.ts";

// The Check Studio's size estimates on the page (backlog 7.1 m): a width typed with a point or a comma, the picture's
// scale given to every symbol measured in it, and each size finding said in plain words with the estimate's note. The
// estimates themselves are the core's (packages/core/test/estimate.test.ts); the form, e2e/check-estimate.spec.ts.

const measured = (across: number): Measure => ({ across, modules: 95, quiet: { left: 40, right: 30 }, barHeight: 280 });
const reading = (measure: Measure | null): Reading => ({
  ...readingFromDecoder({ format: "EAN13", symbologyIdentifier: "]E0", bytes: new TextEncoder().encode("9506000134352") }, { source: "image" }),
  measure,
});

describe("the printed width", () => {
  it("is read with a point or a comma, and refused when it is not a number above 0", () => {
    expect(parseMm("31.35")).toBe(31.35);
    expect(parseMm(" 31,35 ")).toBe(31.35);
    expect(parseMm(".5")).toBe(0.5);
    for (const wrong of ["", "0", "0,0", "-3", "3 mm", "abc", "1.2.3"]) expect(parseMm(wrong), wrong).toBeNull();
  });
});

describe("the picture's scale", () => {
  it("comes from one symbol's width and goes to every symbol measured, none to one without a measure", () => {
    const readings = [reading(measured(380)), reading(measured(500)), reading(null)];
    const scaled = scaledReadings(readings, 0, 31.35);
    expect(scaled[0]!.measure!.scale!.mmPerPixel).toBeCloseTo(31.35 / 380, 6);
    expect(scaled[1]!.measure!.scale).toEqual(scaled[0]!.measure!.scale);
    expect(scaled[2]).toBe(readings[2]);
    expect(scaledReadings(scaled, 0, null).every((r) => !r.measure?.scale)).toBe(true);
    expect(scaledReadings([reading(null)], 0, 30)[0]!.measure).toBeNull();
  });
});

describe("a size finding in plain words", () => {
  it("says the estimate, what is allowed, and that it is not a grade", () => {
    expect(NOTE).toBe(ESTIMATE_NOTE);
    const h1 = estimateLines({ code: "H1", details: { x: "0.200", tolerance: "0.004", min: "0.264", max: "0.66", table: "1", quality: "1.5/06/660" } });
    expect(h1).toEqual(["X-dimension estimated: 0.2 mm ± 0.004; here 0.264 to 0.66 mm.", `${ESTIMATE_NOTE} Table 1 asks a verifier for at least 1.5/06/660.`]);
    expect(estimateLines({ code: "H2", details: { sides: "left,top", left: "7", leftNeeded: "11", top: "2", topNeeded: "4" } }).slice(0, 2))
      .toEqual(["Margin on the left: 7 modules; 11 needed.", "Margin on the top: 2 modules; 4 needed."]);
    expect(estimateLines({ code: "H3", details: { height: "35", needed: "69.2" } })[0]).toBe("Bar height estimated: 35 modules; at least 69.2.");
    expect(estimateLines({ code: "J5", details: { distance: "60.4", radius: "50" } })).toEqual(["Distance estimated: 60.4 mm; at most 50 mm.", ESTIMATE_NOTE]);
    expect(estimateLines({ code: "C1", details: { expected: "2" } })).toEqual([]);
    expect(detailLines({ code: "H3", severity: "warning", ranges: [], ai: null, sections: [], engineMessage: null, details: { height: "35", needed: "69.2" } })).toHaveLength(2);
  });
});
