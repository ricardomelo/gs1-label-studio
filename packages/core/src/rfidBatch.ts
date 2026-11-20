// Many tags at once (backlog 6.12 d, ADR 0008): the rows of a spreadsheet or a serial sequence, each row's EPC in the
// tag's memory, as a CSV an encoder or an RFID printer's software takes, and as one ZPL file with a tag per label. A
// row whose data has no EPC is left out with its reason, as the bulk generator leaves out a row it cannot draw.

import { toDelimited } from "./report.ts";
import { zplRfidLabel, type RfidWriteFrom } from "./rfidZpl.ts";
import type { EpcBank } from "./tagMemory.ts";

/** One row's tag: its bank, what it identifies, or why it has none. */
export interface RfidTagRow {
  /** The row's number in the file, as a spreadsheet numbers it. */
  row: number;
  bank?: EpcBank;
  /** The EPC Pure Identity URI, or for EPC+ the GS1 Digital Link URI it decodes to. */
  identity?: string;
  /** The EPC Tag URI with its control fields; none for EPC+ and EPC++, which have no tag URI. */
  tagUri?: string;
  /** Why the row has no tag: the EPC's message, the row's error, or that it was skipped. */
  error?: string;
}

/** The CSV's columns: an encoder takes the EPC from bit 20h, or the StoredPC and EPC from bit 10h. */
export const ENCODER_COLUMNS = ["Row", "EPC", "PC and EPC", "EPC bits", "Pure identity", "Tag URI", "Reason"] as const;

/**
 * The tags as CSV (RFC 4180, comma, CRLF), a row each, in order: the EPC in hexadecimal from bit 20h, the StoredPC and
 * EPC from bit 10h, the EPC's length, the identity and tag URIs; a row with no tag keeps its line, its reason given and
 * its hexadecimal empty, so that the file still lines up with the spreadsheet.
 */
export function encoderCsv(tags: readonly RfidTagRow[]): string {
  return toDelimited([
    [...ENCODER_COLUMNS],
    ...tags.map((tag) => tag.bank
      ? [String(tag.row), tag.bank.fromEpc, tag.bank.fromPc, String(tag.bank.bits), tag.identity ?? "", tag.tagUri ?? "", ""]
      : [String(tag.row), "", "", "", "", "", tag.error ?? ""]),
  ]);
}

/**
 * One ZPL file with a label a tag, in the rows' order: each label writes its tag and prints its EPC and identity in
 * text (`zplRfidLabel`). Rows with no tag are left out; none at all gives an empty file.
 */
export function zplRfidLabels(tags: readonly RfidTagRow[], options: { dpi: number; from?: RfidWriteFrom }): string {
  return tags.flatMap((tag) => (tag.bank ? [zplRfidLabel(tag.bank, [tag.bank.fromEpc, tag.identity ?? ""].filter(Boolean), options)] : [])).join("");
}
