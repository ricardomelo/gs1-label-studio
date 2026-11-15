import data from "./data/check_faults.json";

// The Check Studio's catalogue of faults (backlog 7.1 b; the check studio's project, sections 4 and 5.4): every fault a
// check can report, in ten groups, each with a stable code (A1, B3…) that the tests, the translations, the reports and
// the project share, its usual severity, the General Specifications sections it rests on and its four English texts
// (what is wrong, where it is shown, why it matters, how to fix it). The catalogue holds the codes that later items
// implement too, so that a code never changes meaning; `item` names the backlog item that finds it. The texts are
// paraphrases with section numbers, never the standard's own text. They are translated when a screen shows them (7.1 f).

/** How much a finding matters: it breaks a SHALL, a SHOULD, is worth knowing, or could not be judged here. */
export type Severity = "error" | "warning" | "note" | "not-assessed";

/** The ten groups: carrier, structure, key, values, combinations, context, Digital Link, picture, tags, several carriers. */
export type FaultGroup = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J";

export interface FaultTexts {
  /** What is wrong, in a line. */
  what: string;
  /** The part of the data or of the symbol the finding points at. */
  where: string;
  /** Why it is wrong, with the General Specifications sections. */
  why: string;
  /** How to fix it, and who does it. */
  fix: string;
}

export interface Fault {
  code: string;
  group: FaultGroup;
  /** The usual severity; `severityNote` says when a finding takes another. */
  severity: Severity;
  severityNote?: string;
  /** Sections of the GS1 General Specifications, release 26.0. */
  sections: string[];
  /** Other sources, where the General Specifications are not the rule (GS1 Digital Link, the EPC Tag Data Standard). */
  references?: string[];
  /** The backlog item that finds it: "7.1 b" for groups A and B. */
  item: string;
  texts: FaultTexts;
  /** How it is found, for the expert view and the developers. */
  detectedBy: string;
}

const CATALOGUE = data as unknown as { source: string; groups: Record<FaultGroup, string>; faults: Fault[] };

/** Every fault, in the order of the project's tables: A1 to A9, B1 to B12 … J1 to J10. */
export const FAULTS: readonly Fault[] = CATALOGUE.faults;

/** Each group's name, in English. */
export const FAULT_GROUPS: Readonly<Record<FaultGroup, string>> = CATALOGUE.groups;

const BY_CODE = new Map(FAULTS.map((fault) => [fault.code, fault]));

/** The fault with this code; an Error when there is none, since codes are written in the code, never typed by a user. */
export function fault(code: string): Fault {
  const found = BY_CODE.get(code);
  if (!found) throw new Error(`no fault ${code} in the catalogue`);
  return found;
}

/** How severities rank, the worst first: findings are listed so, within the order of the checks. */
export const SEVERITY_RANK: Readonly<Record<Severity, number>> = { error: 0, warning: 1, note: 2, "not-assessed": 3 };
