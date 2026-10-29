import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

// The scan test (item 1.6): the label's SVG drawn by the browser and read back by ZXing, the decoder the tests use.
// The reader and its WebAssembly are loaded on the first test, from this application (not a CDN): nothing leaves the
// browser.

type Reader = typeof import("zxing-wasm/reader");
let loading: Promise<Reader> | null = null;

function reader(): Promise<Reader> {
  loading ??= import("zxing-wasm/reader").then(async (zxing) => {
    await zxing.prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) },
      fireImmediately: true,
    });
    return zxing;
  });
  return loading;
}

const PIXELS_PER_UNIT = 6; // a module of the label's unit, drawn as six pixels
const MAX_PIXELS = 4000;

/** What a reader finds on the label: "]<symbology identifier> <data>" for each symbol, sorted (as `expectedReads()`). */
export async function scanSvg(svg: string): Promise<string[]> {
  const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!box) throw new Error("The label has no size to draw it at.");
  const [width, height] = [Number(box[1]), Number(box[2])];
  const scale = Math.min(PIXELS_PER_UNIT, MAX_PIXELS / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
  const { readBarcodes } = await reader();
  const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
  const results = await readBarcodes(pixels, { formats: [], textMode: "HRI", tryHarder: true, maxNumberOfSymbols: 4 });
  return results.map((r) => `${r.symbologyIdentifier} ${r.text}`).sort();
}
