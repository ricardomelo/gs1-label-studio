import { inflateSync } from "node:zlib";

// A PNG reader for the tests, independent of the writer: 8-bit grey, grey with alpha, RGB or RGBA, any filter, not
// interlaced (what Pillow and png.ts write). Returns grey pixels and the pHYs density.

export interface DecodedPng {
  width: number;
  height: number;
  grey: Uint8Array;
  perMetre: number | null;
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

export function decodePng(bytes: Uint8Array): DecodedPng {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  let perMetre: number | null = null;
  const idat: Uint8Array[] = [];
  while (at < bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      if (data[8] !== 8 || data[12] !== 0) throw new Error("only 8-bit, not interlaced");
      channels = CHANNELS[data[9]!]!;
    } else if (type === "pHYs") {
      if (data[8] !== 1 || view.getUint32(at + 8) !== view.getUint32(at + 12)) throw new Error("unexpected pHYs");
      perMetre = view.getUint32(at + 8);
    } else if (type === "IDAT") {
      idat.push(data);
    }
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i]!;
      const a = i >= channels ? pixels[y * stride + i - channels]! : 0;
      const b = y ? pixels[(y - 1) * stride + i]! : 0;
      const c = y && i >= channels ? pixels[(y - 1) * stride + i - channels]! : 0;
      const p = a + b - c;
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
      const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter]!;
      pixels[y * stride + i] = (x + predictor) & 0xff;
    }
  }
  const grey = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const colour = channels >= 3 ? channels - (channels === 4 ? 1 : 0) : 1;
    let sum = 0;
    for (let k = 0; k < colour; k++) sum += pixels[i * channels + k]!;
    grey[i] = Math.round(sum / colour);
  }
  return { width, height, grey, perMetre };
}
