/**
 * The symbols the studio draws. `data` says what the symbol carries: a GTIN alone (EAN/UPC, ITF-14), a GS1 element
 * string in bracketed form, e.g. "(01)09506000134352(10)ABC" (GS1-128, GS1 DataMatrix, GS1 QR Code), or a GS1
 * Digital Link URI (QR code and Data Matrix carrying the URI as plain data). `bcid` is the encoder's name for it.
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
  | "dl-datamatrix";

export interface Symbology {
  id: SymbologyId;
  name: string;
  kind: "linear" | "matrix";
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
};
