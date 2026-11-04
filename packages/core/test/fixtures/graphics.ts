import { pictureOf, type DesignPage, type Picture } from "../../src/index.ts";

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

/**
 * A made-up logo for the image tests (backlog 4.2, step d): `width` × `height` pixels of a ring, a bar across and a
 * checkerboard corner, so that its dots differ at every scale; drawn in colour over transparency, as an image file is.
 */
export function logo(width = 120, height = 60): Picture {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const r = Math.hypot(x - height / 2, y - height / 2);
      const ring = r > height * 0.3 && r < height * 0.45;
      const bar = x > height && y > height * 0.4 && y < height * 0.6;
      const check = x > width - height * 0.4 && y < height * 0.4 && ((x >> 2) + (y >> 2)) % 2 === 0;
      const i = (y * width + x) * 4;
      if (ring) rgba.set([27, 94, 32, 255], i); // dark green: dark
      else if (bar || check) rgba.set([20, 20, 20, 255], i);
      else if (x < 4) rgba.set([255, 214, 0, 255], i); // yellow: light, so not printed
    }
  }
  return pictureOf(rgba, width, height);
}

/** A label of one's own with an image beside a symbol: the logo 40 mm wide, the Data Matrix clear of it. */
export const WITH_LOGO: DesignPage = {
  widthMm: 100, heightMm: 40,
  elements: [
    { id: "logo", kind: "image", name: "logo", picture: logo(), widthMm: 40, xMm: 4, yMm: 4 },
    { id: "m", kind: "symbol", symbology: "dl-datamatrix", ais: null, size: 100, hri: false, xMm: 70, yMm: 8 },
  ],
};
