/// <reference lib="webworker" />
import type { DecodedSymbol } from "@gs1-label-studio/core";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

// The Check Studio's decoder (backlog 7.1 g): frames of the camera and pictures read by ZXing off the page, so the
// camera's picture stays smooth. Each symbol is returned with its bytes and symbology identifier as decoded, before
// any text mode (reading.ts; docs/conformance.md, 3.1). The WebAssembly comes from this application, not a CDN.

export interface DecodeMessage {
  id: number;
  image: ImageData;
  /** A picture is read harder (slower, finds more) than a camera frame, which the next frame can retry. */
  harder: boolean;
}

export type DecodeReply = { id: number; symbols: DecodedSymbol[] } | { id: number; error: string };

const ready = prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) },
  fireImmediately: true,
});

self.onmessage = async (event: MessageEvent<DecodeMessage>) => {
  const { id, image, harder } = event.data;
  try {
    await ready;
    // Up to 16 symbols: a logistic label or a medicine's pack in one frame (the project's section 3.2)
    const results = await readBarcodes(image, { formats: [], textMode: "Plain", tryHarder: harder, maxNumberOfSymbols: 16 });
    const symbols: DecodedSymbol[] = results
      .filter((r) => r.isValid)
      .map((r) => ({
        format: r.format,
        symbologyIdentifier: r.symbologyIdentifier,
        bytes: r.bytes,
        hasECI: r.hasECI,
        ecLevel: r.ecLevel,
        version: r.version,
        isMirrored: r.isMirrored,
        isInverted: r.isInverted,
        position: r.position,
      }));
    (self as unknown as Worker).postMessage({ id, symbols } satisfies DecodeReply);
  } catch (error) {
    (self as unknown as Worker).postMessage({ id, error: String(error) } satisfies DecodeReply);
  }
};
