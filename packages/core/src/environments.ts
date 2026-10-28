import type { SymbologyId } from "./symbologies.ts";

/**
 * Scanning environments: the symbol specification tables of the GS1 General Specifications (release 26.0, section
 * 5.12.3) that set each symbol's X-dimension range (minimum, target, maximum, in mm). Ported from the resolver's
 * label studio (`portal/label.py`, its ADR 0010 sections 7.6 and 7.7; ADR 0004 here) and checked against it: the tests
 * replay the resolver's own answers (`test/fixtures/resolver/environments.json`).
 *
 * `symbols` are the resolver's 2D symbols: "qr" (a QR code: with a GS1 Digital Link URI, or a GS1 QR Code), "dm" (a
 * Data Matrix with a GS1 Digital Link URI) and "gs1dm" (GS1 DataMatrix). A table that names GS1 DataMatrix gives its
 * range to both Data Matrix symbols; QR codes only where a table names a QR Code. `linear` is the EAN/UPC range, null
 * where the table has none; the tables themselves, with the ranges of ITF-14, GS1-128, GS1 DataBar and GS1 DotCode, are
 * in `specifications.ts`. `keys`: null for trade items (every key without a table of its own), the keys of the table,
 * or "any". The order is the decision tree's (figure 5-68): a key's first environment is its default.
 */
export type Range = readonly [min: number, target: number, max: number];
export type ResolverSymbol = "qr" | "dm" | "gs1dm";

export interface Environment {
  table: number;
  "2d": Range;
  linear: Range | null;
  symbols: readonly ResolverSymbol[];
  keys: readonly string[] | null | "any";
}

export const SIZES = [80, 90, 100, 120, 150, 200] as const;
export const RESOLVER_SYMBOLS: readonly ResolverSymbol[] = ["qr", "dm", "gs1dm"];
const DM: readonly ResolverSymbol[] = ["gs1dm", "dm"];

export const ENVIRONMENTS: Record<string, Environment> = {
  // Trade items scanned at general retail point of sale, not in general distribution: table 1 and its addendum 2
  retail: { table: 1, "2d": [0.396, 0.495, 0.990], linear: [0.264, 0.330, 0.660], symbols: RESOLVER_SYMBOLS, keys: null },
  // At retail point of sale and in general distribution: table 3 and its addendum 1
  "retail-gd": { table: 3, "2d": [0.743, 0.990, 0.990], linear: [0.495, 0.660, 0.660], symbols: RESOLVER_SYMBOLS, keys: null },
  // In general distribution only: table 2 (GS1 DataMatrix and GS1 QR Code)
  distribution: { table: 2, "2d": [0.743, 0.743, 1.50], linear: [0.495, 0.660, 0.660], symbols: RESOLVER_SYMBOLS, keys: null },
  // Regulated healthcare retail consumer trade items, not in general distribution: table 10
  pharmacy: { table: 10, "2d": [0.396, 0.495, 0.990], linear: [0.264, 0.330, 0.660], symbols: DM, keys: null },
  // Regulated healthcare in retail or non-retail pharmacy and in general distribution: table 8
  "pharmacy-gd": { table: 8, "2d": [0.750, 0.750, 1.520], linear: [0.495, 0.660, 0.660], symbols: DM, keys: null },
  // Regulated healthcare non-retail trade items not in general distribution (hospitals): table 6
  healthcare: { table: 6, "2d": [0.254, 0.380, 0.990], linear: [0.170, 0.330, 0.660], symbols: DM, keys: null },
  // Not at retail point of sale, not in general distribution, not regulated healthcare: table 4
  other: { table: 4, "2d": [0.375, 0.495, 0.990], linear: [0.264, 0.330, 0.660], symbols: RESOLVER_SYMBOLS, keys: null },
  // Logistic units (SSCC) in general distribution: table 5 (its GS1-128 row is in specifications.ts)
  logistics: { table: 5, "2d": [0.743, 0.743, 1.50], linear: null, symbols: RESOLVER_SYMBOLS, keys: ["00"] },
  // GDTI, GRAI, GIAI and GLN: table 9
  assets: { table: 9, "2d": [0.375, 0.375, 0.743], linear: null, symbols: RESOLVER_SYMBOLS,
    keys: ["253", "8003", "8004", "414", "417"] },
  // GSRN: table 11
  gsrn: { table: 11, "2d": [0.254, 0.380, 0.495], linear: null, symbols: RESOLVER_SYMBOLS, keys: ["8017", "8018"] },
  // Direct part marking, any key: table 7 (GS1 DataMatrix and GS1 QR Code)
  dpm: { table: 7, "2d": [0.254, 0.300, 0.615], linear: null, symbols: RESOLVER_SYMBOLS, keys: "any" },
};

const KEYS_WITH_TABLES = new Set(
  Object.values(ENVIRONMENTS).flatMap((env) => (Array.isArray(env.keys) ? env.keys : [])),
);

/** The resolver's 2D symbol for one of this project's symbologies (undefined for linear symbols). */
export const RESOLVER_SYMBOL_OF: Partial<Record<SymbologyId, ResolverSymbol>> = {
  "dl-qrcode": "qr",
  "gs1-qrcode": "qr",
  "dl-datamatrix": "dm",
  "gs1-datamatrix": "gs1dm",
};

/** The scanning environments for a key, its default first: its own tables, else the trade items'; and DPM. */
export function environmentsFor(ai: string): string[] {
  return Object.entries(ENVIRONMENTS)
    .filter(([, { keys }]) => keys === "any" || (keys === null ? !KEYS_WITH_TABLES.has(ai) : keys.includes(ai)))
    .map(([name]) => name);
}

const within = ([low, target, high]: Range, size: number) =>
  low - 1e-9 <= (target * size) / 100 && (target * size) / 100 <= high + 1e-9;

/**
 * The sizes (percentages of the environment's targets) whose X-dimensions stay within its ranges: the 2D symbol's,
 * and with `withLinear` the EAN/UPC's too (one size for both).
 */
export function sizesFor(environment: string, withLinear = false): number[] {
  const env = ENVIRONMENTS[environment]!;
  const ranges = [env["2d"], ...(withLinear && env.linear ? [env.linear] : [])];
  return SIZES.filter((size) => ranges.every((range) => within(range, size)));
}

/** The sizes of an EAN/UPC given a size of its own: those within the environment's linear range alone. */
export function linearSizesFor(environment: string): number[] {
  const range = ENVIRONMENTS[environment]!.linear;
  return range ? SIZES.filter((size) => within(range, size)) : [];
}

export class OutOfRange extends Error {
  constructor(
    readonly code: string,
    readonly params: Record<string, string> = {},
  ) {
    super(code);
    this.name = "OutOfRange";
  }
}

export interface EnvironmentChoice {
  environment: string;
  symbol: ResolverSymbol;
  /** Percentage of the environment's 2D target. */
  size: number;
  /** An EAN/UPC beside the 2D symbol. */
  linear: boolean;
  /** The EAN/UPC's own size; null: the 2D symbol's. */
  linearSize: number | null;
}

/**
 * Refuses what the scanning environment does not allow, or (with the key's AI) an environment of other keys. The codes
 * are the resolver's (`label.environmentInvalid`, `label.environmentNotForKey`, `label.symbolNotForEnvironment`,
 * `label.linearNotForEnvironment`, `label.sizeOutOfRange`, `label.linearSizeOutOfRange`).
 */
export function checkEnvironment(choice: EnvironmentChoice, ai?: string): void {
  const env = ENVIRONMENTS[choice.environment];
  if (!env) throw new OutOfRange("label.environmentInvalid", { names: Object.keys(ENVIRONMENTS).join(", ") });
  if (ai !== undefined && !environmentsFor(ai).includes(choice.environment)) {
    throw new OutOfRange("label.environmentNotForKey", { names: environmentsFor(ai).join(", ") });
  }
  if (!env.symbols.includes(choice.symbol)) throw new OutOfRange("label.symbolNotForEnvironment");
  if (choice.linear && !env.linear) throw new OutOfRange("label.linearNotForEnvironment");
  // One size for both symbols keeps both within their ranges; a size of the linear symbol's own frees the 2D one.
  const together = choice.linear && choice.linearSize === null;
  if (!sizesFor(choice.environment, together).includes(choice.size)) {
    const [low, , high] = env["2d"];
    throw new OutOfRange("label.sizeOutOfRange", {
      min: low.toFixed(3), max: high.toFixed(3), sizes: sizesFor(choice.environment, together).join(", "),
    });
  }
  if (choice.linear && !together && !linearSizesFor(choice.environment).includes(choice.linearSize!)) {
    const [low, , high] = env.linear!;
    throw new OutOfRange("label.linearSizeOutOfRange", {
      min: low.toFixed(3), max: high.toFixed(3), sizes: linearSizesFor(choice.environment).join(", "),
    });
  }
}

/** The 2D symbol's X-dimension in mm: the environment's target times the size. */
export function xDimension(environment: string, size: number): number {
  return (ENVIRONMENTS[environment]!["2d"][1] * size) / 100;
}

/** The EAN/UPC's X-dimension in mm: the environment's linear target (0.330 mm without one) times its size. */
export function linearXDimension(environment: string, size: number): number {
  return ((ENVIRONMENTS[environment]!.linear?.[1] ?? 0.33) * size) / 100;
}
