import type { SymbologyId } from "./symbologies.ts";

/**
 * The GS1 symbol specification tables, as the GS1 General Specifications give them (release 26.0, January 2026,
 * section 5.12.3, tables 5-44 to 5-59): for each symbol a table allows, its X-dimension (minimum, target, maximum, in
 * mm), the minimum bar height for those X-dimensions, the quiet zones and the minimum quality specification. Every row
 * of tables 1 to 13 is here except the composite components (CC-A, CC-B, CC-C: printed at their linear symbol's
 * X-dimension) and the EAN/UPC add-ons of table 1, which the studio does not draw.
 *
 * `environments.ts` keeps the resolver's summary of these tables (one 2D range and the EAN/UPC range per table);
 * this module is the tables themselves, so that ITF-14, GS1-128, the GS1 DataBar family and GS1 DotCode have their
 * ranges too. The tests check every row against the text of the General Specifications.
 */

/** The symbols the tables name: this project's symbologies and GS1 DotCode, which it does not draw yet (backlog 1.3). */
export type SpecSymbol = SymbologyId | "gs1-dotcode";

export const SPEC_SYMBOL_NAMES: Record<SpecSymbol, string> = {
  ean13: "EAN-13",
  upca: "UPC-A",
  ean8: "EAN-8",
  upce: "UPC-E",
  itf14: "ITF-14",
  "gs1-128": "GS1-128",
  "gs1-datamatrix": "GS1 DataMatrix",
  "gs1-qrcode": "GS1 QR Code",
  "dl-qrcode": "QR code (GS1 Digital Link)",
  "dl-datamatrix": "Data Matrix (GS1 Digital Link)",
  "databar-omni": "GS1 DataBar Omnidirectional",
  "databar-stacked-omni": "GS1 DataBar Stacked Omnidirectional",
  "databar-expanded": "GS1 DataBar Expanded",
  "databar-expanded-stacked": "GS1 DataBar Expanded Stacked",
  "databar-stacked": "GS1 DataBar Stacked",
  "databar-limited": "GS1 DataBar Limited",
  "databar-truncated": "GS1 DataBar Truncated",
  "gs1-dotcode": "GS1 DotCode",
};

export interface SymbolSpecification {
  symbol: SpecSymbol;
  /** X-dimension in mm: minimum, target (null where the table gives none: table 13), maximum. */
  x: readonly [min: number, target: number | null, max: number];
  /** Minimum bar height in mm for the minimum, target and maximum X-dimensions; null: set by X and the data (2D). */
  height: readonly [forMin: number, forTarget: number, forMax: number] | null;
  /** Quiet zones in X: left and right for a linear symbol (0 where the table says none), all four sides for 2D. */
  quietZone: readonly [left: number, right: number] | number;
  /** Minimum quality specification: grade/aperture/wavelength, as the table writes it. */
  quality: string;
  /** The part of the table, where a symbol has more than one row: an addendum, a use, a level of packaging. */
  part?: string;
}

export interface SpecificationTable {
  table: number;
  section: string;
  /** The tables' numbers in the General Specifications, e.g. "5-47". */
  printed: string;
  title: string;
  rows: readonly SymbolSpecification[];
}

type Height = readonly [number, number, number];
type Quiet = readonly [number, number];

function linear(symbol: SpecSymbol, x: SymbolSpecification["x"], height: Height, quietZone: Quiet, quality: string,
  part?: string): SymbolSpecification {
  return { symbol, x, height, quietZone, quality, ...(part ? { part } : {}) };
}

function matrix(symbol: SpecSymbol, x: SymbolSpecification["x"], quietZone: number, quality: string,
  part?: string): SymbolSpecification {
  return { symbol, x, height: null, quietZone, quality, ...(part ? { part } : {}) };
}

// The EAN/UPC quiet zones (left, right) and GS1 DataBar's (none), in X.
const EAN13: Quiet = [11, 7];
const EAN8: Quiet = [7, 7];
const UPCA: Quiet = [9, 9];
const UPCE: Quiet = [9, 7];
const NONE: Quiet = [0, 0];
const TEN: Quiet = [10, 10];

/** The parts of the tables that give a symbol more than one row. */
export const PARTS = {
  t1Ai8200: "addendum 1: with AI (8200)",
  t1TwoD: "addendum 2: 2D barcodes",
  t3TwoD: "addendum 1: 2D barcodes",
  t7Other: "direct marking of items other than medical devices",
  t7Ink: "ink-based direct part marking of medical devices",
  t7A: "direct part marking A: connected modules (laser, chemical etching)",
  t7B: "direct part marking B: non-connected modules (dot peen)",
  t9Location: "location marking (note to the table; section 2.4.2)",
  t12Unit: "trade items at unit pack level",
  t12Grouping: "trade item groupings",
  t12Logistic: "logistic units",
} as const;
const { t1Ai8200: T1_ADD1, t1TwoD: T1_ADD2, t3TwoD: T3_ADD1, t7Other: T7_OTHER, t7Ink: T7_INK, t7A: T7_A, t7B: T7_B,
  t9Location: T9_LOCATION, t12Unit: T12_UNIT, t12Grouping: T12_GROUPING, t12Logistic: T12_LOGISTIC } = PARTS;

const R = (min: number, target: number | null, max: number) => [min, target, max] as const;
const H = (forMin: number, forTarget: number, forMax: number) => [forMin, forTarget, forMax] as const;

export const SPECIFICATION_TABLES: Record<number, SpecificationTable> = {
  1: {
    table: 1, section: "5.12.3.1", printed: "5-44, 5-45, 5-46",
    title: "Trade items scanned in general retail POS and not general distribution",
    rows: [
      linear("ean13", R(0.264, 0.330, 0.660), H(18.28, 22.85, 45.70), EAN13, "1.5/06/660"),
      linear("ean8", R(0.264, 0.330, 0.660), H(14.58, 18.23, 36.46), EAN8, "1.5/06/660"),
      linear("upca", R(0.264, 0.330, 0.660), H(18.28, 22.85, 45.70), UPCA, "1.5/06/660"),
      linear("upce", R(0.264, 0.330, 0.660), H(18.28, 22.85, 45.70), UPCE, "1.5/06/660"),
      linear("databar-omni", R(0.264, 0.330, 0.660), H(12.14, 15.19, 30.36), NONE, "1.5/06/660"),
      linear("databar-stacked-omni", R(0.264, 0.330, 0.660), H(25.10, 31.37, 62.70), NONE, "1.5/06/660"),
      linear("databar-expanded", R(0.264, 0.330, 0.660), H(8.99, 11.23, 22.44), NONE, "1.5/06/660"),
      linear("databar-expanded-stacked", R(0.264, 0.330, 0.660), H(18.75, 23.44, 46.86), NONE, "1.5/06/660"),
      matrix("gs1-datamatrix", R(0.396, 0.495, 0.743), 1, "1.5/12/660", T1_ADD1),
      matrix("gs1-qrcode", R(0.396, 0.495, 0.743), 4, "1.5/12/660", T1_ADD1),
      matrix("gs1-datamatrix", R(0.396, 0.495, 0.990), 1, "1.5/12/660", T1_ADD2),
      matrix("dl-datamatrix", R(0.396, 0.495, 0.990), 1, "1.5/12/660", T1_ADD2),
      matrix("dl-qrcode", R(0.396, 0.495, 0.990), 4, "1.5/12/660", T1_ADD2),
    ],
  },
  2: {
    table: 2, section: "5.12.3.2", printed: "5-47",
    title: "Trade items scanned in general distribution only",
    rows: [
      linear("ean13", R(0.495, 0.660, 0.660), H(34.28, 45.70, 45.70), EAN13, "1.5/10/660"),
      linear("upca", R(0.495, 0.660, 0.660), H(34.28, 45.70, 45.70), UPCA, "1.5/10/660"),
      linear("upce", R(0.495, 0.660, 0.660), H(34.28, 45.70, 45.70), UPCE, "1.5/10/660"),
      linear("itf14", R(0.495, 0.495, 1.016), H(31.75, 31.75, 31.75), TEN, "1.5/10/660"),
      linear("gs1-128", R(0.495, 0.495, 1.016), H(31.75, 31.75, 31.75), TEN, "1.5/10/660"),
      linear("databar-omni", R(0.495, 0.660, 0.660), H(16.34, 21.78, 21.78), NONE, "1.5/10/660"),
      linear("databar-stacked-omni", R(0.495, 0.660, 0.660), H(34.16, 45.54, 45.54), NONE, "1.5/10/660"),
      linear("databar-expanded", R(0.495, 0.660, 0.660), H(16.83, 22.44, 22.44), NONE, "1.5/10/660"),
      linear("databar-expanded-stacked", R(0.495, 0.660, 0.660), H(35.15, 46.86, 46.86), NONE, "1.5/10/660"),
      linear("databar-stacked", R(0.495, 0.660, 0.660), H(6.44, 8.58, 8.58), NONE, "1.5/10/660"),
      linear("databar-limited", R(0.495, 0.660, 0.660), H(4.95, 6.60, 6.60), NONE, "1.5/10/660"),
      linear("databar-truncated", R(0.495, 0.660, 0.660), H(6.44, 8.58, 8.58), NONE, "1.5/10/660"),
      matrix("gs1-datamatrix", R(0.743, 0.743, 1.50), 1, "1.5/20/660"),
      matrix("gs1-qrcode", R(0.743, 0.743, 1.50), 4, "1.5/20/660"),
    ],
  },
  3: {
    table: 3, section: "5.12.3.3", printed: "5-48, 5-49",
    title: "Trade items scanned at general retail POS and general distribution",
    rows: [
      linear("ean13", R(0.495, 0.660, 0.660), H(34.28, 45.70, 45.70), EAN13, "1.5/06/660"),
      linear("ean8", R(0.495, 0.660, 0.660), H(27.35, 36.46, 36.46), EAN8, "1.5/06/660"),
      linear("upca", R(0.495, 0.660, 0.660), H(34.28, 45.70, 45.70), UPCA, "1.5/06/660"),
      linear("upce", R(0.495, 0.660, 0.660), H(34.28, 45.70, 45.70), UPCE, "1.5/06/660"),
      linear("databar-omni", R(0.495, 0.660, 0.660), H(22.77, 30.36, 30.36), NONE, "1.5/06/660"),
      linear("databar-stacked-omni", R(0.495, 0.660, 0.660), H(47.03, 62.70, 62.70), NONE, "1.5/06/660"),
      linear("databar-expanded", R(0.495, 0.660, 0.660), H(16.83, 22.44, 22.44), NONE, "1.5/06/660"),
      linear("databar-expanded-stacked", R(0.495, 0.660, 0.660), H(35.15, 46.86, 46.86), NONE, "1.5/06/660"),
      matrix("gs1-datamatrix", R(0.743, 0.990, 0.990), 1, "1.5/20/660", T3_ADD1),
      matrix("dl-datamatrix", R(0.743, 0.990, 0.990), 1, "1.5/20/660", T3_ADD1),
      matrix("dl-qrcode", R(0.743, 0.990, 0.990), 4, "1.5/20/660", T3_ADD1),
    ],
  },
  4: {
    table: 4, section: "5.12.3.4", printed: "5-50",
    title: "Trade items not scanned at POS or general retail, nor in general distribution or regulated healthcare",
    rows: [
      linear("ean13", R(0.264, 0.330, 0.660), H(18.28, 22.85, 45.70), EAN13, "1.5/06/660"),
      linear("ean8", R(0.264, 0.330, 0.660), H(14.58, 18.23, 36.46), EAN8, "1.5/06/660"),
      linear("upca", R(0.264, 0.330, 0.660), H(18.28, 22.85, 45.70), UPCA, "1.5/06/660"),
      linear("upce", R(0.264, 0.330, 0.660), H(18.28, 22.85, 45.70), UPCE, "1.5/06/660"),
      linear("databar-omni", R(0.264, 0.330, 0.660), H(8.71, 10.90, 21.78), NONE, "1.5/06/660"),
      linear("databar-stacked-omni", R(0.264, 0.330, 0.660), H(18.24, 27.78, 45.54), NONE, "1.5/06/660"),
      linear("databar-expanded", R(0.264, 0.330, 0.660), H(8.99, 11.23, 22.44), NONE, "1.5/06/660"),
      linear("databar-expanded-stacked", R(0.264, 0.330, 0.660), H(18.75, 23.44, 46.86), NONE, "1.5/06/660"),
      linear("databar-stacked", R(0.264, 0.330, 0.660), H(3.43, 4.29, 8.58), NONE, "1.5/06/660"),
      linear("databar-limited", R(0.264, 0.330, 0.660), H(2.64, 3.30, 6.60), NONE, "1.5/06/660"),
      linear("databar-truncated", R(0.264, 0.330, 0.660), H(3.43, 4.29, 8.58), NONE, "1.5/06/660"),
      linear("itf14", R(0.250, 0.495, 0.495), H(12.70, 12.70, 12.70), TEN, "1.5/06/660"),
      linear("gs1-128", R(0.250, 0.495, 0.495), H(12.70, 12.70, 12.70), TEN, "1.5/06/660"),
      matrix("gs1-datamatrix", R(0.375, 0.495, 0.990), 1, "1.5/08/660"),
      matrix("gs1-qrcode", R(0.375, 0.495, 0.990), 4, "1.5/08/660"),
    ],
  },
  5: {
    table: 5, section: "5.12.3.5", printed: "5-51",
    title: "Logistic units scanned in general distribution",
    rows: [
      linear("gs1-128", R(0.495, 0.495, 0.940), H(31.75, 31.75, 31.75), TEN, "1.5/10/660"),
      matrix("gs1-datamatrix", R(0.743, 0.743, 1.50), 1, "1.5/20/660"),
      matrix("gs1-qrcode", R(0.743, 0.743, 1.50), 4, "1.5/20/660"),
    ],
  },
  6: {
    table: 6, section: "5.12.3.6", printed: "5-52",
    title: "Regulated healthcare non-retail consumer trade items not scanned in general distribution",
    rows: [
      linear("gs1-128", R(0.170, 0.495, 0.495), H(12.70, 12.70, 12.70), TEN, "1.5/06/660"),
      matrix("gs1-datamatrix", R(0.254, 0.380, 0.990), 1, "1.5/08/660"),
      linear("databar-omni", R(0.170, 0.200, 0.660), H(5.61, 6.60, 21.78), NONE, "1.5/06/660"),
      linear("databar-truncated", R(0.170, 0.200, 0.660), H(2.21, 2.60, 8.58), NONE, "1.5/06/660"),
      linear("databar-stacked", R(0.170, 0.200, 0.660), H(2.21, 2.60, 8.58), NONE, "1.5/06/660"),
      linear("databar-stacked-omni", R(0.170, 0.200, 0.660), H(11.73, 13.80, 45.54), NONE, "1.5/06/660"),
      linear("databar-limited", R(0.170, 0.200, 0.660), H(1.70, 2.00, 6.60), NONE, "1.5/06/660"),
      linear("databar-expanded", R(0.170, 0.200, 0.660), H(5.78, 6.80, 22.44), NONE, "1.5/06/660"),
      linear("databar-expanded-stacked", R(0.170, 0.200, 0.660), H(12.07, 14.20, 46.86), NONE, "1.5/06/660"),
      linear("ean13", R(0.170, 0.330, 0.660), H(18.28, 22.85, 45.70), EAN13, "1.5/06/660"),
      linear("ean8", R(0.170, 0.330, 0.660), H(14.58, 18.23, 36.46), EAN8, "1.5/06/660"),
      linear("upca", R(0.170, 0.330, 0.660), H(18.28, 22.85, 45.70), UPCA, "1.5/06/660"),
      linear("upce", R(0.170, 0.330, 0.660), H(18.28, 22.85, 45.70), UPCE, "1.5/06/660"),
      linear("itf14", R(0.170, 0.495, 0.495), H(12.70, 12.70, 12.70), TEN, "1.5/06/660"),
    ],
  },
  7: {
    table: 7, section: "5.12.3.7", printed: "5-53",
    title: "Direct part marking",
    rows: [
      matrix("gs1-datamatrix", R(0.254, 0.300, 0.615), 1, "1.5/06/660", T7_OTHER),
      matrix("gs1-qrcode", R(0.254, 0.300, 0.615), 4, "1.5/06/660", T7_OTHER),
      matrix("gs1-datamatrix", R(0.254, 0.300, 0.615), 1, "1.5/08/660", T7_INK),
      matrix("gs1-datamatrix", R(0.100, 0.200, 0.300), 1, "DPM1.5/04-12/650/(45Q|30Q|30T|30S|90)", T7_A),
      matrix("gs1-datamatrix", R(0.200, 0.300, 0.495), 1, "DPM1.5/08-20/650/(45Q|30Q|30T|30S|90)", T7_B),
    ],
  },
  8: {
    table: 8, section: "5.12.3.8", printed: "5-54",
    title: "Trade items scanned in retail pharmacy and general distribution or non-retail pharmacy and general distribution",
    rows: [
      linear("gs1-128", R(0.495, 0.495, 1.016), H(31.75, 31.75, 31.75), TEN, "1.5/10/660"),
      matrix("gs1-datamatrix", R(0.750, 0.750, 1.520), 1, "1.5/20/660"),
      linear("ean13", R(0.495, 0.660, 0.660), H(34.28, 45.70, 45.70), EAN13, "1.5/10/660"),
      linear("ean8", R(0.495, 0.660, 0.660), H(27.35, 36.46, 36.46), EAN8, "1.5/10/660"),
      linear("upca", R(0.495, 0.660, 0.660), H(34.28, 45.70, 45.70), UPCA, "1.5/10/660"),
      linear("upce", R(0.495, 0.660, 0.660), H(34.28, 45.70, 45.70), UPCE, "1.5/10/660"),
      linear("itf14", R(0.495, 0.495, 1.016), H(31.75, 31.75, 31.75), TEN, "1.5/10/660"),
      linear("databar-omni", R(0.495, 0.660, 0.660), H(16.34, 21.78, 21.78), NONE, "1.5/10/660"),
      linear("databar-truncated", R(0.495, 0.660, 0.660), H(6.44, 8.58, 8.58), NONE, "1.5/10/660"),
      linear("databar-stacked", R(0.495, 0.660, 0.660), H(6.44, 8.58, 8.58), NONE, "1.5/10/660"),
      linear("databar-stacked-omni", R(0.495, 0.660, 0.660), H(34.16, 45.54, 45.54), NONE, "1.5/10/660"),
      linear("databar-limited", R(0.495, 0.660, 0.660), H(4.95, 6.60, 6.60), NONE, "1.5/10/660"),
      linear("databar-expanded", R(0.495, 0.660, 0.660), H(16.83, 22.44, 22.44), NONE, "1.5/10/660"),
      linear("databar-expanded-stacked", R(0.495, 0.660, 0.660), H(35.15, 46.86, 46.86), NONE, "1.5/10/660"),
    ],
  },
  9: {
    table: 9, section: "5.12.3.9", printed: "5-55",
    title: "GS1 keys GDTI, GRAI, GIAI and GLN",
    rows: [
      linear("gs1-128", R(0.250, 0.250, 0.495), H(12.70, 12.70, 12.70), TEN, "1.5/06/660"),
      matrix("gs1-datamatrix", R(0.375, 0.375, 0.743), 1, "1.5/08/660"),
      matrix("gs1-qrcode", R(0.375, 0.375, 0.743), 4, "1.5/08/660"),
      // "For location marking, barcodes may be printed at a higher maximum X-dimension"
      linear("gs1-128", R(0.250, 0.250, 1.016), H(12.70, 12.70, 12.70), TEN, "1.5/06/660", T9_LOCATION),
      matrix("gs1-datamatrix", R(0.375, 0.375, 1.520), 1, "1.5/08/660", T9_LOCATION),
      matrix("gs1-qrcode", R(0.375, 0.375, 1.520), 4, "1.5/08/660", T9_LOCATION),
    ],
  },
  10: {
    table: 10, section: "5.12.3.10", printed: "5-56",
    title: "Regulated healthcare retail consumer trade items not scanned in general distribution",
    rows: [
      linear("gs1-128", R(0.264, 0.330, 0.660), H(12.70, 12.70, 12.70), TEN, "1.5/06/660"),
      matrix("gs1-datamatrix", R(0.396, 0.495, 0.990), 1, "1.5/08/660"),
      linear("databar-omni", R(0.264, 0.330, 0.660), H(8.71, 10.89, 21.78), NONE, "1.5/06/660"),
      linear("databar-truncated", R(0.264, 0.330, 0.660), H(3.43, 4.29, 8.58), NONE, "1.5/06/660"),
      linear("databar-stacked", R(0.264, 0.330, 0.660), H(3.43, 4.29, 8.58), NONE, "1.5/06/660"),
      linear("databar-stacked-omni", R(0.264, 0.330, 0.660), H(18.22, 27.77, 45.54), NONE, "1.5/06/660"),
      linear("databar-limited", R(0.264, 0.330, 0.660), H(2.64, 3.30, 6.60), NONE, "1.5/06/660"),
      linear("databar-expanded", R(0.264, 0.330, 0.660), H(8.98, 11.22, 22.44), NONE, "1.5/06/660"),
      linear("databar-expanded-stacked", R(0.264, 0.330, 0.660), H(18.74, 23.43, 46.86), NONE, "1.5/06/660"),
      linear("ean13", R(0.264, 0.330, 0.660), H(18.28, 22.85, 45.70), EAN13, "1.5/06/660"),
      linear("ean8", R(0.264, 0.330, 0.660), H(14.58, 18.23, 36.46), EAN8, "1.5/06/660"),
      linear("upca", R(0.264, 0.330, 0.660), H(18.28, 22.85, 45.70), UPCA, "1.5/06/660"),
      linear("upce", R(0.264, 0.330, 0.660), H(18.28, 22.85, 45.70), UPCE, "1.5/06/660"),
      linear("itf14", R(0.264, 0.330, 0.660), H(12.70, 12.70, 12.70), TEN, "1.5/06/660"),
    ],
  },
  11: {
    table: 11, section: "5.12.3.11", printed: "5-57",
    title: "GS1 GSRNs",
    rows: [
      linear("databar-expanded", R(0.264, 0.330, 0.660), H(8.99, 11.23, 22.44), NONE, "1.5/06/660"),
      linear("databar-expanded-stacked", R(0.264, 0.330, 0.660), H(18.75, 23.44, 46.86), NONE, "1.5/06/660"),
      linear("gs1-128", R(0.170, 0.250, 0.495), H(12.70, 12.70, 12.70), TEN, "1.5/05/660"),
      matrix("gs1-datamatrix", R(0.254, 0.380, 0.495), 1, "1.5/08/660"),
      matrix("gs1-qrcode", R(0.254, 0.380, 0.495), 4, "1.5/08/660"),
    ],
  },
  12: {
    table: 12, section: "5.12.3.12", printed: "5-58",
    title: "Tobacco trade items and logistic units for European Regulation 2018/574",
    rows: [
      matrix("gs1-datamatrix", R(0.380, 0.380, 0.990), 1, "3.5/08/660", T12_UNIT),
      matrix("gs1-qrcode", R(0.380, 0.380, 0.990), 4, "3.5/08/660", T12_UNIT),
      matrix("gs1-dotcode", R(0.380, 0.380, 0.990), 3, "3.5/08/660", T12_UNIT),
      matrix("gs1-datamatrix", R(0.750, 0.750, 1.520), 1, "3.5/20/660", T12_GROUPING),
      matrix("gs1-qrcode", R(0.750, 0.750, 1.520), 4, "3.5/20/660", T12_GROUPING),
      linear("gs1-128", R(0.495, 0.495, 1.016), H(31.75, 31.75, 31.75), TEN, "3.5/10/660", T12_GROUPING),
      matrix("gs1-datamatrix", R(0.750, 0.750, 1.520), 1, "3.5/20/660", T12_LOGISTIC),
      matrix("gs1-qrcode", R(0.750, 0.750, 1.520), 4, "3.5/20/660", T12_LOGISTIC),
      linear("gs1-128", R(0.495, 0.495, 0.940), H(31.75, 31.75, 31.75), TEN, "3.5/10/660", T12_LOGISTIC),
    ],
  },
  13: {
    table: 13, section: "5.12.3.13", printed: "5-59",
    title: "Durable labelling and durable marking enabling long distance scanning",
    rows: [
      // No target: "for optimal reader performance, a limited X-dimension range should be selected"; above 1.75 mm
      // for long distances. The aperture of the quality specification is 80 % of the chosen X-dimension.
      matrix("gs1-datamatrix", R(0.495, null, 3.50), 1, "1.5/(80 % of X)/660"),
      matrix("gs1-qrcode", R(0.495, null, 3.50), 4, "1.5/(80 % of X)/660"),
      linear("gs1-128", R(0.495, null, 0.940), H(12.70, 12.70, 12.70), TEN, "1.5/(80 % of X)/660"),
    ],
  },
};

/** The rows of a table for a symbol, or of one part of the table. */
export function specificationsFor(table: number, symbol: SpecSymbol, part?: string): SymbolSpecification[] {
  return (SPECIFICATION_TABLES[table]?.rows ?? []).filter(
    (row) => row.symbol === symbol && (part === undefined || row.part === undefined || row.part === part),
  );
}

/**
 * A symbol's row in a table: the one without a part, or the part asked for. Undefined where the table does not allow
 * the symbol.
 */
export function specificationFor(table: number, symbol: SpecSymbol, part?: string): SymbolSpecification | undefined {
  const rows = specificationsFor(table, symbol, part);
  return rows.find((row) => row.part === part) ?? rows.find((row) => row.part === undefined) ?? rows[0];
}

/** The X-dimension sizes are percentages of: the target, or the minimum where the table gives no target (table 13). */
export function baseX(spec: SymbolSpecification): number {
  return spec.x[1] ?? spec.x[0];
}

/** The sizes (percentages of `baseX`) that keep a symbol within its row's range. */
export function specSizesFor(spec: SymbolSpecification, sizes: readonly number[]): number[] {
  const [low, , high] = spec.x;
  const base = baseX(spec);
  return sizes.filter((size) => low - 1e-9 <= (base * size) / 100 && (base * size) / 100 <= high + 1e-9);
}

/**
 * The minimum bar height in mm for an X-dimension within the row's range: the table's heights for its minimum, target
 * and maximum, interpolated linearly between them (for EAN/UPC and GS1 DataBar the height grows with X; for ITF-14 and
 * GS1-128 it is fixed). Null for 2D symbols, whose height is set by X and the data.
 */
export function minimumBarHeight(spec: SymbolSpecification, xMm: number): number | null {
  if (!spec.height) return null;
  const [low, target, high] = spec.x;
  const [hLow, hTarget, hHigh] = spec.height;
  const points: [number, number][] = target === null ? [[low, hLow], [high, hHigh]] : [[low, hLow], [target, hTarget], [high, hHigh]];
  if (xMm <= points[0]![0]) return points[0]![1];
  for (let i = 1; i < points.length; i++) {
    const [x0, h0] = points[i - 1]!;
    const [x1, h1] = points[i]!;
    if (xMm <= x1) return x1 === x0 ? h1 : h0 + ((h1 - h0) * (xMm - x0)) / (x1 - x0);
  }
  return points.at(-1)![1];
}
