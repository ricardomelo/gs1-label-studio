import { beforeAll, describe, expect, it } from "vitest";
import {
  decodeEpc,
  decodeEpcPlus,
  encodeEpc,
  encoderCsv,
  encodeEpcPlus,
  epcBank,
  epcSchemes,
  readEpcBank,
  readZplRfid,
  zplRfidCommands,
  zplRfidLabel,
  zplRfidLabels,
  zplWithRfid,
  type EpcScheme,
  type RfidTagRow,
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
    expect(readZplRfid(zplWithRfid(file, bank, "auto")).map((w) => w.bank)).toEqual(["A", "A"]);
  });

  it("prints the lines in text, a caret or tilde in them made a space", () => {
    const zpl = zplRfidLabel(epcBank("3034257BF7194E4000001A85", 96), ["EPC 3034…", "a^b~c"], { dpi: 203 });
    expect(zpl.startsWith("^XA\n^RS8\n")).toBe(true);
    expect(zpl).toContain("^FDa b c^FS");
    expect(zpl.trimEnd().endsWith("^XZ")).toBe(true);
    expect(zpl).toContain("^FO24,60^A0N,24,24^FDa b c^FS"); // 3 mm and 7.5 mm at 8 dots a millimetre
  });
});

// Many tags at once (backlog 6.12 d): a serial sequence's EPCs as an encoder's CSV and as ZPL with a tag per label,
// each read back to the EPC of its row.
describe("many tags", () => {
  function tags(): RfidTagRow[] {
    const rows: RfidTagRow[] = [1000, 1001, 1002].map((serial, i) => {
      const epc = encodeEpc(schemes, "01", "09521141123459", { "21": String(serial) }, 7, 1);
      return { row: [2, 4, 5][i]!, bank: epcBank(epc.hex, epc.bits.length), identity: epc.pureIdentity, tagUri: epc.tagUri };
    });
    rows.splice(1, 0, { row: 3, error: "This key's EPC needs the qualifier (21)" });
    return rows;
  }

  it("writes a CSV line a row, the EPC from bit 20h and 10h, a row with no tag given its reason", () => {
    const lines = encoderCsv(tags()).split("\r\n");
    expect(lines[0]).toBe("Row,EPC,PC and EPC,EPC bits,Pure identity,Tag URI,Reason");
    expect(lines).toHaveLength(6); // the header, four rows and the final line break
    expect(lines[5]).toBe("");
    const first = lines[1]!.split(",");
    expect(first[0]).toBe("2");
    expect(first[2]).toBe(`3000${first[1]}`);
    expect(first[3]).toBe("96");
    expect(decodeEpc(schemes, first[1]!)!.pureIdentity).toBe("urn:epc:id:sgtin:9521141.012345.1000");
    expect(first[4]).toBe("urn:epc:id:sgtin:9521141.012345.1000");
    expect(first[5]).toBe("urn:epc:tag:sgtin-96:1.9521141.012345.1000");
    expect(lines[2]).toBe("3,,,,,,This key's EPC needs the qualifier (21)");
    expect(lines[4]!.startsWith("5,")).toBe(true);
    expect(encoderCsv([])).toBe("Row,EPC,PC and EPC,EPC bits,Pure identity,Tag URI,Reason\r\n");
  });

  it("writes one ZPL file with a label a tag, in order, each read back to its row's EPC", () => {
    const zpl = zplRfidLabels(tags(), { dpi: 203 });
    expect(zpl.match(/\^XA/g)).toHaveLength(3);
    const writes = readZplRfid(zpl);
    expect(writes.map((w) => decodeEpc(schemes, readEpcBank(w.hex)!.epc)!.pureIdentity)).toEqual(
      [1000, 1001, 1002].map((n) => `urn:epc:id:sgtin:9521141.012345.${n}`));
    expect(zpl).toContain("^FDurn:epc:id:sgtin:9521141.012345.1002^FS");
    expect(readZplRfid(zplRfidLabels(tags(), { dpi: 300, from: "auto" })).every((w) => w.bank === "A")).toBe(true);
    expect(zplRfidLabels([{ row: 2, error: "x" }], { dpi: 203 })).toBe("");
  });
});
