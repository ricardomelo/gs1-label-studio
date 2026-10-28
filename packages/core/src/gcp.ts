/**
 * GS1's GCP length table: how many digits the GS1 Company Prefix of a key has, from GS1's list of prefixes
 * (GCPPrefixFormatList, an XML file GS1 gives on request):
 *
 *     <GCPPrefixFormatList date="2026-09-17T11:04:36.316Z">
 *       <entry prefix="7896" gcpLength="8" />
 *       …
 *
 * The person loads it once in the browser, where it stays; it is GS1's and restricted, so it is never in the
 * repository nor sent anywhere. A key's GS1 Company Prefix has the length of the longest entry its company part starts
 * with; a length of 0 means the range is not a GS1 Company Prefix. Ported from the resolver's `portal/gcp.py` (its ADR
 * 0015; ADR 0004 here) and checked against it; the XML is read without a DOM, so the same code runs in Node.
 */
export const GCP_ROOT = "GCPPrefixFormatList";
export const GCP_LENGTHS = new Set([0, 6, 7, 8, 9, 10, 11, 12]);
export const MAX_PREFIX = 12;
export const MAX_XML_CHARACTERS = 64 * 1024 * 1024; // once decompressed: the list of 2026 is 9.2 MB

const GCP_MESSAGES: Record<string, string> = {
  "gcp.notXml": "The file is not a GS1 GCP length table (XML).",
  "gcp.doctype": "The file declares a DOCTYPE or entities, which a GCP length table never has: refused.",
  "gcp.root": "The file's root element is {root}, not GCPPrefixFormatList.",
  "gcp.date": "The list has no valid date (the date attribute of GCPPrefixFormatList).",
  "gcp.element": "The list holds an element {element} where only entry elements are expected.",
  "gcp.entry": "Entry {number} is invalid (prefix {prefix}, length {length}): a prefix has 1 to 12 digits and a length is 0 or 6 to 12.",
  "gcp.duplicate": "The prefix {prefix} appears twice in the list.",
  "gcp.empty": "The list holds no entry.",
  "gcp.tooLarge": "The list is larger than {max} MB once decompressed.",
};

export class GcpError extends Error {
  constructor(
    readonly code: string,
    readonly params: Record<string, string | number> = {},
  ) {
    super((GCP_MESSAGES[code] ?? code).replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? "")));
    this.name = "GcpError";
  }
}

/** A list: its date, its prefixes in order and the length of each. */
export class GcpTable {
  readonly prefixes: string[];
  readonly lengths: Uint8Array;

  constructor(
    readonly date: string,
    entries: Map<string, number>,
  ) {
    this.prefixes = [...entries.keys()].sort();
    this.lengths = Uint8Array.from(this.prefixes.map((p) => entries.get(p)!));
  }

  get size(): number {
    return this.prefixes.length;
  }

  /** The length of the longest prefix the digits start with, or null when no entry matches. */
  lengthFor(digits: string): number | null {
    for (let size = Math.min(MAX_PREFIX, digits.length); size > 0; size--) {
      const head = digits.slice(0, size);
      let low = 0;
      let high = this.prefixes.length;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (this.prefixes[mid]! < head) low = mid + 1;
        else high = mid;
      }
      if (this.prefixes[low] === head) return this.lengths[low]!;
    }
    return null;
  }

  /** "prefix length" lines, to keep the list in the browser (and read it back with `fromCompact`). */
  compact(): string {
    return `${this.date}\n` + this.prefixes.map((p, i) => `${p} ${this.lengths[i]}`).join("\n");
  }

  static fromCompact(text: string): GcpTable {
    const [date = "", ...lines] = text.split("\n");
    return new GcpTable(date, new Map(lines.filter(Boolean).map((line) => {
      const [prefix = "", length = "0"] = line.split(" ");
      return [prefix, Number(length)];
    })));
  }
}

/** The list's date as ISO 8601 in UTC with a Z, to the second, as the resolver wrote it. */
function isoDate(text: string | undefined): string {
  const value = (text ?? "").trim();
  // Python's datetime.fromisoformat: a date, optionally a time and an offset ("Z" taken as +00:00)
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match) throw new GcpError("gcp.date");
  const [, y, mo, d, h = "00", mi = "00", s = "00", zone = "Z"] = match;
  const moment = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${zone === "Z" ? "Z" : zone}`);
  if (Number.isNaN(moment.getTime())) throw new GcpError("gcp.date");
  return moment.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return match ? (match[1] ?? match[2]) : undefined;
}

/** Checks a GCPPrefixFormatList (its text) and returns it, or throws a GcpError naming the first problem. */
export function parseGcpTable(xml: string): GcpTable {
  if (xml.length > MAX_XML_CHARACTERS) throw new GcpError("gcp.tooLarge", { max: MAX_XML_CHARACTERS / (1024 * 1024) });
  const head = xml.slice(0, 4096).replace(/^[﻿ \t\r\n]+/, "");
  if (!head.startsWith("<")) throw new GcpError("gcp.notXml");
  if (xml.includes("<!DOCTYPE") || xml.includes("<!ENTITY")) throw new GcpError("gcp.doctype");
  // The markup: the declaration and comments aside, every tag in order.
  const body = xml.replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  if (/<(?![/A-Za-z_])/.test(body) || /^[^<]*[^\s<][^<]*</.test(body)) throw new GcpError("gcp.notXml");
  const tagPattern = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  const entries = new Map<string, number>();
  const stack: string[] = [];
  let date = "";
  let position = 0;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(body)) !== null) {
    if (body.slice(position, match.index).includes("<")) throw new GcpError("gcp.notXml");
    position = tagPattern.lastIndex;
    const [tag, closing, name, , selfClosing] = match;
    if (closing) {
      if (stack.pop() !== name) throw new GcpError("gcp.notXml");
      continue;
    }
    const depth = stack.length + 1;
    if (depth === 1) {
      if (entries.size || date) throw new GcpError("gcp.notXml"); // a second root
      if (name !== GCP_ROOT) throw new GcpError("gcp.root", { root: name!.slice(0, 60) });
      date = isoDate(attribute(tag, "date"));
    } else if (depth === 2 && name !== "entry") {
      throw new GcpError("gcp.element", { element: name!.slice(0, 60) });
    } else if (depth > 2) {
      throw new GcpError("gcp.element", { element: name!.slice(0, 60) });
    }
    if (depth === 2) {
      const prefix = (attribute(tag, "prefix") ?? "").trim();
      const length = (attribute(tag, "gcpLength") ?? "").trim();
      if (!/^[0-9]{1,12}$/.test(prefix) || !/^[0-9]+$/.test(length) || !GCP_LENGTHS.has(Number(length))) {
        throw new GcpError("gcp.entry", { prefix: prefix.slice(0, 20), length: length.slice(0, 20), number: entries.size + 1 });
      }
      if (entries.has(prefix)) throw new GcpError("gcp.duplicate", { prefix });
      entries.set(prefix, Number(length));
    }
    if (!selfClosing) stack.push(name!);
  }
  if (stack.length || !date) throw new GcpError("gcp.notXml");
  if (body.slice(position).includes("<")) throw new GcpError("gcp.notXml");
  if (!entries.size) throw new GcpError("gcp.empty");
  return new GcpTable(date, entries);
}

/** A key's GS1 Company Prefix by the list: its length (0: not a GS1 Company Prefix), or null without an entry. */
export function gcpLengthOf(table: GcpTable, companyPart: string): number | null {
  const digits = /^[0-9]*/.exec(companyPart)![0]; // a GIAI's or GRAI's serial may follow
  return digits ? table.lengthFor(digits) : null;
}
