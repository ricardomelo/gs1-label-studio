import type { DesignElement, DesignPage, PlacedElement } from "@gs1-label-studio/core";
import { describe, expect, it } from "vitest";
import { freeCorner, heldMove, keyMoved } from "../src/place.ts";

// A new element on a label of one's own never lands exactly on another (the owner, 3 November 2026): a step of 5 mm
// right and down from one at its corner, along the page.

const text = (id: string, xMm: number, yMm: number): DesignElement => ({ id, kind: "text", text: "T", heightMm: 3, xMm, yMm });
const page = (widthMm: number, heightMm: number, ...elements: DesignElement[]): DesignPage => ({ widthMm, heightMm, elements });

describe("where a new element lands", () => {
  it("at its corner when no element has it, else a step right and down, and again", () => {
    expect(freeCorner(page(100, 60), 4, 4)).toEqual({ xMm: 4, yMm: 4 });
    expect(freeCorner(page(100, 60, text("e1", 2, 2)), 4, 4)).toEqual({ xMm: 4, yMm: 4 }); // near is not on it
    expect(freeCorner(page(100, 60, text("e1", 4, 4)), 4, 4)).toEqual({ xMm: 9, yMm: 9 });
    expect(freeCorner(page(100, 60, text("e1", 4, 4), text("e2", 9, 9)), 4, 4)).toEqual({ xMm: 14, yMm: 14 });
    expect(freeCorner(page(100, 60, text("e1", 4, 4), text("e2", 14, 14)), 4, 4)).toEqual({ xMm: 9, yMm: 9 });
  });

  it("past the page's foot, the next diagonal a step right of the first; a page full keeps the corner", () => {
    // 30 × 20 mm from (4, 4): three corners a diagonal, (4, 4), (9, 9), (14, 14)
    const full = [text("a", 4, 4), text("b", 9, 9), text("c", 14, 14)];
    expect(freeCorner(page(30, 20, ...full), 4, 4)).toEqual({ xMm: 9, yMm: 4 });
    expect(freeCorner(page(30, 20, ...full, text("d", 9, 4)), 4, 4)).toEqual({ xMm: 14, yMm: 9 });
    const all = Array.from({ length: 9 }, (_, n) => text(`n${n}`, 4 + ((n % 3) + Math.floor(n / 3)) * 5, 4 + (n % 3) * 5));
    expect(freeCorner(page(30, 20, ...all), 4, 4)).toEqual({ xMm: 4, yMm: 4 });
  });
});

// Moving the chosen element from the keyboard (mock-up A of two, 7 November 2026): the arrow keys on its outline move
// it half a millimetre, or 5 mm with Shift, its top left corner on the half millimetres.

describe("moving the chosen element by the arrow keys", () => {
  const box: DesignElement = { id: "e1", kind: "box", widthMm: 40, heightMm: 20, thicknessMm: 0.5, filled: false, xMm: 10, yMm: 20 };

  it("half a millimetre each way, 5 mm with Shift, the rest of the element as it was", () => {
    expect(keyMoved(box, "ArrowRight", false)).toEqual({ ...box, xMm: 10.5 });
    expect(keyMoved(box, "ArrowLeft", false)).toEqual({ ...box, xMm: 9.5 });
    expect(keyMoved(box, "ArrowDown", false)).toEqual({ ...box, yMm: 20.5 });
    expect(keyMoved(box, "ArrowUp", false)).toEqual({ ...box, yMm: 19.5 });
    expect(keyMoved(box, "ArrowRight", true)).toEqual({ ...box, xMm: 15 });
    expect(keyMoved(box, "ArrowLeft", true)).toEqual({ ...box, xMm: 5 });
    expect(keyMoved(box, "ArrowDown", true)).toEqual({ ...box, yMm: 25 });
    expect(keyMoved(box, "ArrowUp", true)).toEqual({ ...box, yMm: 15 });
  });

  it("a corner typed off the half millimetres back on them; past the label's edge as dragging goes, no minus zero", () => {
    const typed = { ...box, xMm: 10.3, yMm: 20.8 };
    expect(keyMoved(typed, "ArrowRight", false).xMm).toBe(11);
    expect(keyMoved(typed, "ArrowLeft", false).xMm).toBe(10);
    expect(keyMoved(typed, "ArrowUp", true).yMm).toBe(16);
    expect(keyMoved(typed, "ArrowUp", true).xMm).toBe(10.3); // the other side untouched
    expect(keyMoved({ ...box, xMm: 0 }, "ArrowLeft", false).xMm).toBe(-0.5);
    expect(keyMoved({ ...box, yMm: 2 }, "ArrowUp", true).yMm).toBe(-3);
    expect(Object.is(keyMoved({ ...box, xMm: 0.4 }, "ArrowLeft", false).xMm, 0)).toBe(true);
  });
});

// Moving by dragging or by the arrow keys held within the label (session 43): the element stops at the edge, its corner
// on the last half millimetre that keeps it on the label; one past the edge is never moved further past it.

describe("moving held within the label", () => {
  const label = { widthMm: 100, heightMm: 60 };
  const box: DesignElement = { id: "e1", kind: "box", widthMm: 40, heightMm: 20, thicknessMm: 0.5, filled: false, xMm: 10, yMm: 20 };
  const placedAt = (xMm: number, yMm: number, widthMm = 40, heightMm = 20): PlacedElement => ({ id: "e1", xMm, yMm, widthMm, heightMm });
  const moved = (element: DesignElement, xMm: number, yMm: number, placed = placedAt(element.xMm, element.yMm)) => {
    const { xMm: x, yMm: y } = heldMove(element, xMm, yMm, placed, label);
    return [x, y];
  };

  it("anywhere on the label as asked, the rest of the element as it was", () => {
    expect(heldMove(box, 30, 25.5, placedAt(10, 20), label)).toEqual({ ...box, xMm: 30, yMm: 25.5 });
    expect(moved(box, 0, 0)).toEqual([0, 0]);
    expect(moved(box, 60, 40)).toEqual([60, 40]); // its right edge and foot on the label's
  });

  it("stopped at each of the four edges", () => {
    expect(moved(box, -7, 20)).toEqual([0, 20]);
    expect(moved(box, 75, 20)).toEqual([60, 20]);
    expect(moved(box, 10, -0.5)).toEqual([10, 0]);
    expect(moved(box, 10, 41)).toEqual([10, 40]);
    expect(moved(box, 200, -200)).toEqual([60, 0]); // both sides at once
    expect(Object.is(moved(box, -0.5, 20)[0], 0)).toBe(true); // no minus zero
  });

  it("on the last half millimetre that keeps its box on the label, a hair's rounding allowed", () => {
    // A barcode 37.3 mm wide and 25.2 mm tall: 62.5 and 34.5 at most, not 62.7 and 34.8
    const symbol = placedAt(10, 20, 37.3, 25.2);
    expect(moved(box, 70, 50, symbol)).toEqual([62.5, 34.5]);
    // A box whose width is computed as a hair under 40 mm still reaches 60
    expect(moved(box, 70, 20, placedAt(10, 20, 39.9999999, 20))).toEqual([60, 20]);
    expect(moved(box, 70, 20, placedAt(10, 20, 40.0000001, 20))).toEqual([60, 20]);
    // Under a millimetre of room: 99.3 mm on 100 mm moves between 0 and 0.5
    expect(moved({ ...box, xMm: 0 }, 3, 20, placedAt(0, 20, 99.3, 20))).toEqual([0.5, 20]);
    expect(moved({ ...box, xMm: 0.5 }, -3, 20, placedAt(0.5, 20, 99.3, 20))).toEqual([0, 20]);
  });

  it("past the edge already: brought back as far as it is moved, never further past", () => {
    const past = { ...box, xMm: 70, yMm: 45 }; // 10 mm past the right edge, 5 mm past the foot
    expect(moved(past, 72, 47)).toEqual([70, 45]);
    expect(moved(past, 70.5, 45)).toEqual([70, 45]);
    expect(moved(past, 65, 45)).toEqual([65, 45]); // back by as much as it is moved
    expect(moved(past, 65, 42.5)).toEqual([65, 42.5]);
    expect(moved(past, 20, 10)).toEqual([20, 10]); // wholly back on the label
    const before = { ...box, xMm: -4, yMm: -3 }; // past the left edge and the top
    expect(moved(before, -6, -5)).toEqual([-4, -3]);
    expect(moved(before, -2, 50)).toEqual([-2, 40]);
  });

  it("larger than the label: only where it still covers the label", () => {
    // 120 × 70 mm on 100 × 60: its corner from -20 to 0 across, -10 to 0 down
    const big = { ...box, widthMm: 120, heightMm: 70, xMm: -5, yMm: 0 };
    const placed = placedAt(-5, 0, 120, 70);
    expect(moved(big, 3, 4, placed)).toEqual([0, 0]);
    expect(moved(big, -30, -30, placed)).toEqual([-20, -10]);
    expect(moved(big, -12.5, -2, placed)).toEqual([-12.5, -2]);
    // 0.3 mm longer than the label: the half millimetres keep it at 0, past the edge by the 0.3 mm it cannot help
    expect(moved({ ...big, xMm: 0 }, -0.5, 0, placedAt(0, 0, 100.3, 20))).toEqual([0, 0]);
  });
});
