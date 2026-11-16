import { checkDigit } from "./checkDigit.ts";
import { aiEntry, isDateAi, isFullYearDate } from "./dictionary.ts";
import { gcpLengthOf, type GcpTable } from "./gcp.ts";
import { isKey } from "./identify.ts";
import type { Range } from "./repair.ts";
import { isoDate } from "./sign.ts";

// The Check Studio's own rules on values (backlog 7.1 c; the check studio's project, section 4, groups C to E): what
// the GS1 Barcode Syntax Engine does not judge or does not explain. The key's prefixes and indicator (C3, C4, C6, C7),
// its company prefix against a GCP table the user loaded (C8), the check digit that would be right (C1), the dates —
// day 00 and the date it stands for (D2, D3), an order that looks swapped (D4), plausibility against today (D5) — a batch
// or serial number likely to be mis-keyed (D7), a measure of zero (D8), and the AIs an association names, with their
// data titles (C9, E1, E2).

/** What the check is told about where the code is used, and what it may use. */
export interface CheckContext {
  /** The reading context, a key of ENVIRONMENTS ("retail", "healthcare"…); unknown when not given. */
  environment?: string;
  /** GS1's GCP length table, when the user loaded it. */
  gcp?: GcpTable;
  /** Today, for the century of a YYMMDD date and its plausibility; the reading's time when not given. */
  today?: Date;
}

/** An element string and where its value is in the reading. */
export interface Located {
  ai: string;
  value: string;
  /** The bytes of its value. */
  range: Range;
}

export type AddFinding = (
  code: string, ranges: Range[],
  extra?: { severity?: "error" | "warning" | "note"; ai?: string | null; details?: Record<string, string>; engineMessage?: string | null; fixedData?: string },
) => void;

/** Contexts with a retail point of sale (tables 1, 3, 8 and 10). */
const POINT_OF_SALE = new Set(["retail", "retail-gd", "pharmacy", "pharmacy-gd"]);
/** Contexts of regulated healthcare (tables 6, 8 and 10). */
const HEALTHCARE = new Set(["pharmacy", "pharmacy-gd", "healthcare"]);

/** Where a key's GS1 Company Prefix starts in its value: after an SSCC's extension digit or a GTIN's indicator. */
const COMPANY_START: Readonly<Record<string, number>> = {
  "00": 1, "01": 1, "02": 1, "03": 1, "253": 0, "255": 0, "401": 0, "402": 0, "414": 0, "415": 0, "416": 0, "417": 0,
  "8003": 1, "8004": 0, "8010": 0, "8017": 0, "8018": 0,
};

/** Measures whose value's last digit of the AI is the decimal point's place (7.8.7): (310n) to (369n). */
const isMeasure = (ai: string) => /^3[1-6]\d\d$/.test(ai);

/** A part of a value as bytes: the value's characters before it are digits or the GS1 set, one byte each. */
const part = (e: Located, from: number, to: number): Range => [e.range[0] + from, e.range[0] + Math.min(to, e.value.length)];

/** Whether YYMMDD is a date that exists (day 00, the month's last, allowed when `zeroDay`). */
function realDate(yymmdd: string, today: Date, zeroDay = false): boolean {
  if (!/^\d{6}$/.test(yymmdd)) return false;
  const month = Number(yymmdd.slice(2, 4));
  const day = Number(yymmdd.slice(4, 6));
  if (month < 1 || month > 12) return false;
  if (day === 0) return zeroDay;
  const year = Number(isoDate(yymmdd, today).slice(0, 4));
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The expected check digit of a key the engine found wrong: the last digit of its first component that has one. */
export function expectedCheckDigit(ai: string, value: string): string | null {
  const components = aiEntry(ai)?.components ?? [];
  let offset = 0;
  for (const c of components) {
    if (c.linters.includes("csum")) {
      const digits = value.slice(offset, offset + c.max);
      return /^\d{2,}$/.test(digits) ? String(checkDigit(digits.slice(0, -1))) : null;
    }
    offset += c.max; // in the dictionary, a check digit's component follows only fixed ones
  }
  return null;
}

/**
 * The own rules on every element string, after the engine accepted it alone. `engineCodes` are the codes the engine
 * already gave, by AI, so that a fault is not said twice. Returns the codes that could not be assessed.
 */
export function valueRules(elements: readonly Located[], context: CheckContext, today: Date, add: AddFinding, refused: ReadonlySet<string>): string[] {
  const notChecked = new Set<string>();
  const environment = context.environment;
  const ais = new Set(elements.map((e) => e.ai));

  for (const e of elements) {
    if (refused.has(e.ai)) continue;
    // C3, C4: a GTIN's indicator
    if (e.ai === "01" && e.value.length === 14) {
      if (e.value[0] === "9" && ![...ais].some((ai) => ai === "30" || ai === "8001" || isMeasure(ai))) {
        add("C3", [part(e, 0, 1)], { ai: e.ai });
      }
      if (/^[1-8]/.test(e.value) && environment && POINT_OF_SALE.has(environment)) add("C4", [part(e, 0, 1)], { ai: e.ai });
    }
    // C6, C7: a GTIN's GS1 Prefix restricted, for coupons, books or serials, or for examples
    if ((e.ai === "01" || e.ai === "02") && /^\d{14}$/.test(e.value)) {
      const gtin8 = e.value.startsWith("000000");
      const prefix = gtin8 ? e.value.slice(6) : e.value.slice(1);
      const offset = gtin8 ? 6 : 1;
      const special = gtin8
        ? /^[02]/.exec(prefix)?.[0]
        : /^(?:0[245]|2\d|9[89]|97[789])/.exec(prefix)?.[0];
      if (special && !prefix.startsWith("00000")) {
        const outside = environment !== undefined && !POINT_OF_SALE.has(environment);
        add("C6", [part(e, offset, offset + special.length)], { ai: e.ai, severity: outside ? "warning" : "note", details: { prefix: special } });
      }
    }
    const start = COMPANY_START[e.ai];
    if (start !== undefined && /^\d/.test(e.value.slice(start))) {
      const company = e.value.slice(start);
      if (company.startsWith("952")) add("C7", [part(e, start, start + 3)], { ai: e.ai, details: { prefix: "952" } });
      // C8: the company prefix against the user's table
      if (context.gcp) {
        if (gcpLengthOf(context.gcp, company) === null) add("C8", [part(e, start, e.value.length)], { ai: e.ai });
      } else notChecked.add("C8");
    }
    // Dates: day 00 (D2, D3) and plausibility (D5) are below
    if (isDateAi(e.ai) && !isFullYearDate(e.ai) && /^\d{6}/.test(e.value) && e.value.slice(4, 6) === "00") {
      const date = isoDate(e.value.slice(0, 6), today);
      if (environment && HEALTHCARE.has(environment)) add("D3", [part(e, 4, 6)], { ai: e.ai, details: { date } });
      else add("D2", [part(e, 4, 6)], { ai: e.ai, details: { date } });
    }
    // D7: a batch or serial number likely to be mis-keyed
    if ((e.ai === "10" || e.ai === "21") && (/^[-/.]|[-/.]$/.test(e.value) || (/O/.test(e.value) && /0/.test(e.value)) || (/I/.test(e.value) && /1/.test(e.value)))) {
      add("D7", [e.range], { ai: e.ai });
    }
    // D8: a measure of zero
    if ((isMeasure(e.ai) || e.ai === "30" || e.ai === "37") && /^0+$/.test(e.value)) {
      const decimals = isMeasure(e.ai) ? Number(e.ai[3]) : 0;
      const shown = decimals ? `0.${"0".repeat(decimals)}` : "0";
      const unit = /\(([^)]+)\)/.exec(aiEntry(e.ai)?.title ?? "")?.[1] ?? "";
      add("D8", [e.range], { ai: e.ai, details: { value: shown, unit } });
    }
  }

  // D5: dates against each other and against today, their full year by the century rule (7.12)
  const day = (e: Located) => isoDate(e.value.slice(0, 6), today);
  const dated = elements.filter((e) => !refused.has(e.ai) && isDateAi(e.ai) && !isFullYearDate(e.ai) && realDate(e.value.slice(0, 6), today, true));
  const made = dated.filter((e) => e.ai === "11" || e.ai === "13");
  const ends = dated.filter((e) => e.ai === "15" || e.ai === "16" || e.ai === "17");
  const now = today.toISOString().slice(0, 10);
  const far = new Date(Date.UTC(today.getUTCFullYear() + 30, today.getUTCMonth(), today.getUTCDate())).toISOString().slice(0, 10);
  for (const end of ends) {
    const before = made.find((m) => day(end) < day(m));
    if (before) add("D5", [before.range, end.range], { ai: end.ai, details: { reason: "before", date: day(end), other: day(before) } });
    else if (day(end) < now) add("D5", [end.range], { ai: end.ai, details: { reason: "past", date: day(end) } });
  }
  for (const m of made) if (day(m) > now) add("D5", [m.range], { ai: m.ai, details: { reason: "future", date: day(m) } });
  for (const e of dated) if (day(e) > far) add("D5", [e.range], { ai: e.ai, details: { reason: "far", date: day(e) } });
  return [...notChecked];
}

/** D4: a date the engine refused that is valid read as DDMMYY or MMDDYY, re-ordered as YYMMDD; null when neither. */
export function reorderedDate(value: string, today: Date): string | null {
  const v = value.slice(0, 6);
  if (!/^\d{6}$/.test(v)) return null;
  const fromDdmmyy = v.slice(4, 6) + v.slice(2, 4) + v.slice(0, 2);
  const fromMmddyy = v.slice(4, 6) + v.slice(0, 2) + v.slice(2, 4);
  if (realDate(fromDdmmyy, today)) return fromDdmmyy + value.slice(6);
  if (realDate(fromMmddyy, today)) return fromMmddyy + value.slice(6);
  return null;
}

/** The AIs an engine message about associations names, each with its data title: "01 GTIN, 02 CONTENT". */
export function withTitles(ais: readonly string[]): string {
  return ais.map((ai) => `${ai} ${aiEntry(ai)?.title ?? ""}`.trim()).join(", ");
}

/** Whether the element strings hold any identification key. */
export function hasKey(ais: Iterable<string>): boolean {
  return [...ais].some((ai) => isKey(ai) || ai === "00" || ai === "8018" || ai === "8017");
}
