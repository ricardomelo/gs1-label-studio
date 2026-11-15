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
