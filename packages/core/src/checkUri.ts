import { aiEntry, qualifiersOf } from "./dictionary.ts";
import { faultOfEngineMessage } from "./engineFaults.ts";
import { inUriOrder } from "./identify.ts";
import type { AddFinding } from "./checkValues.ts";
import { rangeOf, type Marked, type Range } from "./repair.ts";
import type { ParsedInput, SyntaxEngine } from "./syntax.ts";

// The Check Studio's checks of a GS1 Digital Link URI (backlog 7.1 c; the check studio's project, section 4, group G):
// the engine's own refusals named, and what it accepts or refuses without saying how to mend: short names in the path
// (G9), a compressed URI (G10), a slash or a percent sign left raw in a value (G6), qualifiers out of order or an
// attribute in the path (G2, G3), plain http or another scheme (G8), a URI valid but not in its canonical form (G7).
// Each finding that a mended URI resolves carries it, and the element strings it means.

/** The short names an earlier version of the standard allowed in the path, and their AIs. */
const SHORT_NAMES: Readonly<Record<string, string>> = {
  gtin: "01", cpv: "22", lot: "10", ser: "21", sscc: "00", gln: "414", glnx: "254", gdti: "253", grai: "8003", giai: "8004",
  gsrn: "8018", gsrnp: "8017", gcn: "255", ginc: "401", gsin: "402", itip: "8006", cpid: "8010", cpsn: "8011", party: "417",
};

export interface UriOutcome {
  /** What the URI means, once mended where it could be: null when it means nothing the engine accepts. */
  parsed: ParsedInput | null;
  /** The URI checked last, mended or not. */
  uri: string;
}

interface Parts {
  scheme: string;
  host: string;
  /** The path's segments before the first key. */
  before: string[];
  pairs: [string, string][];
  query: string;
  fragment: string;
}

/** A URI's parts, its path read as AI and value pairs from the first segment that is a known key. */
function partsOf(uri: string): Parts | null {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(uri);
  if (!m) return null;
  const segments = m[3]!.split("/").slice(1);
  const first = segments.findIndex((s) => Boolean(aiEntry(s)?.dlpkey) || s in SHORT_NAMES);
  const rest = first === -1 ? [] : segments.slice(first);
  const pairs: [string, string][] = [];
  for (let i = 0; i < rest.length; i += 2) pairs.push([rest[i]!, rest[i + 1] ?? ""]);
  return { scheme: m[1]!, host: m[2]!, before: first === -1 ? segments : segments.slice(0, first), pairs, query: m[4] ?? "", fragment: m[5] ?? "" };
}

const build = (p: Parts) =>
  `${p.scheme}://${p.host}${p.before.map((s) => `/${s}`).join("")}${p.pairs.map(([a, v]) => `/${a}/${v}`).join("")}${p.query}${p.fragment}`;

/** The bytes of an AI's value in the URI, in its path or its query; the whole URI when it is not there. */
export function uriValueRange(m: Marked, ai: string): Range {
  const found = new RegExp(`[/?&]${ai}[/=]([^/?&#]*)`).exec(m.text);
  if (!found) return rangeOf(m, 0, m.text.length);
  const start = found.index + found[0].length - found[1]!.length;
  return rangeOf(m, start, start + found[1]!.length);
}

/** Checks a URI, mending what the rules above can mend, and adds the findings. */
export function checkUri(engine: SyntaxEngine, m: Marked, add: AddFinding): UriOutcome {
  let uri = m.text;
  const all: Range = rangeOf(m, 0, m.text.length);
  const parse = (text: string) => {
    try {
      return engine.parse(text);
    } catch {
      return null;
    }
  };
  const accepted = (text: string) => engine.checkMessage(text) === null;

  // G8: the scheme
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(uri)?.[1] ?? "";
  if (!/^https?$/i.test(scheme)) {
    add("G8", [rangeOf(m, 0, scheme.length)], { severity: "error", details: { scheme } });
    uri = `https${uri.slice(scheme.length)}`;
  } else if (/^http$/i.test(scheme)) {
    add("G8", [rangeOf(m, 0, scheme.length)], { severity: "warning", details: { scheme } });
  }

  // G6: a percent sign that starts no %hh
  if (/%(?![0-9A-Fa-f]{2})/.test(uri)) {
    const at = Math.max(m.text.search(/%(?![0-9A-Fa-f]{2})/), 0);
    const mended = uri.replace(/%(?![0-9A-Fa-f]{2})/g, "%25");
    add("G6", [rangeOf(m, at, at + 1)], { details: { uri: mended } });
    uri = mended;
  }

  let parts = partsOf(uri);
  // G9: short names in the path
  if (parts && parts.pairs.some(([a]) => a in SHORT_NAMES)) {
    const names = parts.pairs.filter(([a]) => a in SHORT_NAMES).map(([a]) => a);
    parts = { ...parts, pairs: parts.pairs.map(([a, v]) => [SHORT_NAMES[a] ?? a, v]) };
    uri = build(parts);
    add("G9", names.map((n) => uriSegmentRange(m, n)), { details: { names: names.join(", "), uri } });
  }

  let problem = engine.checkMessage(uri);
  if (problem && parts) {
    const code = faultOfEngineMessage(problem.message);
    // G10: one opaque segment, a compressed URI
    const path = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*\/([^?#]*)/i.exec(uri)?.[1] ?? "";
    if (code === "G1" && /^[A-Za-z0-9_-]{10,}$/.test(path) && parts.pairs.length === 0) {
      add("G10", [all]);
      return { parsed: null, uri };
    }
    // G6: a slash left raw in a value cuts the path: the segment where an AI should be belongs to the value before it
    const cut = ([a, v]: [string, string]) => !aiEntry(a) || v === "";
    if (parts.pairs.some((p, i) => i > 0 && cut(p))) {
      const pairs: [string, string][] = [];
      for (const [a, v] of parts.pairs) {
        if (pairs.length > 0 && cut([a, v])) {
          const last = pairs[pairs.length - 1]!;
          last[1] = `${last[1]}%2F${a}${v ? `%2F${v}` : ""}`;
        } else pairs.push([a, v]);
      }
      const mended = build({ ...parts, pairs });
      if (accepted(mended)) {
        add("G6", [all], { details: { uri: mended } });
        uri = mended;
        parts = partsOf(uri)!;
        problem = null;
      }
    }
    // A trailing slash (G7, below) is the only fault of a URI the engine then accepts
    if (problem && uri.endsWith("/") && accepted(uri.replace(/\/+$/, ""))) problem = null;
    // G2, G3: qualifiers out of order, or an attribute in the path
    if (problem && code === "G2") {
      const key = parts.pairs[0]![0];
      const qualifiers = new Set(qualifiersOf(key));
      const attributes = parts.pairs.slice(1).filter(([a]) => !qualifiers.has(a));
      if (attributes.length > 0) {
        const query = [parts.query.replace(/^\?/, ""), ...attributes.map(([a, v]) => `${a}=${v}`)].filter(Boolean).join("&");
        const mended = build({ ...parts, pairs: parts.pairs.filter((p) => !attributes.includes(p)), query: `?${query}` });
        add("G3", attributes.map(([a]) => uriSegmentRange(m, a)), { ai: attributes[0]![0], engineMessage: problem.message, details: { uri: mended } });
        uri = mended;
      } else {
        const ordered = inUriOrder(parts.pairs.map(([ai, value]) => ({ ai, value })));
        const mended = build({ ...parts, pairs: ordered.map((e) => [e.ai, e.value]) });
        add("G2", [all], { engineMessage: problem.message, details: { uri: mended } });
        uri = mended;
      }
      parts = partsOf(uri)!;
      problem = engine.checkMessage(uri);
    }
  }
  if (problem) {
    const ai = /AI \((\d{2,4})\)/.exec(problem.message)?.[1] ?? null;
    const value = ai && parts ? (parts.pairs.find(([a]) => a === ai)?.[1] ?? "") : "";
    // A GTIN of fewer than 14 digits: valid where zero suppression is allowed, not canonical (G7)
    if (ai === "01" && /^\d{8}$|^\d{12,13}$/.test(value) && parts) {
      const padded = build({ ...parts, pairs: parts.pairs.map(([a, v]) => [a, a === "01" ? v.padStart(14, "0") : v]) });
      if (accepted(padded)) {
        add("G7", [uriValueRange(m, "01")], { details: { canonical: parse(padded)?.digitalLinkUri ?? padded, reason: "gtin" } });
        return { parsed: parse(padded), uri: padded };
      }
    }
    const code = faultOfEngineMessage(problem.message, ai, value);
    add(code, ai ? [uriValueRange(m, ai)] : [], { ai, engineMessage: problem.message });
    return { parsed: null, uri };
  }
  const trimmed = uri.replace(/\/+$/, "");
  const parsed = parse(trimmed);
  if (!parsed) return { parsed: null, uri };
  // G7: valid, not canonical
  const p = partsOf(trimmed);
  const reasons = [
    trimmed !== uri ? "trailing-slash" : "",
    p && p.host !== p.host.toLowerCase() ? "upper-case-host" : "",
    p && p.fragment ? "fragment" : "",
    p && p.before.length > 0 ? "path-before-key" : "",
  ].filter(Boolean);
  if (reasons.length > 0) add("G7", [all], { details: { canonical: parsed.digitalLinkUri, reason: reasons.join(" ") } });
  return { parsed, uri: trimmed };
}

/** The bytes of a path segment that is exactly `name`. */
function uriSegmentRange(m: Marked, name: string): Range {
  const found = new RegExp(`/${name}(?=[/?#]|$)`).exec(m.text);
  return found ? rangeOf(m, found.index + 1, found.index + 1 + name.length) : rangeOf(m, 0, m.text.length);
}
