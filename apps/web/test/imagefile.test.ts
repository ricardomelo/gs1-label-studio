import { PICTURE_MAX_SIDE, PICTURE_THRESHOLD, PICTURE_THRESHOLD_MAX, PICTURE_THRESHOLD_MIN } from "@gs1-label-studio/core";
import { describe, expect, it } from "vitest";
import { canDarken, darkened, drawnSize, percentOf, thresholdOf } from "../src/picture.ts";

// An image file for a label of one's own (backlog 4.2, step d): drawn at its own size, or scaled down so that its
// longest side is what the core takes.

describe("the size an image is drawn at", () => {
  it("its own when it fits, else its longest side the core's limit, its proportions kept", () => {
    expect(drawnSize(360, 150)).toEqual({ width: 360, height: 150 });
    expect(drawnSize(PICTURE_MAX_SIDE, 10)).toEqual({ width: PICTURE_MAX_SIDE, height: 10 });
    expect(drawnSize(2400, 1000)).toEqual({ width: PICTURE_MAX_SIDE, height: 250 });
    expect(drawnSize(1000, 3000)).toEqual({ width: 200, height: PICTURE_MAX_SIDE });
    expect(drawnSize(6000, 1)).toEqual({ width: PICTURE_MAX_SIDE, height: 1 });
  });
});

describe("the image's darkness", () => {
  it("in per cent from 5 to 95 is the core's range of thresholds, 50 its usual one, and back", () => {
    expect([thresholdOf(5), thresholdOf(50), thresholdOf(95)]).toEqual([PICTURE_THRESHOLD_MIN, PICTURE_THRESHOLD, PICTURE_THRESHOLD_MAX]);
    for (let percent = 5; percent <= 95; percent += 5) expect(percentOf(thresholdOf(percent))).toBe(percent);
  });

  it("cannot be changed for a picture whose file was not chosen in this page (one opened from a work)", () => {
    const picture = { width: 8, height: 1, bits: btoa("\x80") };
    expect(canDarken(picture)).toBe(false);
    expect(darkened(picture, 160)).toBeNull();
    expect(darkened(picture, 160, true)).toBeNull();
  });
});
