import { describe, expect, it } from "vitest";
import { COMPUTER_TOUR, placeCard, TABBED_TOUR, within } from "../src/tour.ts";

// The tour of the studio (backlog 6.4): where its card goes beside what it points at, and its stops.

const VIEW = { width: 1400, height: 900 };
const CARD = { width: 340, height: 200 };

describe("the tour's card", () => {
  it("goes at the right of the target when there is room, level with its top", () => {
    expect(placeCard({ left: 20, top: 300, width: 680, height: 280 }, CARD, VIEW)).toEqual({ left: 714, top: 300 });
  });
  it("goes at its left when the right has no room", () => {
    expect(placeCard({ left: 710, top: 40, width: 670, height: 400 }, CARD, VIEW)).toEqual({ left: 356, top: 40 });
  });
  it("goes under a target as wide as the window, over one at its bottom", () => {
    const phone = { width: 412, height: 915 };
    const card = { width: 388, height: 220 };
    expect(placeCard({ left: 10, top: 70, width: 392, height: 50 }, card, phone)).toEqual({ left: 12, top: 134 });
    expect(placeCard({ left: 82, top: 850, width: 82, height: 65 }, card, phone)).toEqual({ left: 12, top: 616 });
  });
  it("stays whole within the window, even for a target taller than it", () => {
    const placed = placeCard({ left: 0, top: -600, width: 1400, height: 2400 }, CARD, VIEW);
    expect(placed.top + CARD.height).toBeLessThanOrEqual(VIEW.height - 12);
    expect(placed.left).toBeGreaterThanOrEqual(12);
    expect(placed.left + CARD.width).toBeLessThanOrEqual(VIEW.width - 12);
  });
  it("keeps its side's top within the window when the target starts above it", () => {
    expect(placeCard({ left: 20, top: -500, width: 680, height: 1200 }, CARD, VIEW).top).toBe(12);
  });
});

describe("the tour's ring", () => {
  it("is the part of the target inside the window", () => {
    expect(within({ left: -10, top: -500, width: 700, height: 1200 }, VIEW)).toEqual({ left: 0, top: 0, width: 690, height: 700 });
  });
});

describe("the tour's stops", () => {
  it("on a computer, the three steps, the label's parts and the header's buttons, ending on the tour's own button", () => {
    expect(COMPUTER_TOUR.map((s) => s.target)).toEqual(["data", "scan", "label", "options", "export", "mode", "assistant", "work", "tour"]);
  });
  it("on a phone or a tablet, each destination opened before it is pointed at, ending on More", () => {
    expect(TABBED_TOUR.map((s) => s.target)).toEqual(["tab-data", "tab-scan", "tab-label", "tab-export", "mode", "assistant", "start-over", "tab-more"]);
    expect(TABBED_TOUR.every((s) => s.pane)).toBe(true);
  });
});
