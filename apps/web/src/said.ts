import { imageHeightMm, type DesignElement, type DesignPage, type PlacedElement } from "@gs1-label-studio/core";
import { formatNumber, t } from "./i18n.ts";

// What an arrow key did on a label of one's own, said after it (backlog 4.2, mock-up B of two, 7 November 2026, taken
// under the owner's rule): once an arrow key has moved the chosen element from its outline (place.ts) or resized it
// from its handle (resize.ts), the hint under the one that has the keyboard's focus starts with the element's new place
// or size, and a screen reader is told the same through a live region (WCAG 4.1.3, status messages). The properties
// show it too, but on a phone or a tablet they are out of sight of the label, and a screen reader does not read them
// unasked. A barcode or a text block at the end of its sizes says that it can go no further, and an element past the
// label's edge says so, as the page reports. Mock-up A said it to a screen reader alone, the hint unchanged.

/**
 * The element's place after an arrow key on its outline: its top left corner, as Left and Top say; `held` when the key
 * moved it less than its step, as moving is held within the label (place.ts heldMove), said as the label's edge reached.
 */
export function placeSaid(element: DesignElement, placed: PlacedElement, page: DesignPage, held = false): string {
  const place = t("Left {x} mm · top {y} mm", { x: formatNumber(element.xMm), y: formatNumber(element.yMm) });
  // An element already past the edge says that alone
  return said(held && !past(placed, page) ? [place, t("at the label's edge")] : [place], placed, page);
}

/**
 * The element's size after an arrow key on its handle, as its properties say it; `end` is the way the key went when it
 * changed nothing (`keyEnd`): a barcode or a text block, a box or an image at the end of its sizes; `held` when the key
 * resized it less than its step, as resizing is held within the label (resize.ts heldResize), said as the label's edge.
 */
export function sizeSaid(element: DesignElement, placed: PlacedElement, page: DesignPage, end: number, held = false): string {
  const mm = (value: number) => formatNumber(Math.round(value * 10) / 10);
  const size =
    element.kind === "box" ? t("Width {w} mm · height {h} mm", { w: mm(element.widthMm), h: mm(element.heightMm) })
    : element.kind === "image" ? t("Width {w} mm · height {h} mm", { w: mm(element.widthMm), h: mm(imageHeightMm(element)) })
    : element.kind === "line" ? t("Length {mm} mm", { mm: mm(element.lengthMm) })
    : element.kind === "symbol" ? t("Size {size} %", { size: element.size })
    : t("Text height {mm} mm", { mm: mm(element.heightMm) });
  const parts = held && !past(placed, page) ? [size, t("at the label's edge")]
    : end < 0 ? [size, t("no smaller size")] : end > 0 ? [size, t("no larger size")] : [size];
  return said(parts, placed, page);
}

/**
 * Which way an arrow key on the handle tried to go when it left the element as it was, 0 when it changed it: +1 for
 * Right and Down, -1 for Left and Up. A line's two keys across it change nothing by design, so they are no end.
 */
export function keyEnd(before: DesignElement, after: DesignElement, key: string): number {
  if (JSON.stringify(before) !== JSON.stringify(after)) return 0;
  const across = key === "ArrowLeft" || key === "ArrowRight";
  if (before.kind === "line" && across === before.vertical) return 0;
  return key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
}

/** The parts joined as the hints join theirs, with the label's edge when the element's box runs past it, as the page says. */
function said(parts: string[], placed: PlacedElement, page: DesignPage): string {
  return [...parts, ...(past(placed, page) ? [t("past the label's edge")] : [])].join(" · ");
}

/** Whether the element's box runs past the label's edge, as the page reports it. */
function past(placed: PlacedElement, page: DesignPage): boolean {
  return placed.xMm < -1e-9 || placed.yMm < -1e-9
    || placed.xMm + placed.widthMm > page.widthMm + 1e-9 || placed.yMm + placed.heightMm > page.heightMm + 1e-9;
}
