import { beforeAll, describe, expect, it } from "vitest";
import { compareReadBack, crc16, encodeEpc, encodeEpcPlus, epcBank, epcSchemes, pcWord, readEpcBank, readPc, type EpcScheme } from "../src/index.ts";

// The EPC memory bank (backlog 6.12 b, ADR 0008). The CRC values were computed apart from this code, with Python's
// binascii.crc_hqx (CRC-CCITT, preset FFFFh) inverted, as Gen2 Annex F describes the StoredCRC; 123456789's D64E is
// CRC-16/GENIBUS's published check value.

/** Gen2 Annex F's method 1: the register over the data and its CRC, not inverted, is the residue 1D0Fh. */
function residue(hex: string): number {
  let crc = 0xffff;
  for (const pair of hex.match(/../g)!) {
    crc ^= parseInt(pair, 16) << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

let schemes: Record<string, EpcScheme>;
beforeAll(async () => {
  schemes = await epcSchemes();
});

describe("the StoredCRC", () => {
  it("is Gen2's CRC-16", () => {
    expect(crc16(new TextEncoder().encode("123456789"))).toBe(0xd64e);
    expect(crc16(Uint8Array.from(Buffer.from("30003034257BF7194E4000001A85", "hex")))).toBe(0xee2c);
    expect(crc16(Uint8Array.from(Buffer.from("340030395DFA80C2EC4000000001", "hex")))).toBe(0xd3db);
  });
  it("leaves Annex F's residue over the data and itself", () => {
    const data = "30003034257BF7194E4000001A85";
    expect(residue(data + crc16(Uint8Array.from(Buffer.from(data, "hex"))).toString(16).padStart(4, "0"))).toBe(0x1d0f);
  });
});

describe("the StoredPC", () => {
  it("counts the EPC's words and carries the user memory indicator and attribute bits", () => {
    expect(pcWord(96)).toBe(0x3000);
    expect(pcWord(198)).toBe(0x6800); // 13 words
    expect(pcWord(128)).toBe(0x4000);
    expect(pcWord(97)).toBe(0x3800);
    expect(pcWord(96, { umi: true })).toBe(0x3400);
    expect(pcWord(96, { attributes: 0x01 })).toBe(0x3001);
    expect(pcWord(496)).toBe(0xf800);
  });
  it("refuses what the Length cannot count and attribute bits beyond a byte", () => {
    expect(() => pcWord(497)).toThrow(RangeError);
    expect(() => pcWord(0)).toThrow(RangeError);
    expect(() => pcWord(96, { attributes: 256 })).toThrow(RangeError);
  });
  it("is read back field by field", () => {
    expect(readPc(0x3401)).toEqual({ words: 6, umi: true, xi: false, toggle: 0, attributes: 1 });
    expect(readPc(0x3200)).toMatchObject({ words: 6, xi: true, toggle: 0 });
    expect(readPc(0x31c1)).toEqual({ words: 6, umi: false, xi: false, toggle: 1, attributes: 0, afi: 0xc1 });
  });
});

describe("the EPC bank", () => {
  it("lays out an SGTIN-96 word by word, its CRC first", () => {
    const bank = epcBank("3034257BF7194E4000001A85", 96);
    expect(bank.hex).toBe("EE2C30003034257BF7194E4000001A85");
    expect(bank.fromPc).toBe("30003034257BF7194E4000001A85");
    expect(bank.fromEpc).toBe("3034257BF7194E4000001A85");
    expect(bank.words.map((w) => [w.address, w.field])).toEqual([
      [0x00, "crc"], [0x10, "pc"], [0x20, "epc"], [0x30, "epc"], [0x40, "epc"], [0x50, "epc"], [0x60, "epc"], [0x70, "epc"],
    ]);
    expect(bank.controls).toBe("");
    expect(epcBank("3034257BF7194E4000001A85", 96, { attributes: 1, umi: true }).controls).toBe("[att=x01][umi=1]");
  });
  it("fills an EPC to the word, the Length counting the words", async () => {
    const epc = encodeEpc(schemes, "01", "09521141123459", { "21": "ABCDEFGHIJKLMNOPQRST" }, 7, 3);
    expect(epc.scheme).toBe("sgtin-198");
    const bank = epcBank(epc.hex, epc.bits.length);
    expect(bank.pc >> 11).toBe(13);
    expect(bank.epc).toBe(epc.hex.toUpperCase());
    expect(bank.fill).toBe(10);
    expect(bank.words.filter((w) => w.field === "epc")).toHaveLength(13);
    expect(epcBank("ABCD1", 20).epc).toBe("ABCD1000");
    expect(epcBank("ABCD1", 20).fill).toBe(12);
    expect(epcBank("3034257BF7194E4000001A85", 96).fill).toBe(0);
  });
  it("refuses a length that does not match the digits", () => {
    expect(() => epcBank("3034257BF7194E4000001A85", 128)).toThrow(RangeError);
    expect(() => epcBank("3034257BF7194E4000001A85", 64)).toThrow(RangeError);
    expect(() => epcBank("30Z4", 16)).toThrow(RangeError);
  });
  it("takes an EPC+ with +AIDC data, whose words the PC counts", () => {
    const plus = encodeEpcPlus([["01", "09521141123459"], ["21", "12345"]], { form: "+", filter: 1, aidc: [["10", "ABC123"]] });
    const bank = epcBank(plus.hex, plus.bits);
    expect(bank.pc >> 11).toBe(Math.ceil(plus.bits / 16));
    expect(readEpcBank(bank.hex)!.epc).toBe(bank.epc);
  });
});

describe("a bank read back", () => {
  it("is read whole, from the PC, or with a CRC that does not match", () => {
    const whole = readEpcBank("EE2C 3000 3034 257B F719 4E40 0000 1A85")!;
    expect(whole.crc).toEqual({ read: 0xee2c, computed: 0xee2c, ok: true });
    expect(whole.epc).toBe("3034257BF7194E4000001A85");
    expect(whole.pc.words).toBe(6);
    const fromPc = readEpcBank("30003034257BF7194E4000001A85")!;
    expect(fromPc.crc).toBeUndefined();
    expect(fromPc.epc).toBe("3034257BF7194E4000001A85");
    const wrong = readEpcBank("EE2D30003034257BF7194E4000001A85")!;
    expect(wrong.crc).toEqual({ read: 0xee2d, computed: 0xee2c, ok: false });
  });
  it("keeps the words after the EPC that the Length does not count", () => {
    const read = readEpcBank("32003034257BF7194E4000001A850004")!;
    expect(read.pc.xi).toBe(true);
    expect(read.beyond).toBe("0004");
  });
  it("refuses what no Length fits", () => {
    // the EPC alone: read from the PC its first word counts 6 words where 5 follow; read from the CRC, the CRC fails,
    // which is how a caller that tried the EPC first tells it was not a bank
    expect(readEpcBank("3034257BF7194E4000001A85")?.crc?.ok).toBe(false);
    expect(readEpcBank("30003034257BF7194E4000001A85FFFFFFFF00000000")).toBeNull(); // past two XPC words either way
    expect(readEpcBank("XYZ")).toBeNull();
    expect(readEpcBank("123")).toBeNull();
    expect(readEpcBank("0000")).toBeNull();
  });
});

describe("a tag read back, compared with the bank meant", () => {
  const bank = epcBank("3034257BF7194E4000001A85", 96);
  it("takes the EPC alone, from the PC or the whole bank, and finds them the same", () => {
    expect(compareReadBack(bank, "3034 257B F719 4E40 0000 1A85")).toMatchObject({ form: "epc", differences: [] });
    expect(compareReadBack(bank, "30003034257BF7194E4000001A85")).toMatchObject({ form: "pc", differences: [] });
    expect(compareReadBack(bank, "ee2c30003034257bf7194e4000001a85")).toMatchObject({ form: "bank", differences: [] });
    // a tag that computes its user memory indicator, or carries an XPC word, is still the same
    expect(compareReadBack(bank, "34003034257BF7194E4000001A85")!.differences).toEqual([]);
    expect(compareReadBack(bank, "32003034257BF7194E4000001A850004")!.differences).toEqual([]);
  });
  it("names what differs: the EPC, the Length, the attribute bits, the toggle, a CRC that does not match", () => {
    expect(compareReadBack(bank, "3034257BF7194E4000001A86")!.differences).toEqual(["epc"]);
    expect(compareReadBack(bank, "30013034257BF7194E4000001A85")!.differences).toEqual(["attributes"]);
    expect(compareReadBack(bank, "31003034257BF7194E4000001A85")!.differences).toEqual(["toggle"]);
    const longer = compareReadBack(bank, "38003034257BF7194E4000001A850000")!;
    expect(longer.differences).toEqual(["epc", "length"]);
    expect(compareReadBack(bank, "EE2D30003034257BF7194E4000001A85")!.differences).toEqual(["crc"]);
    expect(compareReadBack(epcBank("3034257BF7194E4000001A85", 96, { attributes: 1 }), "30003034257BF7194E4000001A85")!.differences).toEqual(["attributes"]);
  });
  it("refuses what is not whole words of hexadecimal", () => {
    expect(compareReadBack(bank, "3034257BF7194E4000001A8")).toBeNull();
    expect(compareReadBack(bank, "hello")).toBeNull();
  });
});
