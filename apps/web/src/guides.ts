// The designer's grid and rulers (backlog 4.2, mock-up A of two, 8 November 2026, taken under the owner's rule): lines
// over the label every 1, 2, 5 or 10 mm as its drawn size allows, stronger every 10 mm; rulers in millimetres along its
// top and left, the chosen element's span marked on them; one button turns both on or off, kept in this browser. B had
// the grid alone, from a button beside the zoom.

/** The steps a grid line or a ruler's tick may take, in millimetres, the finest first. */
const STEPS = [1, 2, 5, 10, 20, 50] as const;
const GRID_GAP_PX = 6; // the closest two grid lines are drawn
const TICK_GAP_PX = 3; // the closest two ticks of a ruler
const NUMBER_GAP_PX = 24; // the closest two numbers of a ruler: room for "100" and a space
const KEPT = "gs1-label-studio.guides";

/** The finest step whose lines stand at least this many pixels apart. */
function stepFor(pxPerMm: number, gapPx: number): number {
  return STEPS.find((step) => step * pxPerMm >= gapPx) ?? STEPS[STEPS.length - 1]!;
}

/** The step a major line or a numbered tick takes over a finer one: every 10 mm, or every 5 steps past it. */
const majorOf = (step: number) => (step < 10 ? 10 : step * 5);

export interface GridLine {
  /** Its distance from the label's left or top edge, in millimetres. */
  atMm: number;
  major: boolean;
}

/** The grid's lines across a length of the label, its edges left out (the label's own border is drawn). */
export function gridLines(lengthMm: number, pxPerMm: number): GridLine[] {
  if (!(lengthMm > 0) || !(pxPerMm > 0)) return [];
  const step = stepFor(pxPerMm, GRID_GAP_PX);
  const major = majorOf(step);
  const lines: GridLine[] = [];
  for (let n = 1; n * step < lengthMm; n++) lines.push({ atMm: n * step, major: (n * step) % major === 0 });
  return lines;
}

export interface Tick {
  atMm: number;
  /** Long at a number, middle at half its step, short otherwise. */
  size: "long" | "middle" | "short";
  /** The millimetres written beside a long tick. */
  number?: number;
}

/** A ruler's ticks along a length of the label, from 0 to its end, numbered in millimetres where they have room. */
export function rulerTicks(lengthMm: number, pxPerMm: number): Tick[] {
  if (!(lengthMm > 0) || !(pxPerMm > 0)) return [];
  const step = stepFor(pxPerMm, TICK_GAP_PX);
  const numbered = Math.max(stepFor(pxPerMm, NUMBER_GAP_PX), majorOf(step));
  const ticks: Tick[] = [];
  for (let n = 0; n * step <= lengthMm; n++) {
    const atMm = n * step;
    if (atMm % numbered === 0) ticks.push({ atMm, size: "long", number: atMm });
    else if ((atMm * 2) % numbered === 0) ticks.push({ atMm, size: "middle" });
    else ticks.push({ atMm, size: "short" });
  }
  return ticks;
}

/** Whether the grid and rulers were left on in this browser; off at first. */
export function keptGuides(): boolean {
  try {
    return localStorage.getItem(KEPT) === "on";
  } catch {
    return false;
  }
}

/** Keeps the choice; without storage it lasts until the page is reloaded. */
export function keepGuides(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEPT, "on");
    else localStorage.removeItem(KEPT);
  } catch {
    // Nothing kept: private windows, blocked storage.
  }
}
