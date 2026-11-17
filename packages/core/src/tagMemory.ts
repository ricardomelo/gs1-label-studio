// The EPC memory bank of a Gen2 UHF RFID tag, as a writer fills it and a reader returns it (backlog 6.12 b, ADR 0008):
// bits 00h–0Fh the StoredCRC, 10h–1Fh the StoredPC, then the EPC zero-filled to the 16-bit word. The StoredPC's
// Length counts the EPC's words (TDS 2.3, table 9-3 and section 15.1.1); bit 15h is the user memory indicator, 16h the
// XPC_W1 indicator (the tag's to compute), 17h the toggle (0 for an EPC), 18h–1Fh the attribute bits (bit 1Fh, x01,
// hazardous material; Gen2 v1 tags). The StoredCRC is the CRC-16 of Gen2 Annex F (polynomial x16 + x12 + x5 + 1, preset
// FFFFh, MSB first, the register inverted) over the StoredPC and the EPC's words; a tag computes it itself, and a
// reader that returns the whole bank shows it, so it is computed here to compare.

/** The EPC memory's limit in bits when the tag supports XPC_W1, and when it does not (TDS 2.3, table 9-3). */
export const EPC_MEMORY_LIMITS = { withXpc: 464, withoutXpc: 496 } as const;

/** The control fields of the StoredPC a writer chooses (TDS 2.3, table 12-1). */
export interface PcFields {
  /** Bit 15h: user memory holds data (written as asked; many tags compute it). */
  umi?: boolean;
  /** Bits 18h–1Fh with the toggle zero: 0 to 255; x01 is hazardous material. */
  attributes?: number;
}

/** The StoredPC read back: every field, with the toggle's other meaning (AFI) when it is one. */
export interface PcRead {
  /** Bits 10h–14h: the EPC's 16-bit words. */
  words: number;
  umi: boolean;
  /** Bit 16h: an XPC_W1 follows the EPC (the tag computes it). */
  xi: boolean;
  /** Bit 17h: 0, an EPC per TDS; 1, an ISO application family identifier and its UII. */
  toggle: 0 | 1;
  /** Bits 18h–1Fh with the toggle zero. */
  attributes: number;
  /** Bits 18h–1Fh with the toggle one. */
  afi?: number;
}

/** The CRC-16 of Gen2 Annex F over bytes, MSB first: preset FFFFh, polynomial 1021h, the register inverted. */
export function crc16(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return ~crc & 0xffff;
}

/** The StoredPC for an EPC of so many bits: its words in the Length, the user memory indicator and attribute bits. */
export function pcWord(epcBits: number, fields: PcFields = {}): number {
  const words = Math.ceil(epcBits / 16);
  if (!Number.isInteger(epcBits) || epcBits <= 0 || words > 31) throw new RangeError(`An EPC of ${epcBits} bits does not fit the Length field (1 to 31 words).`);
  const attributes = fields.attributes ?? 0;
  if (!Number.isInteger(attributes) || attributes < 0 || attributes > 0xff) throw new RangeError(`Attribute bits ${attributes} are not 0 to 255.`);
  return (words << 11) | (fields.umi ? 1 << 10 : 0) | attributes;
}

/** The StoredPC's fields. */
export function readPc(pc: number): PcRead {
  const toggle = (pc >> 8) & 1 ? 1 : 0;
  return {
    words: pc >> 11,
    umi: Boolean((pc >> 10) & 1),
    xi: Boolean((pc >> 9) & 1),
    toggle,
    attributes: toggle ? 0 : pc & 0xff,
    ...(toggle ? { afi: pc & 0xff } : {}),
  };
}

function bytesOf(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

const word = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");

/** One 16-bit word of the bank, with where it is and what it holds. */
export interface BankWord {
  /** The word's bit address, as Gen2 numbers it: 00h, 10h, 20h… */
  address: number;
  hex: string;
  field: "crc" | "pc" | "epc";
}

/** The EPC memory bank as written: the StoredCRC, the StoredPC and the EPC's words. */
export interface EpcBank {
  crc: number;
  pc: number;
  /** The EPC as the tag holds it, zero-filled to the word. */
  epc: string;
  /** The EPC's own bits, before the zero fill. */
  bits: number;
  /** The zero bits after them that fill the last word. */
  fill: number;
  words: BankWord[];
  /** The whole bank in hexadecimal, CRC first, as a reader returning bits 00h onward gives it. */
  hex: string;
  /** What ZPL's ^RF writes from bit 20h when the printer sets the PC itself, and what most readers report as the EPC. */
  fromEpc: string;
  /** From bit 10h: the StoredPC and the EPC, for an encoder that writes the PC too. */
  fromPc: string;
  /** The EPC Tag URI's control fields for these choices ([att=x01][umi=1]), empty when all are zero (TDS 15.2.4). */
  controls: string;
}

/**
 * The EPC memory bank for an EPC's hexadecimal and its length in bits: the StoredPC's Length counts the words of the
 * EPC zero-filled to the word (TDS 2.3, 15.1.1), the StoredCRC computed over the PC and the EPC.
 */
export function epcBank(epcHex: string, bits: number, fields: PcFields = {}): EpcBank {
  const clean = epcHex.replace(/\s+/g, "").toUpperCase();
  if (!/^[0-9A-F]*$/.test(clean)) throw new RangeError("The EPC is not hexadecimal.");
  const pc = pcWord(bits, fields);
  const words = pc >> 11;
  if (clean.length > words * 4 || bits > clean.length * 4) throw new RangeError(`${bits} bits do not match an EPC of ${clean.length} hexadecimal digits.`);
  const epc = clean.padEnd(words * 4, "0");
  const crc = crc16(bytesOf(word(pc) + epc));
  const list: BankWord[] = [
    { address: 0x00, hex: word(crc), field: "crc" },
    { address: 0x10, hex: word(pc), field: "pc" },
    ...Array.from({ length: words }, (_, i): BankWord => ({
      address: 0x20 + 16 * i, hex: epc.slice(4 * i, 4 * i + 4), field: "epc",
    })),
  ];
  const attributes = fields.attributes ?? 0;
  const controls = `${attributes ? `[att=x${attributes.toString(16).toUpperCase().padStart(2, "0")}]` : ""}${fields.umi ? "[umi=1]" : ""}`;
  return { crc, pc, epc, bits, fill: words * 16 - bits, words: list, hex: word(crc) + word(pc) + epc, fromEpc: epc, fromPc: word(pc) + epc, controls };
}

/** What a reader returned, read as an EPC bank: whole (CRC, PC, EPC) or from the PC, the CRC checked when present. */
export interface BankRead {
  /** The StoredCRC as read, and whether it matches the PC and the EPC; absent when the bank was given from the PC. */
  crc?: { read: number; computed: number; ok: boolean };
  pc: PcRead;
  pcWord: number;
  /** The EPC's words as the Length counts them. */
  epc: string;
  /** Words after the EPC that the Length does not count (an XPC_W1 or memory beyond it), in hexadecimal. */
  beyond: string;
}

/**
 * Reads a memory bank returned by a reader: from bit 00h (CRC first) or from bit 10h (PC first). A bank whose first
 * word is the CRC of the rest is read from 00h; otherwise one whose first word's Length counts the words that follow
 * (up to two XPC words after them) is read from 10h; otherwise, from 00h with a CRC that does not match. Null when
 * no reading fits.
 */
export function readEpcBank(hex: string): BankRead | null {
  const clean = hex.replace(/[\s:-]+/g, "").toUpperCase();
  if (!/^([0-9A-F]{4})+$/.test(clean)) return null;
  const count = clean.length / 4;
  const at = (i: number) => parseInt(clean.slice(4 * i, 4 * i + 4), 16);
  const from = (offset: 0 | 1): BankRead | null => {
    if (count <= offset + 1) return null;
    const pc = at(offset);
    const fields = readPc(pc);
    const end = offset + 1 + fields.words;
    if (fields.words === 0 || end > count || count - end > 2) return null;
    const read: BankRead = { pc: fields, pcWord: pc, epc: clean.slice(4 * (offset + 1), 4 * end), beyond: clean.slice(4 * end) };
    if (offset === 1) {
      const computed = crc16(bytesOf(clean.slice(4, 4 * end)));
      read.crc = { read: at(0), computed, ok: at(0) === computed };
    }
    return read;
  };
  const whole = from(1);
  if (whole?.crc?.ok) return whole;
  return from(0) ?? whole;
}
