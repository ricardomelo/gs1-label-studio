import { PICTURE_MAX_SIDE } from "@gs1-label-studio/core";
import { describe, expect, it } from "vitest";
import { drawnSize } from "../src/picture.ts";

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
