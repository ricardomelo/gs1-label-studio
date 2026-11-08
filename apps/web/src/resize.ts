import {
  boxOf, layoutLabel, linearSizesFor, SIZES, sizesFor, specSizesFor, SYMBOLOGIES, type DesignedLabel, type DesignElement,
  type HriFont, type PlacedElement,
} from "@gs1-label-studio/core";

// Resizing an element by dragging a corner on a label of one's own (backlog 4.2, mock-up A of two, 7 November 2026,
// taken under the owner's rule): the chosen element shows one handle at its box's bottom right corner; dragging it
// makes the element larger or smaller while its top left corner stays where it is, as Left and Top say and as rotation
// keeps it. Mock-up B had a handle at each corner, the opposite one kept: four handles crowd a small element, above all
// on a phone, and a corner other than the top left would move the element as well.
//
// A box takes the corner's width and height; a line its length, across or down; an image, a barcode and a text block
// keep their proportions, so they follow the corner along their box's diagonal. A barcode takes the nearest of the
// sizes its scanning environment (or its table's row) allows, its X-dimension a percentage of the target, and a text
// block the nearest of its heights, so that dragging gives only what the properties could choose and draw. A barcode's
// box holds its human readable text, which keeps its height whatever the size, so the corner follows its bars or
// modules alone (`symbolSizing`): dragging it 10 mm makes them about 10 mm larger.
//
// An element can run past the label's edge (the page reports it), and its corner with it, out of the drawn label and
// possibly under the canvas's edge or the zoom buttons. Then the handle stays at the label's edge, where the element
// is cut, in red, and dragging it puts the corner under the pointer, so the element shrinks back as soon as it is
// pulled (mock-up A of two, 7 November 2026, taken under the owner's rule; B drew the whole outline past the edge with
// the handle at its true corner, which can still be out of sight).
//
// The handle also takes the keyboard (mock-up A of two, 7 November 2026, taken under the owner's rule): Tab reaches it
// once an element is chosen, and each arrow key moves the corner one step, half a millimetre, or 5 mm with Shift
// (`keyResized`). A box takes Right and Left on its width and Down and Up on its height, a line the two along it; an
// image, a barcode and a text block keep their proportions, Right and Down making them larger, Left and Up smaller, a
// barcode and a text block to their next size, or with Shift to the size nearest their longer side 5 mm longer or
// shorter, at least the next one. Mock-up B gave the keyboard to the element's outline, the arrows moving it and Shift
// and the arrows resizing it: moving from the keyboard was not asked for, and Left and Top already move it exactly.
//
// Resizing by dragging or by the arrow keys is held within the label, as moving is (session 46, an open point since
// session 43, taken under the owner's rule; B was resizing freely as before, the page reporting the edge): the element
// grows no further than the label's edge, a box or a line to the last half millimetre, an image to the last half
// millimetre of its width that keeps its whole box on the label, a barcode or a text block to the largest of its sizes
// that does. One already past the edge never grows further past it, but can always be made smaller. Width, height,
// length, size and text height typed in the properties stay free, past the edge too, which the page reports.

/** Dragging sizes boxes, lines and images by half millimetres, as it moves elements. */
export const RESIZE_STEP_MM = 0.5;

/** Shift and an arrow key move the corner by 5 mm. */
export const RESIZE_BIG_STEP_MM = 5;

/** The heights a text block's capitals can take, in mm: those its properties offer. */
export const TEXT_HEIGHTS = [2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10, 12] as const;

/** What a barcode is resized by: the box of its bars or modules alone, as turned on the page, and the sizes it can take. */
export interface SymbolSizing {
  widthMm: number;
  heightMm: number;
  sizes: readonly number[];
  /** Its whole box on the page at `size`, as turned, text and quiet zones included; undefined when it cannot be drawn. */
  boxAt?: (size: number) => { widthMm: number; heightMm: number } | undefined;
}

/**
 * A barcode's sizing from what the page writes it from (`DesignedLabel.printer.symbols`): its layout and options; with
 * the HRI `font`, its whole box at each size, laid out as the page lays it out when it is first asked for.
 */
export function symbolSizing({ layout, options, rotation }: DesignedLabel["printer"]["symbols"][number], font?: HriFont): SymbolSizing {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y, w, h] of layout.rects) {
    [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x + w), Math.max(bottom, y + h)];
  }
  const [w, h] = right > left ? [(right - left) * layout.xMm, (bottom - top) * layout.xMm] : [layout.width * layout.xMm, layout.height * layout.xMm];
  const environment = options.environment ?? "";
  const sizes = options.spec ? specSizesFor(options.spec, SIZES)
    : SYMBOLOGIES[options.symbology].kind === "matrix" ? sizesFor(environment) : linearSizesFor(environment);
  const turned = rotation === 90 || rotation === 270;
  const boxes = new Map<number, { widthMm: number; heightMm: number } | undefined>();
  const boxAt = (size: number) => {
    if (!boxes.has(size)) {
      try {
        const at = size === options.size ? layout : layoutLabel({ ...options, size }, font!);
        const [bw, bh] = [at.width * at.xMm, at.height * at.xMm];
        boxes.set(size, turned ? { widthMm: bh, heightMm: bw } : { widthMm: bw, heightMm: bh });
      } catch {
        boxes.set(size, undefined);
      }
    }
    return boxes.get(size);
  };
  return { ...(turned ? { widthMm: h, heightMm: w } : { widthMm: w, heightMm: h }), sizes, ...(font ? { boxAt } : {}) };
}

/** Where the chosen element's handle is drawn: its box's bottom right corner, held within the label; `past` when held. */
export function handleAt(placed: PlacedElement, page: { widthMm: number; heightMm: number }): { xMm: number; yMm: number; past: boolean } {
  const [x, y] = [placed.xMm + placed.widthMm, placed.yMm + placed.heightMm];
  const [xMm, yMm] = [Math.min(Math.max(x, 0), page.widthMm), Math.min(Math.max(y, 0), page.heightMm)];
  return { xMm, yMm, past: xMm !== x || yMm !== y };
}

const step = (mm: number) => Math.max(RESIZE_STEP_MM, Math.round(mm / RESIZE_STEP_MM) * RESIZE_STEP_MM);

/** The value of `values` nearest to `wanted` by their ratio, so that a step up and a step down weigh the same. */
export function nearest<T extends number>(values: readonly T[], wanted: number): T {
  let best = values[0]!;
  for (const value of values) if (Math.abs(Math.log(value / wanted)) < Math.abs(Math.log(best / wanted))) best = value;
  return best;
}

/**
 * The element as it is when its box's bottom right corner, as placed on the page (`placed`, turned already), is dragged
 * to (xMm, yMm): its top left corner kept. `element`, `placed` and a barcode's `sizing` are as they were when the drag
 * began, so that the sizes a barcode or a text block snap to do not drift as the pointer moves.
 */
export function resized(element: DesignElement, placed: PlacedElement, xMm: number, yMm: number, sizing?: SymbolSizing): DesignElement {
  const [dx, dy] = [xMm - placed.xMm - placed.widthMm, yMm - placed.yMm - placed.heightMm];
  if (element.kind === "box") return { ...element, widthMm: step(placed.widthMm + dx), heightMm: step(placed.heightMm + dy) };
  if (element.kind === "line") return { ...element, lengthMm: step(element.vertical ? placed.heightMm + dy : placed.widthMm + dx) };
  // Along the diagonal of what grows with it (a barcode's bars or modules, the others' whole box): the scale whose
  // corner is nearest to the pointer
  const grows = element.kind === "symbol" && sizing ? sizing : placed;
  const w = Math.max(grows.widthMm, 0.1);
  const h = Math.max(grows.heightMm, 0.1);
  const scale = Math.max(0.01, ((w + dx) * w + (h + dy) * h) / (w * w + h * h));
  if (element.kind === "image") return { ...element, widthMm: step(element.widthMm * scale) };
  if (element.kind === "symbol") {
    const sizes = sizing?.sizes.length ? sizing.sizes : SIZES;
    return { ...element, size: nearest(sizes, element.size * scale) };
  }
  return { ...element, heightMm: nearest(TEXT_HEIGHTS, element.heightMm * scale) };
}

/** The keys that resize the chosen element from its handle. */
export const RESIZE_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"] as const;
export type ResizeKey = (typeof RESIZE_KEYS)[number];

/** The next of `values` after `current` towards `sign`, or past `wanted` when it lies further: `current` at the end. */
function nextOf(values: readonly number[], current: number, sign: number, wanted?: number): number {
  const ahead = [...values].sort((a, b) => sign * (a - b)).filter((value) => sign * (value - current) > 0);
  if (!ahead.length) return current;
  return wanted === undefined ? ahead[0]! : nearest(ahead, wanted);
}

/**
 * The element as it is after an arrow key on its handle: the corner one step, 0.5 mm or with `big` (Shift) 5 mm, right
 * or left, down or up, its top left corner kept. A box and a line take the step on the side it moves along (a line
 * ignores the other two keys); an image, a barcode and a text block keep their proportions, Right and Down making them
 * larger. A barcode and a text block go to their next size, or with `big` to the one nearest to their longer side (a
 * barcode's bars or modules, as `sizing` says) 5 mm longer or shorter, at least the next; at the end of their sizes they
 * stay as they are. `placed` is the element's box on the page now.
 */
export function keyResized(element: DesignElement, placed: PlacedElement, key: ResizeKey, big: boolean, sizing?: SymbolSizing): DesignElement {
  const mm = big ? RESIZE_BIG_STEP_MM : RESIZE_STEP_MM;
  const across = key === "ArrowLeft" || key === "ArrowRight";
  const sign = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
  if (element.kind === "box") {
    return across ? { ...element, widthMm: step(element.widthMm + sign * mm) } : { ...element, heightMm: step(element.heightMm + sign * mm) };
  }
  if (element.kind === "line") return across === element.vertical ? element : { ...element, lengthMm: step(element.lengthMm + sign * mm) };
  if (element.kind === "image") return { ...element, widthMm: step(element.widthMm + sign * mm) };
  const grows = element.kind === "symbol" && sizing ? sizing : placed;
  const side = Math.max(grows.widthMm, grows.heightMm, 0.1);
  const scale = Math.max(0.01, (side + sign * mm) / side);
  if (element.kind === "symbol") {
    const sizes = sizing?.sizes.length ? sizing.sizes : SIZES;
    return { ...element, size: nextOf(sizes, element.size, sign, big ? element.size * scale : undefined) };
  }
  return { ...element, heightMm: nextOf(TEXT_HEIGHTS, element.heightMm, sign, big ? element.heightMm * scale : undefined) };
}

/**
 * The box `next` would have on the page, as turned, its top left corner kept: `element` is the element as it is, laid
 * out in `placed`. A box and a line from their sizes; an image and a text block grow in proportion to their width and
 * height; a barcode as `sizing` lays it out at its size, or, without it, in proportion to its size.
 */
export function boxAfter(element: DesignElement, next: DesignElement, placed: PlacedElement, sizing?: SymbolSizing): { widthMm: number; heightMm: number } | undefined {
  if (next.kind === "box" || next.kind === "line") return boxOf(next);
  const scale = (ratio: number) => ({ widthMm: placed.widthMm * ratio, heightMm: placed.heightMm * ratio });
  if (element.kind === "image" && next.kind === "image") return scale(next.widthMm / element.widthMm);
  if (element.kind === "text" && next.kind === "text") return scale(next.heightMm / element.heightMm);
  if (element.kind === "symbol" && next.kind === "symbol") return sizing?.boxAt ? sizing.boxAt(next.size) : scale(next.size / element.size);
  return undefined;
}

const halfDown = (mm: number) => Math.floor(mm / RESIZE_STEP_MM + 1e-6) * RESIZE_STEP_MM;

/**
 * `next`, what dragging the corner or an arrow key on the handle makes of `element` (laid out in `placed`), held within
 * the label: as it is when its box stays on the label (or cannot be laid out, which the page reports), or no further past the edge than `element`'s is; else a box or
 * a line on the last half millimetre, an image on the last half millimetre of its width that keeps its box there, a
 * barcode or a text block at the largest of its sizes between the two that does, and the element as it is when none
 * does. Making it smaller is never held.
 */
export function heldResize(element: DesignElement, next: DesignElement, placed: PlacedElement, page: { widthMm: number; heightMm: number }, sizing?: SymbolSizing): DesignElement {
  // Each side may reach the label's edge, or stay as far past it as it is
  const maxW = Math.max(page.widthMm - placed.xMm, placed.widthMm);
  const maxH = Math.max(page.heightMm - placed.yMm, placed.heightMm);
  const fits = (candidate: DesignElement) => {
    const box = boxAfter(element, candidate, placed, sizing);
    // A barcode that cannot be drawn at that size is left to the page, which says why
    return !box || (box.widthMm <= maxW + 1e-6 && box.heightMm <= maxH + 1e-6);
  };
  if (fits(next)) return next;
  if (element.kind === "box" && next.kind === "box") {
    return {
      ...next,
      widthMm: next.widthMm <= maxW + 1e-6 ? next.widthMm : Math.max(halfDown(page.widthMm - placed.xMm), element.widthMm),
      heightMm: next.heightMm <= maxH + 1e-6 ? next.heightMm : Math.max(halfDown(page.heightMm - placed.yMm), element.heightMm),
    };
  }
  if (element.kind === "line" && next.kind === "line") {
    const room = element.vertical ? page.heightMm - placed.yMm : page.widthMm - placed.xMm;
    return { ...next, lengthMm: Math.max(halfDown(room), element.lengthMm) };
  }
  if (element.kind === "image" && next.kind === "image") {
    // Its width at which its box reaches the first of the two edges
    const limit = Math.min(maxW * (element.widthMm / placed.widthMm), maxH * (element.widthMm / placed.heightMm));
    return { ...next, widthMm: Math.max(halfDown(limit), element.widthMm) };
  }
  if (element.kind === "symbol" && next.kind === "symbol") {
    const sizes = sizing?.sizes.length ? sizing.sizes : SIZES;
    const between = sizes.filter((size) => size > element.size && size < next.size).sort((a, b) => b - a);
    const size = between.find((s) => fits({ ...next, size: s }));
    return size === undefined ? element : { ...next, size };
  }
  if (element.kind === "text" && next.kind === "text") {
    const between = TEXT_HEIGHTS.filter((h) => h > element.heightMm && h < next.heightMm).sort((a, b) => b - a);
    const heightMm = between.find((h) => fits({ ...next, heightMm: h }));
    return heightMm === undefined ? element : { ...next, heightMm };
  }
  return element;
}
