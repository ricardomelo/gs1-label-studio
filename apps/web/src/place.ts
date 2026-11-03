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
