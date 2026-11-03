import type { DesignPage } from "../../src/index.ts";

// A label of one's own with lines and boxes (backlog 4.2), each clear of the others along its middle row and column so
// that a test can scan where a printer draws it (png.ts, drawnBox): a frame, a rule across, a thinner one down, a filled
// box and an outline, and a Data Matrix with a GS1 Digital Link URI that reads back (EPL2 has no GS1 DataMatrix).
export const GRAPHICS: DesignPage = {
  widthMm: 100, heightMm: 60,
  elements: [
    { id: "frame", kind: "box", widthMm: 96, heightMm: 56, thicknessMm: 0.8, filled: false, xMm: 2, yMm: 2 },
    { id: "across", kind: "line", vertical: false, lengthMm: 50, thicknessMm: 0.5, xMm: 6, yMm: 20 },
    { id: "down", kind: "line", vertical: true, lengthMm: 40, thicknessMm: 0.3, xMm: 60, yMm: 6 },
    { id: "filled", kind: "box", widthMm: 20, heightMm: 10, thicknessMm: 0.5, filled: true, xMm: 8, yMm: 30 },
    { id: "outline", kind: "box", widthMm: 30, heightMm: 10, thicknessMm: 1, filled: false, xMm: 8, yMm: 44 },
    { id: "m", kind: "symbol", symbology: "dl-datamatrix", ais: null, size: 100, hri: false, xMm: 70, yMm: 30 },
  ],
};
