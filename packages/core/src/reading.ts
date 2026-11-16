// What the Check Studio is given (backlog 7.1 a; the check studio's project, section 3): one reading of a barcode or a
// tag, whatever the way in, as the record every check starts from. A decoder's result keeps the symbol's bytes and
// its symbology identifier (ISO/IEC 15424, General Specifications 5.1.3) as decoded, before any text mode: a reader
// that rewrites GS1 data with parentheses would hide parentheses that were really encoded. A scanner's or pasted text
// keeps what it says, its identifier when it carries one, its group separators however they were written. An NFC
// tag's NDEF message and an RFID tag's EPC come in as what they hold. The checks themselves are item 7.1 b.

import { firstUriRecord, ndefRecords } from "./ndef.ts";

/** How the reading came in: the camera, an image, an NFC tag, a scanner in keyboard mode, pasted or typed text. */
export type ReadingSource = "camera" | "image" | "nfc" | "wedge" | "paste";

/** What carried the data: a barcode, an NFC tag, an RFID tag. */
export type ReadingCarrier = "barcode" | "nfc" | "rfid";

export interface Reading {
  /** When it was read, as an ISO 8601 date and time in UTC. */
  at: string;
  source: ReadingSource;
  carrier: ReadingCarrier;
  /** The symbology identifier, "]d2" or "]Q3", as the decoder or the scanner gave it; null when none was given. */
  symbologyIdentifier: string | null;
  /** The decoder's name for the symbology ("DataMatrix", "Code128"); null for text and tags. */
  format: string | null;
  /** What the symbol or tag carries, as decoded: a group separator is byte 29. */
  bytes: Uint8Array;
  /** The bytes as text (`bytesToText`), control characters kept. */
  text: string;
  /** What the decoder reports of the symbol: an ECI, its error correction level, its version, mirrored or inverted. */
  eci: boolean;
  ecLevel: string | null;
  version: string | null;
  mirrored: boolean;
  inverted: boolean;
  /** The symbol's four corners in the image's pixels (top left, top right, bottom right, bottom left), when found. */
  position: [number, number][] | null;
  image: { width: number; height: number } | null;
  /** An NFC tag: its serial number when the browser gives it, and the record read. */
  nfc: { serialNumber: string | null; recordIndex: number; recordType: string } | null;
  /** True when nothing said which symbology carried the data: a scanner's text without an identifier, a paste. */
  identifierAssumed: boolean;
}

/** A decoder's result as the Check Studio needs it (ZXing's `ReadResult` has these fields). */
export interface DecodedSymbol {
  format: string;
  symbologyIdentifier: string;
  bytes: Uint8Array;
  hasECI?: boolean;
  ecLevel?: string;
  version?: string;
  isMirrored?: boolean;
  isInverted?: boolean;
  position?: Record<"topLeft" | "topRight" | "bottomRight" | "bottomLeft", { x: number; y: number }>;
}

export interface ReadingOptions {
  /** When it was read; now when not given. */
  at?: Date;
}

const GROUP_SEPARATOR = "\u001d";

const blank = (source: ReadingSource, carrier: ReadingCarrier, at: Date | undefined) => ({
  at: (at ?? new Date()).toISOString(), source, carrier, format: null, eci: false, ecLevel: null, version: null,
  mirrored: false, inverted: false, position: null, image: null, nfc: null,
});

/** A reading from a decoder's result: the camera's or an image's symbol, its bytes and identifier as decoded. */
export function readingFromDecoder(symbol: DecodedSymbol, options: ReadingOptions & { source: "camera" | "image"; image?: { width: number; height: number } }): Reading {
  const corners = symbol.position;
  return {
    ...blank(options.source, "barcode", options.at),
    symbologyIdentifier: symbol.symbologyIdentifier || null,
    format: symbol.format || null,
    bytes: Uint8Array.from(symbol.bytes),
    text: bytesToText(symbol.bytes),
    eci: symbol.hasECI ?? false,
    ecLevel: symbol.ecLevel || null,
    version: symbol.version || null,
    mirrored: symbol.isMirrored ?? false,
    inverted: symbol.isInverted ?? false,
    position: corners ? [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft].map(({ x, y }) => [x, y] as [number, number]) : null,
    image: options.image ?? null,
    identifierAssumed: false,
  };
}

/**
 * The ways a group separator is written where a control character cannot be typed: `{GS}`, `<GS>` and `[GS]` in any
 * case, the control picture ␝, and the escapes `\x1d`, `\u001d` and `^]` (a terminal's Ctrl+]).
 */
const SEPARATOR_FORMS = /\{GS\}|<GS>|\[GS\]|␝|\\x1d|\\u001d|\^\]/gi;

/** A symbology identifier at the start of a scanner's text: `]`, a flag character and a modifier (ISO/IEC 15424). */
const IDENTIFIER = /^\][A-Za-z][0-9A-Za-z]/;

/**
 * A reading from a scanner in keyboard mode or from pasted or typed text: the line ending a scanner adds left out, a
 * symbology identifier at the start taken as the reading's, every written form of the group separator made byte 29.
 * Anything else stays as it is, parentheses included: whether they belong there is for the checks to say.
 */
export function readingFromText(input: string, options: ReadingOptions & { source: "wedge" | "paste" }): Reading {
  let text = input.replace(/\r?\n$|\r$/, "").replace(SEPARATOR_FORMS, GROUP_SEPARATOR);
  const identifier = IDENTIFIER.exec(text)?.[0] ?? null;
  if (identifier) text = text.slice(identifier.length);
  return {
    ...blank(options.source, "barcode", options.at),
    symbologyIdentifier: identifier,
    bytes: new TextEncoder().encode(text),
    text,
    identifierAssumed: identifier === null,
  };
}

/**
 * A reading from an NFC tag's NDEF message: its first URI record, wherever it is (the check says when it is not the
 * first record, I3), else its first record as text; the tag's serial number when the browser gives it.
 */
export function readingFromNdef(message: Uint8Array, options: ReadingOptions & { serialNumber?: string | null }): Reading {
  const found = firstUriRecord(message);
  const first = found ? null : ndefRecords(message)[0];
  const text = found ? found.uri : first ? bytesToText(first.payload) : "";
  return {
    ...blank("nfc", "nfc", options.at),
    symbologyIdentifier: null,
    bytes: new TextEncoder().encode(text),
    text,
    nfc: { serialNumber: options.serialNumber ?? null, recordIndex: found?.index ?? 0, recordType: found ? "U" : (first?.type ?? "") },
    identifierAssumed: false,
  };
}

/**
 * A reading from an RFID tag's EPC, pasted or typed by a reader in keyboard mode: its hexadecimal (spaces left out),
 * whose bytes are the EPC memory's, or a tag URI or pure identity URI, kept as text.
 */
export function readingFromEpc(input: string, options: ReadingOptions & { source: "wedge" | "paste" }): Reading {
  const trimmed = input.trim();
  const hex = trimmed.replace(/\s+/g, "");
  const isHex = /^(?:[0-9A-Fa-f]{2})+$/.test(hex);
  return {
    ...blank(options.source, "rfid", options.at),
    symbologyIdentifier: null,
    bytes: isHex ? Uint8Array.from(hex.match(/../g)!, (pair) => parseInt(pair, 16)) : new TextEncoder().encode(trimmed),
    text: isHex ? hex.toUpperCase() : trimmed,
    identifierAssumed: false,
  };
}

/** Bytes as text: UTF-8 when they are valid UTF-8 (a GS1 Digital Link URI may carry it), else one character a byte. */
export function bytesToText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return String.fromCharCode(...bytes);
  }
}

/** Bytes as hexadecimal pairs, upper case, a space between them: "30 31 1D". */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

/** Text with each control character shown as its Unicode control picture, so that a group separator reads ␝. */
export function withControlPictures(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f]/g, (c) => (c === "\u007f" ? "\u2421" : String.fromCharCode(0x2400 + c.charCodeAt(0))));
}
