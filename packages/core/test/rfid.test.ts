import { beforeAll, describe, expect, it } from "vitest";
import {
  decodeEpc,
  decodeEpcPlus,
  encodeEpc,
  encodeEpcPlus,
  epcBank,
  epcSchemes,
  readEpcBank,
  readZplRfid,
  zplRfidCommands,
  zplRfidLabel,
  zplWithRfid,
  type EpcScheme,
} from "../src/index.ts";

// ZPL for an RFID printer (backlog 6.12 c, ADR 0008): what ^RF writes, read back as the tag's bank would be and decoded
// to the EPC that was meant. Labelary's linter checks the parameters (labelary.test.ts).

let schemes: Record<string, EpcScheme>;
beforeAll(async () => {
  schemes = await epcSchemes();
});

describe("ZPL's ^RF", () => {
  it("writes the StoredPC and the EPC from block 1 of the EPC bank, the bytes counted", () => {
    const bank = epcBank("3034257BF7194E4000001A85", 96);
    expect(zplRfidCommands(bank)).toBe("^RS8\n^RFW,H,1,14,1^FD30003034257BF7194E4000001A85^FS");
    expect(zplRfidCommands(bank, "auto")).toBe("^RS8\n^RFW,H,,,A^FD3034257BF7194E4000001A85^FS");
  });

  it("writes what decodes to the same EPC, classic and EPC+, whatever its length", () => {
    const cases = [
      encodeEpc(schemes, "01", "09521141123459", { "21": "6789" }, 7, 1),
      encodeEpc(schemes, "01", "09521141123459", { "21": "ABCDEFGHIJKLMNOPQRST" }, 7, 3),
      encodeEpc(schemes, "00", "095211410000000013", {}, 7, 0),
      encodeEpc(schemes, "8004", "9521141ABC-123/X", {}, 7, 0),
    ];
    for (const epc of cases) {
      const bank = epcBank(epc.hex, epc.bits.length, { attributes: 1 });
      const [write] = readZplRfid(zplRfidLabel(bank, ["x"], { dpi: 300 }));
      expect(write!.bytes).toBe(write!.hex.length / 2);
      expect(write!.block).toBe("1");
      expect(write!.bank).toBe("1");
      const read = readEpcBank(write!.hex)!;
      expect(read.crc).toBeUndefined();
      expect(read.pc.attributes).toBe(1);
      expect(decodeEpc(schemes, read.epc)!.pureIdentity).toBe(epc.pureIdentity);
    }
    const plus = encodeEpcPlus([["01", "09521141123459"], ["21", "12345"]], { form: "++", filter: 1, hostname: "example.com", aidc: [["10", "ABC123"]] });
    const bank = epcBank(plus.hex, plus.bits);
    const [write] = readZplRfid(zplRfidCommands(bank));
    expect(decodeEpcPlus(readEpcBank(write!.hex)!.epc)!.digitalLink).toBe(decodeEpcPlus(plus.hex)!.digitalLink);
    const [auto] = readZplRfid(zplRfidCommands(bank, "auto"));
    expect(auto).toEqual({ block: "", bank: "A", bytes: null, hex: bank.fromEpc });
  });

  it("joins every label of a file, after its ^XA, the label's own commands unchanged", () => {
    const bank = epcBank("3034257BF7194E4000001A85", 96);
    const file = "^XA\n^FO10,10^FDone^FS\n^XZ\n^XA^FO10,10^FDtwo^FS^XZ\n";
    const joined = zplWithRfid(file, bank);
    expect(readZplRfid(joined)).toHaveLength(2);
    expect(joined.replaceAll(`${zplRfidCommands(bank)}\n`, "")).toBe("^XA\n^FO10,10^FDone^FS\n^XZ\n^XA\n^FO10,10^FDtwo^FS^XZ\n");
    expect(zplWithRfid("no label", bank)).toBe("no label");
  });

  it("prints the lines in text, a caret or tilde in them made a space", () => {
    const zpl = zplRfidLabel(epcBank("3034257BF7194E4000001A85", 96), ["EPC 3034…", "a^b~c"], { dpi: 203 });
    expect(zpl.startsWith("^XA\n^RS8\n")).toBe(true);
    expect(zpl).toContain("^FDa b c^FS");
    expect(zpl.trimEnd().endsWith("^XZ")).toBe(true);
    expect(zpl).toContain("^FO24,60^A0N,24,24^FDa b c^FS"); // 3 mm and 7.5 mm at 8 dots a millimetre
  });
});
