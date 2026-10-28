/**
 * The EPC of a key for RFID and NFC tags (backlog item 1.8): every key the EPC Tag Data Standard encodes in a scheme
 * defined before TDS 2.0 — SGTIN, SSCC, SGLN, GRAI, GIAI, GSRN, GSRNP, GDTI, SGCN, CPI, ITIP — as its binary string
 * (hexadecimal and base 64), tag URI and pure identity URI, and as the compressed GS1 Digital Link URI an NFC tag emits
 * (GS1 Digital Link URI: Compression Technical Standard for EPC binary strings 1.0.0: https://<stem>/eh<hexadecimal> or
 * /ex<base 64>). Ported from the resolver's `portal/epc.py` (its ADR 0010, section 8; ADR 0004 here) and checked
 * against it.
 *
 * The encoding follows the EPC Tag Data Translation artefacts (`data/epc_schemes.json`, the resolver's file, generated
 * from the TDT artefacts by its `tools/gen_epc_schemes.py`): the key's GS1 Digital Link path is matched by the scheme's
 * GS1_DIGITAL_LINK level for the company prefix's length, the level's EXTRACT rules give the EPC's fields, and the
 * BINARY, TAG_ENCODING and PURE_IDENTITY levels write them out (TDT 3.x). For each key the schemes are tried in order —
 * the 96-bit one first, then the longer one that takes alphanumeric values — and the first whose rules accept the
 * values is used. The artefacts' patterns are Python's: `re.match` anchors at the start only, hence `^(?:…)`.
 *
 * The partition of the GS1 Company Prefix needs its length, which the key does not say: the caller gives it (the
 * person's choice, or GS1's GCP length table, gcp.ts).
 */
export interface EpcField {
  seq?: string | number;
  name: string;
  bitLength?: string | number;
  length?: string | number;
  compaction?: string;
  decimalMinimum?: string;
  decimalMaximum?: string;
  padChar?: string;
  padDir?: string;
}
export interface EpcOption {
  optionKey: string;
  pattern: string;
  grammar: string;
  fields: EpcField[];
}
export interface EpcRule {
  type: string;
  seq: string | number;
  newFieldName: string;
  function: string;
}
export interface EpcLevel {
  options: EpcOption[];
  rules: EpcRule[];
}
export interface EpcScheme {
  name: string;
  tagLength: string | number | null;
  levels: Record<"GS1_DIGITAL_LINK" | "BINARY" | "TAG_ENCODING" | "PURE_IDENTITY", EpcLevel>;
}

/** The schemes of each primary key, in the order they are tried (GDTI-113 left out: TDS 2.0 deprecates it). */
export const KEY_SCHEMES: Record<string, string[]> = {
  "01": ["SGTIN-96", "SGTIN-198"], "00": ["SSCC-96"], "414": ["SGLN-96", "SGLN-195"],
  "8003": ["GRAI-96", "GRAI-170"], "8004": ["GIAI-96", "GIAI-202"], "8018": ["GSRN-96"], "8017": ["GSRNP-96"],
  "253": ["GDTI-96", "GDTI-174"], "255": ["SGCN-96"], "8010": ["CPI-96", "CPI-var"], "8006": ["ITIP-110", "ITIP-212"],
};
/**
 * What a key needs before it has an EPC: a key qualifier, or a serial component after the key's fixed digits (GRAI: 14
 * digits, GDTI and GCN: 13); a GLN without extension is encoded with the extension 0 (TDS 6.3.3).
 */
export const MINIMUM: Record<string, { qualifier?: string; serialAfter?: number }> = {
  "01": { qualifier: "21" }, "8006": { qualifier: "21" }, "8010": { qualifier: "8011" },
  "8003": { serialAfter: 14 }, "253": { serialAfter: 13 }, "255": { serialAfter: 13 },
};
/** Key qualifiers that are part of an EPC (the others — a batch, a variant — are not). */
export const EPC_QUALIFIERS = ["21", "254", "8011"];
export const PARTITION_LENGTHS = [6, 7, 8, 9, 10, 11, 12];
/** GS1 AI encodable character set 82. */
const CSET_82 = new Set("!\"%&'()*+,-./0123456789:;<=>?ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz");
const BASE64_URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
/** TDS section 7 (Table I.3.1-1): characters escaped in the strings of an EPC URI ('#' only occurs in a CPI). */
const URN_ESCAPES: Record<string, string> = { '"': "%22", "#": "%23", "%": "%25", "&": "%26", "/": "%2F", "<": "%3C", ">": "%3E", "?": "%3F" };
/** Characters a GS1 Digital Link path keeps as they are in the TDT artefacts' patterns; the others are %-escaped. */
const URL_SAFE = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"._-');

/** The key cannot be written as an EPC; `code` is the resolver's message code. */
export class EpcError extends Error {
  constructor(
    readonly code: string,
    readonly params: Record<string, string | number> = {},
  ) {
    super(EPC_MESSAGES[code]?.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? "")) ?? code);
    this.name = "EpcError";
  }
}

const EPC_MESSAGES: Record<string, string> = {
  "epc.needsQualifier": "This key's EPC needs its qualifier ({qualifier}), such as the serial number.",
  "epc.needsSerial": "This key's EPC needs its serial component after the first {serialAfter} digits.",
  "epc.unsupported": "This key has no EPC scheme in the EPC Tag Data Standard.",
  "epc.notEncodable": "These values fit no EPC scheme of this key (too long, or with characters an EPC cannot carry).",
  "epc.prefixLength": "Choose the company prefix length (6 to 12 digits).",
  "epc.filterInvalid": "Invalid filter (0 to 7).",
  "epc.notGcp": "GS1's list says this key's range is not a GS1 Company Prefix: choose the prefix's length to write an EPC.",
};

export interface Epc {
  /** Lower case, as in the tag URI: sgtin-96, sscc-96, … */
  scheme: string;
  filter: number;
  bits: string;
  /**
   * The EPC bank's contents from bit 20h: the binary string zero-filled to the 16-bit word boundary, as a tag holds it
   * and an RFID encoder takes it (TDS 2.3: the PC bits' Length counts 16-bit words; "the EPC is then zero-filled to the
   * word boundary"). The resolver showed `linkHex` here, which is shorter for the schemes whose length is not a
   * multiple of 16 (SGTIN-198, SGLN-195, GRAI-170, GIAI-202, ITIP, CPI-var).
   */
  hex: string;
  /** The binary string in hexadecimal, filled to 4 bits only: the resolver's form, in the NFC link /eh… */
  linkHex: string;
  /** The binary string in base64url, filled to 6 bits: the NFC link /ex… */
  base64: string;
  tagUri: string;
  pureIdentity: string;
}

function hexOf(bits: string, boundary = 4): string {
  const padded = bits + "0".repeat((boundary - (bits.length % boundary)) % boundary);
  let out = "";
  for (let i = 0; i < padded.length; i += 4) out += parseInt(padded.slice(i, i + 4), 2).toString(16);
  return out;
}

function base64Of(bits: string): string {
  const padded = bits + "0".repeat((6 - (bits.length % 6)) % 6);
  let out = "";
  for (let i = 0; i < padded.length; i += 6) out += BASE64_URL[parseInt(padded.slice(i, i + 6), 2)];
  return out;
}

const pyMatch = (pattern: string, text: string) => new RegExp(`^(?:${pattern})`).exec(text);

function option(level: EpcLevel, key: string): EpcOption | undefined {
  return level.options.find((o) => o.optionKey === key);
}

/** [isLiteral, text] for each token of a TDT grammar ('literal' or field name). */
function tokens(grammar: string): [boolean, string][] {
  return [...grammar.matchAll(/'[^']*'|\S+/g)].map(([t]) => (t.startsWith("'") ? [true, t.slice(1, -1)] : [false, t]));
}

function checksum(digits: string): string {
  let sum = 0;
  [...digits].reverse().forEach((d, i) => (sum += Number(d) * (i % 2 === 0 ? 3 : 1)));
  return String((10 - (sum % 10)) % 10);
}

export function urnEscape(text: string): string {
  return [...text].map((c) => URN_ESCAPES[c] ?? c).join("");
}

export function urlEscape(text: string): string {
  return [...text]
    .map((c) => (URL_SAFE.has(c) ? c : [...new TextEncoder().encode(c)].map((b) => `%${b.toString(16).toUpperCase().padStart(2, "0")}`).join("")))
    .join("");
}

/** Python's urllib.parse.unquote: %XX sequences decoded as UTF-8, malformed ones left as they are. */
function unquote(text: string): string {
  return text.replace(/(%[0-9A-Fa-f]{2})+/g, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run;
    }
  });
}

const isDigits = (s: string) => /^[0-9]+$/.test(s);

/** The functions of the artefacts' rules (TDT Table 3-3). */
function call(fn: string, values: Record<string, string>): string {
  const match = /^(\w+)\((.*)\)$/s.exec(fn.trim());
  if (!match) throw new EpcError("epc.notEncodable");
  const [, name, raw] = match;
  const arg = (token: string) => {
    const t = token.trim();
    if (t in values) return values[t]!;
    if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1);
    if (isDigits(t)) return t;
    throw new EpcError("epc.notEncodable");
  };
  const args = raw!.split(",").map(arg);
  switch (name) {
    case "SUBSTR": {
      const start = Number(args[1]);
      return args.length > 2 ? args[0]!.slice(start, start + Number(args[2])) : args[0]!.slice(start);
    }
    case "CONCAT":
      return args.join("");
    case "GS1CHECKSUM":
      return checksum(args[0]!);
    case "URLENCODE":
      return urlEscape(args[0]!);
    case "URLDECODE":
    case "URNDECODE":
      return unquote(args[0]!);
    case "URNENCODE":
      return urnEscape(args[0]!);
    default:
      throw new EpcError("epc.notEncodable");
  }
}

function run(level: EpcLevel, kind: string, values: Record<string, string>): void {
  for (const rule of level.rules.filter((r) => r.type === kind).sort((a, b) => Number(a.seq) - Number(b.seq))) {
    values[rule.newFieldName] = call(rule.function, values);
  }
}

/** A string compacted at 6 or 7 bits per character (TDT 3.13), or null when a character does not fit. */
function characters(text: string, compaction: string): string | null {
  if (compaction === "7-bit") {
    return [...text].every((c) => CSET_82.has(c)) ? [...text].map((c) => c.charCodeAt(0).toString(2).padStart(7, "0")).join("") : null;
  }
  if (compaction === "6-bit") {
    // TDS 14.3.6: the characters 0x20 to 0x5F, written as their low 6 bits
    if (![...text].every((c) => c.charCodeAt(0) >= 0x20 && c.charCodeAt(0) <= 0x5f)) return null;
    return [...text].map((c) => (c.charCodeAt(0) & 0x3f).toString(2).padStart(6, "0")).join("");
  }
  return null;
}

/** The BINARY grammar filled in, or null when a value does not fit its field. */
function binary(opt: EpcOption, values: Record<string, string>): string | null {
  const fields = Object.fromEntries(opt.fields.map((f) => [f.name, f]));
  let bits = "";
  for (const [literal, token] of tokens(opt.grammar)) {
    if (literal) {
      bits += token;
      continue;
    }
    const spec = fields[token]!;
    const value = values[token] ?? "";
    const length = spec.bitLength ? Number(spec.bitLength) : null;
    if (spec.compaction) {
      const part = characters(value, spec.compaction);
      if (part === null || !value || (length !== null && part.length > length)) return null;
      bits += length ? part.padEnd(length, "0") : part;
      continue;
    }
    if (value && !isDigits(value)) return null;
    // a number without a fixed width (a serial of a 96-bit scheme) is written without leading zeros (TDS 14.3.2):
    // "012" goes to the longer scheme, which keeps it as characters
    if (value && !spec.length && value !== BigInt(value).toString()) return null;
    const number = BigInt(value || "0");
    const minimum = BigInt(spec.decimalMinimum ?? "0");
    const maximum = spec.decimalMaximum !== undefined ? BigInt(spec.decimalMaximum) : 2n ** BigInt(length!) - 1n;
    if (!(minimum <= number && number <= maximum) || number >= 2n ** BigInt(length!)) return null;
    bits += number.toString(2).padStart(length!, "0");
  }
  return pyMatch(opt.pattern, bits) ? bits : null;
}

/**
 * A TAG_ENCODING or PURE_IDENTITY URI: the level's FORMAT rules, then its grammar, numbers padded as its fields say;
 * null unless the level's own pattern accepts it.
 */
function text(level: EpcLevel, key: string, given: Record<string, string>): string | null {
  const opt = option(level, key)!;
  const values = { ...given };
  run(level, "FORMAT", values);
  const fields = Object.fromEntries(opt.fields.map((f) => [f.name, f]));
  let out = "";
  for (const [literal, token] of tokens(opt.grammar)) {
    if (literal) {
      out += token;
      continue;
    }
    let value = values[token] ?? "";
    const spec = fields[token] ?? ({} as EpcField);
    if (spec.padChar && spec.length && Number(spec.length)) {
      value = spec.padDir === "LEFT" ? value.padStart(Number(spec.length), spec.padChar) : value;
    }
    out += value;
  }
  return pyMatch(opt.pattern, out) ? out : null;
}

/** The GS1 Digital Link path the artefacts read: the key and the qualifiers that are part of an EPC. */
export function epcPathOf(ai: string, value: string, qualifiers: Record<string, string>): string {
  let path = `/${ai}/${urlEscape(value)}`;
  for (const q of EPC_QUALIFIERS) if (qualifiers[q]) path += `/${q}/${urlEscape(qualifiers[q]!)}`;
  if (ai === "414" && !qualifiers["254"]) path += "/254/0"; // a GLN without extension: the extension 0 (TDS 6.3.3)
  return path;
}

/** What the key lacks before it has an EPC ({qualifier: "21"} or {serialAfter: 14}), or null. */
export function epcMissing(ai: string, value: string, qualifiers: Record<string, string>): { qualifier?: string; serialAfter?: number } | null {
  const rule = MINIMUM[ai] ?? {};
  if (rule.qualifier && !qualifiers[rule.qualifier]) return { qualifier: rule.qualifier };
  if (rule.serialAfter && value.length <= rule.serialAfter) return { serialAfter: rule.serialAfter };
  return null;
}

/** The filter a key's EPC takes by default: 1 (point of sale) for trade items, 0 (all others) for the other keys. */
export function defaultFilter(ai: string): number {
  return ai === "01" || ai === "8006" ? 1 : 0;
}

/** The EPC of a key (and its EPC qualifiers) with a company prefix of `prefixLength` digits. */
export function encodeEpc(
  schemes: Record<string, EpcScheme>,
  ai: string,
  value: string,
  qualifiers: Record<string, string>,
  prefixLength: number,
  filter = 1,
): Epc {
  if (!(ai in KEY_SCHEMES)) throw new EpcError("epc.unsupported", { key: ai });
  if (!PARTITION_LENGTHS.includes(prefixLength)) throw new EpcError("epc.prefixLength");
  if (!Number.isInteger(filter) || filter < 0 || filter > 7) throw new EpcError("epc.filterInvalid");
  const need = epcMissing(ai, value, qualifiers);
  if (need) throw new EpcError(need.qualifier ? "epc.needsQualifier" : "epc.needsSerial", need as Record<string, string | number>);
  const path = epcPathOf(ai, value, qualifiers);
  const key = String(prefixLength);
  for (const name of KEY_SCHEMES[ai]!) {
    const scheme = schemes[name]!;
    const levels = scheme.levels;
    const link = levels.GS1_DIGITAL_LINK;
    const opt = option(link, key);
    const match = opt ? pyMatch(opt.pattern, path) : null;
    if (!opt || !match) continue;
    const values: Record<string, string> = {
      gs1companyprefixlength: key, filter: String(filter), tagLength: String(scheme.tagLength ?? ""),
    };
    for (const spec of opt.fields) values[spec.name] = match[Number(spec.seq)] ?? "";
    try {
      run(link, "EXTRACT", values);
      run(levels.BINARY, "FORMAT", values);
      const bits = binary(option(levels.BINARY, key)!, values);
      if (bits === null) continue;
      const tagUri = text(levels.TAG_ENCODING, key, values);
      const pureIdentity = text(levels.PURE_IDENTITY, key, values);
      if (!tagUri || !pureIdentity) continue;
      return {
        scheme: name.toLowerCase(), filter, bits, hex: hexOf(bits, 16), linkHex: hexOf(bits), base64: base64Of(bits),
        tagUri, pureIdentity,
      };
    } catch {
      continue; // a rule that cannot apply to these values: the next scheme
    }
  }
  throw new EpcError("epc.notEncodable", { key: ai });
}

/** The part of a key value where the GS1 Company Prefix starts: after a GTIN's or ITIP's indicator, an SSCC's
 * extension digit and a GRAI's filler zero. */
export function companyPart(ai: string, value: string): string {
  return ["01", "8006", "00", "8003"].includes(ai) ? value.slice(1) : value;
}

let loaded: Promise<Record<string, EpcScheme>> | undefined;

/** The TDT schemes (about 550 KB), loaded once, when the EPC is first needed. */
export function epcSchemes(): Promise<Record<string, EpcScheme>> {
  loaded ??= import("./data/epc_schemes.json").then((module) => {
    const data = (module.default ?? module) as unknown as { schemes: EpcScheme[] };
    return Object.fromEntries(data.schemes.map((s) => [s.name, s]));
  });
  return loaded;
}
