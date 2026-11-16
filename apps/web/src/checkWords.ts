import { formatDate, type Finding, type Reading, type Verdict } from "@gs1-label-studio/core";
import { en, locale, t } from "./i18n.ts";

// The words of the Check Studio's result (backlog 7.1 f), shared by the screen and the reports (7.1 k), so that a
// report says what the screen says: the verdicts, the severities, what was not checked, where a reading came from,
// a value made readable and a finding's details in plain words.

/** A missing separator in text a keyboard gave: the code may lack it, or the scanner may have dropped it (section 3.5). */
export const B3_KEYBOARD = {
  what: en("Either the code lacks a separator after a value whose length varies, or your scanner removes it."),
  scanner: en("Many scanners drop the separator in keyboard mode. If the code was scanned, set the scanner to send the separator as a visible stand-in the studio accepts, such as <GS>, and scan again: if the problem goes, the code is right."),
};
/** Where a reading came from, as the expert view's Reading panel names it. */
export const SOURCE_NAMES: Record<Reading["source"], string> = {
  camera: en("Camera"),
  image: en("Picture"),
  nfc: en("NFC tag"),
  wedge: en("A scanner in keyboard mode"),
  paste: en("Pasted or typed"),
};

export const VERDICTS: Record<Verdict, { icon: string; word: string; line: string }> = {
  follows: { icon: "✓", word: en("Follows the GS1 rules"), line: en("No errors and no warnings.") },
  remarks: { icon: "!", word: en("Works, with remarks"), line: en("No errors, but some things are worth correcting.") },
  "does-not-follow": { icon: "✕", word: en("Does not follow the GS1 rules"), line: en("At least one error: see what is wrong below.") },
  "not-gs1": { icon: "–", word: en("Not a GS1 code"), line: en("Nothing here for a GS1 system to read.") },
  "not-assessed": { icon: "?", word: en("Could not be checked"), line: en("Nothing could be read to check.") },
};
/** What a code listed as not assessed could not say, and what would let it be checked. */
export const NOT_CHECKED: Record<string, string> = {
  C8: en("Whether the company prefix is licensed: that needs GS1's table of company prefixes."),
  F1: en("Whether this type of symbol suits where it is scanned: that needs the place, and data that can be read."),
  F3: en("Whether a 2D symbol alone suits a shop till: that needs the place."),
  I1: en("The tag's EPC: that needs the EPC tables."),
  I2: en("The tag's EPC: that needs the EPC tables."),
  H1: en("Sizes and margins: those need a picture with a known scale."),
  J5: en("The distance between symbols: that needs a picture with a known scale."),
};
export const SEVERITIES: Record<Finding["severity"], string> = {
  error: en("Error"),
  warning: en("Warning"),
  note: en("Note"),
  "not-assessed": en("Not checked"),
};

const DATE_AIS = new Set(["11", "12", "13", "15", "16", "17", "7006"]);

/** An element's value made readable: a date in the user's language, day 00 as the date it stands for. */
export function readable(ai: string, value: string, today: Date): string {
  if (DATE_AIS.has(ai) && /^\d{6}$/.test(value)) {
    const month = Number(value.slice(2, 4));
    const day = Number(value.slice(4, 6));
    if (month < 1 || month > 12) return value;
    try {
      const iso = formatDate(value, "YYYY-MM-DD", { today });
      const date = new Date(`${iso}T12:00:00Z`);
      if (Number.isNaN(date.getTime()) || Number(iso.slice(8)) !== (day || Number(iso.slice(8)))) return value;
      return new Intl.DateTimeFormat(locale(), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
    } catch {
      return value;
    }
  }
  if (/^3[1-6]\d\d$/.test(ai) && /^\d{6}$/.test(value)) {
    const decimals = Number(ai[3]);
    return (Number(value) / 10 ** decimals).toLocaleString(locale(), { minimumFractionDigits: decimals });
  }
  return value;
}

/** What a finding's details say in plain words, the ones the simple view shows. */
export function detailLines(finding: Finding): string[] {
  const d = finding.details ?? {};
  const lines: string[] = [];
  if (d.expected) lines.push(t("The check digit that would be right: {expected}", { expected: d.expected }));
  if (d.reordered) lines.push(t("Read the other way round: {reordered}", { reordered: d.reordered }));
  if (d.required) lines.push(t("Needed with it: {required}", { required: d.required }));
  if (d.allowed) lines.push(t("Symbols allowed here: {allowed}", { allowed: d.allowed }));
  if (d.uri) lines.push(t("The address made right: {uri}", { uri: d.uri }));
  else if (d.canonical) lines.push(t("In GS1's standard form: {canonical}", { canonical: d.canonical }));
  return lines;
}
