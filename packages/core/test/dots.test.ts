import { describe, expect, it } from "vitest";
import { dotsWithin, snapToDots } from "../src/index.ts";

describe("printer dot grid", () => {
  it("prints an EAN-13 at 100 % (0.330 mm) as 3 dots at 203 dpi and 4 dots at 300 dpi", () => {
    expect(snapToDots(0.33, 203)).toMatchObject({ dots: 3 });
    expect(snapToDots(0.33, 203).xMm).toBeCloseTo(0.3754, 3);
    expect(snapToDots(0.33, 300)).toMatchObject({ dots: 4 });
  });

  it("offers only the dot counts within a symbol specification table's range", () => {
    // Table 1, EAN/UPC at retail point of sale: 0.264 to 0.660 mm.
    expect(dotsWithin(0.264, 0.66, 203).map((snap) => snap.dots)).toEqual([3, 4, 5]);
    expect(dotsWithin(0.264, 0.66, 300).map((snap) => snap.dots)).toEqual([4, 5, 6, 7]);
    // Table 1, 2D symbols: 0.396 to 0.990 mm.
    expect(dotsWithin(0.396, 0.99, 203).map((snap) => snap.dots)).toEqual([4, 5, 6, 7]);
  });

  it("never gives fewer than one dot", () => {
    expect(snapToDots(0.01, 203).dots).toBe(1);
  });
});
