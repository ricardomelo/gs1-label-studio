import { bytesToText, type Reading, type ReadingCarrier, type ReadingSource } from "./reading.ts";
import { InputError } from "./syntax.ts";
import { readWork, workFile, type Work } from "./work.ts";

// Shared links (backlog 7.1 l; the check studio's project, section 7.4; ADR 0007 decision 18): what a link carries is
// in the address's fragment, "#/check?r=…" for a reading and "#/label?w=…" for a work, so GitHub Pages never sees it;
// whoever receives the message does. The data is JSON, compressed with deflate (the browser's own CompressionStream,
// no library) and written in base64url. A link longer than LINK_LIMIT characters is not offered: a message then
// carries the text and the file only. Opening a reading's link checks it again under the release that opens it.

/** The longest link offered, whole address included (the project's section 7.4). */
export const LINK_LIMIT = 2000;
/** The version of what a link carries; a newer one is refused with a message to reload. */
const LINK_VERSION = 1;

/** A reading as a link carries it, with the place it is scanned when one was chosen. */
export interface LinkedReading {
  reading: Reading;
  environment: string | null;
}

const SOURCES: readonly ReadingSource[] = ["camera", "image", "nfc", "wedge", "paste"];
const CARRIERS: readonly ReadingCarrier[] = ["barcode", "nfc", "rfid"];

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new RangeError();
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function through(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** A text compressed and written for an address: deflate, then base64url. */
export async function packText(text: string): Promise<string> {
  return base64url(await through(new TextEncoder().encode(text), new CompressionStream("deflate-raw")));
}

/** The text packText() wrote; an InputError when the link was cut or changed on its way. */
export async function unpackText(packed: string): Promise<string> {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(await through(fromBase64url(packed), new DecompressionStream("deflate-raw")));
  } catch {
    throw new InputError("This link is incomplete: ask for it again, or copy all of it.");
  }
}

/** A link no longer than LINK_LIMIT, else null. */
export function linkWithin(link: string): string | null {
  return link.length <= LINK_LIMIT ? link : null;
}

/** What a reading's link carries: its bytes and what was known of the symbol; the check is made again on opening. */
export async function readingParam(reading: Reading, environment: string | null): Promise<string> {
  const value = {
    v: LINK_VERSION,
    b: base64url(reading.bytes),
    s: reading.symbologyIdentifier,
    f: reading.format,
    c: reading.carrier,
    o: reading.source,
    a: reading.identifierAssumed,
    t: reading.at,
    // The text when it is not the bytes read as text: an EPC's is the hexadecimal typed
    ...(reading.text !== bytesToText(reading.bytes) ? { x: reading.text } : {}),
    ...(reading.nfc ? { r: reading.nfc } : {}),
    ...(reading.eci ? { e: true } : {}),
    ...(reading.ecLevel ? { l: reading.ecLevel } : {}),
    ...(reading.version ? { n: reading.version } : {}),
    ...(reading.mirrored ? { m: true } : {}),
    ...(reading.inverted ? { i: true } : {}),
    ...(environment ? { p: environment } : {}),
  };
  return packText(JSON.stringify(value));
}

const isText = (v: unknown): v is string => typeof v === "string";
const optionalText = (v: unknown): v is string | null | undefined => v === undefined || v === null || isText(v);

const isNfc = (v: unknown): boolean => {
  const n = v as Record<string, unknown>;
  return typeof v === "object" && v !== null && optionalText(n.serialNumber) && Number.isInteger(n.recordIndex) && isText(n.recordType);
};

/** The reading a link carries, as readingParam() wrote it. */
export async function readingFromParam(param: string): Promise<LinkedReading> {
  let value: unknown;
  try {
    value = JSON.parse(await unpackText(param));
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError("This link is incomplete: ask for it again, or copy all of it.");
  }
  const v = value as Record<string, unknown>;
  if (typeof value !== "object" || value === null || !Number.isInteger(v.v)) throw new InputError("This link is incomplete: ask for it again, or copy all of it.");
  if ((v.v as number) > LINK_VERSION) throw new InputError("This link was made by a newer version of GS1 Label Studio: reload the page to update it, then open it again.");
  const valid = isText(v.b) && /^[A-Za-z0-9_-]*$/.test(v.b) && v.b.length % 4 !== 1 && optionalText(v.s) && optionalText(v.f) && CARRIERS.includes(v.c as ReadingCarrier)
    && SOURCES.includes(v.o as ReadingSource) && typeof v.a === "boolean" && isText(v.t) && optionalText(v.l) && optionalText(v.n) && optionalText(v.p) && optionalText(v.x) && (v.r === undefined || isNfc(v.r));
  if (!valid) throw new InputError("This link is incomplete: ask for it again, or copy all of it.");
  const bytes = fromBase64url(v.b as string);
  return {
    reading: {
      at: v.t as string,
      source: v.o as ReadingSource,
      carrier: v.c as ReadingCarrier,
      symbologyIdentifier: (v.s as string | null | undefined) ?? null,
      format: (v.f as string | null | undefined) ?? null,
      bytes,
      text: (v.x as string | undefined) ?? bytesToText(bytes),
      eci: v.e === true,
      ecLevel: (v.l as string | undefined) ?? null,
      version: (v.n as string | undefined) ?? null,
      mirrored: v.m === true,
      inverted: v.i === true,
      position: null,
      image: null,
      nfc: (v.r as Reading["nfc"] | undefined) ?? null,
      identifierAssumed: v.a as boolean,
    },
    environment: (v.p as string | undefined) ?? null,
  };
}

/** What a work's link carries: the work file, compact. */
export async function workParam(work: Work, saved: Date = new Date()): Promise<string> {
  return packText(JSON.stringify(JSON.parse(workFile(work, saved))));
}

/** The work a link carries, read as a work file is (readWork's checks and messages). */
export async function workFromParam(param: string): Promise<Work> {
  return readWork(await unpackText(param));
}
