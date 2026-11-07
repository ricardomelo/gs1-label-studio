import type { DesignPage } from "@gs1-label-studio/core";

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
// millimetres, so a Left or Top typed off them comes back to them. As by dragging or by Left and Top, it can go past
// the label's edge, which the page reports. Mock-up B moved the element by the arrow keys on its button in the list of
// elements, where the arrow keys are expected to go from one button to the next.

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
