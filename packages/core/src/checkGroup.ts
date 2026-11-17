import type { CheckResult, Finding, Verdict } from "./check.ts";
import { verdictOf } from "./check.ts";
import { isPointOfSaleLinear, isTwoD, symbolsOf } from "./checkContext.ts";
import { aiEntry } from "./dictionary.ts";
import { distanceBetween } from "./estimate.ts";
import { fault, SEVERITY_RANK, type Severity } from "./faults.ts";
import { isKey } from "./identify.ts";
import type { Reading } from "./reading.ts";
import { SPEC_SYMBOL_NAMES } from "./specifications.ts";

// The Check Studio's check of several carriers on one item (backlog 7.1 d; the check studio's project, section 5,
// group J): each reading is checked alone first (check()), then the group against section 4.15 of the General
// Specifications. Every reading is already in one form — an EAN/UPC's or ITF-14's GTIN padded to 14 digits as AI (01),
// a URI's elements, an EPC's key and serial — and values are compared character by character: no trimming, no case
// folding, no leading zero dropped (4.15.2). The matrix, one row per AI and one column per carrier, explains most
// group faults by itself.

/** What the user says the group is: the rules differ. */
/** For retail POS the whole 2D symbol should lie within this radius of the linear symbol's centre (6.3.3.1). */
export const J5_RADIUS_MM = 50;

export type GroupKind = "consumer-pack" | "case" | "logistic-label" | "tag-and-code";

export interface GroupMember {
  reading: Reading;
  result: CheckResult;
}

export interface GroupColumn {
  carrier: Reading["carrier"];
  symbologyIdentifier: string | null;
  /** A barcode's symbol, as the specification tables name it ("EAN-13", "GS1 DataMatrix"); null for a tag. */
  symbol: string | null;
  /** An RFID tag's EPC scheme ("sgtin-96", "sgtin+"); null otherwise. The screen heads each column with these. */
  scheme: string | null;
}

export interface MatrixRow {
  ai: string;
  title: string;
  /** One value per column; null where the carrier does not carry the AI. */
  values: (string | null)[];
  /** The carriers that carry it do not all carry the same value. */
  differs: boolean;
}

export interface GroupFinding {
  code: string;
  severity: Severity;
  /** The columns it concerns. */
  columns: number[];
  ai: string | null;
  sections: string[];
  details?: Record<string, string>;
}

export interface GroupResult {
  verdict: Verdict;
  columns: GroupColumn[];
  matrix: MatrixRow[];
  /** The worst first. */
  findings: GroupFinding[];
  /** A reading's finding the group answers: C9 or E1 whose key or companion another carrier holds, F3 beside a linear symbol. */
  resolved: { column: number; code: string; by: string }[];
  /** Codes that could not be assessed: J4 without a context, J5 without one picture with a scale. */
  notChecked: string[];
}

const LINEAR_RETAIL_CONTEXTS = new Set(["retail", "retail-gd"]);
/** A numeric serial without leading zeros, the only one an SGTIN-96 holds (TDS 2.3, 14.5.1). */
const SGTIN96_SERIAL = /^(?:0|[1-9]\d{0,11})$/;

function columnOf({ reading, result }: GroupMember): GroupColumn {
  const base = { carrier: reading.carrier, symbologyIdentifier: reading.symbologyIdentifier, symbol: null, scheme: null };
  if (reading.carrier === "rfid") return { ...base, scheme: result.tag?.scheme ?? null };
  if (reading.carrier === "nfc") return base;
  // ZXing gives a UPC-A as its EAN-13 and does not tell GS1 DataBar's siblings apart: each candidate, then
  return { ...base, symbol: symbolsOf(reading).map((s) => SPEC_SYMBOL_NAMES[s]).join(" / ") || reading.format };
}

/** The AIs an E1 finding needs, one of which is enough, from the engine's message. */
const requiredOf = (f: Finding) => /not satisfied: ([\d,]+)/.exec(f.engineMessage ?? "")?.[1]?.split(",") ?? [];

const isUriReading = (r: Reading) => /^https?:\/\//i.test(r.text);
const uriParts = (text: string) => /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)/i.exec(text);

/** Checks several readings of one item together; each member's result is check()'s for that reading. */
export function checkGroup(members: readonly GroupMember[], kind: GroupKind, context: { environment?: string | null } = {}): GroupResult {
  const columns = members.map(columnOf);
  const findings: GroupFinding[] = [];
  const resolved: GroupResult["resolved"] = [];
  const notChecked = new Set<string>();
  const add = (code: string, cols: number[], ai: string | null = null, extra: { severity?: Severity; details?: Record<string, string> } = {}) => {
    const f = fault(code);
    findings.push({ code, severity: extra.severity ?? f.severity, columns: [...new Set(cols)].sort((a, b) => a - b), ai, sections: f.sections, ...(extra.details ? { details: extra.details } : {}) });
  };

  // The matrix: keys first, then the AIs in the order the carriers hold them
  const valueOf = members.map(({ result }) => {
    const map = new Map<string, string>();
    for (const e of result.elements) if (!map.has(e.ai)) map.set(e.ai, e.value);
    return map;
  });
  const ais = [...new Set(valueOf.flatMap((m) => [...m.keys()]))];
  ais.sort((a, b) => Number(isKey(b)) - Number(isKey(a)));
  const matrix: MatrixRow[] = ais.map((ai) => {
    const values = valueOf.map((m) => m.get(ai) ?? null);
    return { ai, title: aiEntry(ai)?.title ?? "", values, differs: new Set(values.filter((v) => v !== null)).size > 1 };
  });

  const index = members.map((_, i) => i);
  const tags = index.filter((i) => members[i]!.reading.carrier === "rfid");
  const nfcs = index.filter((i) => members[i]!.reading.carrier === "nfc");
  const barcodes = index.filter((i) => members[i]!.reading.carrier === "barcode");
  const gs1128 = barcodes.filter((i) => members[i]!.reading.symbologyIdentifier === "]C1");
  const twoD = barcodes.filter((i) => isTwoD(members[i]!.reading));
  const linear = barcodes.filter((i) => isPointOfSaleLinear(members[i]!.reading));
  const logistic = kind === "logistic-label";

  // J1, J2 and J9: the barcodes against each other
  for (const row of matrix) {
    const carrying = barcodes.filter((i) => row.values[i] !== null);
    const distinct = new Set(carrying.map((i) => row.values[i]));
    if (distinct.size < 2) continue;
    const details: Record<string, string> = { values: carrying.map((i) => row.values[i]).join(", ") };
    if (logistic) {
      add("J9", carrying, row.ai, { details: { ...details, reason: row.ai === "00" ? "sscc" : "values" } });
    } else if (isKey(row.ai)) {
      const values = [...distinct] as string[];
      // Two GTINs that differ in the indicator only: perhaps the box's code and the product's inside
      if (row.ai === "01" && values.every((v) => v.slice(1, 13) === values[0]!.slice(1, 13))) details.indicatorOnly = "true";
      add("J1", carrying, row.ai, { details });
    } else add("J2", carrying, row.ai, { details });
  }

  // J7: an RFID tag against the barcodes
  for (const t of tags) {
    const tag = members[t]!.result;
    for (const b of barcodes) {
      const barcodeKeys = [...valueOf[b]!.keys()].filter(isKey);
      const tagKeys = [...valueOf[t]!.keys()].filter(isKey);
      if (tagKeys.length && barcodeKeys.length && !barcodeKeys.some((k) => tagKeys.includes(k))) {
        add("J7", [b, t], barcodeKeys[0]!, { details: { reason: "scheme", scheme: tag.tag?.scheme ?? "", key: barcodeKeys[0]! } });
        continue;
      }
      for (const row of matrix) {
        const [x, y] = [row.values[b] ?? null, row.values[t] ?? null];
        if (x === null || y === null || x === y) continue;
        const details: Record<string, string> = { barcode: x, tag: y };
        if (row.ai === "21" && tag.tag?.scheme === "sgtin-96" && !SGTIN96_SERIAL.test(x)) details.cannotFit = "sgtin-96";
        add("J7", [b, t], row.ai, { details });
      }
    }
  }

  // J8: an NFC tag against the 2D symbols with a URI: protocol, host, key and every data element
  for (const n of nfcs) {
    const tagUri = members[n]!.reading.text;
    for (const b of twoD.filter((i) => isUriReading(members[i]!.reading))) {
      const [p, q] = [uriParts(tagUri), uriParts(members[b]!.reading.text)];
      if (p && q && p[1]!.toLowerCase() !== q[1]!.toLowerCase()) add("J8", [b, n], null, { details: { field: "scheme", symbol: q[1]!, tag: p[1]! } });
      if (p && q && p[2]!.toLowerCase() !== q[2]!.toLowerCase()) add("J8", [b, n], null, { details: { field: "host", symbol: q[2]!, tag: p[2]! } });
      for (const row of matrix) {
        const [x, y] = [row.values[b], row.values[n]];
        if (x === y) continue;
        add("J8", [b, n], row.ai, { details: { field: "element", symbol: x ?? "", tag: y ?? "" } });
      }
    }
  }

  // J3, and the associations a group answers: attributes in one symbol, their key or companion in another
  for (const [i, { result }] of members.entries()) {
    const others = new Set(index.filter((j) => j !== i).flatMap((j) => [...valueOf[j]!.keys()]));
    for (const f of result.findings) {
      if (f.code !== "C9" && f.code !== "E1") continue;
      const answered = f.code === "C9" ? [...others].some(isKey) : requiredOf(f).some((ai) => others.has(ai));
      if (!answered) continue;
      if (logistic) {
        resolved.push({ column: i, code: f.code, by: "group" }); // a logistic label splits its element strings over symbols (6.6)
        continue;
      }
      const holder = index.find((j) => j !== i && [...valueOf[j]!.keys()].some((ai) => (f.code === "C9" ? isKey(ai) : requiredOf(f).includes(ai))))!;
      add("J3", [i, holder], f.ai, { severity: members[i]!.reading.symbologyIdentifier === "]C1" ? "warning" : "error" });
      resolved.push({ column: i, code: f.code, by: "J3" });
    }
  }

  // J4 and J5: a retail consumer pack's 2D symbol and its linear one
  if (kind === "consumer-pack" && twoD.length) {
    const environment = context.environment;
    if (typeof environment !== "string") notChecked.add("J4");
    else if (LINEAR_RETAIL_CONTEXTS.has(environment) && linear.length === 0) add("J4", twoD);
    if (linear.length) {
      // The distance needs one picture with a scale (estimate.ts): the farthest of the 2D symbols from each linear one
      let farthest: { distance: number; pair: number[] } | null = null;
      for (const l of linear) for (const d of twoD) {
        const distance = distanceBetween(members[l]!.reading, members[d]!.reading);
        if (distance !== null && (!farthest || distance > farthest.distance)) farthest = { distance, pair: [d, l] };
      }
      if (!farthest) {
        add("J5", [...twoD, ...linear], null, { severity: "not-assessed" });
        notChecked.add("J5");
      } else if (farthest.distance > J5_RADIUS_MM) {
        add("J5", farthest.pair, null, { details: { distance: farthest.distance.toFixed(1), radius: String(J5_RADIUS_MM) } });
      }
    }
    for (const i of twoD) {
      if (members[i]!.result.findings.some((f) => f.code === "F3")) resolved.push({ column: i, code: "F3", by: linear.length ? "group" : "J4" });
    }
  }

  // J6: a case's or a logistic label's GS1-128 element strings, at a minimum in the supplemental 2D symbol
  if ((kind === "case" || logistic) && twoD.length) {
    for (const s of twoD) {
      for (const g of gs1128) {
        const missing = [...valueOf[g]!].filter(([ai, v]) => valueOf[s]!.get(ai) !== v).map(([ai]) => ai);
        if (missing.length) add("J6", [g, s], missing[0]!, { details: { ais: missing.join(", ") } });
      }
    }
  }

  // J9: a logistic label's mandatory associations across its symbols (4.13.2): (02) with (37) and the SSCC
  if (logistic) {
    const all = new Set(valueOf.flatMap((m) => [...m.keys()]));
    if (all.has("02") && !all.has("37")) add("J9", index.filter((i) => valueOf[i]!.has("02")), "02", { details: { reason: "missing", ai: "37" } });
    if (all.has("02") && !all.has("00")) add("J9", index.filter((i) => valueOf[i]!.has("02")), "02", { details: { reason: "missing", ai: "00" } });
  }

  // J10: a symbol that is not a GS1 one
  for (const [i, { result }] of members.entries()) if (result.findings.some((f) => f.code === "A8")) add("J10", [i]);

  findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || Number(a.code.slice(1)) - Number(b.code.slice(1)));
  const open = members.flatMap(({ result }, i) => result.findings.filter((f) => !resolved.some((r) => r.column === i && r.code === f.code)));
  const asFindings = findings.map((f) => ({ code: f.code, severity: f.severity, ranges: [], ai: f.ai, sections: f.sections, engineMessage: null }));
  const elements = members.reduce((sum, { result }) => sum + result.elements.length, 0);
  return { verdict: verdictOf([...asFindings, ...open], elements), columns, matrix, findings, resolved, notChecked: [...notChecked] };
}
