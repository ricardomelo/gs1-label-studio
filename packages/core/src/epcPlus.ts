import hostnameTables from "./data/epc_hostname.json";
import { EpcError, urlEscape } from "./epc.ts";

/**
 * The EPC schemes new to the EPC Tag Data Standard 2.x (backlog 6.7, option A of three): a '+' scheme for each kind of
 * EPC the studio writes (TDS 2.0) and its '++' form (TDS 2.3), which also carries the GS1 Digital Link URI's hostname.
 * Each is a binary string of variable length, written from the left (TDS 14.6, "counting up"): an 8-bit header (14.2),
 * a bit saying whether +AIDC data follows (14.5.1, always 0 here: none is written), a 3-bit filter (14.5.2), the key
 * in four bits a digit (14.5.4, so no GS1 Company Prefix length is needed) or as delimited numeric (14.5.5, GIAI and
 * CPI), its other component (a serial number, an extension) in the variable-length encoding its characters allow
 * (14.5.6) or as a number without encoding indicator (14.5.13), the DSGTIN's date before the GTIN (14.5.3), and for '++'
 * the hostname (14.5.16). They have no tag URI nor pure identity URI: the binary string and the GS1 Digital Link URI.
 *
 * Checked against the examples of TDS 2.3, Annex E.3. The hexadecimal is padded with zero bits to a 16-bit word, as an
 * RFID tag's EPC memory holds it (its PC bits count words, TDS 15.1.1).
 */

/** The element strings an EPC carries, in their order: the key, then its qualifier or serial component. */
export type EpcPlusElements = [string, string][];

export type EpcPlusScheme =
  | "sgtin" | "dsgtin" | "sscc" | "sgln" | "grai" | "giai" | "gsrn" | "gsrnp" | "gdti" | "cpi" | "sgcn" | "itip";

/** TDS 14.2, table 14-1: the '+' header and the '++' header of each scheme. */
const HEADERS: Record<EpcPlusScheme, [number, number]> = {
  cpi: [0xf0, 0xe6], grai: [0xf1, 0xeb], sgln: [0xf2, 0xe9], itip: [0xf3, 0xed], gsrn: [0xf4, 0xe7], gsrnp: [0xf5, 0xe8],
  gdti: [0xf6, 0xea], sgtin: [0xf7, 0xfd], sgcn: [0xf8, 0xec], sscc: [0xf9, 0xef], giai: [0xfa, 0xee], dsgtin: [0xfb, 0xfc],
};

/** The key of each scheme. */
export const PLUS_KEYS: Record<string, EpcPlusScheme> = {
  "01": "sgtin", "00": "sscc", "414": "sgln", "8003": "grai", "8004": "giai", "8018": "gsrn", "8017": "gsrnp",
  "253": "gdti", "8010": "cpi", "255": "sgcn", "8006": "itip",
};

/** TDS 14.5.3: the date a DSGTIN puts first, by its 4-bit date type. */
export const PRIORITISED_DATES = ["11", "13", "15", "16", "17", "7006", "7007"] as const;

/** Variable-length alphanumeric (14.5.6): bits of the length indicator and the most characters, from TDS table F. */
interface Variable {
  bits: number;
  max: number;
}
const SERIAL_21: Variable = { bits: 5, max: 20 };

/** Each scheme's layout after the filter (TDS 14.6): the key's fixed digits and what follows them. */
interface Layout {
  key: string;
  /** Digits of the key written four bits each; null for delimited numeric (GIAI, CPI). */
  fixed: number | null;
  /** The component after the fixed digits, inside the key's own value (GRAI, GDTI, SGCN). */
  rest?: { variable: Variable } | { numeric: Variable };
  /** A qualifier after the key: its AI and encoding. */
  qualifier?: { ai: string; variable: Variable } | { ai: string; numeric: Variable };
  /** Delimited numeric's alphanumeric remainder. */
  delimited?: Variable;
}
const LAYOUTS: Record<EpcPlusScheme, Layout> = {
  sgtin: { key: "01", fixed: 14, qualifier: { ai: "21", variable: SERIAL_21 } },
  dsgtin: { key: "01", fixed: 14, qualifier: { ai: "21", variable: SERIAL_21 } },
  sscc: { key: "00", fixed: 18 },
  sgln: { key: "414", fixed: 13, qualifier: { ai: "254", variable: { bits: 5, max: 20 } } },
  grai: { key: "8003", fixed: 14, rest: { variable: { bits: 5, max: 16 } } },
  giai: { key: "8004", fixed: null, delimited: { bits: 5, max: 30 } },
  gsrn: { key: "8018", fixed: 18 },
  gsrnp: { key: "8017", fixed: 18 },
  gdti: { key: "253", fixed: 13, rest: { variable: { bits: 5, max: 17 } } },
  cpi: { key: "8010", fixed: null, delimited: { bits: 5, max: 30 }, qualifier: { ai: "8011", numeric: { bits: 4, max: 12 } } },
  sgcn: { key: "255", fixed: 13, rest: { numeric: { bits: 4, max: 12 } } },
  itip: { key: "8006", fixed: 18, qualifier: { ai: "21", variable: SERIAL_21 } },
};

// URN Code 40 (14.5.6.5, table 14-8): index 0 is the pad
const URN40 = "\0ABCDEFGHIJKLMNOPQRSTUVWXYZ-.:0123456789";
const BASE64_URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
/** GS1 AI encodable character set 82, which 7-bit ASCII carries (14.5.6.6). */
const CSET_82 = /^[!"%&'()*+,\-./0-9:;<=>?A-Z_a-z]*$/;

const bin = (value: number | bigint, bits: number) => (bits ? BigInt(value).toString(2).padStart(bits, "0") : "");
const numericBits = (length: number) => Math.ceil((length * Math.log(10)) / Math.log(2));
const digits4 = (text: string) => [...text].map((d) => bin(Number(d), 4)).join("");

function urn40(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => (text[i + k] ? URN40.indexOf(text[i + k]!) : 0));
    out += bin(1600 * a! + 40 * b! + c! + 1, 16);
  }
  return out;
}

/**
 * Variable-length alphanumeric (14.5.6): the encoding indicator, the length and the characters, in the encoding that
 * takes the fewest bits for them (the decision tree of figure 14-5; any correctly indicated encoding conforms).
 */
function variable(text: string, { bits, max }: Variable): string {
  if (text.length > max || !CSET_82.test(text)) throw new EpcError("epc.notEncodable");
  const length = bin(text.length, bits);
  const options: string[] = [];
  if (/^[0-9]*$/.test(text)) options.push("000" + length + bin(text ? BigInt(text) : 0n, numericBits(text.length)));
  if (/^[0-9A-F]*$/.test(text)) options.push("001" + length + [...text].map((c) => bin(parseInt(c, 16), 4)).join(""));
  if (/^[0-9a-f]*$/.test(text)) options.push("010" + length + [...text].map((c) => bin(parseInt(c, 16), 4)).join(""));
  if (/^[0-9A-Za-z_-]*$/.test(text)) options.push("011" + length + [...text].map((c) => bin(BASE64_URL.indexOf(c), 6)).join(""));
  if (/^[0-9A-Z.:-]*$/.test(text)) options.push("101" + length + urn40(text));
  options.push("100" + length + [...text].map((c) => bin(c.charCodeAt(0), 7)).join(""));
  return options.reduce((best, o) => (o.length < best.length ? o : best));
}

/** Variable-length numeric string without encoding indicator (14.5.13). */
function numeric(text: string, { bits, max }: Variable): string {
  if (!/^[0-9]*$/.test(text) || text.length > max) throw new EpcError("epc.notEncodable");
  return bin(text.length, bits) + bin(text ? BigInt(text) : 0n, numericBits(text.length));
}

/** Delimited/terminated numeric (14.5.5): the leading digits, then 1111, or 1110 and the rest as alphanumeric. */
function delimited(text: string, rest: Variable): string {
  const lead = /^[0-9]*/.exec(text)![0];
  return digits4(lead) + (lead.length === text.length ? "1111" : "1110" + variable(text.slice(lead.length), rest));
}

/** The prioritised date (14.5.3): its 4-bit type, then YY, MM and DD in 7, 4 and 5 bits. */
function prioritisedDate(ai: string, value: string): string {
  const type = PRIORITISED_DATES.indexOf(ai as (typeof PRIORITISED_DATES)[number]);
  const [yy, mm, dd] = [0, 2, 4].map((i) => Number(value.slice(i, i + 2)));
  if (type < 0 || !/^\d{6}$/.test(value) || mm! < 1 || mm! > 12 || dd! > daysIn(yy!, mm!)) throw new EpcError("epc.notEncodable");
  return bin(type, 4) + bin(yy!, 7) + bin(mm!, 4) + bin(dd!, 5);
}
function daysIn(yy: number, mm: number): number {
  return [31, yy % 4 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1]!;
}

const SEVEN_BIT: Record<string, string> = hostnameTables.sevenBit;
const FOURTEEN_BIT: Record<string, string> = hostnameTables.fourteenBit;
const PREFIXES = Object.entries(SEVEN_BIT).filter(([, s]) => s.endsWith("."));
const SUFFIXES = [...Object.entries(SEVEN_BIT).filter(([, s]) => s.startsWith(".")), ...Object.entries(FOURTEEN_BIT)]
  .sort(([, a], [, b]) => b.length - a.length);

/**
 * A hostname (14.5.16): URN Code 40 when its characters allow and it is shorter, else 7-bit ASCII with the
 * optimisation tables' sequences: a leading "id.", "www." or "qr.", and the longest top-level domain it ends with.
 */
function hostnameBits(hostname: string): string {
  if (!hostname || hostname.length > 63 || !CSET_82.test(hostname)) throw new EpcError("epc.hostname");
  const prefix = PREFIXES.find(([, s]) => hostname.startsWith(s));
  const middle = hostname.slice(prefix?.[1].length ?? 0);
  const suffix = SUFFIXES.find(([, s]) => middle.endsWith(s) && middle.length > s.length);
  const plain = middle.slice(0, middle.length - (suffix?.[1].length ?? 0));
  const units = plain.length + (prefix ? 1 : 0) + (suffix ? suffix[0].length / 7 : 0);
  const ascii = "1" + bin(units, 6) + (prefix?.[0] ?? "") + [...plain].map((c) => bin(c.charCodeAt(0), 7)).join("") + (suffix?.[0] ?? "");
  if (/^[0-9A-Z.:-]*$/.test(hostname)) {
    const code40 = "0" + bin(hostname.length, 6) + urn40(hostname);
    if (code40.length < ascii.length) return code40;
  }
  return ascii;
}

export interface EpcPlusOptions {
  /** '+' or '++' (which carries `hostname`). */
  form: "+" | "++";
  filter: number;
  /** The GS1 Digital Link URI's hostname, for '++': "example.com", "id.example.com". */
  hostname?: string;
  /** A DSGTIN: the date (11, 13, 15, 16, 17, 7006 or 7007) written before the GTIN, and its value YYMMDD. */
  date?: [string, string];
}

export interface EpcPlus {
  /** As TDS names it: "SGTIN+", "DSGTIN++"… */
  scheme: string;
  /** The binary string in upper case hexadecimal, padded to a 16-bit word. */
  hex: string;
  /** Its bits before the padding. */
  bits: number;
}

/** The '+' or '++' EPC of a key and its qualifiers (`elements`, the key first). */
export function encodeEpcPlus(elements: EpcPlusElements, options: EpcPlusOptions): EpcPlus {
  const [key, value] = elements[0] ?? [];
  const base = key === undefined ? undefined : PLUS_KEYS[key];
  if (!base || value === undefined) throw new EpcError("epc.unsupported");
  const scheme: EpcPlusScheme = base === "sgtin" && options.date ? "dsgtin" : base;
  const layout = LAYOUTS[scheme];
  if (!Number.isInteger(options.filter) || options.filter < 0 || options.filter > 7) throw new EpcError("epc.filterInvalid");
  const of = (ai: string) => elements.find(([a]) => a === ai)?.[1];
  let bits = bin(HEADERS[scheme][options.form === "++" ? 1 : 0], 8) + "0" + bin(options.filter, 3);
  if (scheme === "dsgtin") bits += prioritisedDate(...options.date!);
  if (layout.fixed === null) {
    if (!/^[0-9]/.test(value)) throw new EpcError("epc.notEncodable");
    bits += delimited(value, layout.delimited!);
  } else {
    const fixed = value.slice(0, layout.fixed);
    if (!/^\d+$/.test(fixed) || fixed.length !== layout.fixed) throw new EpcError("epc.notEncodable");
    bits += digits4(fixed);
    const rest = value.slice(layout.fixed);
    if (layout.rest) {
      if (!rest) throw new EpcError("epc.needsSerial", { serialAfter: layout.fixed });
      bits += "variable" in layout.rest ? variable(rest, layout.rest.variable) : numeric(rest, layout.rest.numeric);
    } else if (rest) throw new EpcError("epc.notEncodable");
  }
  if (layout.qualifier) {
    // A GLN without extension takes the extension 0, as in the classic SGLN (TDS 6.3.3)
    const q = of(layout.qualifier.ai) ?? (scheme === "sgln" ? "0" : undefined);
    if (q === undefined) throw new EpcError("epc.needsQualifier", { qualifier: layout.qualifier.ai });
    bits += "variable" in layout.qualifier ? variable(q, layout.qualifier.variable) : numeric(q, layout.qualifier.numeric);
  }
  if (options.form === "++") bits += hostnameBits(options.hostname ?? "");
  const padded = bits.padEnd(Math.ceil(bits.length / 16) * 16, "0");
  const hex = (padded.match(/.{4}/g) ?? []).map((n) => parseInt(n, 2).toString(16)).join("").toUpperCase();
  return { scheme: scheme.toUpperCase() + options.form, hex, bits: bits.length };
}

export interface DecodedEpcPlus {
  scheme: string;
  filter: number;
  /** Whether the tag says +AIDC data follows the EPC (not read here). */
  aidc: boolean;
  /** The key, then its qualifier, then a DSGTIN's date. */
  elements: EpcPlusElements;
  /** '++': the hostname; '+': none (id.gs1.org, or the jurisdiction's own). */
  hostname?: string;
  /** The GS1 Digital Link URI, on the hostname read or on id.gs1.org. */
  digitalLink: string;
}

/** A '+' or '++' EPC read from its hexadecimal (TDS 14.4 for the new schemes); null for a header that is not one of them. */
export function decodeEpcPlus(hex: string): DecodedEpcPlus | null {
  const clean = hex.replace(/\s+/g, "");
  if (!/^[0-9A-Fa-f]+$/.test(clean) || clean.length < 4) return null;
  const header = parseInt(clean.slice(0, 2), 16);
  const found = (Object.entries(HEADERS) as [EpcPlusScheme, [number, number]][]).find(([, h]) => h.includes(header));
  if (!found) return null;
  const [scheme, [plusHeader]] = found;
  const plusPlus = header !== plusHeader;
  const bits = [...clean].map((c) => parseInt(c, 16).toString(2).padStart(4, "0")).join("");
  let at = 8;
  const fail = (): never => {
    throw new EpcError("epc.notDecodable");
  };
  const read = (n: number): string => {
    if (at + n > bits.length) fail();
    const out = bits.slice(at, at + n);
    at += n;
    return out;
  };
  const int = (n: number) => (n ? BigInt("0b" + read(n)) : 0n);
  const readDigits = (n: number) => Array.from({ length: n }, () => {
    const d = Number(int(4));
    return d > 9 ? fail() : String(d);
  }).join("");
  const readUrn40 = (length: number) => {
    let out = "";
    for (let i = 0; i < Math.ceil(length / 3); i++) {
      let r = Number(int(16)) - 1;
      const c = r % 40;
      r = (r - c) / 40;
      const b = r % 40;
      const a = (r - b) / 40;
      out += [a, b, c].filter((x, k) => k === 0 || x > 0).map((x) => URN40[x] ?? fail()).join("");
    }
    return out.slice(0, length);
  };
  const readVariable = ({ bits: lengthBits, max }: Variable): string => {
    const indicator = Number(int(3));
    const length = Number(int(lengthBits));
    if (length > max) fail();
    switch (indicator) {
      case 0: return length ? int(numericBits(length)).toString().padStart(length, "0") : "";
      case 1: return Array.from({ length }, () => Number(int(4)).toString(16).toUpperCase()).join("");
      case 2: return Array.from({ length }, () => Number(int(4)).toString(16)).join("");
      case 3: return Array.from({ length }, () => BASE64_URL[Number(int(6))]).join("");
      case 4: return Array.from({ length }, () => String.fromCharCode(Number(int(7)))).join("");
      case 5: return readUrn40(length);
      default: return fail();
    }
  };
  const readNumeric = ({ bits: lengthBits, max }: Variable): string => {
    const length = Number(int(lengthBits));
    if (length > max) fail();
    return length ? int(numericBits(length)).toString().padStart(length, "0") : "";
  };
  const aidc = read(1) === "1";
  const filter = Number(int(3));
  const layout = LAYOUTS[scheme];
  const elements: EpcPlusElements = [];
  let date: [string, string] | undefined;
  if (scheme === "dsgtin") {
    const type = PRIORITISED_DATES[Number(int(4))] ?? fail();
    const [yy, mm, dd] = [int(7), int(4), int(5)].map(Number);
    if (mm! < 1 || mm! > 12 || dd! > daysIn(yy!, mm!)) fail();
    date = [type, [yy, mm, dd].map((n) => String(n).padStart(2, "0")).join("")];
  }
  if (layout.fixed === null) {
    let lead = "";
    for (;;) {
      const nibble = Number(int(4));
      if (nibble === 15) break;
      if (nibble === 14) {
        lead += readVariable(layout.delimited!);
        break;
      }
      if (nibble > 9) fail();
      lead += String(nibble);
    }
    elements.push([layout.key, lead]);
  } else {
    let value = readDigits(layout.fixed);
    if (layout.rest) value += "variable" in layout.rest ? readVariable(layout.rest.variable) : readNumeric(layout.rest.numeric);
    elements.push([layout.key, value]);
  }
  if (layout.qualifier) {
    const q = "variable" in layout.qualifier ? readVariable(layout.qualifier.variable) : readNumeric(layout.qualifier.numeric);
    // The extension 0 is a GLN without extension (TDS 6.3.3)
    if (!(scheme === "sgln" && q === "0")) elements.push([layout.qualifier.ai, q]);
  }
  let hostname: string | undefined;
  if (plusPlus) {
    if (read(1) === "0") hostname = readUrn40(Number(int(6)));
    else {
      let units = Number(int(6));
      hostname = "";
      while (units > 0) {
        const seven = read(7);
        if (/^00000[01][01]$/.test(seven)) {
          hostname += FOURTEEN_BIT[seven + read(7)] ?? fail();
          units -= 2;
        } else {
          hostname += SEVEN_BIT[seven] ?? (CSET_82.test(String.fromCharCode(parseInt(seven, 2))) ? String.fromCharCode(parseInt(seven, 2)) : fail());
          units -= 1;
        }
      }
      if (units < 0) fail();
    }
  }
  if (date) elements.push(date);
  const path = elements.filter(([ai]) => ai !== date?.[0]).map(([ai, v]) => `/${ai}/${urlEscape(v)}`).join("");
  const digitalLink = `https://${hostname ?? "id.gs1.org"}${path}${date ? `?${date[0]}=${date[1]}` : ""}`;
  return { scheme: scheme.toUpperCase() + (plusPlus ? "++" : "+"), filter, aidc, elements, ...(hostname ? { hostname } : {}), digitalLink };
}
