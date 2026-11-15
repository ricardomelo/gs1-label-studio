import { describe, expect, it } from "vitest";
import { decodeEpcPlus, encodeEpcPlus, type EpcPlusElements } from "../src/index.ts";

// The EPC schemes of TDS 2.x (backlog 6.7): each example of TDS 2.3, Annex E.3, encoded from its element strings and
// decoded back to them and to its GS1 Digital Link URI. The examples pad a '+' EPC to a hexadecimal digit and a '++'
// EPC to a 16-bit word, the studio every EPC to a word (the tag's EPC memory counts words): compared without the
// trailing zero digits. Two examples carry the '+' header where the '++' one is meant (SSCC++ F9 for EF, ITIP++ F3
// for ED): compared with the header of TDS table 14-1. The SGTIN++ and DSGTIN++ examples write the hostname
// id.example.com in binary (its 7-bit "id." first) where their URI shows example.com: compared with id.example.com. The
// SSCC examples take the filter 0, the others 3.

type Example = [scheme: string, elements: EpcPlusElements, uri: string, hex: string, date?: [string, string]];
const EXAMPLES: Example[] = [
  ["SGTIN+", [["01", "79521141123453"], ["21", "32a/b"]], "https://id.gs1.org/01/79521141123453/21/32a%2Fb", "F73795211411234538566CB0AFC4"],
  ["DSGTIN+", [["01", "79521141123453"], ["21", "32a/b"]], "https://id.gs1.org/01/79521141123453/21/32a%2Fb?17=220630", "FB342CDE795211411234538566CB0AFC4", ["17", "220630"]],
  ["SGTIN++", [["01", "79521141123453"], ["21", "32a/b"]], "https://id.example.com/01/79521141123453/21/32a%2Fb", "FD3795211411234538566CB0AFC525065F1876F0D996D800"],
  ["DSGTIN++", [["01", "79521141123453"], ["21", "32a/b"]], "https://id.example.com/01/79521141123453/21/32a%2Fb?17=220630", "FC342CDE795211411234538566CB0AFC525065F1876F0D996D80", ["17", "220630"]],
  ["SSCC+", [["00", "095201234567891235"]], "https://id.gs1.org/00/095201234567891235", "F90095201234567891235"],
  ["SSCC++", [["00", "095201234567891235"]], "https://id.example.com/00/095201234567891235", "EF009520123456789123592832F8C3B786CCB6C0"],
  ["SGLN+", [["414", "9521141123454"], ["254", "32a/b"]], "https://id.gs1.org/414/9521141123454/254/32a%2Fb", "F2395211411234548566CB0AFC4"],
  ["SGLN++", [["414", "9521141123454"], ["254", "32a/b"]], "https://id.example.com/414/9521141123454/254/32a%2Fb", "E9395211411234548566CB0AFC525065F1876F0D996D8000"],
  ["GRAI+", [["8003", "0952114112345432a/b"]], "https://id.gs1.org/8003/0952114112345432a%2Fb", "F13095211411234548566CB0AFC4"],
  ["GRAI++", [["8003", "0952114112345432a/b"]], "https://id.example.com/8003/0952114112345432a%2Fb", "EB3095211411234548566CB0AFC525065F1876F0D996D800"],
  ["GIAI+", [["8004", "952114132a/b"]], "https://id.gs1.org/8004/952114132a%2Fb", "FA3952114132E83C2BF10"],
  ["GIAI++", [["8004", "952114132a/b"]], "https://id.example.com/8004/952114132a%2Fb", "EE3952114132E83C2BF1494197C61DBC3665B600"],
  ["GSRN+", [["8018", "952114112345678906"]], "https://id.gs1.org/8018/952114112345678906", "F43952114112345678906"],
  ["GSRN++", [["8018", "952114112345678906"]], "https://id.example.com/8018/952114112345678906", "E7395211411234567890692832F8C3B786CCB6C0"],
  ["GSRNP+", [["8017", "952114112345678906"]], "https://id.gs1.org/8017/952114112345678906", "F53952114112345678906"],
  ["GSRNP++", [["8017", "952114112345678906"]], "https://id.example.com/8017/952114112345678906", "E8395211411234567890692832F8C3B786CCB6C0"],
  ["GDTI+", [["253", "95211411234545678"]], "https://id.gs1.org/253/95211411234545678", "F6395211411234540458B8"],
  ["GDTI++", [["253", "95211411234545678"]], "https://id.example.com/253/95211411234545678", "EA395211411234540458BA4A0CBE30EDE1B32DB0"],
  ["CPI+", [["8010", "95211415PQ7/Z43"], ["8011", "12345"]], "https://id.gs1.org/8010/95211415PQ7%2FZ43/8011/12345", "F0395211415E87A145BAFB4D19A8C0E4"],
  ["CPI++", [["8010", "95211415PQ7/Z43"], ["8011", "12345"]], "https://id.example.com/8010/95211415PQ7%2FZ43/8011/12345", "E6395211415E87A145BAFB4D19A8C0E64A0CBE30EDE1B32DB000"],
  ["SGCN+", [["255", "952114167890904711"]], "https://id.gs1.org/255/952114167890904711", "F839521141678909509338"],
  ["SGCN++", [["255", "952114167890904711"]], "https://id.example.com/255/952114167890904711", "EC3952114167890950933C94197C61DBC3665B60"],
  ["ITIP+", [["8006", "095211411234540102"], ["21", "rif981"]], "https://id.gs1.org/8006/095211411234540102/21/rif981", "F3309521141123454010266AE27FDF35"],
  ["ITIP++", [["8006", "095211411234540102"], ["21", "rif981"]], "https://id.example.com/8006/095211411234540102/21/rif981", "ED309521141123454010266AE27FDF3592832F8C3B786CCB6C00"],
];

const trimmed = (hex: string) => hex.replace(/0+$/, "");

describe("the EPC schemes of TDS 2.x, '+' and '++'", () => {
  it.each(EXAMPLES)("%s: TDS E.3's example encoded and decoded", (scheme, elements, uri, hex, date) => {
    const form = scheme.endsWith("++") ? "++" : "+";
    const hostname = form === "++" ? new URL(uri).hostname : undefined;
    const filter = scheme.startsWith("SSCC") ? 0 : 3;
    const epc = encodeEpcPlus(elements, { form, filter, ...(hostname ? { hostname } : {}), ...(date ? { date } : {}) });
    expect(epc.scheme).toBe(scheme);
    expect(trimmed(epc.hex)).toBe(trimmed(hex));
    // Padded to a 16-bit word
    expect(epc.hex.length % 4).toBe(0);
    expect(epc.hex.length * 4 - epc.bits).toBeLessThan(16);
    for (const read of [hex, epc.hex]) {
      const decoded = decodeEpcPlus(read)!;
      expect(decoded).toMatchObject({ scheme, filter, aidc: false, elements: date ? [...elements, date] : elements, digitalLink: uri });
      expect(decoded.hostname).toBe(hostname);
    }
  });

  it("chooses the encoding that takes the fewest bits, and decodes each of the six", () => {
    const serial = (s: string) => encodeEpcPlus([["01", "09506000134352"], ["21", s]], { form: "+", filter: 1 });
    const indicator = (s: string) => parseInt(serial(s).hex.slice(17, 18), 16) >> 1;
    // Bits 68 to 70 are the encoding indicator: numeric, upper and lower case hexadecimal, base 64, 7-bit, URN Code 40
    expect(["0012345", "00AF", "00af", "Ab-_", "A/b", "ABCDEFGHIJKLMNOPQ.:"].map(indicator)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const s of ["0012345", "00AF", "00af", "Ab-_", "A/b", "ABCDEFGHIJKLMNOPQ.:", "", "A", "AB"]) {
      expect(decodeEpcPlus(serial(s).hex)!.elements).toEqual([["01", "09506000134352"], ["21", s]]);
    }
  });

  it("writes a hostname in URN Code 40 when shorter, and the optimisation tables' sequences", () => {
    const sscc = (hostname: string) => encodeEpcPlus([["00", "095201234567891235"]], { form: "++", filter: 0, hostname });
    for (const hostname of ["ID.EXAMPLE.COM", "www.example.org", "qr.example.co.uk", "example.com.br", "shop.example.tech", "a.b", "example.com"]) {
      expect(decodeEpcPlus(sscc(hostname).hex)!.hostname).toBe(hostname);
    }
    // id. and .com in seven bits each: 9 units of 7 bits, where 14 characters would take 98
    expect(sscc("id.example.com").bits).toBe(84 + 1 + 6 + 9 * 7);
    // The longest domain it ends with: .com.br in 14 bits, not .br after ".com"
    expect(sscc("example.com.br").bits).toBe(84 + 1 + 6 + 7 * 7 + 14);
    // A two-letter country's domain in 14 bits
    expect(sscc("example.br").bits).toBe(84 + 1 + 6 + 7 * 7 + 14);
    // URN Code 40: 16 bits for three characters, less than 7-bit's 21
    expect(sscc("ABC.DE").bits).toBe(84 + 1 + 6 + 2 * 16);
  });

  it("keeps a GLN without extension and a DSGTIN's other dates", () => {
    const gln = encodeEpcPlus([["414", "9521141123454"]], { form: "+", filter: 0 });
    expect(decodeEpcPlus(gln.hex)!.elements).toEqual([["414", "9521141123454"]]);
    for (const ai of ["11", "13", "15", "16", "17", "7006", "7007"]) {
      const epc = encodeEpcPlus([["01", "09506000134352"], ["21", "1"]], { form: "+", filter: 1, date: [ai, "240229"] });
      expect(decodeEpcPlus(epc.hex)!.elements.at(-1)).toEqual([ai, "240229"]);
    }
  });

  it("refuses what the schemes cannot carry, and reads only their headers", () => {
    const refused = (elements: EpcPlusElements, options: Partial<Parameters<typeof encodeEpcPlus>[1]> = {}) =>
      () => encodeEpcPlus(elements, { form: "+", filter: 1, ...options });
    expect(refused([["01", "09506000134352"]])).toThrow(/qualifier \(21\)/);
    expect(refused([["01", "09506000134352"], ["21", "x".repeat(21)]])).toThrow(/too long/);
    expect(refused([["01", "09506000134352"], ["21", "é"]])).toThrow(/too long/);
    expect(refused([["8003", "09521141123454"]])).toThrow(/serial component/);
    expect(refused([["01", "09506000134352"], ["21", "1"]], { filter: 8 })).toThrow(/filter/);
    expect(refused([["01", "09506000134352"], ["21", "1"]], { date: ["17", "220230"] })).toThrow(/too long/);
    expect(refused([["01", "09506000134352"], ["21", "1"]], { date: ["10", "220630"] })).toThrow(/too long/);
    expect(refused([["01", "09506000134352"], ["21", "1"]], { form: "++" })).toThrow(/hostname/);
    expect(refused([["01", "09506000134352"], ["21", "1"]], { form: "++", hostname: "a".repeat(64) })).toThrow(/hostname/);
    expect(refused([["422", "076"]])).toThrow(/no EPC scheme/);
    // A classic EPC, or what is not hexadecimal, is not one of them; a string cut short is refused
    expect(decodeEpcPlus("3074257BF7194E4000001A85")).toBeNull();
    expect(decodeEpcPlus("not hex")).toBeNull();
    expect(() => decodeEpcPlus("F737952114")).toThrow(/not an EPC/);
  });
});

// +AIDC data (backlog 6.7 B, TDS 15.3): element strings after the EPC, each in the encoding of TDS table F
// (data/epc_aidc.json, read from the standard's text). The table is checked against the GS1 dictionary, every AI the
// table has is written and read back at its longest, and each method is checked bit by bit against TDS 14.5.
describe("+AIDC data after the EPC", async () => {
  const { aidcRow } = await import("../src/epcPlus.ts");
  const dictionary = (await import("../src/data/gs1_dictionary.json")).default as unknown as {
    ais: Record<string, { components: { type: string; min: number; max: number; optional: boolean; linters?: string[] }[] }>;
  };
  const covered = Object.entries(dictionary.ais).filter(([ai]) => aidcRow(ai));
  const sgtin: EpcPlusElements = [["01", "09506000134352"], ["21", "S1001"]];

  it("has a row of table F for every AI of the GS1 dictionary but (03), (8014) and those newer than TDS 2.3", () => {
    const missing = Object.keys(dictionary.ais).filter((ai) => !aidcRow(ai)).sort();
    expect(missing).toEqual(["03", "3954", "3955", "717", "8014", "8040", "8041", "8042", "8043"].filter((ai) => ai in dictionary.ais));
  });

  // TDS 2.3 trails the General Specifications for two AIs: (7254) and (8007) take 40 and 34 characters there, 30 and 24
  // in table F, which a longer value cannot follow an EPC by
  const TRAILING: Record<string, number> = { "7254": 30, "8007": 24 };
  it.each(covered)("table F gives (%s) the lengths of the GS1 dictionary", (ai, { components }) => {
    const row = aidcRow(ai)!;
    const longest = TRAILING[ai] ?? components.reduce((sum, c) => sum + c.max, 0);
    const of = (c: NonNullable<typeof row.second>) => ("max" in c && c.max !== undefined ? c.max : c.length!);
    if (row.second) expect(row.first.length! + of(row.second)).toBe(longest); else if (row.first.method === "dateRange") expect(longest).toBe(12);
    else if (row.first.method === "dateTimeVariable") expect([10, 12]).toContain(longest);
    else expect(of(row.first)).toBe(longest);
  });

  /** A value of an AI at its longest, of the characters its type allows, or one its method takes. */
  function longest(ai: string): string {
    const row = aidcRow(ai)!;
    const special: Record<string, string> = {
      date: "271231", dateTime: "2712312359", dateRange: "271201271231", dateTimeVariable: ai === "7011" ? "2712312359" : "271231235959",
      country: "BR", bit: "1", sequence: "1/3",
    };
    if (special[row.first.method]) return special[row.first.method]!;
    if (TRAILING[ai]) return "A".repeat(TRAILING[ai]!);
    return dictionary.ais[ai]!.components.map((c, i) => {
      if (i === 1 && row.second?.method === "minus") return "-";
      if (c.type === "N") return (c.linters ?? []).some((l) => /^iso/.test(l)) ? "076".slice(0, c.max) : "9".repeat(c.max);
      const text = "Az9-./:_!'()*+,;=?\"%&<>";
      return (row.first.method === "delimited" && i === 0 ? "12" : "") + text.repeat(5).slice(0, c.max - (row.first.method === "delimited" && i === 0 ? 2 : 0));
    }).join("");
  }

  it.each(covered.map(([ai]) => [ai, longest(ai)]))("writes (%s) %s after an SGTIN+ and reads it back", (ai, value) => {
    const data: EpcPlusElements = ai === "01" || ai === "21" ? [] : [[ai, value]];
    if (!data.length) return;
    const epc = encodeEpcPlus(sgtin, { form: "+", filter: 1, aidc: data });
    const read = decodeEpcPlus(epc.hex)!;
    expect(read.aidc).toBe(true);
    expect(read.elements).toEqual(sgtin);
    expect(read.data).toEqual(data);
  });

  /** The hexadecimal of an SGTIN+ (its toggle bit set) followed by these bits, padded to a 16-bit word. */
  function withBits(after: string): string {
    const base = encodeEpcPlus(sgtin, { form: "+", filter: 1 });
    const bits = [...base.hex].map((c) => parseInt(c, 16).toString(2).padStart(4, "0")).join("").slice(0, base.bits);
    const all = bits.slice(0, 8) + "1" + bits.slice(9) + after.replace(/ /g, "");
    return (all.padEnd(Math.ceil(all.length / 16) * 16, "0").match(/.{4}/g) ?? []).map((n) => parseInt(n, 2).toString(16)).join("").toUpperCase();
  }

  // Each method of TDS 14.5 worked by hand: the AI's digits in four bits each, then the value
  it.each([
    ["17", "271231", "0001 0111 | 0011011 1100 11111", "6-digit date (14.5.8): YY, MM, DD in 7, 4 and 5 bits"],
    ["10", "ABC123", "0001 0000 | 001 00110 1010 1011 1100 0001 0010 0011", "variable-length (14.5.6), upper case hexadecimal the shortest"],
    ["3103", "000500", "0011 0001 0000 0011 | 00000000000111110100", "fixed-bit-length (14.5.2): 6 digits in 20 bits"],
    ["4330", "001234-", "0100 0011 0011 0000 | 00000000010011010010 1", "a temperature and its minus sign (14.5.14)"],
    ["7258", "1/3", "0111 0010 0101 1000 | 0001 0011", "sequence indicator (14.5.15)"],
    ["4307", "BR", "0100 0011 0000 0111 | 000001 010001", "country code (14.5.12)"],
    ["8008", "2712312359", "1000 0000 0000 1000 | 01 0011011 1100 11111 10111 111011", "variable-precision date+time (14.5.11), to the minute"],
    ["7007", "271201271231", "0111 0000 0000 0111 | 1 0011011 1100 00001 0011011 1100 11111", "a date range (14.5.10)"],
    ["7007", "271231", "0111 0000 0000 0111 | 0 0011011 1100 11111", "a date range's single date (14.5.10)"],
    ["4321", "1", "0100 0011 0010 0001 | 1", "single data bit (14.5.7)"],
    ["30", "12", "0011 0000 | 0010 0001100", "a 2-digit AI table K leaves out; numeric without indicator (14.5.13)"],
    ["8004", "123AB", "1000 0000 0000 0100 | 0001 0010 0011 1110 001 00010 1010 1011", "delimited numeric (14.5.5), its rest in upper case hexadecimal"],
    ["8004", "12ab_", "1000 0000 0000 0100 | 0001 0010 1110 011 00011 011010 011011 111111", "delimited numeric, its rest in base 64"],
  ])("(%s) %s: %s — %s", (ai, value, bits) => {
    const hex = withBits(bits.replace("|", ""));
    expect(encodeEpcPlus(sgtin, { form: "+", filter: 1, aidc: [[ai, value]] }).hex).toBe(hex);
    expect(decodeEpcPlus(hex)!.data).toEqual([[ai, value]]);
  });

  it("writes several in their order, its qualifiers in the URI's path and the rest after '?', on a '++' too", () => {
    const data: EpcPlusElements = [["17", "271231"], ["10", "ABC123"], ["3103", "000500"]];
    const plus = decodeEpcPlus(encodeEpcPlus(sgtin, { form: "++", filter: 1, hostname: "example.com", aidc: data }).hex)!;
    expect(plus.data).toEqual(data);
    expect(plus.hostname).toBe("example.com");
    expect(plus.digitalLink).toBe("https://example.com/01/09506000134352/10/ABC123/21/S1001?17=271231&3103=000500");
    // A DSGTIN's date stays in the EPC
    const dated = decodeEpcPlus(encodeEpcPlus(sgtin, { form: "+", filter: 1, date: ["17", "271231"], aidc: [["10", "L1"]] }).hex)!;
    expect(dated.digitalLink).toBe("https://id.gs1.org/01/09506000134352/10/L1/21/S1001?17=271231");
    // Without the toggle bit nothing after the EPC is read
    const none = decodeEpcPlus(encodeEpcPlus(sgtin, { form: "+", filter: 1 }).hex)!;
    expect(none).not.toHaveProperty("data");
    expect(none.aidc).toBe(false);
    // Bits after an EPC whose toggle bit is 0 are not read as +AIDC data
    const written = withBits("0001 0111 0011011 1100 11111");
    const cleared = (parseInt(written.slice(2, 3), 16) & 0b0111).toString(16).toUpperCase();
    expect(decodeEpcPlus(written.slice(0, 2) + cleared + written.slice(3))).not.toHaveProperty("data");
  });

  it("refuses an AI table F has not, a value its method cannot take, and an AI the EPC already carries", () => {
    const refused = (ai: string, value: string, options: Partial<Parameters<typeof encodeEpcPlus>[1]> = {}) => {
      try {
        encodeEpcPlus(sgtin, { form: "+", filter: 1, aidc: [[ai, value]], ...options });
        return "written";
      } catch (error) {
        return (error as { code: string }).code;
      }
    };
    expect(refused("8040", "A")).toBe("epc.aidcUnknown");
    expect(refused("999", "A")).toBe("epc.aidcUnknown");
    expect(refused("9", "A")).toBe("epc.aidcUnknown");
    expect(refused("17", "270231")).toBe("epc.aidcValue"); // 31 February
    expect(refused("17", "2712311")).toBe("epc.aidcValue");
    expect(refused("4307", "br")).toBe("epc.aidcValue");
    expect(refused("7258", "0/3")).toBe("epc.aidcValue");
    expect(refused("3103", "0005000")).toBe("epc.aidcValue");
    expect(refused("4330", "001234+")).toBe("epc.aidcValue");
    expect(refused("8008", "2712312460")).toBe("epc.aidcValue"); // 24:60
    expect(refused("8008", "2712312401")).toBe("epc.aidcValue"); // past 24:00
    expect(refused("8008", "2712312400")).toBe("written");
    expect(refused("8008", "2712312360")).toBe("epc.aidcValue"); // 23:60
    expect(refused("8008", "271231235960")).toBe("epc.aidcValue"); // 60 seconds
    expect(refused("10", "ABC#")).toBe("epc.aidcValue");
    expect(refused("21", "S2")).toBe("epc.aidcTwice");
    expect(refused("17", "271231", { date: ["17", "271231"] })).toBe("epc.aidcTwice");
    // A reserved header (A to F in either digit) is not read as an AI
    expect(() => decodeEpcPlus(withBits("1010 0000 0000 0000"))).toThrow();
  });
});

