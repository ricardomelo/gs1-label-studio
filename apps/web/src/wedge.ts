// A scanner in keyboard mode, a "keyboard wedge" (backlog 7.1 h; the check studio's project, section 3.5): it types
// what it reads as keystrokes a few milliseconds apart, ended by Enter, faster than any person. The studio tells a
// scan from typing by that rhythm, so that a scan is checked at once and marked as a scanner's, and names the three
// things a scanner gets wrong rather than blaming the code: no symbology identifier sent, the group separator lost,
// and a keyboard layout that turns its characters into others.

import { en } from "./i18n.ts";

/** The longest pause between two keystrokes of a scan; a person types at 100 ms or more. */
export const WEDGE_GAP_MS = 50;
/** The fewest characters a scan has: anything shorter is a key pressed by hand. */
export const WEDGE_MIN_CHARS = 4;

/**
 * Listens to a field's keystrokes and says, at Enter, whether what came before it was a scan: at least four
 * characters, none more than 50 ms after the one before, and Enter as quickly after the last.
 */
export class WedgeListener {
  private chars: string[] = [];
  private last = Number.NEGATIVE_INFINITY;

  /** A character typed at a time in milliseconds; a pause longer than a scan's starts a new burst. */
  key(char: string, now: number): void {
    if (now - this.last > WEDGE_GAP_MS) this.chars = [];
    this.chars.push(char);
    this.last = now;
  }

  /** Enter pressed: the burst's text when it was a scan, else null. The burst is forgotten either way. */
  end(now: number): string | null {
    const scan = this.chars.length >= WEDGE_MIN_CHARS && now - this.last <= WEDGE_GAP_MS ? this.chars.join("") : null;
    this.chars = [];
    this.last = Number.NEGATIVE_INFINITY;
    return scan;
  }
}

/** A keyboard layout a scanner set to a US layout may be typing into, and what each of its characters really was. */
export interface Layout {
  id: string;
  /** The layout's name, in English for t(). */
  name: string;
  /** Each character the computer shows, mapped back to the one the scanner sent. */
  back: Record<string, string>;
}

const swap = (pairs: string): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const [a, b] of pairs.split(" ").map((p) => [...p] as [string, string])) {
    map[a] = b;
    map[b] = a;
  }
  return map;
};

/**
 * What a US-layout scanner's keystrokes become on the commonest other layouts, undone. The key right of P's
 * neighbour (US "]", the identifier's first character) shows as "+" on German, Spanish and Italian keyboards, "$" on a
 * French one and "[" on a Brazilian ABNT2 one; French AZERTY also needs Shift for digits, so a scan's digits arrive as
 * the characters on those keys, and swaps A/Q, Z/W and moves M; German QWERTZ swaps Y and Z.
 */
export const LAYOUTS: readonly Layout[] = [
  {
    id: "fr",
    name: en("AZERTY (France, Belgium)"),
    back: {
      "&": "1", "é": "2", '"': "3", "'": "4", "(": "5", "-": "6", "è": "7", "_": "8", "ç": "9", "à": "0",
      ")": "-", "$": "]", "^": "[", ",": "m", ";": ",", ":": ".", "!": "/", "?": "M", m: ";", M: ":",
      ...swap("aq AQ zw ZW"),
    },
  },
  { id: "de", name: en("QWERTZ (Germany, Austria)"), back: { "+": "]", "ü": "[", "ß": "-", "-": "/", "ö": ";", "ä": "'", ...swap("yz YZ") } },
  { id: "pt-BR", name: en("ABNT2 (Brazil)"), back: { "[": "]", ";": "/", "ç": ";", "~": "'" } },
  { id: "es", name: en("QWERTY (Spain)"), back: { "+": "]", "'": "-", "-": "/", "ñ": ";" } },
  { id: "it", name: en("QWERTY (Italy)"), back: { "+": "]", "è": "[", "'": "-", "-": "/", "ò": ";" } },
];

/** A scan's text as the scanner sent it, had the computer used a US layout. */
export const undoLayout = (text: string, layout: Layout): string => [...text].map((c) => layout.back[c] ?? c).join("");

const IDENTIFIER = /^\][A-Za-z][0-9A-Za-z]/;
const digitShare = (text: string) => (text.length ? [...text].filter((c) => c >= "0" && c <= "9").length / text.length : 0);

/**
 * The layouts that would explain a scan gone wrong, with the text it would have been: offered when undoing the layout
 * brings back a symbology identifier the text lacks, or turns a scan that is mostly not digits into one that mostly
 * is (AZERTY's digits). Layouts giving the same text are listed together; a text already well formed gets none.
 */
export function layoutRepairs(text: string): { layouts: Layout[]; text: string }[] {
  const repairs: { layouts: Layout[]; text: string }[] = [];
  for (const layout of LAYOUTS) {
    const repaired = undoLayout(text, layout);
    if (repaired === text) continue;
    const identifier = IDENTIFIER.test(repaired) && !IDENTIFIER.test(text);
    const digits = digitShare(repaired) >= 0.6 && digitShare(text) < 0.3;
    if (!identifier && !digits) continue;
    const same = repairs.find((r) => r.text === repaired);
    if (same) same.layouts.push(layout);
    else repairs.push({ layouts: [layout], text: repaired });
  }
  return repairs;
}
