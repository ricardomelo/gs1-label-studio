import { aiEntry } from "./dictionary.ts";
import { predefinedLength } from "./elementString.ts";
import type { Reading } from "./reading.ts";

// The Check Studio's named repairs (backlog 7.1 b; the check studio's project, section 4): when the data is not valid
// as it stands, the studio does not guess. It tries a named repair (assume the missing FNC1, strip the parentheses,
// strip spaces and printed titles, make a stand-in a separator, insert a separator), splits the result into element
// strings again, and keeps the repair when it leaves fewer faults: the repair is the diagnosis, and the fix. Every
// character keeps the offset of the byte it came from, so that a fault found after a repair still points at the
// reading's own bytes.

/** The repairs, each named after what it undoes. */
export type RepairName =
  | "strip-flag-text"
  | "assume-fnc1"
  | "drop-leading-separator"
  | "strip-formatting"
  | "strip-parentheses"
  | "stand-in-separator"
  | "insert-separator"
  | "drop-separator";

/** The fault each repair proves when it is kept. */
export const REPAIR_PROVES: Readonly<Record<RepairName, readonly string[]>> = {
  "strip-flag-text": ["A4"],
  "assume-fnc1": ["A1", "A2", "A3"],
  "drop-leading-separator": ["A5"],
  "strip-formatting": ["B2"],
  "strip-parentheses": ["B1"],
  "stand-in-separator": ["B6"],
  "insert-separator": ["B3"],
  "drop-separator": ["B4", "B5"],
};

export const GS = "\u001d";

/**
 * Text whose every character remembers the reading's byte it came from: `at[i]` is the offset of character i, and
 * `at[text.length]` the offset after the last. A character a repair inserts takes the offset of the one after it.
 */
export interface Marked {
  text: string;
  at: number[];
}

/** A byte range in the reading, end excluded. */
export type Range = [number, number];

/** The reading's text, each character with the offset of its first byte (UTF-8 when the bytes are UTF-8, else one a byte). */
export function markedOf(reading: Pick<Reading, "text" | "bytes">): Marked {
  const at: number[] = [];
  const utf8 = new TextEncoder().encode(reading.text);
  const isUtf8 = utf8.length === reading.bytes.length && utf8.every((b, i) => b === reading.bytes[i]);
  let offset = 0;
  for (let i = 0; i < reading.text.length; i++) {
    at.push(offset);
    const code = reading.text.charCodeAt(i);
    if (!isUtf8) offset += 1;
    else if (code >= 0xd800 && code <= 0xdbff) offset += 0; // the high surrogate: its pair takes the four bytes
    else if (code >= 0xdc00 && code <= 0xdfff) offset += 4;
    else offset += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
  }
  at.push(offset);
  return { text: reading.text, at };
}

/** The bytes of characters i to j (j excluded). */
export function rangeOf(m: Marked, i: number, j: number): Range {
  return [m.at[i]!, m.at[j]!];
}

/** The text with characters i to j left out; the offsets of the rest kept. */
export function cut(m: Marked, i: number, j: number): Marked {
  return { text: m.text.slice(0, i) + m.text.slice(j), at: [...m.at.slice(0, i), ...m.at.slice(j)] };
}

/** The text with characters i to j made `s`, which takes the offset of character i. */
export function replace(m: Marked, i: number, j: number, s: string): Marked {
  return { text: m.text.slice(0, i) + s + m.text.slice(j), at: [...m.at.slice(0, i), ...Array<number>(s.length).fill(m.at[i]!), ...m.at.slice(j)] };
}

/** The text with `s` inserted before character i. */
export function insert(m: Marked, i: number, s: string): Marked {
  return { text: m.text.slice(0, i) + s + m.text.slice(i), at: [...m.at.slice(0, i), ...Array<number>(s.length).fill(m.at[i]!), ...m.at.slice(i)] };
}

/**
 * The GS1 flag written as text before the data (A4): the words FNC1 or <F1>, a symbology identifier typed in (]d2, ]C1,
 * ]Q3, ]e0), a printer's escape (~1, \F), or byte 232, a code set's FNC1 value, left in the data.
 */
const FLAG_TEXT = /^(?:FNC1|<F1>|\][dCQe][0-9]|~1|\\F|è)/;

export function flagText(m: Marked): number {
  return FLAG_TEXT.exec(m.text)?.[0].length ?? 0;
}

/** Characters a person or a program put where a separator should be (B6): <GS>, {GS} or [GS] as text, ^, ~, |, %. */
const STAND_INS = /<GS>|\{GS\}|\[GS\]|[\^~|%]/gi;

/** The text with every stand-in made a separator, and the stand-ins' ranges; null when there is none. */
export function standInsReplaced(m: Marked): { marked: Marked; ranges: Range[] } | null {
  const found = [...m.text.matchAll(STAND_INS)];
  if (found.length === 0) return null;
  let out = m;
  const ranges: Range[] = [];
  for (const match of found.reverse()) {
    const i = match.index!;
    ranges.unshift(rangeOf(m, i, i + match[0].length));
    out = replace(out, i, i + match[0].length, GS);
  }
  return { marked: out, ranges };
}

/**
 * Printed titles and spacing in the data (B2): white space anywhere, and a title such as "LOT", "EXP" or "GTIN:" before
 * an AI's parenthesis. Null when there is none.
 */
export function formattingStripped(m: Marked): { marked: Marked; ranges: Range[] } | null {
  const pattern = /(?:^|(?<=\s))[A-Za-z][A-Za-z./]*:?\s*(?=\(\d{2,4}\))|\s+/g;
  const found = [...m.text.matchAll(pattern)].filter((match) => match[0].length > 0);
  if (found.length === 0) return null;
  let out = m;
  const ranges: Range[] = [];
  for (const match of found.reverse()) {
    const i = match.index!;
    const range = rangeOf(m, i, i + match[0].length);
    // A space and the title after it are one span
    if (ranges[0] && ranges[0][0] === range[1]) ranges[0][0] = range[0];
    else ranges.unshift(range);
    out = cut(out, i, i + match[0].length);
  }
  return { marked: out, ranges };
}

/** An element string found in the data: its AI and value and where they are. */
export interface Token {
  ai: string;
  value: string;
  /** Characters of the AI's first digit (or its parenthesis) and after the value, in the marked text. */
  start: number;
  valueStart: number;
  end: number;
  /** A group separator follows it in the data. */
  separator: boolean;
  /** Its element string has a predefined length (figure 7.8.5-2). */
  predefined: boolean;
}

/** What splitting into element strings found about the structure, with the characters it concerns. */
export interface StructureEvent {
  code: "B1" | "B4" | "B5" | "B7" | "B11";
  /** Characters in the marked text. */
  spans: [number, number][];
  ai?: string;
}

export interface Split {
  marked: Marked;
  tokens: Token[];
  events: StructureEvent[];
  /** Every character belongs to an element string with a known AI. */
  complete: boolean;
}

/** The AI at the start of `text`: the dictionary's AIs are prefix-free, so at most one of 2, 3 or 4 digits is known. */
export function aiAt(text: string, i: number): string | null {
  for (const n of [2, 3, 4]) {
    const candidate = text.slice(i, i + n);
    if (/^\d+$/.test(candidate) && candidate.length === n && aiEntry(candidate)) return candidate;
  }
  return null;
}

/**
 * Element strings as a symbol carries them, after its FNC1: an AI, then its value — of its predefined length, or up to a
 * group separator or the end. A separator after a predefined length (B4) or at the end (B5) is noted and skipped, a
 * predefined-length element string after a variable-length one noted (B11), and an unknown AI stops the split (B7).
 */
export function splitUnbracketed(m: Marked): Split {
  const { text } = m;
  const tokens: Token[] = [];
  const events: StructureEvent[] = [];
  let i = 0;
  let afterVariable = false;
  while (i < text.length) {
    if (text[i] === GS) {
      events.push({ code: i === text.length - 1 ? "B5" : "B4", spans: [[i, i + 1]] });
      i++;
      continue;
    }
    const ai = aiAt(text, i);
    if (!ai) {
      events.push({ code: "B7", spans: [[i, text.length]] });
      return { marked: m, tokens, events, complete: false };
    }
    const fixed = predefinedLength(ai);
    const valueStart = i + ai.length;
    let end: number;
    if (fixed !== undefined) {
      const stop = text.indexOf(GS, valueStart);
      end = Math.min(i + fixed, stop === -1 ? text.length : stop, text.length);
      if (afterVariable) events.push({ code: "B11", spans: [[i, end]], ai });
    } else {
      const stop = text.indexOf(GS, valueStart);
      end = stop === -1 ? text.length : stop;
      afterVariable = true;
    }
    const separator = text[end] === GS;
    tokens.push({ ai, value: text.slice(valueStart, end), start: i, valueStart, end, separator, predefined: fixed !== undefined });
    if (separator) {
      // A separator after a variable-length value is where it belongs, unless nothing follows it
      if (fixed === undefined) {
        if (end === text.length - 1) events.push({ code: "B5", spans: [[end, end + 1]] });
        i = end + 1;
      } else i = end;
    } else i = end;
  }
  return { marked: m, tokens, events, complete: true };
}

/** Whether the data is written with the AIs between parentheses: "(01)09506000134352(10)ABC123". */
export function isBracketed(text: string): boolean {
  return /^\(\d{2,4}\)/.test(text);
}

/**
 * Element strings written with their AIs between parentheses, as people write them (B1 when a symbol carries them): the
 * parentheses delimit each value, whatever its length.
 */
export function splitBracketed(m: Marked): Split {
  const { text } = m;
  const tokens: Token[] = [];
  const events: StructureEvent[] = [];
  const marks = [...text.matchAll(/\((\d{2,4})\)/g)];
  const spans: [number, number][] = [];
  let complete = true;
  marks.forEach((match, index) => {
    const start = match.index!;
    const ai = match[1]!;
    const valueStart = start + match[0].length;
    const end = index + 1 < marks.length ? marks[index + 1]!.index! : text.length;
    spans.push([start, start + 1], [valueStart - 1, valueStart]);
    if (!aiEntry(ai)) {
      events.push({ code: "B7", spans: [[start, end]], ai });
      complete = false;
      return;
    }
    tokens.push({ ai, value: text.slice(valueStart, end), start, valueStart, end, separator: false, predefined: predefinedLength(ai) !== undefined });
  });
  events.unshift({ code: "B1", spans });
  return { marked: m, tokens, events, complete };
}
