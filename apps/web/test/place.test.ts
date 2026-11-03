import type { DesignElement, DesignPage } from "@gs1-label-studio/core";
import { describe, expect, it } from "vitest";
import { freeCorner } from "../src/place.ts";

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
