import type { GroupColumn, GroupFinding, GroupKind, Reading } from "@gs1-label-studio/core";
import { en, t } from "./i18n.ts";
import { symbolName } from "./Picture.tsx";

// The Check Studio's group on screen (backlog 7.1 i; the check studio's project, section 5): several readings the user
// says belong to one item, checked together by the core's checkGroup(). This module holds what the screen needs and
// a test can reach without a browser: the kind of group guessed from the readings, a reading already in the group,
// a column's name, and what a group finding's details say in plain words.

/** A reading in the group; one left unticked stays listed but is left out of the check (section 5.1). */
export interface Member {
  reading: Reading;
  on: boolean;
}

/** The kinds of group, as the user names them (section 5.1): the rules differ. */
export const GROUP_KINDS: readonly { value: GroupKind; text: string }[] = [
  { value: "consumer-pack", text: en("A consumer pack") },
  { value: "case", text: en("A case") },
  { value: "logistic-label", text: en("A logistic label") },
  { value: "tag-and-code", text: en("A tag with its printed code") },
];

/** The kind a group most likely is, until the user says: a tag beside a code, a label with an SSCC, a case's GS1-128. */
export function guessKind(readings: readonly Reading[]): GroupKind {
  if (readings.some((r) => r.carrier !== "barcode")) return "tag-and-code";
  const gs1128 = readings.filter((r) => r.symbologyIdentifier === "]C1");
  if (gs1128.some((r) => r.text.startsWith("00"))) return "logistic-label";
  return gs1128.length ? "case" : "consumer-pack";
}

/** The same code read twice (the same symbol on the camera, a picture's symbol chosen again): it joins only once. */
export function sameReading(a: Reading, b: Reading): boolean {
  if (a.carrier !== b.carrier || a.symbologyIdentifier !== b.symbologyIdentifier || a.bytes.length !== b.bytes.length) return false;
  return a.bytes.every((byte, i) => byte === b.bytes[i]);
}

/** A column's name: the symbol a person knows, or the kind of tag and its EPC scheme. */
export function memberName(reading: Reading, column: GroupColumn | undefined): string {
  if (reading.carrier === "rfid") return column?.scheme ? `${t("RFID tag")} (${column.scheme.toUpperCase()})` : t("RFID tag");
  if (reading.carrier === "nfc") return t("NFC tag");
  if (!reading.format && column?.symbol) return column.symbol;
  return symbolName(reading);
}

/** The columns a finding concerns, as the matrix numbers them. */
export function columnsText(columns: readonly number[]): string {
  const numbers = columns.map((c) => String(c + 1));
  if (numbers.length === 1) return t("Code {n}", { n: numbers[0]! });
  return t("Codes {list} and {last}", { list: numbers.slice(0, -1).join(", "), last: numbers.at(-1)! });
}

/** What a group finding's details say in plain words, under its card. */
export function groupDetailLines(finding: GroupFinding): string[] {
  const d = finding.details ?? {};
  const lines: string[] = [];
  if (d.barcode !== undefined && d.tag !== undefined) lines.push(t("The barcode: {barcode} · the tag: {tag}", { barcode: d.barcode || "—", tag: d.tag || "—" }));
  if (d.cannotFit === "sgtin-96") lines.push(t("An SGTIN-96 holds only a serial number of digits without leading zeros: write the tag as SGTIN-198, or give the item such a serial number."));
  if (d.reason === "scheme") lines.push(t("The tag carries another kind of key than the barcode: {scheme} and ({key}).", { scheme: d.scheme ?? "", key: d.key ?? "" }));
  if (d.field === "scheme" || d.field === "host") lines.push(t("The symbol: {symbol} · the tag: {tag}", { symbol: d.symbol ?? "", tag: d.tag ?? "" }));
  if (d.field === "element") lines.push(t("The symbol: {symbol} · the tag: {tag}", { symbol: d.symbol || "—", tag: d.tag || "—" }));
  if (d.values) lines.push(t("The values: {values}", { values: d.values }));
  if (d.ais) lines.push(t("Missing from the 2D symbol: {ais}", { ais: d.ais.split(", ").map((ai) => `(${ai})`).join(", ") }));
  if (d.reason === "missing" && d.ai) lines.push(t("Missing from the label: ({ai})", { ai: d.ai }));
  if (d.reason === "sscc") lines.push(t("A logistic label carries one SSCC."));
  return lines;
}
