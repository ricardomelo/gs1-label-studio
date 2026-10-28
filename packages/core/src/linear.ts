/**
 * EAN/UPC symbols as the GS1 General Specifications (section 5.2) encode them: EAN-13, UPC-A, EAN-8 and UPC-E (number
 * system 0). Ported from the resolver's `portal/linear.py` (ADR 0004) and checked against it: the modules ("1" a dark
 * module), which modules are guard bars (extended below the others), the quiet zones, the bar height and where the
 * human readable digits go, all in modules of the linear symbol (X = 0.330 mm at 100 %). bwip-js encodes the same bars
 * (the tests compare them); this module adds what a layout needs and bwip-js does not give.
 */
const L_CODES = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G_CODES = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R_CODES = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
// EAN-13: the parity of the six left characters, chosen by the first digit (which has no bars of its own)
const EAN13_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
// UPC-E, number system 0: the parity of the six characters, chosen by the check digit (G = even, L = odd)
const UPCE_PARITY = ["GGGLLL", "GGLGLL", "GGLLGL", "GGLLLG", "GLGGLL", "GLLGGL", "GLLLGG", "GLGLGL", "GLGLLG", "GLLGLG"];
const START = "101";
const CENTRE = "01010";
const END_UPCE = "010101";

export type LinearKind = "ean13" | "upca" | "upce" | "ean8";

export const BAR_HEIGHT: Record<LinearKind, number> = { ean13: 69.24, upca: 69.24, upce: 69.24, ean8: 55.24 }; // in X: 22.85 and 18.23 mm at 100 %
export const QUIET: Record<LinearKind, readonly [number, number]> = { ean13: [11, 7], upca: [9, 9], upce: [9, 7], ean8: [7, 7] }; // left, right, in X
export const GUARD_EXTENSION = 5.0; // guard bars reach this far below the others, in X
export const DIGIT_HEIGHT = 8.33; // height of the human readable digits, in X (about 2.75 mm at 100 %)
export const SMALL_DIGIT = 0.75; // UPC-A's and UPC-E's outer digits are smaller
export const LINEAR_NAMES: Record<LinearKind, string> = { ean13: "EAN-13", upca: "UPC-A", upce: "UPC-E", ean8: "EAN-8" };

/** The key cannot be carried by an EAN/UPC symbol (or not by the one asked). */
export class NotPossible extends Error {
  constructor(value: string) {
    super(value);
    this.name = "NotPossible";
  }
}

function checkDigitOf(body: string): string {
  let total = 0;
  [...body].reverse().forEach((d, i) => (total += Number(d) * (i % 2 === 0 ? 3 : 1)));
  return String((10 - (total % 10)) % 10);
}

/** The six UPC-E digits of a UPC-A (12 digits, number system 0), or null when it does not zero-suppress. */
export function upceFromUpca(upca: string): string | null {
  if (upca.length !== 12 || upca[0] !== "0") return null;
  const m = upca.slice(1, 6);
  const p = upca.slice(6, 11);
  if (["000", "100", "200"].includes(m.slice(2)) && p.slice(0, 2) === "00") return m.slice(0, 2) + p.slice(2) + m[2];
  if (m.slice(3) === "00" && p.slice(0, 3) === "000") return m.slice(0, 3) + p.slice(3) + "3";
  if (m[4] === "0" && p.slice(0, 4) === "0000") return m.slice(0, 4) + p[4] + "4";
  if (m[4] !== "0" && p.slice(0, 4) === "0000" && "56789".includes(p[4]!)) return m + p[4];
  return null;
}

/**
 * [symbol, digits] for a GTIN-14 value: "auto" chooses by the GTIN's length — EAN-8 for a GTIN-8 (six leading zeros),
 * UPC-A for a GTIN-12 (two), EAN-13 for a GTIN-13 (one) —, "upce" asks for UPC-E (a GTIN-12 that zero-suppresses).
 * Throws NotPossible for anything else (an indicator other than 0, a value that is not 14 digits).
 */
export function symbolFor(gtin14: string, choice: "auto" | "upce"): [LinearKind, string] {
  if (!/^0\d{13}$/.test(gtin14)) throw new NotPossible(gtin14);
  if (choice === "upce") {
    if (gtin14.slice(0, 2) !== "00" || gtin14.slice(0, 6) === "000000") throw new NotPossible(gtin14);
    const digits = upceFromUpca(gtin14.slice(2));
    if (digits === null) throw new NotPossible(gtin14);
    return ["upce", "0" + digits + gtin14.at(-1)];
  }
  if (choice !== "auto") throw new NotPossible(choice);
  if (gtin14.slice(0, 6) === "000000") return ["ean8", gtin14.slice(6)];
  if (gtin14.slice(0, 2) === "00") return ["upca", gtin14.slice(2)];
  return ["ean13", gtin14.slice(1)];
}

/** A digit under the bars: its text, its centre in modules from the first module, its size relative to the others. */
export type LinearDigit = readonly [text: string, centre: number, relative: number];

export interface LinearEncoded {
  kind: LinearKind;
  /** "1" a dark module. */
  modules: string;
  /** The modules of the guard bars (and UPC-A's first and last characters), extended below the others. */
  extended: Set<number>;
  quiet: readonly [number, number];
  barHeight: number;
  digits: LinearDigit[];
}

const characters = (text: string, codes: string[]) => [...text].map((d) => codes[Number(d)]).join("");

/**
 * The modules and human readable digits of an EAN-13 (13 digits), UPC-A (12), EAN-8 (8) or UPC-E (8: number system,
 * six digits, check digit). The check digit is verified.
 */
export function encodeLinear(kind: LinearKind, digits: string): LinearEncoded {
  if (!/^\d+$/.test(digits)) throw new NotPossible(digits);
  if (kind === "upce") {
    if (digits.length !== 8 || digits[0] !== "0") throw new NotPossible(digits);
    const upca = "0" + upcaBody(digits.slice(1, 7));
    if (checkDigitOf(upca) !== digits[7]) throw new NotPossible(digits);
  } else if (checkDigitOf(digits.slice(0, -1)) !== digits.at(-1)) {
    throw new NotPossible(digits);
  }
  let modules: string;
  let extended: Set<number>;
  let texts: LinearDigit[];
  if (kind === "ean13" && digits.length === 13) {
    const parity = EAN13_PARITY[Number(digits[0])]!;
    const left = [...digits.slice(1, 7)].map((d, i) => (parity[i] === "L" ? L_CODES : G_CODES)[Number(d)]).join("");
    modules = START + left + CENTRE + characters(digits.slice(7), R_CODES) + START;
    extended = guards(modules.length, 6, 6);
    texts = [[digits[0]!, -QUIET.ean13[0] / 2 - 1, 1.0], ...under(digits.slice(1, 7), 3), ...under(digits.slice(7), 3 + 42 + 5)];
  } else if (kind === "upca" && digits.length === 12) {
    modules = START + characters(digits.slice(0, 6), L_CODES) + CENTRE + characters(digits.slice(6), R_CODES) + START;
    extended = guards(modules.length, 6, 6); // and the first and last characters
    for (let i = 3; i < 10; i++) extended.add(i);
    for (let i = 85; i < 92; i++) extended.add(i);
    texts = [[digits[0]!, -QUIET.upca[0] / 2, SMALL_DIGIT], ...under(digits.slice(1, 6), 10),
      ...under(digits.slice(6, 11), 3 + 42 + 5), [digits[11]!, modules.length + QUIET.upca[1] / 2, SMALL_DIGIT]];
  } else if (kind === "ean8" && digits.length === 8) {
    modules = START + characters(digits.slice(0, 4), L_CODES) + CENTRE + characters(digits.slice(4), R_CODES) + START;
    extended = guards(modules.length, 4, 4);
    texts = [...under(digits.slice(0, 4), 3), ...under(digits.slice(4), 3 + 28 + 5)];
  } else if (kind === "upce") {
    const parity = UPCE_PARITY[Number(digits[7])]!;
    const body = [...digits.slice(1, 7)].map((d, i) => (parity[i] === "L" ? L_CODES : G_CODES)[Number(d)]).join("");
    modules = START + body + END_UPCE;
    extended = new Set([0, 1, 2, ...Array.from({ length: 6 }, (_, i) => modules.length - 6 + i)]);
    texts = [[digits[0]!, -QUIET.upce[0] / 2, SMALL_DIGIT], ...under(digits.slice(1, 7), 3),
      [digits[7]!, modules.length + QUIET.upce[1] / 2, SMALL_DIGIT]];
  } else {
    throw new NotPossible(kind);
  }
  return { kind, modules, extended, quiet: QUIET[kind], barHeight: BAR_HEIGHT[kind], digits: texts };
}

function guards(length: number, leftChars: number, rightChars: number): Set<number> {
  void rightChars;
  const centre = 3 + 7 * leftChars;
  return new Set([0, 1, 2, centre, centre + 1, centre + 2, centre + 3, centre + 4, length - 3, length - 2, length - 1]);
}

/** Digits centred under their 7-module characters, the first starting at module `first`. */
function under(text: string, first: number): LinearDigit[] {
  return [...text].map((d, i) => [d, first + 7 * i + 3.5, 1.0] as const);
}

/** The UPC-A digits (manufacturer and product, 10) a UPC-E's six digits stand for. */
function upcaBody(e: string): string {
  const last = e[5]!;
  if ("012".includes(last)) return e.slice(0, 2) + last + "00" + "00" + e.slice(2, 5);
  if (last === "3") return e.slice(0, 3) + "00" + "000" + e.slice(3, 5);
  if (last === "4") return e.slice(0, 4) + "0" + "0000" + e[4];
  return e.slice(0, 5) + "0000" + last;
}
