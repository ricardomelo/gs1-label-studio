import { describe, expect, it } from "vitest";
import {
  ENVIRONMENTS,
  minimumBarHeight,
  SIZES,
  SPECIFICATION_TABLES,
  specificationFor,
  specSizesFor,
  type SpecSymbol,
  type SymbolSpecification,
} from "../src/index.ts";

// The rows of the GS1 symbol specification tables as the GS1 General Specifications print them (release 26.0, January
// 2026, section 5.12.3; the inches left out): the symbol, the X-dimension (minimum, target, maximum, mm), the minimum
// bar height for those X-dimensions (mm), the quiet zones and the minimum quality specification. Copied from the
// text of the PDF, not from the code, so that each row is a second reading of the standard.
const NAMES: Record<string, SpecSymbol> = {
  "EAN-13": "ean13",
  "EAN-8": "ean8",
  "UPC-A": "upca",
  "UPC-E": "upce",
  "ITF-14": "itf14",
  "GS1-128": "gs1-128",
  "GS1 DataBar Omnidirectional": "databar-omni",
  "GS1 DataBar Stacked Omnidirectional": "databar-stacked-omni",
  "GS1 DataBar Expanded": "databar-expanded",
  "GS1 DataBar Expanded Stacked": "databar-expanded-stacked",
  "GS1 DataBar Stacked": "databar-stacked",
  "GS1 DataBar Limited": "databar-limited",
  "GS1 DataBar Truncated": "databar-truncated",
  "GS1 DataMatrix (ECC 200)": "gs1-datamatrix",
  "GS1 QR Code": "gs1-qrcode",
  "Data Matrix (GS1 Digital Link URI) (ECC 200)": "dl-datamatrix",
  "QR Code (GS1 Digital Link URI)": "dl-qrcode",
  "GS1 DotCode": "gs1-dotcode",
};

const ADD1_8200 = "addendum 1: with AI (8200)";
const ADD2 = "addendum 2: 2D barcodes";
const ADD1_2D = "addendum 1: 2D barcodes";
const LOCATION = "location marking (note to the table; section 2.4.2)";

const PRINTED: Record<number, { section: string; rows: (string | [part: string, row: string])[] }> = {
  1: {
    section: "5.12.3.1, tables 5-44, 5-45 and 5-46",
    rows: [
      "EAN-13 0.264 0.330 0.660 18.28 22.85 45.70 11X 7X 1.5/06/660",
      "EAN-8 0.264 0.330 0.660 14.58 18.23 36.46 7X 7X 1.5/06/660",
      "UPC-A 0.264 0.330 0.660 18.28 22.85 45.70 9X 9X 1.5/06/660",
      "UPC-E 0.264 0.330 0.660 18.28 22.85 45.70 9X 7X 1.5/06/660",
      "GS1 DataBar Omnidirectional 0.264 0.330 0.660 12.14 15.19 30.36 None None 1.5/06/660",
      "GS1 DataBar Stacked Omnidirectional 0.264 0.330 0.660 25.10 31.37 62.70 None None 1.5/06/660",
      "GS1 DataBar Expanded 0.264 0.330 0.660 8.99 11.23 22.44 None None 1.5/06/660",
      "GS1 DataBar Expanded Stacked 0.264 0.330 0.660 18.75 23.44 46.86 None None 1.5/06/660",
      [ADD1_8200, "GS1 DataMatrix (ECC 200) 0.396 0.495 0.743 1X on all four sides 1.5/12/660"],
      [ADD1_8200, "GS1 QR Code 0.396 0.495 0.743 4X on all four sides 1.5/12/660"],
      [ADD2, "GS1 DataMatrix (ECC 200) 0.396 0.495 0.990 1X on all four sides 1.5/12/660"],
      [ADD2, "Data Matrix (GS1 Digital Link URI) (ECC 200) 0.396 0.495 0.990 1X on all four sides 1.5/12/660"],
      [ADD2, "QR Code (GS1 Digital Link URI) 0.396 0.495 0.990 4X on all four sides 1.5/12/660"],
    ],
  },
  2: {
    section: "5.12.3.2, table 5-47",
    rows: [
      "EAN-13 0.495 0.660 0.660 34.28 45.70 45.70 11X 7X 1.5/10/660",
      "UPC-A 0.495 0.660 0.660 34.28 45.70 45.70 9X 9X 1.5/10/660",
      "UPC-E 0.495 0.660 0.660 34.28 45.70 45.70 9X 7X 1.5/10/660",
      "ITF-14 0.495 0.495 1.016 31.75 31.75 31.75 10X 10X 1.5/10/660",
      "GS1-128 0.495 0.495 1.016 31.75 31.75 31.75 10X 10X 1.5/10/660",
      "GS1 DataBar Omnidirectional 0.495 0.660 0.660 16.34 21.78 21.78 None None 1.5/10/660",
      "GS1 DataBar Stacked Omnidirectional 0.495 0.660 0.660 34.16 45.54 45.54 None None 1.5/10/660",
      "GS1 DataBar Expanded 0.495 0.660 0.660 16.83 22.44 22.44 None None 1.5/10/660",
      "GS1 DataBar Expanded Stacked 0.495 0.660 0.660 35.15 46.86 46.86 None None 1.5/10/660",
      "GS1 DataBar Stacked 0.495 0.660 0.660 6.44 8.58 8.58 None None 1.5/10/660",
      "GS1 DataBar Limited 0.495 0.660 0.660 4.95 6.60 6.60 None None 1.5/10/660",
      "GS1 DataBar Truncated 0.495 0.660 0.660 6.44 8.58 8.58 None None 1.5/10/660",
      "GS1 DataMatrix (ECC 200) 0.743 0.743 1.50 1X on all four sides 1.5/20/660",
      "GS1 QR Code 0.743 0.743 1.50 4X on all four sides 1.5/20/660",
    ],
  },
  3: {
    section: "5.12.3.3, tables 5-48 and 5-49",
    rows: [
      "EAN-13 0.495 0.660 0.660 34.28 45.70 45.70 11X 7X 1.5/06/660",
      "EAN-8 0.495 0.660 0.660 27.35 36.46 36.46 7X 7X 1.5/06/660",
      "UPC-A 0.495 0.660 0.660 34.28 45.70 45.70 9X 9X 1.5/06/660",
      "UPC-E 0.495 0.660 0.660 34.28 45.70 45.70 9X 7X 1.5/06/660",
      "GS1 DataBar Omnidirectional 0.495 0.660 0.660 22.77 30.36 30.36 None None 1.5/06/660",
      "GS1 DataBar Stacked Omnidirectional 0.495 0.660 0.660 47.03 62.70 62.70 None None 1.5/06/660",
      "GS1 DataBar Expanded 0.495 0.660 0.660 16.83 22.44 22.44 None None 1.5/06/660",
      "GS1 DataBar Expanded Stacked 0.495 0.660 0.660 35.15 46.86 46.86 None None 1.5/06/660",
      [ADD1_2D, "GS1 DataMatrix (ECC 200) 0.743 0.990 0.990 1X on all four sides 1.5/20/660"],
      [ADD1_2D, "Data Matrix (GS1 Digital Link URI) (ECC 200) 0.743 0.990 0.990 1X on all four sides 1.5/20/660"],
      [ADD1_2D, "QR Code (GS1 Digital Link URI) 0.743 0.990 0.990 4X on all four sides 1.5/20/660"],
    ],
  },
  4: {
    section: "5.12.3.4, table 5-50",
    rows: [
      "EAN-13 0.264 0.330 0.660 18.28 22.85 45.70 11X 7X 1.5/06/660",
      "EAN-8 0.264 0.330 0.660 14.58 18.23 36.46 7X 7X 1.5/06/660",
      "UPC-A 0.264 0.330 0.660 18.28 22.85 45.70 9X 9X 1.5/06/660",
      "UPC-E 0.264 0.330 0.660 18.28 22.85 45.70 9X 7X 1.5/06/660",
      "GS1 DataBar Omnidirectional 0.264 0.330 0.660 8.71 10.90 21.78 None None 1.5/06/660",
      "GS1 DataBar Stacked Omnidirectional 0.264 0.330 0.660 18.24 27.78 45.54 None None 1.5/06/660",
      "GS1 DataBar Expanded 0.264 0.330 0.660 8.99 11.23 22.44 None None 1.5/06/660",
      "GS1 DataBar Expanded Stacked 0.264 0.330 0.660 18.75 23.44 46.86 None None 1.5/06/660",
      "GS1 DataBar Stacked 0.264 0.330 0.660 3.43 4.29 8.58 None None 1.5/06/660",
      "GS1 DataBar Limited 0.264 0.330 0.660 2.64 3.30 6.60 None None 1.5/06/660",
      "GS1 DataBar Truncated 0.264 0.330 0.660 3.43 4.29 8.58 None None 1.5/06/660",
      "ITF-14 0.250 0.495 0.495 12.70 12.70 12.70 10X 10X 1.5/06/660",
      "GS1-128 0.250 0.495 0.495 12.70 12.70 12.70 10X 10X 1.5/06/660",
      "GS1 DataMatrix (ECC 200) 0.375 0.495 0.990 1X on all four sides 1.5/08/660",
      "GS1 QR Code 0.375 0.495 0.990 4X on all four sides 1.5/08/660",
    ],
  },
  5: {
    section: "5.12.3.5, table 5-51",
    rows: [
      "GS1-128 0.495 0.495 0.940 31.75 31.75 31.75 10X 10X 1.5/10/660",
      "GS1 DataMatrix (ECC 200) 0.743 0.743 1.50 1X on all four sides 1.5/20/660",
      "GS1 QR Code 0.743 0.743 1.50 4X on all four sides 1.5/20/660",
    ],
  },
  6: {
    section: "5.12.3.6, table 5-52",
    rows: [
      "GS1-128 0.170 0.495 0.495 12.70 12.70 12.70 10X 10X 1.5/06/660",
      "GS1 DataMatrix (ECC 200) 0.254 0.380 0.990 1X on all four sides 1.5/08/660",
      "GS1 DataBar Omnidirectional 0.170 0.200 0.660 5.61 6.60 21.78 None None 1.5/06/660",
      "GS1 DataBar Truncated 0.170 0.200 0.660 2.21 2.60 8.58 None None 1.5/06/660",
      "GS1 DataBar Stacked 0.170 0.200 0.660 2.21 2.60 8.58 None None 1.5/06/660",
      "GS1 DataBar Stacked Omnidirectional 0.170 0.200 0.660 11.73 13.80 45.54 None None 1.5/06/660",
      "GS1 DataBar Limited 0.170 0.200 0.660 1.70 2.00 6.60 None None 1.5/06/660",
      "GS1 DataBar Expanded 0.170 0.200 0.660 5.78 6.80 22.44 None None 1.5/06/660",
      "GS1 DataBar Expanded Stacked 0.170 0.200 0.660 12.07 14.20 46.86 None None 1.5/06/660",
      "EAN-13 0.170 0.330 0.660 18.28 22.85 45.70 11X 7X 1.5/06/660",
      "EAN-8 0.170 0.330 0.660 14.58 18.23 36.46 7X 7X 1.5/06/660",
      "UPC-A 0.170 0.330 0.660 18.28 22.85 45.70 9X 9X 1.5/06/660",
      "UPC-E 0.170 0.330 0.660 18.28 22.85 45.70 9X 7X 1.5/06/660",
      "ITF-14 0.170 0.495 0.495 12.70 12.70 12.70 10X 10X 1.5/06/660",
    ],
  },
  7: {
    section: "5.12.3.7, table 5-53",
    rows: [
      ["direct marking of items other than medical devices",
        "GS1 DataMatrix (ECC 200) 0.254 0.300 0.615 1X on all four sides 1.5/06/660"],
      ["direct marking of items other than medical devices",
        "GS1 QR Code 0.254 0.300 0.615 4X on all four sides 1.5/06/660"],
      ["ink-based direct part marking of medical devices",
        "GS1 DataMatrix (ECC 200) 0.254 0.300 0.615 1X on all four sides 1.5/08/660"],
      ["direct part marking A: connected modules (laser, chemical etching)",
        "GS1 DataMatrix (ECC 200) 0.100 0.200 0.300 1X on all four sides DPM1.5/04-12/650/(45Q|30Q|30T|30S|90)"],
      ["direct part marking B: non-connected modules (dot peen)",
        "GS1 DataMatrix (ECC 200) 0.200 0.300 0.495 1X on all four sides DPM1.5/08-20/650/(45Q|30Q|30T|30S|90)"],
    ],
  },
  8: {
    section: "5.12.3.8, table 5-54",
    rows: [
      "GS1-128 0.495 0.495 1.016 31.75 31.75 31.75 10X 10X 1.5/10/660",
      "GS1 DataMatrix (ECC 200) 0.750 0.750 1.520 1X on all four sides 1.5/20/660",
      "EAN-13 0.495 0.660 0.660 34.28 45.70 45.70 11X 7X 1.5/10/660",
      "EAN-8 0.495 0.660 0.660 27.35 36.46 36.46 7X 7X 1.5/10/660",
      "UPC-A 0.495 0.660 0.660 34.28 45.70 45.70 9X 9X 1.5/10/660",
      "UPC-E 0.495 0.660 0.660 34.28 45.70 45.70 9X 7X 1.5/10/660",
      "ITF-14 0.495 0.495 1.016 31.75 31.75 31.75 10X 10X 1.5/10/660",
      "GS1 DataBar Omnidirectional 0.495 0.660 0.660 16.34 21.78 21.78 None None 1.5/10/660",
      "GS1 DataBar Truncated 0.495 0.660 0.660 6.44 8.58 8.58 None None 1.5/10/660",
      "GS1 DataBar Stacked 0.495 0.660 0.660 6.44 8.58 8.58 None None 1.5/10/660",
      "GS1 DataBar Stacked Omnidirectional 0.495 0.660 0.660 34.16 45.54 45.54 None None 1.5/10/660",
      "GS1 DataBar Limited 0.495 0.660 0.660 4.95 6.60 6.60 None None 1.5/10/660",
      "GS1 DataBar Expanded 0.495 0.660 0.660 16.83 22.44 22.44 None None 1.5/10/660",
      "GS1 DataBar Expanded Stacked 0.495 0.660 0.660 35.15 46.86 46.86 None None 1.5/10/660",
    ],
  },
  9: {
    section: "5.12.3.9, table 5-55 and its note on location marking",
    rows: [
      "GS1-128 0.250 0.250 0.495 12.70 12.70 12.70 10X 10X 1.5/06/660",
      "GS1 DataMatrix (ECC 200) 0.375 0.375 0.743 1X on all four sides 1.5/08/660",
      "GS1 QR Code 0.375 0.375 0.743 4X on all four sides 1.5/08/660",
      // "For location marking, barcodes may be printed at a higher maximum X-dimension: GS1-128 at 1.016 mm (0.0400
      // inches), GS1 DataMatrix and GS1 QR Code at 1.520 mm (0.0600 inches)."
      [LOCATION, "GS1-128 0.250 0.250 1.016 12.70 12.70 12.70 10X 10X 1.5/06/660"],
      [LOCATION, "GS1 DataMatrix (ECC 200) 0.375 0.375 1.520 1X on all four sides 1.5/08/660"],
      [LOCATION, "GS1 QR Code 0.375 0.375 1.520 4X on all four sides 1.5/08/660"],
    ],
  },
  10: {
    section: "5.12.3.10, table 5-56",
    rows: [
      "GS1-128 0.264 0.330 0.660 12.70 12.70 12.70 10X 10X 1.5/06/660",
      "GS1 DataMatrix (ECC 200) 0.396 0.495 0.990 1X on all four sides 1.5/08/660",
      "GS1 DataBar Omnidirectional 0.264 0.330 0.660 8.71 10.89 21.78 None None 1.5/06/660",
      "GS1 DataBar Truncated 0.264 0.330 0.660 3.43 4.29 8.58 None None 1.5/06/660",
      "GS1 DataBar Stacked 0.264 0.330 0.660 3.43 4.29 8.58 None None 1.5/06/660",
      "GS1 DataBar Stacked Omnidirectional 0.264 0.330 0.660 18.22 27.77 45.54 None None 1.5/06/660",
      "GS1 DataBar Limited 0.264 0.330 0.660 2.64 3.30 6.60 None None 1.5/06/660",
      "GS1 DataBar Expanded 0.264 0.330 0.660 8.98 11.22 22.44 None None 1.5/06/660",
      "GS1 DataBar Expanded Stacked 0.264 0.330 0.660 18.74 23.43 46.86 None None 1.5/06/660",
      "EAN-13 0.264 0.330 0.660 18.28 22.85 45.70 11X 7X 1.5/06/660",
      "EAN-8 0.264 0.330 0.660 14.58 18.23 36.46 7X 7X 1.5/06/660",
      "UPC-A 0.264 0.330 0.660 18.28 22.85 45.70 9X 9X 1.5/06/660",
      "UPC-E 0.264 0.330 0.660 18.28 22.85 45.70 9X 7X 1.5/06/660",
      "ITF-14 0.264 0.330 0.660 12.70 12.70 12.70 10X 10X 1.5/06/660",
    ],
  },
  11: {
    section: "5.12.3.11, table 5-57",
    rows: [
      "GS1 DataBar Expanded 0.264 0.330 0.660 8.99 11.23 22.44 None None 1.5/06/660",
      "GS1 DataBar Expanded Stacked 0.264 0.330 0.660 18.75 23.44 46.86 None None 1.5/06/660",
      "GS1-128 0.170 0.250 0.495 12.70 12.70 12.70 10X 10X 1.5/05/660",
      "GS1 DataMatrix (ECC 200) 0.254 0.380 0.495 1X on all four sides 1.5/08/660",
      "GS1 QR Code 0.254 0.380 0.495 4X on all four sides 1.5/08/660",
    ],
  },
  12: {
    section: "5.12.3.12, table 5-58",
    rows: [
      ["trade items at unit pack level", "GS1 DataMatrix (ECC 200) 0.380 0.380 0.990 1X on all four sides 3.5/08/660"],
      ["trade items at unit pack level", "GS1 QR Code 0.380 0.380 0.990 4X on all four sides 3.5/08/660"],
      ["trade items at unit pack level", "GS1 DotCode 0.380 0.380 0.990 3X on all four sides 3.5/08/660"],
      ["trade item groupings", "GS1 DataMatrix (ECC 200) 0.750 0.750 1.520 1X on all four sides 3.5/20/660"],
      ["trade item groupings", "GS1 QR Code 0.750 0.750 1.520 4X on all four sides 3.5/20/660"],
      ["trade item groupings", "GS1-128 0.495 0.495 1.016 31.75 10X 10X 3.5/10/660"],
      ["logistic units", "GS1 DataMatrix (ECC 200) 0.750 0.750 1.520 1X on all four sides 3.5/20/660"],
      ["logistic units", "GS1 QR Code 0.750 0.750 1.520 4X on all four sides 3.5/20/660"],
      ["logistic units", "GS1-128 0.495 0.495 0.940 31.75 10X 10X 3.5/10/660"],
    ],
  },
  13: {
    section: "5.12.3.13, table 5-59 (minimum and maximum only)",
    rows: [
      "GS1 DataMatrix (ECC 200) 0.495 3.50 1X on all four sides 1.5/(**)/660",
      "GS1 QR Code 0.495 3.50 4X on all four sides 1.5/(**)/660",
      "GS1-128 0.495 0.940 12.70 10X on left and right side 1.5/(**)/660",
    ],
  },
};

/** A printed row read into the code's form. */
function read(row: string, part?: string): SymbolSpecification {
  const words = row.split(" ");
  const first = words.findIndex((w) => /^\d+\.\d+$/.test(w));
  const symbol = NAMES[words.slice(0, first).join(" ")];
  if (!symbol) throw new Error(`unknown symbol in "${row}"`);
  let i = first;
  const numbers: number[] = [];
  while (/^\d+\.\d+$/.test(words[i]!)) numbers.push(Number(words[i++]));
  const rest = words.slice(i).join(" ");
  // (**) of table 13: "the effective aperture should be 80% of the chosen X-dimension".
  const quality = words.at(-1)!.replace("(**)", "(80 % of X)");
  const quiet = rest.match(/^(\d+)X on all four sides/);
  const sides = rest.match(/^(\d+)X (\d+)X|^(None) None|^(\d+)X on left and right side/);
  const x = numbers.length === 2 || numbers.length === 3 && !quiet && /on left and right/.test(rest)
    ? ([numbers[0]!, null, numbers[1]!] as const)
    : ([numbers[0]!, numbers[1]!, numbers[2]!] as const);
  const heights = numbers.slice(x[1] === null ? 2 : 3);
  const spec: SymbolSpecification = {
    symbol,
    x,
    height: heights.length === 0 ? null : heights.length === 1 ? [heights[0]!, heights[0]!, heights[0]!] : [heights[0]!, heights[1]!, heights[2]!],
    quietZone: quiet ? Number(quiet[1]) : sides?.[3] ? [0, 0] : sides?.[4] ? [Number(sides[4]), Number(sides[4])] : [Number(sides![1]), Number(sides![2])],
    quality,
  };
  return part ? { ...spec, part } : spec;
}

describe("GS1 symbol specification tables (General Specifications 26.0, section 5.12.3)", () => {
  for (const [table, { section, rows }] of Object.entries(PRINTED)) {
    const code = SPECIFICATION_TABLES[Number(table)]!;
    describe(`table ${table} (${section})`, () => {
      it("has the printed rows, in their order, and no others", () => {
        expect(code.rows.length).toBe(rows.length);
        expect(code.section).toBe(`5.12.3.${table}`);
      });
      rows.forEach((printed, n) => {
        const [part, row] = typeof printed === "string" ? [undefined, printed] : printed;
        it(`row ${n + 1}: ${part ? `${part} — ` : ""}${row}`, () => {
          expect(code.rows[n]).toEqual(read(row, part));
        });
      });
    });
  }

  it("agrees with the resolver's summary in environments.ts: its 2D range and its EAN/UPC range", () => {
    // The resolver's 2D range is the GS1 DataMatrix row its label studio used: table 1's addendum 2, table 3's
    // addendum 1, table 7's row for items other than medical devices, the main row elsewhere.
    const part: Record<number, string> = {
      1: ADD2, 3: ADD1_2D, 7: "direct marking of items other than medical devices",
    };
    for (const [name, env] of Object.entries(ENVIRONMENTS)) {
      expect(specificationFor(env.table, "gs1-datamatrix", part[env.table])?.x, name).toEqual(env["2d"]);
      expect(specificationFor(env.table, "ean13")?.x ?? null, name).toEqual(env.linear);
    }
  });

  it("gives ITF-14, GS1-128 and GS1 DataBar the sizes within their rows", () => {
    expect(specSizesFor(specificationFor(2, "itf14")!, SIZES)).toEqual([100, 120, 150, 200]);
    expect(specSizesFor(specificationFor(5, "gs1-128")!, SIZES)).toEqual([100, 120, 150]);
    expect(specSizesFor(specificationFor(4, "gs1-128")!, SIZES)).toEqual([80, 90, 100]);
    expect(specSizesFor(specificationFor(1, "databar-omni")!, SIZES)).toEqual([80, 90, 100, 120, 150, 200]);
    expect(specSizesFor(specificationFor(13, "gs1-128")!, SIZES)).toEqual([]);
  });

  it("chooses the part asked for, or the row without a part", () => {
    expect(specificationFor(9, "gs1-128")!.x).toEqual([0.25, 0.25, 0.495]);
    expect(specificationFor(9, "gs1-128", LOCATION)!.x).toEqual([0.25, 0.25, 1.016]);
    expect(specificationFor(1, "gs1-datamatrix", ADD2)!.x[2]).toBe(0.99);
    expect(specificationFor(12, "gs1-128", "logistic units")!.x[2]).toBe(0.94);
    expect(specificationFor(5, "itf14")).toBeUndefined();
  });

  it("gives the minimum bar height for an X-dimension: the tables' heights grow with X for EAN/UPC and DataBar", () => {
    const ean13 = specificationFor(1, "ean13")!;
    expect(minimumBarHeight(ean13, 0.33)).toBeCloseTo(22.85, 9);
    expect(minimumBarHeight(ean13, 0.495)).toBeCloseTo(22.85 + ((45.7 - 22.85) * 0.165) / 0.33, 9);
    expect(minimumBarHeight(ean13, 0.495)! / 0.495).toBeCloseTo(69.24, 1); // as linear.ts's BAR_HEIGHT, in X
    expect(minimumBarHeight(specificationFor(2, "itf14")!, 0.8)).toBe(31.75);
    expect(minimumBarHeight(specificationFor(13, "gs1-128")!, 0.7)).toBe(12.7);
    expect(minimumBarHeight(specificationFor(2, "gs1-datamatrix")!, 0.8)).toBeNull();
  });
});
