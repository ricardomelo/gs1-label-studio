import { checkUri, uriValueRange } from "./checkUri.ts";
import { expectedCheckDigit, hasKey, reorderedDate, valueRules, withTitles, type AddFinding, type CheckContext, type Located } from "./checkValues.ts";
import { aiEntry } from "./dictionary.ts";
import { faultOfEngineMessage } from "./engineFaults.ts";
import { fault, SEVERITY_RANK, type Severity } from "./faults.ts";
import { dataCharacters, GS1_128_MAX_DATA } from "./gs1128.ts";
import type { Reading } from "./reading.ts";
import {
  cut, flagText, formattingStripped, GS, insert, isBracketed, markedOf, rangeOf, REPAIR_PROVES, replace, splitBracketed, splitUnbracketed,
  standInsReplaced, type Marked, type Range, type RepairName, type Split, type Token,
} from "./repair.ts";
import type { EngineFault, SyntaxEngine } from "./syntax.ts";

// The Check Studio's check of one reading (backlog 7.1 b; the check studio's project, section 4): in a fixed order,
// (1) the carrier — is the symbol a GS1 one, and does its data start as GS1 data should (group A); (2) the named repairs
// (repair.ts), kept when they leave fewer faults; (3) the GS1 Barcode Syntax Engine on every element string alone and
// then on the whole message, so that every fault is found, not only the engine's first; (4) the studio's own rules on
// the structure (group B); (5) the own rules on keys, values and associations (groups C to E, checkValues.ts) and on
// GS1 Digital Link URIs (group G, checkUri.ts). Groups F, H, I and J come with items d and m. Every finding points at
// the reading's own bytes.

/** The four verdicts of the simple view, and one for a reading nothing could be checked of. */
export type Verdict = "follows" | "remarks" | "does-not-follow" | "not-gs1" | "not-assessed";

export interface Finding {
  code: string;
  severity: Severity;
  /** The bytes of the reading it points at, end excluded; empty when it concerns the symbol as a whole. */
  ranges: Range[];
  /** The AI it concerns, when it concerns one. */
  ai: string | null;
  sections: string[];
  /** The engine's own message, in English, when the engine found it. */
  engineMessage: string | null;
  /** The data made right, as a bracketed element string, when a repair produced valid data. */
  fixedData?: string;
  /** What explains it: the check digit that would be right, the date a day 00 stands for, the URI mended… */
  details?: Record<string, string>;
}

export interface CheckedElement {
  ai: string;
  value: string;
  /** The AI's data title, from the GS1 Barcode Syntax Dictionary ("BATCH/LOT"). */
  title: string;
  /** The bytes of the AI and its value in the reading. */
  range: Range;
  /** A group separator follows it in the data. */
  separator: boolean;
}

export interface CheckResult {
  verdict: Verdict;
  /** The worst first; within a severity, in the order of the checks (carrier, structure, key, values, combinations). */
  findings: Finding[];
  elements: CheckedElement[];
  /** The repairs kept, in the order they were made. */
  repairs: RepairName[];
  /** The data in its other forms, when it is valid once repaired: bracketed, the engine's notation, GS1 Digital Link. */
  forms: { elementString: string; dataStr: string; digitalLinkUri: string } | null;
  /** Codes that could not be assessed for want of something: C8 without a GCP table. */
  notChecked: string[];
}

export type { CheckContext } from "./checkValues.ts";

/** The symbology identifiers of GS1 symbols carrying element strings (General Specifications 5.1.3, table 5-2). */
const ELEMENT_STRING_CARRIERS = new Set(["]C1", "]d2", "]Q3", "]e0", "]J1"]);
/** The plain symbols a faulty label uses instead: Data Matrix, QR Code (models 1 and 2) and Code 128. */
const PLAIN_CARRIERS: Record<string, "A1" | "A2" | "A3"> = { "]d1": "A1", "]Q1": "A2", "]Q0": "A2", "]C0": "A3" };

const AI_IN_MESSAGE = /AI \((\d{2,4})\)/;

/** Checks one reading: what is wrong with it, where, and the data made right when a named repair makes it so. */
export function check(engine: SyntaxEngine, reading: Reading, context: CheckContext = {}): CheckResult {
  const findings: Finding[] = [];
  const repairs: RepairName[] = [];
  const notChecked = new Set<string>();
  const today = context.today ?? new Date(reading.at);
  const add: AddFinding = (code, ranges, extra = {}) => {
    const f = fault(code);
    findings.push({ code, severity: f.severity, ranges, ai: null, sections: f.sections, engineMessage: null, ...extra });
  };
  const result = (elements: CheckedElement[] = [], forms: CheckResult["forms"] = null): CheckResult => {
    findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || order(a) - order(b));
    return { verdict: verdictOf(findings), findings, elements, repairs, forms, notChecked: [...notChecked] };
  };
  /** An engine message on one element string, named, with what explains it. */
  const engineFinding = (ai: string, value: string, message: string, ranges: Range[], valueRange: Range) => {
    const code = faultOfEngineMessage(message, ai, value);
    const details: Record<string, string> = {};
    if (code === "C1") {
      const expected = expectedCheckDigit(ai, value);
      if (expected) details.expected = expected;
    }
    add(code, ranges, { ai, engineMessage: message, ...(Object.keys(details).length ? { details } : {}) });
    if (code === "D1") {
      const reordered = reorderedDate(value, today);
      if (reordered) add("D4", [valueRange], { ai, details: { reordered } });
    }
  };
  /** The own rules on element strings the engine accepted alone. */
  const ownRules = (located: Located[], refused: Set<string>) => {
    for (const code of valueRules(located, context, today, add, refused)) notChecked.add(code);
  };

  if (reading.bytes.length === 0) {
    add("A9", []);
    return result();
  }
  if (reading.carrier === "rfid") return result(); // tags are item 7.1 d

  const id = reading.symbologyIdentifier;
  const plain = id ? PLAIN_CARRIERS[id] : undefined;
  let m = markedOf(reading);

  // (1) The carrier
  if (id && !plain && !ELEMENT_STRING_CARRIERS.has(id) && !/^\][EI]\d$/.test(id)) {
    add("A8", []);
    return result();
  }
  const gtin = (kind: "itf" | "ean" | "assumed") => gtinOnly(engine, m, kind, id ?? "", add, result, engineFinding, ownRules);
  if (/^\]I\d$/.test(id ?? "")) return gtin("itf");
  if (/^\]E\d$/.test(id ?? "")) return gtin("ean");
  if (id === null && /^(?:\d{8}|\d{12,14})$/.test(m.text)) return gtin("assumed");

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(m.text) || reading.carrier === "nfc") {
    if (!/^https?:/i.test(m.text) && !/\/(?:01|00|414|8018|gtin|sscc)\//.test(m.text)) {
      add("A8", []);
      return result();
    }
    if (id && ELEMENT_STRING_CARRIERS.has(id)) add("A6", []);
    const outcome = checkUri(engine, m, add);
    if (!outcome.parsed) return result();
    const located = outcome.parsed.elements.map((e) => ({ ai: e.ai, value: e.value, range: uriValueRange(m, e.ai) }));
    ownRules(located, new Set());
    const proven = findings.filter((f) => f.details?.uri || f.details?.canonical);
    for (const f of proven) f.fixedData = outcome.parsed.elementString;
    const elements = located.map((e) => ({ ai: e.ai, value: e.value, title: aiEntry(e.ai)?.title ?? "", range: e.range, separator: false }));
    const { elementString, dataStr, digitalLinkUri } = outcome.parsed;
    return result(elements, { elementString, dataStr, digitalLinkUri });
  }

  let carrierFault: string | null = null;
  const flag = flagText(m);
  if (flag > 0) {
    add("A4", [rangeOf(m, 0, flag)]);
    repairs.push("strip-flag-text");
    m = cut(m, 0, flag);
  } else if (plain && m.text.startsWith(GS) && plain !== "A3") {
    carrierFault = "A5";
    m = cut(m, 0, 1);
  } else if (plain) carrierFault = plain;
  if (id === null && m.text.startsWith("^")) m = cut(m, 0, 1); // the engine's notation for FNC1, as people paste it
  if (id === null && !isBracketed(m.text)) m = withSeparators(m, /\^/g); // and for a separator

  // (2) The repairs, and the split into element strings
  let split = splitOf(m);
  const formatting = formattingStripped(m);
  if (formatting) {
    const stripped = splitOf(formatting.marked);
    if (better(engine, stripped, split)) {
      split = stripped;
      repairs.push("strip-formatting");
      add("B2", formatting.ranges);
    }
  }
  if (!isBracketed(split.marked.text) && id !== null) {
    const replaced = standInsReplaced(split.marked);
    if (replaced) {
      const withSeparator = splitOf(replaced.marked);
      if (withSeparator.complete && withSeparator.tokens.length > split.tokens.length && !worse(engine, withSeparator, split)) {
        split = withSeparator;
        repairs.push("stand-in-separator");
        add("B6", replaced.ranges);
      }
    }
  }
  split = separatorsInserted(engine, split, add, repairs);

  // Not GS1 data at all: a plain symbol whose data does not start with a known AI followed by a valid value
  const first = split.tokens[0];
  const lone = split.tokens.length === 1 && !isBracketed(split.marked.text) && first && engine.checkElementString(first.ai, first.value);
  if ((plain || id === null) && (!first || first.start !== 0 || lone)) {
    findings.length = 0;
    repairs.length = 0;
    add("A8", []);
    return result();
  }
  if (carrierFault) {
    add(carrierFault, carrierFault === "A5" ? [rangeOf(markedOf(reading), 0, 1)] : []);
    repairs.unshift(carrierFault === "A5" ? "drop-leading-separator" : "assume-fnc1");
  }

  // (3) and (4): the structure, every element string alone, then the whole message
  const sm = split.marked;
  for (const event of split.events) {
    if (event.code === "B1" && id === null) continue; // pasted text written the way people write it
    const ranges = event.spans.map(([i, j]) => rangeOf(sm, i, j));
    if (event.code === "B11") add("B11", ranges, { ai: event.ai ?? null });
    else add(event.code, ranges, event.ai ? { ai: event.ai } : {});
  }
  if (id !== null && split.events.some((e) => e.code === "B1")) repairs.push("strip-parentheses");
  if (split.events.some((e) => e.code === "B4" || e.code === "B5")) repairs.push("drop-separator");

  let valid = split.complete;
  const refused = new Set<string>();
  for (const token of split.tokens) {
    const problem = engine.checkElementString(token.ai, token.value);
    if (!problem) continue;
    valid = false;
    refused.add(token.ai);
    engineFinding(token.ai, token.value, problem.message, [markupRange(sm, token, problem)], rangeOf(sm, token.valueStart, token.end));
  }
  ownRules(split.tokens.map((t) => ({ ai: t.ai, value: t.value, range: rangeOf(sm, t.valueStart, t.end) })), refused);
  const elements = split.tokens.map((t) => ({
    ai: t.ai, value: t.value, title: aiEntry(t.ai)?.title ?? "", range: rangeOf(sm, t.start, t.end), separator: t.separator,
  }));
  for (const [i, a] of split.tokens.entries()) {
    const other = split.tokens.slice(i + 1).find((b) => b.ai === a.ai && b.value !== a.value);
    if (other && !findings.some((f) => f.code === "B10" && f.ai === a.ai)) {
      valid = false;
      add("B10", [rangeOf(sm, a.start, a.end), rangeOf(sm, other.start, other.end)], { ai: a.ai });
    }
  }
  if (id === "]C1" && split.complete) {
    const count = dataCharacters(split.tokens);
    if (count > GS1_128_MAX_DATA) add("B12", [rangeOf(sm, 0, sm.text.length)]);
  }
  let forms: CheckResult["forms"] = null;
  if (valid && split.tokens.length > 0) {
    const dataStr = `^${split.tokens.map((t, i) => t.ai + t.value + (!t.predefined && i < split.tokens.length - 1 ? "^" : "")).join("")}`;
    const problem = engine.checkMessage(dataStr);
    if (problem) {
      const ai = AI_IN_MESSAGE.exec(problem.message)?.[1] ?? null;
      const named = [...problem.message.matchAll(/AI \((\d{2,4})\)/g)].map((x) => x[1]!);
      const required = /not satisfied: ([\d,]+)/.exec(problem.message)?.[1]?.split(",") ?? [];
      const ranges = named.flatMap((a) => split.tokens.filter((t) => t.ai === a).map((t) => rangeOf(sm, t.start, t.end)));
      let code = faultOfEngineMessage(problem.message);
      // Attributes with no key at all: C9 rather than one companion missing
      if (code === "E1" && !hasKey(split.tokens.map((t) => t.ai))) code = "C9";
      const details: Record<string, string> = { ais: withTitles(named) };
      if (required.length) details.required = withTitles(required);
      add(code, ranges, { ai, engineMessage: problem.message, details });
    } else {
      const bracketed = split.tokens.map((t) => `(${t.ai})${t.value}`).join("");
      try {
        const parsed = engine.parse(bracketed);
        forms = { elementString: parsed.elementString, dataStr: parsed.dataStr, digitalLinkUri: parsed.digitalLinkUri };
      } catch {
        forms = { elementString: bracketed, dataStr, digitalLinkUri: "" };
      }
      // The repairs made the data valid: each finding they prove carries the data made right
      const proven = new Set(repairs.flatMap((r) => REPAIR_PROVES[r]));
      for (const f of findings) if (proven.has(f.code)) f.fixedData = forms.elementString;
    }
  }
  return result(elements, forms);
}

/** Text whose stand-ins matching `pattern` are made separators. */
function withSeparators(m: Marked, pattern: RegExp): Marked {
  let out = m;
  for (const match of [...m.text.matchAll(pattern)].reverse()) out = replace(out, match.index!, match.index! + match[0].length, GS);
  return out;
}

const splitOf = (m: Marked): Split => (isBracketed(m.text) ? splitBracketed(m) : splitUnbracketed(m));

/** How many faults a split leaves: an incomplete split counts as many, then each element string the engine refuses. */
function faultsOf(engine: SyntaxEngine, split: Split): number {
  return (split.complete ? 0 : 100) + split.tokens.filter((t) => engine.checkElementString(t.ai, t.value)).length;
}

const better = (engine: SyntaxEngine, a: Split, b: Split) => faultsOf(engine, a) < faultsOf(engine, b);
const worse = (engine: SyntaxEngine, a: Split, b: Split) => faultsOf(engine, a) > faultsOf(engine, b);

/**
 * A variable-length value that runs on into what reads as further element strings (B3): when the engine refuses the
 * value, a separator inserted where the rest becomes valid element strings is the repair, an Error; when the value is
 * valid as it is but ends in element strings of predefined length, only a Warning, and the data is left as it is.
 */
function separatorsInserted(engine: SyntaxEngine, split: Split, add: AddFinding, repairs: RepairName[], from = 0): Split {
  if (isBracketed(split.marked.text)) return split;
  for (const [index, token] of split.tokens.entries()) {
    if (index < from || token.predefined || token.value.length < 3) continue;
    const refused = engine.checkElementString(token.ai, token.value) !== null;
    const candidates: { k: number; tail: Token[] }[] = [];
    for (let k = 1; k < token.value.length - 1; k++) {
      const tail = splitUnbracketed({ text: token.value.slice(k), at: [] as number[] });
      if (!tail.complete || tail.tokens.length === 0 || /^9\d$/.test(tail.tokens[0]!.ai)) continue;
      if (!refused && !tail.tokens.every((t) => t.predefined)) continue;
      if (engine.checkElementString(token.ai, token.value.slice(0, k)) || tail.tokens.some((t) => engine.checkElementString(t.ai, t.value))) continue;
      candidates.push({ k, tail: tail.tokens });
    }
    // Where a separator was most likely left out: before a date, a GTIN or another value of predefined length
    const chosen = candidates.find((c) => c.tail[0]!.predefined) ?? candidates[0];
    if (!chosen) continue;
    const at = token.valueStart + chosen.k;
    const join = rangeOf(split.marked, at, at);
    if (!refused) {
      const fixed = [...split.tokens.slice(0, index), { ...token, value: token.value.slice(0, chosen.k) }, ...chosen.tail, ...split.tokens.slice(index + 1)];
      add("B3", [join], { severity: "warning", ai: token.ai, fixedData: fixed.map((t) => `(${t.ai})${t.value}`).join("") });
      continue;
    }
    add("B3", [join], { ai: token.ai });
    repairs.push("insert-separator");
    return separatorsInserted(engine, splitUnbracketed(insert(split.marked, at, GS)), add, repairs, index + 1);
  }
  return split;
}

/** The bytes an engine message points at: the part between "|" in its markup, else the whole value. */
function markupRange(m: Marked, token: Token, problem: EngineFault): Range {
  const prefix = `(${token.ai})`;
  // The engine's markup garbles what follows a character outside ASCII, leaving a single bar: then the whole value
  const markup = problem.markup.startsWith(prefix) ? problem.markup.slice(prefix.length) : "";
  const open = markup.indexOf("|");
  const close = markup.indexOf("|", open + 1);
  if (open === -1 || close === -1) return rangeOf(m, token.valueStart, token.end);
  return rangeOf(m, token.valueStart + open, token.valueStart + close - 1);
}

/** A GTIN alone, as EAN/UPC and ITF-14 carry it: read as AI (01), the check digit verified, then the own rules. */
function gtinOnly(
  engine: SyntaxEngine, m: Marked, kind: "itf" | "ean" | "assumed", id: string, add: AddFinding,
  result: (elements?: CheckedElement[], forms?: CheckResult["forms"]) => CheckResult,
  engineFinding: (ai: string, value: string, message: string, ranges: Range[], valueRange: Range) => void,
  ownRules: (located: Located[], refused: Set<string>) => void,
): CheckResult {
  const all = rangeOf(m, 0, m.text.length);
  if (kind === "itf") {
    if (m.text.length !== 14 || !/^\d+$/.test(m.text)) {
      add("A7", [all]);
      return result();
    }
    if (id === "]I0") add("A7", [all], { severity: "note" });
  }
  if (!/^\d+$/.test(m.text)) {
    add("B9", [all]);
    return result();
  }
  const gtin = m.text.padStart(14, "0");
  const element: CheckedElement = { ai: "01", value: gtin, title: aiEntry("01")?.title ?? "", range: all, separator: false };
  const problem = engine.checkElementString("01", gtin);
  if (problem) {
    engineFinding("01", gtin, problem.message, [all], all);
    return result([element]);
  }
  // The padding's zeros are not in the reading: a part of the GTIN is shifted back to the digits read
  const pad = gtin.length - m.text.length;
  ownRules([{ ai: "01", value: gtin, range: [all[0] - pad, all[1]] }], new Set());
  const parsed = engine.parse(`(01)${gtin}`);
  return result([element], { elementString: parsed.elementString, dataStr: parsed.dataStr, digitalLinkUri: parsed.digitalLinkUri });
}

/** Groups in the order of the checks, then the place in the data, then the code's number. */
function order(f: Finding): number {
  return f.code.charCodeAt(0) * 1e8 + (f.ranges[0]?.[0] ?? 0) * 100 + Number(f.code.slice(1));
}

function verdictOf(findings: Finding[]): Verdict {
  if (findings.length === 0) return "follows";
  if (findings.every((f) => f.severity === "not-assessed")) return "not-assessed";
  if (findings.some((f) => f.severity === "error")) return "does-not-follow";
  if (findings.every((f) => f.code === "A8" || f.code === "G1")) return "not-gs1";
  return findings.some((f) => f.severity === "warning") ? "remarks" : "follows";
}

