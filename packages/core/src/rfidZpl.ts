// ZPL for an RFID printer (backlog 6.12 c, ADR 0008 decision 3): the tag's EPC bank written by ^RF, as Zebra's guide
// P1134473-11EN describes it (pp. 426–430, 434). ^RS8 names a Gen2 tag; ^RFW,H,1,n,1 writes n bytes of hexadecimal to
// the EPC bank (1) from its 16-bit block 1, bit 10h: the StoredPC and the EPC together, so that the Length counts the
// EPC's words on any Gen2 printer, whatever the EPC's length. ^RFW,H,,,A (bit 20h, "EPC and auto adjust PC bits") does
// the same with the printer setting the PC, but the guide says only the ZD500R, ZT400 and ZT600 series take it: offered
// as a choice, not the default. Labelary's linter checks the commands' parameters (labelary.test.ts); the bytes counted
// and the data written are checked here by reading them back to the same EPC (rfid.test.ts). Lock and passwords stay
// out (ADR 0008, consequences).

import type { EpcBank } from "./tagMemory.ts";

/** Where ^RF starts writing: bit 10h with the StoredPC (any Gen2 printer), or bit 20h with the PC set by the printer. */
export type RfidWriteFrom = "pc" | "auto";

/** The ^RS and ^RF commands that write the bank's EPC, one per line. */
export function zplRfidCommands(bank: EpcBank, from: RfidWriteFrom = "pc"): string {
  if (from === "auto") return `^RS8\n^RFW,H,,,A^FD${bank.fromEpc}^FS`;
  return `^RS8\n^RFW,H,1,${bank.fromPc.length / 2},1^FD${bank.fromPc}^FS`;
}

/**
 * The commands added to each label of a ZPL file, right after its ^XA: the label's printing stays as it was and the
 * printer writes the tag in the same pass. A file with no ^XA is returned as it was.
 */
export function zplWithRfid(zpl: string, bank: EpcBank, from: RfidWriteFrom = "pc"): string {
  const commands = zplRfidCommands(bank, from);
  return zpl.replace(/\^XA(\r?\n)?/g, (start, newline: string | undefined) => `${start}${newline ? "" : "\n"}${commands}\n`);
}

/** A label of its own that writes the tag and prints what it holds in text: for a tag with no label to print. */
export function zplRfidLabel(bank: EpcBank, lines: readonly string[], options: { dpi: number; from?: RfidWriteFrom }): string {
  const dpmm = options.dpi / 25.4;
  const dot = (mm: number) => Math.round(mm * dpmm);
  const height = dot(3);
  const text = lines.map((line, i) => `^FO${dot(3)},${dot(3) + i * dot(4.5)}^A0N,${height},${height}^FD${line.replace(/[\^~]/g, " ")}^FS`);
  return ["^XA", zplRfidCommands(bank, options.from), "^CI28", ...text, "^XZ", ""].join("\n");
}

/** What a ZPL file's ^RF commands write, read back: the hexadecimal, its starting block and the bytes it says. */
export interface RfidWrite {
  /** "1" from bit 10h, "" with A (from bit 20h, the PC set by the printer). */
  block: string;
  bank: string;
  /** The byte count the command gives, or null with A. */
  bytes: number | null;
  hex: string;
}

/** Every ^RF write of a ZPL file, as a printer would take it. */
export function readZplRfid(zpl: string): RfidWrite[] {
  const writes: RfidWrite[] = [];
  for (const match of zpl.matchAll(/\^RFW,H,([^,^]*),([^,^]*),([^,^]*)\^FD([0-9A-Fa-f]*)\^FS/g)) {
    const [, block = "", bytes = "", bank = "", hex = ""] = match;
    writes.push({ block, bank, bytes: bytes ? Number(bytes) : null, hex });
  }
  return writes;
}
