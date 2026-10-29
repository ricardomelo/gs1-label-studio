/**
 * The symbols the studio draws. `data` says what the symbol carries: a GTIN alone (EAN/UPC, ITF-14, and as the
 * element string "(01)…" the GS1 DataBar symbols other than Expanded), a GS1 element string in bracketed form, e.g.
 * "(01)09506000134352(10)ABC" (GS1-128, GS1 DataBar Expanded, GS1 DataMatrix, GS1 QR Code), or a GS1 Digital Link URI
 * (QR code and Data Matrix carrying the URI as plain data). `bcid` is the encoder's name for it. A stacked symbol is
 * rows of bars, drawn as a matrix of modules.
 */
export type SymbologyId =
  | "ean13"
  | "upca"
  | "ean8"
  | "upce"
  | "itf14"
  | "gs1-128"
  | "gs1-datamatrix"
  | "gs1-qrcode"
  | "dl-qrcode"
  | "dl-datamatrix"
  | "databar-omni"
  | "databar-truncated"
  | "databar-stacked"
  | "databar-stacked-omni"
  | "databar-limited"
  | "databar-expanded"
  | "databar-expanded-stacked";

export interface Symbology {
  id: SymbologyId;
  name: string;
  kind: "linear" | "stacked" | "matrix";
  data: "gtin" | "element-string" | "uri";
  bcid: string;
}

export const SYMBOLOGIES: Record<SymbologyId, Symbology> = {
  ean13: { id: "ean13", name: "EAN-13", kind: "linear", data: "gtin", bcid: "ean13" },
  upca: { id: "upca", name: "UPC-A", kind: "linear", data: "gtin", bcid: "upca" },
  ean8: { id: "ean8", name: "EAN-8", kind: "linear", data: "gtin", bcid: "ean8" },
  upce: { id: "upce", name: "UPC-E", kind: "linear", data: "gtin", bcid: "upce" },
  itf14: { id: "itf14", name: "ITF-14", kind: "linear", data: "gtin", bcid: "itf14" },
  "gs1-128": { id: "gs1-128", name: "GS1-128", kind: "linear", data: "element-string", bcid: "gs1-128" },
  "gs1-datamatrix": {
    id: "gs1-datamatrix", name: "GS1 DataMatrix", kind: "matrix", data: "element-string", bcid: "gs1datamatrix",
  },
  "gs1-qrcode": { id: "gs1-qrcode", name: "GS1 QR Code", kind: "matrix", data: "element-string", bcid: "gs1qrcode" },
  "dl-qrcode": { id: "dl-qrcode", name: "QR code (GS1 Digital Link)", kind: "matrix", data: "uri", bcid: "qrcode" },
  "dl-datamatrix": {
    id: "dl-datamatrix", name: "Data Matrix (GS1 Digital Link)", kind: "matrix", data: "uri", bcid: "datamatrix",
  },
  "databar-omni": {
    id: "databar-omni", name: "GS1 DataBar Omnidirectional", kind: "linear", data: "gtin", bcid: "databaromni",
  },
  "databar-truncated": {
    id: "databar-truncated", name: "GS1 DataBar Truncated", kind: "linear", data: "gtin", bcid: "databartruncated",
  },
  "databar-stacked": {
    id: "databar-stacked", name: "GS1 DataBar Stacked", kind: "stacked", data: "gtin", bcid: "databarstacked",
  },
  "databar-stacked-omni": {
    id: "databar-stacked-omni", name: "GS1 DataBar Stacked Omnidirectional", kind: "stacked", data: "gtin",
    bcid: "databarstackedomni",
  },
  "databar-limited": {
    id: "databar-limited", name: "GS1 DataBar Limited", kind: "linear", data: "gtin", bcid: "databarlimited",
  },
  "databar-expanded": {
    id: "databar-expanded", name: "GS1 DataBar Expanded", kind: "linear", data: "element-string", bcid: "databarexpanded",
  },
  "databar-expanded-stacked": {
    id: "databar-expanded-stacked", name: "GS1 DataBar Expanded Stacked", kind: "stacked", data: "element-string",
    bcid: "databarexpandedstacked",
  },
};

/** The GS1 DataBar family. */
export const DATABAR: readonly SymbologyId[] = [
  "databar-omni", "databar-truncated", "databar-stacked", "databar-stacked-omni", "databar-limited", "databar-expanded",
  "databar-expanded-stacked",
];
