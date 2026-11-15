// The pictograms a label of one's own may carry (backlog 6.5, 6.13), by segment: those a standard lets anyone draw.
//
// Two kinds. Letters in a frame, as ISO 15223-1:2021 draws UDI, MD, LOT, REF, SN, IVD and the STERILE family: the
// printers draw them as boxes and lines of text, as they draw those. And drawings — the factory, the hourglass, the
// glass, the arrows, the umbrella, the ℮ — as contours of one's own after the standards' figures (no copy of their
// artwork): filled by the nonzero rule, vector outlines in the SVG, PDF and EPS, filled pixels in the PNG, and a
// bitmap at the printer's own dots in a printer language (batch.ts, printPageFor). The textile care symbols of
// ISO 3758 are GINETEX's registered trademarks and need a licence: none until the owner says so (backlog 6.13).

/** A closed contour: points in order, its last joined to its first. */
export type Contour = [number, number][];

export type PictogramName =
  | "udi" | "md" | "lot" | "ref" | "sn" | "ivd" | "sterile" | "sterile-eo" | "sterile-r" | "non-sterile"
  | "manufacturer" | "manufactured" | "use-by"
  | "fragile" | "this-way-up" | "keep-dry"
  | "estimated";

export type PictogramSegment = "healthcare" | "logistics" | "prepacked";

export interface Pictogram {
  segment: PictogramSegment;
  /** What it means, in English (the editor translates it). */
  name: string;
  /** The standard and its symbol's number. */
  source: string;
  /** Letters in a frame: each cell's letters, side by side, a rule between cells (STERILE | EO). */
  cells?: readonly string[];
  /** A drawing: its width for a height of 1, and its contours in that box (y downwards). */
  drawing?: { aspect: number; contours: () => Contour[] };
  /** A new one's height in mm: beside a medical device's carrier, on a carton, beside a net quantity. */
  heightMm: number;
}

/** Each segment's name and the standards it draws from, in the order the editor lists them. */
export const PICTOGRAM_SEGMENTS: readonly { segment: PictogramSegment; name: string; source: string }[] = [
  { segment: "healthcare", name: "Healthcare", source: "ISO 15223-1" },
  { segment: "logistics", name: "Logistics", source: "ISO 7000 / ISO 780" },
  { segment: "prepacked", name: "Prepacked goods", source: "Directive 76/211/EEC" },
];

// ——— Geometry: every contour turns the same way, so that the nonzero rule unites what overlaps (a stroke's segments
// and joins); a white line through a drawing (the glass's crack) is a notch in its outline, not a hole.

const area = (contour: Contour) => contour.reduce((sum, [x0, y0], i) => {
  const [x1, y1] = contour[(i + 1) % contour.length]!;
  return sum + x0 * y1 - x1 * y0;
}, 0) / 2;

/** A filled contour, turned clockwise on the page (y downwards). */
function filled(points: Contour): Contour {
  return area(points) < 0 ? [...points].reverse() : points;
}

function rect(x: number, y: number, w: number, h: number): Contour {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

/** Points along an ellipse's arc, from angle `from` to `to` (radians, y downwards: π/2 is the bottom), both ends kept. */
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number, steps = 48): Contour {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as [number, number];
  });
}

/**
 * A line `width` wide along `points`, as contours: a quadrilateral for each segment and a round join at each point
 * between two (and at every point of a closed line); its ends are cut square.
 */
function stroke(points: Contour, width: number, closed = false): Contour[] {
  const half = width / 2;
  const contours: Contour[] = [];
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[(i + 1) % points.length]!;
    const length = Math.hypot(x1 - x0, y1 - y0);
    if (!length) continue;
    const [nx, ny] = [(-(y1 - y0) / length) * half, ((x1 - x0) / length) * half];
    contours.push(filled([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]]));
  }
  const joins = closed ? points : points.slice(1, -1);
  for (const [x, y] of joins) contours.push(filled(arc(x, y, half, half, 0, 2 * Math.PI, 16).slice(0, -1)));
  return contours;
}

// ——— The drawings, each in a box `aspect` wide and 1 high

/** The factory of ISO 7000-3082 (manufacturer): a chimney at the left, a saw-tooth roof of three teeth. */
const FACTORY: Contour = [
  [0.04, 0.96], [0.04, 0.06], [0.22, 0.06], [0.22, 0.46], [0.5, 0.26], [0.5, 0.46], [0.78, 0.26], [0.78, 0.46],
  [1.06, 0.26], [1.06, 0.96],
];

function manufacturer(): Contour[] {
  return [filled(FACTORY)];
}

/** The same factory in outline (ISO 7000-2497, date of manufacture). */
function manufactured(): Contour[] {
  const line = 0.07;
  // Drawn inside the box: the outline's middle a half line in from the filled factory's edge
  const inside: Contour = FACTORY.map(([x, y]) => [0.04 + line / 2 + ((x - 0.04) * (1.02 - line)) / 1.02, 0.06 + line / 2 + ((y - 0.06) * (0.9 - line)) / 0.9]);
  return stroke(inside, line, true);
}

/** The hourglass of ISO 7000-2607 (use-by date): a plate above and below, the glass between, sand fallen. */
function useBy(): Contour[] {
  return [
    filled(rect(0.04, 0.03, 0.62, 0.09)),
    filled(rect(0.04, 0.88, 0.62, 0.09)),
    ...stroke([[0.13, 0.12], [0.57, 0.12], [0.39, 0.5], [0.57, 0.88], [0.13, 0.88], [0.31, 0.5]], 0.06, true),
    filled([[0.2, 0.85], [0.5, 0.85], [0.35, 0.66]]),
  ];
}

/** The glass of ISO 7000-0621 (fragile): its bowl cracked from the rim, a stem and a foot. */
function fragile(): Contour[] {
  const bowl: Contour = [
    [0.04, 0.04], [0.32, 0.04], [0.25, 0.14], [0.32, 0.22], [0.27, 0.31], [0.37, 0.22], [0.3, 0.14], [0.38, 0.04], [0.58, 0.04],
    ...arc(0.31, 0.04, 0.27, 0.4, 0, Math.PI, 32).slice(1, -1),
  ];
  return [filled(bowl), filled(rect(0.285, 0.42, 0.05, 0.46)), filled(rect(0.11, 0.86, 0.4, 0.08))];
}

/** The two arrows of ISO 7000-0623 (this way up), over a bar. */
function thisWayUp(): Contour[] {
  const arrow = (c: number): Contour => [[c, 0.04], [c + 0.17, 0.33], [c + 0.055, 0.33], [c + 0.055, 0.8], [c - 0.055, 0.8], [c - 0.055, 0.33], [c - 0.17, 0.33]];
  return [filled(arrow(0.24)), filled(arrow(0.66)), filled(rect(0.04, 0.88, 0.82, 0.08))];
}

/** The umbrella of ISO 7000-0626 (keep dry, away from rain): drops over its canopy, a hooked handle. */
function keepDry(): Contour[] {
  const [cx, cy, rx, ry] = [0.45, 0.54, 0.42, 0.34];
  // The canopy: its upper half, then three scallops back along its lower edge
  const canopy: Contour = arc(cx, cy, rx, ry, Math.PI, 2 * Math.PI, 48);
  const scallop = (2 * rx) / 3;
  for (let i = 2; i >= 0; i--) {
    const sx = cx - rx + scallop * (i + 0.5);
    canopy.push(...arc(sx, cy, scallop / 2, 0.06, 0, -Math.PI, 12).slice(1));
  }
  return [
    filled(canopy.slice(0, -1)),
    filled(rect(0.43, 0.16, 0.04, 0.05)),
    ...stroke([[0.45, 0.52], [0.45, 0.85], ...arc(0.36, 0.85, 0.09, 0.09, 0, Math.PI, 16).slice(1), [0.27, 0.8]], 0.055),
    ...[0.2, 0.45, 0.7].flatMap((x) => stroke([[x + 0.03, 0.02], [x - 0.01, 0.11]], 0.05)),
  ];
}

/** The estimated sign ℮ of Directive 76/211/EEC (Annex I, 3): a ring open at the lower right, a bar across its middle. */
function estimated(): Contour[] {
  const [c, r, line] = [0.5, 0.43, 0.1];
  return [
    ...stroke(arc(c, 0.5, r, r, 0, -1.75 * Math.PI, 64), line),
    filled(rect(c - r - line / 2, 0.5 - line / 2, 2 * r + line, line)),
  ];
}

export const PICTOGRAMS: Readonly<Record<PictogramName, Pictogram>> = {
  udi: { segment: "healthcare", name: "Unique device identifier", source: "ISO 15223-1:2021, symbol 5.7.10", cells: ["UDI"], heightMm: 4 },
  md: { segment: "healthcare", name: "Medical device", source: "ISO 15223-1:2021, symbol 5.7.7", cells: ["MD"], heightMm: 4 },
  lot: { segment: "healthcare", name: "Batch code", source: "ISO 15223-1:2021, symbol 5.1.5", cells: ["LOT"], heightMm: 4 },
  ref: { segment: "healthcare", name: "Catalogue number", source: "ISO 15223-1:2021, symbol 5.1.6", cells: ["REF"], heightMm: 4 },
  sn: { segment: "healthcare", name: "Serial number", source: "ISO 15223-1:2021, symbol 5.1.7", cells: ["SN"], heightMm: 4 },
  ivd: { segment: "healthcare", name: "In vitro diagnostic medical device", source: "ISO 15223-1:2021, symbol 5.5.1", cells: ["IVD"], heightMm: 4 },
  sterile: { segment: "healthcare", name: "Sterile", source: "ISO 15223-1:2021, symbol 5.2.1", cells: ["STERILE"], heightMm: 4 },
  "sterile-eo": { segment: "healthcare", name: "Sterilized using ethylene oxide", source: "ISO 15223-1:2021, symbol 5.2.3", cells: ["STERILE", "EO"], heightMm: 4 },
  "sterile-r": { segment: "healthcare", name: "Sterilized using irradiation", source: "ISO 15223-1:2021, symbol 5.2.4", cells: ["STERILE", "R"], heightMm: 4 },
  "non-sterile": { segment: "healthcare", name: "Non-sterile", source: "ISO 15223-1:2021, symbol 5.2.7", cells: ["NON STERILE"], heightMm: 4 },
  manufacturer: { segment: "healthcare", name: "Manufacturer", source: "ISO 15223-1:2021, symbol 5.1.1 (ISO 7000-3082)", drawing: { aspect: 1.1, contours: manufacturer }, heightMm: 4 },
  manufactured: { segment: "healthcare", name: "Date of manufacture", source: "ISO 15223-1:2021, symbol 5.1.3 (ISO 7000-2497)", drawing: { aspect: 1.1, contours: manufactured }, heightMm: 4 },
  "use-by": { segment: "healthcare", name: "Use-by date", source: "ISO 15223-1:2021, symbol 5.1.4 (ISO 7000-2607)", drawing: { aspect: 0.7, contours: useBy }, heightMm: 4 },
  fragile: { segment: "logistics", name: "Fragile", source: "ISO 7000-0621 (ISO 780)", drawing: { aspect: 0.62, contours: fragile }, heightMm: 15 },
  "this-way-up": { segment: "logistics", name: "This way up", source: "ISO 7000-0623 (ISO 780)", drawing: { aspect: 0.9, contours: thisWayUp }, heightMm: 15 },
  "keep-dry": { segment: "logistics", name: "Keep dry", source: "ISO 7000-0626 (ISO 780)", drawing: { aspect: 0.9, contours: keepDry }, heightMm: 15 },
  estimated: { segment: "prepacked", name: "Estimated sign", source: "Directive 76/211/EEC, Annex I, 3", drawing: { aspect: 1, contours: estimated }, heightMm: 3 },
};

/** The pictograms in the order the editor offers them, each segment's together. */
export const PICTOGRAM_NAMES = Object.keys(PICTOGRAMS) as readonly PictogramName[];

/** What a pictogram is called in a list: its letters (STERILE EO), or its name for a drawing. */
export function pictogramLabel(name: PictogramName): string {
  const pictogram = PICTOGRAMS[name];
  return pictogram.cells ? pictogram.cells.join(" ") : pictogram.name;
}

const drawn = new Map<PictogramName, Contour[]>();

/** A drawing's contours for a height of 1 (computed once). */
export function pictogramContours(name: PictogramName): Contour[] {
  const drawing = PICTOGRAMS[name].drawing;
  if (!drawing) return [];
  let contours = drawn.get(name);
  if (!contours) drawn.set(name, (contours = drawing.contours()));
  return contours;
}
