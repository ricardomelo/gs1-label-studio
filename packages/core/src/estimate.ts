import { symbolsOf } from "./checkContext.ts";
import type { AddFinding, CheckContext } from "./checkValues.ts";
import { encode } from "./encode.ts";
import { leafOfEnvironment, rowsFor } from "./guide.ts";
import type { Measure, Reading } from "./reading.ts";
import { minimumBarHeight, SPECIFICATION_TABLES, type SpecSymbol, type SymbolSpecification } from "./specifications.ts";
import type { SymbologyId } from "./symbologies.ts";

// The Check Studio's size estimates from a picture (backlog 7.1 m; the check studio's project, section 4, group H, and
// J5): what a photograph can tell of a symbol's size, never a print quality grade. A grade (ISO/IEC 15416 for linear
// symbols, ISO/IEC 15415 for 2D) needs a verifier, with fixed light, aperture and distance (General Specifications
// 5.12.5), and the studio never gives one. From the picture's pixels the core measures, once, each symbol's width in
// pixels, its light margins and a linear symbol's bar height (`measureSymbol`); these are kept with the reading, so a
// reading checked again later gives the same estimates. Scale-free, they give the quiet zones in modules (H2) and an
// EAN/UPC's bar height against its width (H3). With a scale the user gives (the printed width of one symbol in the
// picture, `scaleFromWidth`) they give the X-dimension in mm (H1) and the distance between a pack's 2D and linear
// symbols (J5, checkGroup.ts). Every estimate carries its tolerance, and a finding is reported only when the whole
// interval is outside the specification table's range: an estimate does not accuse on a guess.

/** An image's pixels as a canvas gives them: four bytes a pixel (red, green, blue, alpha), rows from the top. */
export interface Pixels {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

/** The code each estimate may report; none is a grade. */
export const ESTIMATE_CODES = ["H1", "H2", "H3", "H4"] as const;

/** The sentence every size estimate carries (the project's section 4, group H). */
export const ESTIMATE_NOTE = "Estimate from a photograph. For a quality grade, have the symbol verified.";

/** How far the user's ruler may be out, in mm: half its smallest division. */
export const RULER_MM = 0.5;

/** The share of the required size an estimate must fall short of before it is reported: its own uncertainty. */
const SLACK = 0.9;

/** A side's light margin is measured up to this many modules: enough for any table's quiet zone. */
const QUIET_LOOK = 16;

/** Two dark pixels in a row end a light margin, so that one speck of noise does not. */
const DARK_RUN = 2;

/** A row of a linear symbol is still a bar row while this share of its pixels agrees with the centre line's. */
const SAME_ROW = 0.85;

/** What the estimates came to, for the screen and the report: values with their tolerances, never a grade. */
export interface SizeEstimate {
  /** The symbol of the specification tables the estimate used. */
  symbol: SpecSymbol | null;
  /** The specification table compared with: the context's, or the first that has the symbol. */
  table: number | null;
  /** The pixels a module takes in the picture. */
  pixelsPerModule: number | null;
  /** The X-dimension in mm and its tolerance (±, mm); null without a scale. */
  xMm: { value: number; tolerance: number } | null;
  /** The table's range for X: minimum, target, maximum, in mm. */
  range: SymbolSpecification["x"] | null;
  /** Each side's light margin in modules, as measured; null where the picture's edge came first. */
  quietZone: { left: number | null; right: number | null; top?: number | null; bottom?: number | null } | null;
  /** A linear symbol's bar height in modules, as measured. */
  barHeight: number | null;
  /** The table's minimum quality, as it writes it ("1.5/06/660"): what a verifier's grade must reach, not a grade. */
  quality: string | null;
}

/** A point in the picture's pixels. */
type Point = readonly [number, number];

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const add = (a: Point, b: Point, k = 1): Point => [a[0] + k * b[0], a[1] + k * b[1]];
const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const length = (a: Point) => Math.hypot(a[0], a[1]);
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const unit = (a: Point): Point => {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l];
};

const LINEAR_KINDS: ReadonlySet<SpecSymbol> = new Set([
  "ean13", "upca", "ean8", "upce", "itf14", "gs1-128", "databar-omni", "databar-truncated", "databar-limited", "databar-expanded",
]);
const EAN_UPC: ReadonlySet<SpecSymbol> = new Set(["ean13", "upca", "ean8", "upce"]);

/** Whether a reading is a linear symbol (one row of bars), as far as its identifier tells. */
function isLinear(reading: Reading): boolean {
  const symbols = symbolsOf(reading);
  return symbols.length > 0 && LINEAR_KINDS.has(symbols[0]!);
}

/**
 * The symbol's width in modules, without quiet zones, from first dark module to last: a Data Matrix's from its
 * version ("18x18"), a QR Code's from its (17 + 4 × version), a linear symbol's by encoding its data again. Null when
 * nothing tells: an ITF-14, whose wide bars may be 2.25 to 3 times the narrow ones, is measured in `measureSymbol`.
 */
export function modulesAcross(reading: Reading, elementString: string | null): number | null {
  const id = reading.symbologyIdentifier ?? "";
  if (id.startsWith("]d")) {
    const size = /^(\d+)x(\d+)$/.exec(reading.version ?? "");
    return size ? Number(size[2]) : null;
  }
  if (id.startsWith("]Q")) {
    const version = Number(reading.version);
    return Number.isInteger(version) && version >= 1 && version <= 40 ? 17 + 4 * version : null;
  }
  const symbol = symbolsOf(reading)[0];
  if (!symbol || !LINEAR_KINDS.has(symbol) || symbol === "itf14") return null;
  const data = EAN_UPC.has(symbol) ? reading.text : elementString;
  if (!data) return null;
  try {
    const geometry = encode((symbol === "upca" ? "ean13" : symbol) as SymbologyId, symbol === "upca" && data.length === 12 ? `0${data}` : data);
    if (geometry.kind !== "linear") return null;
    // From the first bar to the last: a GS1 DataBar starts and ends with light elements, which ZXing leaves out
    let start = 0;
    let end = 0;
    let at = 0;
    geometry.widths.forEach((w, i) => {
      if (i % 2 === 0) {
        if (end === 0) start = at;
        end = at + w;
      }
      at += w;
    });
    return end - start;
  } catch {
    return null;
  }
}

/**
 * Measures a symbol of a reading in the picture it was read from: its width in pixels along its own axis, its light
 * margins (left and right; top and bottom for a 2D symbol) and a linear symbol's bar height. The reading's corners
 * (ZXing's position) give the symbol's axes, so a turned picture measures as a straight one. Null when the reading
 * has no corners.
 */
export function measureSymbol(reading: Reading, pixels: Pixels, elementString: string | null = null): Measure | null {
  const corners = reading.position;
  if (!corners || corners.length !== 4) return null;
  const [tl, tr, br, bl] = corners as unknown as [Point, Point, Point, Point];
  const linear = isLinear(reading);
  const centre: Point = [(tl[0] + tr[0] + br[0] + bl[0]) / 4, (tl[1] + tr[1] + br[1] + bl[1]) / 4];
  // The symbol's axis: across its sides. ZXing gives a linear symbol's corners on the rows it scanned, so its top
  // and bottom may lie along the picture's rows while the bars lean: the bars' direction (top to bottom) decides.
  let u = unit(sub(mid(tr, br), mid(tl, bl)));
  if (linear) {
    const down = sub(mid(bl, br), mid(tl, tr));
    if (length(down) > 4) {
      const bars = unit(down);
      const across: Point = [bars[1], -bars[0]];
      u = dot(across, u) >= 0 ? across : [-across[0], -across[1]];
    }
  }
  const v: Point = [-u[1], u[0]];
  const sLeft = dot(sub(mid(tl, bl), centre), u);
  const sRight = dot(sub(mid(tr, br), centre), u);
  const across0 = sRight - sLeft + 1;
  const grey = (p: Point): number | null => {
    const x = Math.round(p[0]);
    const y = Math.round(p[1]);
    if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) return null;
    const i = (y * pixels.width + x) * 4;
    const own = 0.299 * pixels.data[i]! + 0.587 * pixels.data[i + 1]! + 0.114 * pixels.data[i + 2]!;
    return 255 - (pixels.data[i + 3]! / 255) * (255 - own);
  };

  // The threshold: half way between the darkest and lightest tenth of the centre line, quiet zones included
  const line: number[] = [];
  for (let s = sLeft - across0 * 0.1; s <= sRight + across0 * 0.1; s++) {
    const g = grey(add(centre, u, s));
    if (g !== null) line.push(g);
  }
  if (line.length < 8) return null;
  const sorted = [...line].sort((a, b) => a - b);
  const threshold = (sorted[Math.floor(sorted.length * 0.1)]! + sorted[Math.floor(sorted.length * 0.9)]!) / 2;
  const dark = (p: Point) => {
    const g = grey(p);
    return g === null ? null : g < threshold;
  };

  /** Light pixels from `from` in direction `d` before two dark ones; null when the picture ends first. */
  const margin = (from: Point, d: Point, limit: number): number | null => {
    let light = 0;
    let run = 0;
    for (let s = 1; s <= limit; s++) {
      const isDark = dark(add(from, d, s));
      if (isDark === null) return null;
      if (isDark) {
        run++;
        if (run >= DARK_RUN) return light;
      } else {
        light += run + 1;
        run = 0;
      }
    }
    return light;
  };

  if (linear) {
    const slack = Math.ceil(Math.max(2, across0 * 0.02));
    /** The symbol's extent along `axis` through the centre: the farthest bar within the slack outside each side. */
    const extent = (axis: Point) => {
      const at = (s: number) => dark(add(centre, axis, s)) === true;
      const edge = (from: number, out: 1 | -1): number => {
        const s = Math.round(from);
        for (let k = slack; k >= 0; k--) if (at(s + out * k)) return s + out * k;
        for (let k = 1; k <= slack; k++) if (at(s - out * k)) return s - out * k;
        return s;
      };
      const sl = edge(dot(sub(mid(tl, bl), centre), axis), -1);
      const sr = edge(dot(sub(mid(tr, br), centre), axis), 1);
      const l = add(centre, axis, sl);
      const across = sr - sl + 1;
      const pattern: boolean[] = [];
      for (let k = 0; k < across; k++) pattern.push(dark(add(l, axis, k)) ?? false);
      /** The share of a row `offset` pixels along `bars` that agrees with the centre line. */
      const agreement = (bars: Point, offset: number): number => {
        let same = 0;
        for (let k = 0; k < across; k++) if ((dark(add(add(l, bars, offset), axis, k)) ?? !pattern[k]) === pattern[k]) same++;
        return same / across;
      };
      return { l, r: add(centre, axis, sr), across, agreement };
    };
    // The bars' direction, to half a degree: the one along which the centre line's pattern stays the same farthest
    const first = extent(u);
    const reach = Math.max(8, first.across * 0.08);
    let bars = v;
    let best = -1;
    for (let degrees = -8; degrees <= 8; degrees += 0.5) {
      const a = (degrees * Math.PI) / 180;
      const turned: Point = [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
      const score = first.agreement(turned, reach) + first.agreement(turned, -reach);
      if (score > best + 1e-9) [best, bars] = [score, turned];
    }
    const axis: Point = [-bars[1], bars[0]];
    const { l, r, across, agreement } = extent(dot(axis, u) >= 0 ? axis : [bars[1], -bars[0]]);
    const along = unit(sub(r, l));
    const modules = modulesAcross(reading, elementString) ?? itfModules(reading, l, along, across, dark);
    const look = modules ? (QUIET_LOOK * across) / modules : across * 0.2;
    const agrees = (offset: number) => agreement(bars, offset) >= SAME_ROW;
    let up = 0;
    while (up < pixels.height && agrees(-(up + 1))) up++;
    let down = 0;
    while (down < pixels.height && agrees(down + 1)) down++;
    return {
      across: round(across),
      modules,
      quiet: { left: margin(l, [-along[0], -along[1]], look), right: margin(r, along, look) },
      barHeight: up + down + 1,
    };
  }

  // A 2D symbol: its sides from the corners, each margin the least of three lines across that side
  const across = (length(sub(tr, tl)) + length(sub(br, bl))) / 2 + 1;
  const modules = modulesAcross(reading, elementString);
  const look = modules ? (QUIET_LOOK * across) / modules : across * 0.5;
  const side = (a: Point, b: Point, d: Point): number | null => {
    const found = [0.25, 0.5, 0.75].map((k) => margin(add(a, sub(b, a), k), d, look));
    return found.some((m) => m === null) ? null : Math.min(...(found as number[]));
  };
  const down = unit(sub(bl, tl));
  return {
    across: round(across),
    modules,
    quiet: {
      left: side(tl, bl, [-u[0], -u[1]]),
      right: side(tr, br, u),
      top: side(tl, tr, [-down[0], -down[1]]),
      bottom: side(bl, br, down),
    },
    barHeight: null,
  };
}

/**
 * An ITF-14's width in modules from its bars: 14 digits of two wide and three narrow elements each, a start of four
 * narrow ones and a stop of a wide and two narrow (ISO/IEC 16390): 48 narrow and 29 wide, the ratio read from the bars.
 */
function itfModules(reading: Reading, left: Point, u: Point, across: number, dark: (p: Point) => boolean | null): number | null {
  if (!/^\]I[01]$/.test(reading.symbologyIdentifier ?? "") || reading.text.length !== 14) return null;
  const runs: number[] = [];
  let current = dark(left);
  let run = 0;
  for (let s = 0; s < across; s++) {
    const d = dark([left[0] + u[0] * s, left[1] + u[1] * s]);
    if (d === current) run++;
    else {
      runs.push(run);
      current = d;
      run = 1;
    }
  }
  runs.push(run);
  if (runs.length !== 14 * 5 + 4 + 3) return null; // from the first bar to the last
  // 29 wide elements (two in each digit, one in the stop) and 48 narrow ones
  const ordered = [...runs].sort((a, b) => a - b);
  const narrow = ordered.slice(0, 48).reduce((a, b) => a + b, 0) / 48;
  const wide = ordered.slice(48).reduce((a, b) => a + b, 0) / 29;
  const ratio = wide / narrow;
  return ratio >= 1.8 && ratio <= 3.2 ? round(48 + 29 * ratio) : null;
}

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

/**
 * The scale of a picture from one symbol's printed width in mm, without its quiet zones, as the user measures it with
 * a ruler: millimetres a pixel, and the relative tolerance of the ruler's half division and a pixel at each edge.
 */
export function scaleFromWidth(measure: Measure, mm: number): NonNullable<Measure["scale"]> {
  if (!(mm > 0) || !(measure.across > 0)) throw new RangeError("the width must be more than 0");
  return { mmPerPixel: mm / measure.across, tolerance: round(RULER_MM / mm + 2 / measure.across, 4) };
}

/**
 * The specification rows a reading's estimate compares with: the context's table's (for X, H1), and that or else the
 * first table's that has the symbol (for its quiet zones and bar height, which the symbology sets).
 */
function specificationOf(reading: Reading, context: CheckContext): { row: SymbolSpecification; table: number; symbol: SpecSymbol; inContext: boolean } | null {
  const symbols = symbolsOf(reading);
  const leaf = typeof context.environment === "string" ? leafOfEnvironment(context.environment) : undefined;
  if (leaf) {
    for (const symbol of symbols) {
      const row = rowsFor(leaf, symbol)[0];
      if (row) return { row, table: leaf.table, symbol, inContext: true };
    }
  }
  for (const symbol of symbols) {
    for (const table of Object.values(SPECIFICATION_TABLES)) {
      const row = table.rows.find((r) => r.symbol === symbol);
      if (row) return { row, table: table.table, symbol, inContext: false };
    }
  }
  return null;
}

/**
 * Group H's findings for a reading: H4 from what the decoder said (no picture needed); H1 to H3 from the measure kept
 * with a picture's reading. Returns the estimate, for the screen, and the codes that could not be assessed.
 */
export function estimateRules(reading: Reading, context: CheckContext, addFinding: AddFinding): { estimate: SizeEstimate | null; notChecked: string[] } {
  const notChecked: string[] = [];
  if (reading.carrier !== "barcode") return { estimate: null, notChecked };
  if (reading.inverted || reading.mirrored) {
    const details: Record<string, string> = { ...(reading.inverted ? { inverted: "true" } : {}), ...(reading.mirrored ? { mirrored: "true" } : {}) };
    addFinding("H4", [], { ...(context.environment === "dpm" ? { severity: "note" as const } : {}), details });
  }
  const measure = reading.measure;
  if (reading.source !== "image" || !measure) {
    // A camera's or a picture's symbol not measured; typed text has no symbol to measure
    if (reading.source === "camera" || reading.source === "image") notChecked.push("H1", "H2", "H3");
    return { estimate: null, notChecked };
  }
  const spec = specificationOf(reading, context);
  const ppm = measure.modules ? measure.across / measure.modules : null;
  const scale = measure.scale ?? null;
  const xMm = scale && measure.modules ? (scale.mmPerPixel * measure.across) / measure.modules : null;
  // An ITF-14's modules come from its bars' wide to narrow ratio, read to about 2 %
  const itf = /^\]I[01]$/.test(reading.symbologyIdentifier ?? "");
  const xTolerance = xMm !== null ? xMm * (scale!.tolerance + 2 / measure.across + (itf ? 0.02 : 0)) : null;
  const estimate: SizeEstimate = {
    symbol: spec?.symbol ?? null,
    table: spec?.table ?? null,
    pixelsPerModule: ppm === null ? null : round(ppm),
    xMm: xMm === null ? null : { value: round(xMm, 3), tolerance: round(xTolerance!, 3) },
    range: spec?.row.x ?? null,
    quietZone: ppm === null ? null : Object.fromEntries(Object.entries(measure.quiet).map(([k, px]) => [k, px === null ? null : round(px / ppm, 1)])) as SizeEstimate["quietZone"],
    barHeight: ppm === null || measure.barHeight === null ? null : round(measure.barHeight / ppm, 1),
    quality: spec?.row.quality ?? null,
  };
  const common = (extra: Record<string, string>) => ({ ...extra, ...(spec ? { table: String(spec.table), quality: spec.row.quality } : {}) });

  // H1: X against the context's range; needs a scale and a context
  if (xMm === null || !spec?.inContext) notChecked.push("H1");
  else {
    const [min, , max] = spec.row.x;
    if (xMm + xTolerance! < min || xMm - xTolerance! > max) {
      addFinding("H1", [], { details: common({ x: estimate.xMm!.value.toFixed(3), tolerance: estimate.xMm!.tolerance.toFixed(3), min: String(min), max: String(max) }) });
    }
  }

  // H2: each side's light margin against the quiet zone, in modules; a side at the picture's edge is not judged
  const quiet = estimate.quietZone;
  if (!spec || !quiet || Object.values(quiet).every((m) => m === null)) notChecked.push("H2");
  else {
    const needed = spec.row.quietZone;
    const sides = (Object.entries(quiet) as [keyof typeof quiet, number | null][])
      .filter(([, m]) => m !== null)
      .map(([name, m]) => [name, m!, typeof needed === "number" ? needed : name === "left" ? needed[0] : name === "right" ? needed[1] : 0] as const)
      .filter(([, m, need]) => need > 0 && m < need * SLACK);
    if (sides.length) {
      addFinding("H2", [], { details: common({ sides: sides.map(([n]) => n).join(","), ...Object.fromEntries(sides.flatMap(([n, m, need]) => [[n, String(m)], [`${n}Needed`, String(need)]])) }) });
    }
  }

  // H3: a linear symbol's bar height against the least for its X; without a scale, an EAN/UPC's at the target X, whose
  // height grows with X as its width does
  const height = spec && spec.row.height && estimate.barHeight !== null && ppm !== null ? spec.row : null;
  const atX = xMm ?? (height && EAN_UPC.has(spec!.symbol) ? (height.x[1] ?? height.x[0]) : null);
  if (!height || atX === null) {
    if (isLinear(reading)) notChecked.push("H3");
  } else {
    const least = minimumBarHeight(height, atX)!;
    const neededModules = least / atX;
    if (estimate.barHeight! < neededModules * SLACK) {
      addFinding("H3", [], {
        details: common({
          height: String(estimate.barHeight), needed: String(round(neededModules, 1)),
          ...(xMm !== null ? { heightMm: round(estimate.barHeight! * xMm, 1).toFixed(1), neededMm: least.toFixed(2) } : {}),
        }),
      });
    }
  }
  return { estimate, notChecked };
}

/**
 * The distance in mm from the centre of a linear symbol to the farthest point of a 2D symbol's quiet zone, in one
 * picture with a scale (J5, General Specifications 6.3.3.1); null when the two were not read from the same picture or
 * it has no scale.
 */
export function distanceBetween(linear: Reading, twoD: Reading): number | null {
  const scale = linear.measure?.scale ?? twoD.measure?.scale;
  if (!scale || !linear.position || !twoD.position || linear.source !== "image" || twoD.source !== "image" || linear.at !== twoD.at) return null;
  const centre = linear.position.reduce<Point>((c, p) => [c[0] + p[0] / 4, c[1] + p[1] / 4], [0, 0]);
  const quiet = twoD.measure?.modules ? (twoD.measure.across / twoD.measure.modules) * (twoD.symbologyIdentifier?.startsWith("]Q") ? 4 : 1) : 0;
  const farthest = Math.max(...twoD.position.map((p) => length(sub(p, centre))));
  return round((farthest + quiet * Math.SQRT2) * scale.mmPerPixel, 1);
}
