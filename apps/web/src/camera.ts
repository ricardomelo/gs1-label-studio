import { bytesToHex, readingFromDecoder, type DecodedSymbol, type Reading } from "@gs1-label-studio/core";
import type { DecodeMessage, DecodeReply } from "./decode.worker.ts";

// The Check Studio's camera and pictures (backlog 7.1 g; the check studio's project, sections 3.2 and 3.3; ADR 0007
// decision 13). Frames and pictures are read by ZXing in a worker (decode.worker.ts), the decoder the tests use, for
// their bytes and symbology identifier: the browser's BarcodeDetector gives neither. Nothing leaves the device and no
// frame is kept. What can be said without a screen lives here, so that unit tests reach it.

/** Why the camera is not showing: refused, none on this device, held by another application, or another reason. */
export type CameraProblem = "refused" | "none" | "busy" | "insecure" | "other";

/** The problem a failed getUserMedia() names (its DOMException's name). */
export function cameraProblem(error: unknown): CameraProblem {
  const name = (error as { name?: string } | null)?.name ?? "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "refused";
    case "NotFoundError":
    case "OverconstrainedError":
      return "none";
    case "NotReadableError":
    case "AbortError":
      return "busy";
    default:
      return "other";
  }
}

/** What the video track offers beyond the picture: a torch, and a zoom with its range (Chrome on Android). */
export interface TrackControls {
  torch: boolean;
  zoom: { min: number; max: number; step: number } | null;
}

/** The controls a track's capabilities offer; a zoom that cannot change is no zoom. */
export function trackControls(capabilities: Record<string, unknown> | undefined): TrackControls {
  const zoom = capabilities?.zoom as { min?: number; max?: number; step?: number } | undefined;
  const usable = zoom && typeof zoom.min === "number" && typeof zoom.max === "number" && zoom.max > zoom.min;
  return {
    torch: capabilities?.torch === true || (Array.isArray(capabilities?.torch) && (capabilities.torch as unknown[]).includes(true)),
    zoom: usable ? { min: zoom.min!, max: zoom.max!, step: zoom.step && zoom.step > 0 ? zoom.step : 0.1 } : null,
  };
}

/** What makes two readings the same symbol: its identifier and its bytes. */
export const readingKey = (reading: Reading): string => `${reading.symbologyIdentifier ?? ""} ${bytesToHex(reading.bytes)}`;

/** How long the camera counts the same symbol once (the project's section 3.2). */
export const SAME_READING_MS = 3000;

/**
 * The camera's memory of what it has just read: a symbol read again within three seconds counts once, so a code held
 * in front of the camera gives one result, not one a frame.
 */
export class RecentReadings {
  private seen = new Map<string, number>();
  constructor(private readonly within = SAME_READING_MS) {}
  /** True when this symbol is new, or was last read more than the interval ago; the time is kept either way. */
  isNew(key: string, now: number): boolean {
    const last = this.seen.get(key);
    this.seen.set(key, now);
    for (const [k, at] of this.seen) if (now - at > this.within) this.seen.delete(k);
    return last === undefined || now - last > this.within;
  }
}

/** The readings of what ZXing found in a frame or a picture, in the order found. */
export function readingsOf(symbols: readonly DecodedSymbol[], source: "camera" | "image", image: { width: number; height: number }, at = new Date()): Reading[] {
  return symbols.map((symbol) => readingFromDecoder(symbol, { source, image, at }));
}

/**
 * The symbology identifiers of linear symbols that may carry a Composite Component: ZXing reads the linear part and
 * leaves the 2D part out (docs/conformance.md, 3.1), so a reading of one says so.
 */
const COMPOSITE_HOSTS = new Set(["]E0", "]E4", "]C1", "]e0"]);

/** True when the reading came from a picture or the camera and its symbol could have a 2D part this decoder leaves out. */
export const mayHaveComposite = (reading: Reading): boolean =>
  (reading.source === "camera" || reading.source === "image") && COMPOSITE_HOSTS.has(reading.symbologyIdentifier ?? "");

/** The longest side a picture is read at: larger photographs are scaled down, which ZXing reads faster and as well. */
export const PICTURE_MAX_SIDE = 2400;

/** The size a picture is drawn at to be read: its own, or scaled so that its longest side is the limit. */
export function pictureSize(width: number, height: number, max = PICTURE_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, { resolve: (s: DecodedSymbol[]) => void; reject: (e: Error) => void }>();

/** Reads the symbols in an image in the decoding worker, started on the first call and kept for the next. */
export function decodeImage(image: ImageData, harder: boolean): Promise<DecodedSymbol[]> {
  if (!worker) {
    worker = new Worker(new URL("./decode.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<DecodeReply>) => {
      const reply = event.data;
      const pending = waiting.get(reply.id);
      if (!pending) return;
      waiting.delete(reply.id);
      if ("error" in reply) pending.reject(new Error(reply.error));
      else pending.resolve(reply.symbols);
    };
  }
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    const message: DecodeMessage = { id, image, harder };
    worker!.postMessage(message, [image.data.buffer]);
  });
}

/** Draws a picture (any image the browser decodes, SVG included) to pixels, at most PICTURE_MAX_SIDE on its longest side. */
export async function picturePixels(blob: Blob): Promise<{ pixels: ImageData; url: string; width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  const size = pictureSize(image.naturalWidth || 1, image.naturalHeight || 1);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(image, 0, 0, size.width, size.height);
  return { pixels: context.getImageData(0, 0, size.width, size.height), url, ...size };
}

/** A short tone and a vibration where the browser allows them, when the camera reads a code. */
export function signalRead(): void {
  try {
    navigator.vibrate?.(60);
  } catch {
    // not offered
  }
  try {
    const Audio = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) return;
    const audio = new Audio();
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.frequency.value = 1760;
    gain.gain.value = 0.08;
    tone.connect(gain).connect(audio.destination);
    tone.start();
    tone.stop(audio.currentTime + 0.08);
    tone.onended = () => void audio.close();
  } catch {
    // no sound here
  }
}
