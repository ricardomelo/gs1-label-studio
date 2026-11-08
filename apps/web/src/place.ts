import type { DesignPage, PlacedElement } from "@gs1-label-studio/core";

// Where a new element lands on a label of one's own (the owner, 3 November 2026): + Barcode, + Text and + Shape put it
// at their usual corner, but where an element already has that corner the new one goes a step right and down, and
// again, so that it is never hidden under another and the person sees that it was made.

/** How far each new element moves from one already at its corner, in mm, right and down. */
export const NEW_ELEMENT_STEP_MM = 5;

/** The first corner from (xMm, yMm), a step right and down at a time, that no element of the page has. */
export function freeCorner(page: DesignPage, xMm: number, yMm: number): { xMm: number; yMm: number } {
  const taken = (x: number, y: number) => page.elements.some((e) => Math.abs(e.xMm - x) < 0.05 && Math.abs(e.yMm - y) < 0.05);
  // Down the diagonal while it stays on the page; past its edge, the next diagonal starts a step right of the first
  const steps = Math.max(1, Math.floor(Math.min(page.widthMm - xMm, page.heightMm - yMm) / NEW_ELEMENT_STEP_MM));
  for (let n = 0; n < steps * steps; n++) {
    const x = xMm + (n % steps + Math.floor(n / steps)) * NEW_ELEMENT_STEP_MM;
    const y = yMm + (n % steps) * NEW_ELEMENT_STEP_MM;
    if (x < page.widthMm && !taken(x, y)) return { xMm: x, yMm: y };
  }
  return { xMm, yMm };
}

// Moving the chosen element from the keyboard (mock-up A of two, 7 November 2026, taken under the owner's rule): once
// an element is chosen, Tab reaches its outline on the label, and each arrow key moves the element one step, half a
// millimetre as dragging does, or 5 mm with Shift, as its handle resizes it. Its top left corner lands on the half
// millimetres, so a Left or Top typed off them comes back to them. Mock-up B moved the element by the arrow keys on its
// button in the list of elements, where the arrow keys are expected to go from one button to the next.
//
// Moving by dragging or by the arrow keys is held within the label (session 43, an open point since session 30, taken
// under the owner's rule; B was moving the element freely as before, the page reporting the edge): the element stops
// at the label's edge, its top left corner on the last half millimetre that keeps its box on the label. One already
// past the edge (a Left or Top typed, the label made smaller, the element made larger) is never moved further past it,
// but comes back as far as it is moved; one larger than the label moves only where it still covers the label. Left and
// Top typed in the properties still place it anywhere, past the edge too, which the page reports, so that nothing a
// person types exactly is changed.

/** An arrow key moves the chosen element by half a millimetre, as dragging does. */
export const MOVE_STEP_MM = 0.5;

/** Shift and an arrow key move it by 5 mm. */
export const MOVE_BIG_STEP_MM = 5;

/** The keys that move the chosen element from its outline. */
export const MOVE_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"] as const;
export type MoveKey = (typeof MOVE_KEYS)[number];

/** The element moved one step by an arrow key, `big` with Shift: its top left corner on the half millimetres. */
export function keyMoved<T extends { xMm: number; yMm: number }>(element: T, key: MoveKey, big: boolean): T {
  const mm = (big ? MOVE_BIG_STEP_MM : MOVE_STEP_MM) * (key === "ArrowRight" || key === "ArrowDown" ? 1 : -1);
  const on = (value: number) => Math.round(value / MOVE_STEP_MM) * MOVE_STEP_MM || 0;
  return key === "ArrowLeft" || key === "ArrowRight" ? { ...element, xMm: on(element.xMm + mm) } : { ...element, yMm: on(element.yMm + mm) };
}

/**
 * Where a move along one side of the label takes the element: `wanted` held between 0 and the last half millimetre that
 * keeps its `size` within the label's `length`, or, for an element longer than the label, between the places where it
 * still covers the label; never further past the edge than it is `now`.
 */
function heldAlong(wanted: number, now: number, size: number, length: number): number {
  const room = length - size;
  // A hair's tolerance, so that a size computed as 39.999999 mm still leaves the last half millimetre
  const [low, high] = room >= 0 ? [0, Math.floor(room / MOVE_STEP_MM + 1e-6) * MOVE_STEP_MM] : [Math.ceil(room / MOVE_STEP_MM - 1e-6) * MOVE_STEP_MM, 0];
  return Math.min(Math.max(wanted, Math.min(low, now)), Math.max(high, now)) || 0;
}

/**
 * The element moved to (xMm, yMm) by dragging or by an arrow key, held within the label: `placed` is its box on the page
 * now (as turned), its top left corner the element's.
 */
export function heldMove<T extends { xMm: number; yMm: number }>(element: T, xMm: number, yMm: number, placed: PlacedElement, page: { widthMm: number; heightMm: number }): T {
  return {
    ...element,
    xMm: heldAlong(xMm, element.xMm, placed.widthMm, page.widthMm),
    yMm: heldAlong(yMm, element.yMm, placed.heightMm, page.heightMm),
  };
}
