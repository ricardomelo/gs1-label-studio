import { readFileSync } from "node:fs";
import { HriFont } from "../src/index.ts";

/** The HRI font, as the web application loads it. */
export function hriFont(): HriFont {
  const bytes = readFileSync(new URL("../assets/fonts/LiberationSans-Regular.ttf", import.meta.url));
  return HriFont.fromBytes(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}
