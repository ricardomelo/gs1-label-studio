import { splitGs1128 } from "./gs1128.ts";
import type { LabelOptions } from "./layout.ts";
import type { SymbologyId } from "./symbologies.ts";
import { upcaManufacturerAndProduct } from "./zpl.ts";

/**
 * What a reader gives back for each symbol on a label, as "]<symbology identifier> <data>" (ISO/IEC 15424; the data of
 * a GS1 symbol in the bracketed form a reader shows as human readable text), sorted: the scan test of the editor (item
 * 1.6) compares what it reads with this, and the tests check this against ZXing.
 *
 * EAN/UPC symbols read as the GTIN-13 they are: a UPC-A with a leading zero, a UPC-E expanded to its UPC-A first.
 */
export function expectedReads(options: Pick<LabelOptions, "symbology" | "data" | "linear" | "gs1128Starts">): string[] {
  // GS1-128 over several symbols (backlog 1.13): a read for each
  const reads = options.symbology === "gs1-128"
    ? splitGs1128(options.data, options.gs1128Starts).map((part) => expectedRead("gs1-128", part))
    : [expectedRead(options.symbology, options.data)];
  if (options.linear) reads.push(expectedRead(options.linear[0], options.linear[1]));
  return reads.sort();
}

const IDENTIFIERS: Record<SymbologyId, string> = {
  ean13: "]E0",
  upca: "]E0",
  upce: "]E0",
  ean8: "]E4",
  itf14: "]I1",
  "gs1-128": "]C1",
  "gs1-datamatrix": "]d2",
  "gs1-qrcode": "]Q3",
  "dl-qrcode": "]Q1",
  "dl-datamatrix": "]d1",
  "databar-omni": "]e0",
  "databar-truncated": "]e0",
  "databar-stacked": "]e0",
  "databar-stacked-omni": "]e0",
  "databar-limited": "]e0",
  "databar-expanded": "]e0",
  "databar-expanded-stacked": "]e0",
};

function expectedRead(symbology: SymbologyId, data: string): string {
  const text = symbology === "upca"
    ? `0${data}`
    : symbology === "upce" ? `00${upcaManufacturerAndProduct(data)}${data.at(-1)}` : data;
  return `${IDENTIFIERS[symbology]} ${text}`;
}
