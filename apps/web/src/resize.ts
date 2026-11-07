import {
  linearSizesFor, SIZES, sizesFor, specSizesFor, SYMBOLOGIES, type DesignedLabel, type DesignElement, type PlacedElement,
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

/** Dragging sizes boxes, lines and images by half millimetres, as it moves elements. */
export const RESIZE_STEP_MM = 0.5;

/** The heights a text block's capitals can take, in mm: those its properties offer. */
export const TEXT_HEIGHTS = [2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10, 12] as const;

/** What a barcode is resized by: the box of its bars or modules alone, as turned on the page, and the sizes it can take. */
export interface SymbolSizing {
  widthMm: number;
  heightMm: number;
  sizes: readonly number[];
}

/** A barcode's sizing from what the page writes it from (`DesignedLabel.printer.symbols`): its layout and options. */
export function symbolSizing({ layout, options, rotation }: DesignedLabel["printer"]["symbols"][number]): SymbolSizing {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y, w, h] of layout.rects) {
    [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x + w), Math.max(bottom, y + h)];
  }
  const [w, h] = right > left ? [(right - left) * layout.xMm, (bottom - top) * layout.xMm] : [layout.width * layout.xMm, layout.height * layout.xMm];
  const environment = options.environment ?? "";
  const sizes = options.spec ? specSizesFor(options.spec, SIZES)
    : SYMBOLOGIES[options.symbology].kind === "matrix" ? sizesFor(environment) : linearSizesFor(environment);
  return rotation === 90 || rotation === 270 ? { widthMm: h, heightMm: w, sizes } : { widthMm: w, heightMm: h, sizes };
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
