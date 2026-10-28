import bwipjs from "bwip-js";
import { hasPredefinedLength } from "./elementString.ts";
import { ENVIRONMENTS } from "./environments.ts";
import { NotPossible, symbolFor } from "./linear.ts";
import {
  PARTS,
  SPEC_SYMBOL_NAMES,
  SPECIFICATION_TABLES,
  type SpecSymbol,
  type SymbolSpecification,
} from "./specifications.ts";
import { SYMBOLOGIES, type SymbologyId } from "./symbologies.ts";
import type { ParsedInput } from "./syntax.ts";

/**
 * The guided choice (ADR 0003, principle 1): what is identified and how it is scanned → the GS1 General
 * Specifications' decision tree (release 26.0, figure 5-68) → a symbol specification table → the symbols it allows,
 * and the one recommended for the data.
 *
 * The tree's sixteen questions keep their numbers. Three are answered by the key: 1 (GDTI, GRAI, GIAI or GLN), 4
 * (GSRN) and 11 (a logistic unit: SSCC, GINC or GSIN); for those logistic keys, the trade item questions 5 and 7 are
 * answered no (section 2.7, table 2-37: logistic units have tables 5 and 12 only). Table 12 has three parts; the key
 * chooses between them, or one more question for a GTIN (a unit pack or a grouping of packs).
 *
 * Each leaf of the tree is an application of section 2, whose carrier choices name the symbols in the order the
 * recommendation follows: the first one the studio draws that carries everything identified. Where only symbols that
 * carry the GTIN alone are allowed (EAN/UPC at a point of sale), a 2D symbol "in addition" carries the rest.
 */

export type QuestionId =
  | "dpm"
  | "long-distance"
  | "retail"
  | "distribution"
  | "healthcare-retail"
  | "tobacco"
  | "healthcare-non-retail"
  | "healthcare"
  | "tobacco-unit-pack";

type KeyQuestion = "key-asset" | "key-gsrn" | "key-logistic";

/** The questions as they are put to the person; the figure's own words in `figure`. */
export const QUESTIONS: Record<QuestionId, { text: string; help: string; figure: string }> = {
  dpm: {
    text: "Is the code marked directly on the item?",
    help: "Laser, dot peen, chemical etching or ink jet on the part itself, rather than printed on a label or package.",
    figure: "Direct part marking?",
  },
  "long-distance": {
    text: "Must it be scanned from a long distance?",
    help: "Durable labels and marks read from metres away, such as on racks, containers or vehicles.",
    figure: "Long distance scanning?",
  },
  retail: {
    text: "Is it scanned at a general retail point of sale?",
    help: "A supermarket or shop till: the consumer buys it there.",
    figure: "Scanned at general retail?",
  },
  distribution: {
    text: "Is it scanned in general distribution?",
    help: "Warehouses and transport, often by fixed scanners as it moves on conveyors.",
    figure: "Scanned in general distribution?",
  },
  "healthcare-retail": {
    text: "Is it a regulated healthcare item sold in a retail pharmacy?",
    help: "A medicine or medical device sold to consumers in a pharmacy, not in general retail.",
    figure: "Scanned in regulated healthcare retail?",
  },
  tobacco: {
    text: "Is it a tobacco product under the EU traceability regulation?",
    help: "European Regulation 2018/574 on the traceability of tobacco products.",
    figure: "Tobacco?",
  },
  "healthcare-non-retail": {
    text: "Is it a regulated healthcare item not sold at retail?",
    help: "For hospitals and other healthcare providers, rather than consumers.",
    figure: "Regulated healthcare non-retail item?",
  },
  healthcare: {
    text: "Is it a regulated healthcare item?",
    help: "A medicine or a medical device.",
    figure: "Regulated healthcare item?",
  },
  "tobacco-unit-pack": {
    text: "Is it a unit pack?",
    help: "A single packet, rather than a grouping of packets such as a carton or a case.",
    figure: "Table 12: trade items at unit pack level, or trade item groupings",
  },
};

export type Answers = Partial<Record<QuestionId, boolean>>;

/** A leaf of the tree: a symbol specification table and the section 2 application it serves. */
export interface Leaf {
  table: number;
  application: string;
  /** Where section 2 gives the carrier choices. */
  sections: string;
  /** The carrier choices, in section 2's order. */
  carriers: readonly SpecSymbol[];
  /** Symbols allowed only in addition to a carrier. */
  inAddition: readonly SpecSymbol[];
  /** The parts of the table that apply (rows without a part always do). */
  parts?: readonly string[];
}

const DATABAR_RETAIL: SpecSymbol[] = ["databar-omni", "databar-stacked-omni", "databar-expanded", "databar-expanded-stacked"];
const DATABAR_ALL: SpecSymbol[] = [
  "databar-omni", "databar-truncated", "databar-stacked", "databar-stacked-omni", "databar-limited", "databar-expanded",
  "databar-expanded-stacked",
];
const EAN_UPC: SpecSymbol[] = ["ean13", "upca", "ean8", "upce"];
const DL: SpecSymbol[] = ["dl-datamatrix", "dl-qrcode"];
const RETAIL_2D: SpecSymbol[] = ["dl-qrcode", "dl-datamatrix", "gs1-datamatrix"];
// Table 2-11: GS1 DataMatrix, GS1-128 and GS1 DataBar preferred; EAN/UPC and ITF-14 "other acceptable options" for the
// GTIN alone.
const HEALTHCARE: SpecSymbol[] = ["gs1-datamatrix", "gs1-128", ...DATABAR_ALL, ...EAN_UPC, "itf14"];

const LONG_DISTANCE: Leaf = {
  table: 13, application: "Durable labelling and marking, scanned from a long distance", sections: "2.6.14",
  carriers: ["gs1-datamatrix", "gs1-qrcode", "gs1-128"], inAddition: DL,
};
const DIRECT_MARKING: Leaf = {
  table: 7, application: "Direct part marking", sections: "2.6.14",
  carriers: ["gs1-datamatrix", "gs1-qrcode"], inAddition: DL, parts: [PARTS.t7Other],
};
const TOBACCO: Record<string, Leaf> = {
  [PARTS.t12Unit]: {
    table: 12, application: "Tobacco products under EU Regulation 2018/574: unit packs", sections: "2.1.14.1",
    carriers: ["gs1-dotcode", "gs1-datamatrix", "gs1-qrcode"], inAddition: [], parts: [PARTS.t12Unit],
  },
  [PARTS.t12Grouping]: {
    table: 12, application: "Tobacco products under EU Regulation 2018/574: groupings of unit packs",
    sections: "2.1.14.2", carriers: ["gs1-datamatrix", "gs1-qrcode", "gs1-128"], inAddition: [],
    parts: [PARTS.t12Grouping],
  },
  [PARTS.t12Logistic]: {
    table: 12, application: "Tobacco products under EU Regulation 2018/574: logistic units", sections: "2.1.14.3",
    carriers: ["gs1-datamatrix", "gs1-qrcode", "gs1-128"], inAddition: [], parts: [PARTS.t12Logistic],
  },
};

type Next = number | Leaf | "tobacco";
interface Node {
  question: QuestionId | KeyQuestion;
  yes: Next;
  no: Next;
}

/** Figure 5-68, node by node. */
export const TREE: Record<number, Node> = {
  1: { question: "key-asset", yes: 2, no: 4 },
  2: {
    question: "dpm", yes: 3,
    no: {
      table: 9, application: "Assets, documents and locations (GRAI, GIAI, GDTI, GLN)", sections: "2.3, 2.4, 2.6.9",
      carriers: ["gs1-128", "gs1-datamatrix", "gs1-qrcode"], inAddition: DL,
    },
  },
  3: { question: "long-distance", yes: LONG_DISTANCE, no: DIRECT_MARKING },
  4: {
    question: "key-gsrn",
    yes: {
      table: 11, application: "Service relationships (GSRN)", sections: "2.5.1, 2.5.2",
      carriers: ["databar-expanded", "databar-expanded-stacked", "gs1-128", "gs1-datamatrix", "gs1-qrcode"], inAddition: [],
    },
    no: 5,
  },
  5: { question: "retail", yes: 6, no: 7 },
  6: {
    question: "distribution",
    yes: {
      table: 3, application: "Trade items scanned at retail point of sale and in general distribution", sections: "2.1.4",
      carriers: [...EAN_UPC, ...DATABAR_RETAIL], inAddition: RETAIL_2D, parts: [PARTS.t3TwoD],
    },
    no: {
      table: 1, application: "Trade items scanned at retail point of sale", sections: "2.1.3, 2.1.13.1",
      carriers: [...EAN_UPC, ...DATABAR_RETAIL], inAddition: RETAIL_2D, parts: [PARTS.t1TwoD],
    },
  },
  7: { question: "healthcare-retail", yes: 8, no: 9 },
  8: {
    question: "distribution",
    yes: {
      table: 8, application: "Regulated healthcare retail consumer trade items, also in general distribution",
      sections: "2.1.6 (table 2-11)", carriers: HEALTHCARE, inAddition: [],
    },
    no: {
      table: 10, application: "Regulated healthcare retail consumer trade items, not in general distribution",
      sections: "2.1.6 (table 2-11)", carriers: HEALTHCARE, inAddition: [],
    },
  },
  9: { question: "distribution", yes: 10, no: 13 },
  10: { question: "tobacco", yes: "tobacco", no: 11 },
  11: {
    question: "key-logistic",
    yes: {
      table: 5, application: "Logistic units", sections: "2.2.1, 2.2.2, 2.2.3",
      carriers: ["gs1-128"], inAddition: ["gs1-datamatrix", "gs1-qrcode"],
    },
    no: 12,
  },
  12: {
    question: "healthcare-non-retail",
    yes: {
      table: 8, application: "Regulated healthcare trade items in general distribution", sections: "2.1.7 (table 2-15)",
      carriers: ["gs1-128", ...DATABAR_ALL, "gs1-datamatrix"], inAddition: [],
    },
    no: {
      table: 2, application: "Trade items scanned in general distribution", sections: "2.1.7.1, 2.1.10",
      carriers: ["ean13", "upca", "upce", "itf14", "gs1-128", ...DATABAR_ALL], inAddition: ["gs1-datamatrix", "gs1-qrcode"],
    },
  },
  13: { question: "healthcare", yes: 14, no: 15 },
  14: {
    question: "dpm",
    yes: {
      table: 7, application: "Regulated healthcare items marked directly (medical devices)", sections: "2.1.8, 2.6.14",
      carriers: ["gs1-datamatrix"], inAddition: [], parts: [PARTS.t7Ink, PARTS.t7A, PARTS.t7B],
    },
    no: {
      table: 6, application: "Regulated healthcare non-retail trade items, not in general distribution",
      sections: "2.1.5 (table 2-11)", carriers: HEALTHCARE, inAddition: [],
    },
  },
  15: {
    question: "dpm", yes: 16,
    no: {
      table: 4, application: "Trade items not scanned at retail, in general distribution or in healthcare",
      sections: "2.1.7 (manufacturing and MRO), 2.1.9", carriers: ["gs1-128", "gs1-datamatrix", "gs1-qrcode"],
      inAddition: DL,
    },
  },
  16: { question: "long-distance", yes: LONG_DISTANCE, no: DIRECT_MARKING },
};

const ASSET_KEYS = ["253", "8003", "8004", "414", "417"];
const GSRN_KEYS = ["8017", "8018"];
const LOGISTIC_KEYS = ["00", "401", "402"];

/** The answer the key gives, if it gives one. */
function byKey(question: QuestionId | KeyQuestion, key: string): boolean | undefined {
  if (question === "key-asset") return ASSET_KEYS.includes(key);
  if (question === "key-gsrn") return GSRN_KEYS.includes(key);
  if (question === "key-logistic") return LOGISTIC_KEYS.includes(key);
  if ((question === "retail" || question === "healthcare-retail") && LOGISTIC_KEYS.includes(key)) return false;
  return undefined;
}

export interface Step {
  node: number | null;
  question: QuestionId | KeyQuestion;
  answer: boolean;
  /** Answered by the key rather than by the person. */
  byKey: boolean;
}

export interface Walk {
  steps: Step[];
  /** The next question to ask; undefined once the walk has reached a leaf. */
  next?: QuestionId;
  leaf?: Leaf;
}

/** Walks the tree for a key with the answers given so far: to the next question, or to a leaf. */
export function walk(key: string, answers: Answers): Walk {
  const steps: Step[] = [];
  let at: Next = 1;
  while (typeof at === "number") {
    const node: Node = TREE[at]!;
    const fromKey = byKey(node.question, key);
    const answer = fromKey ?? answers[node.question as QuestionId];
    if (answer === undefined) return { steps, next: node.question as QuestionId };
    steps.push({ node: at, question: node.question, answer, byKey: fromKey !== undefined });
    at = answer ? node.yes : node.no;
  }
  if (at !== "tobacco") return { steps, leaf: key === "414" && at.table === 9 ? { ...at, parts: [PARTS.t9Location] } : at };
  // Table 12's parts: logistic units by their key, unit packs or groupings of a GTIN by one more question.
  if (LOGISTIC_KEYS.includes(key)) return { steps, leaf: TOBACCO[PARTS.t12Logistic] };
  const unitPack = answers["tobacco-unit-pack"];
  if (unitPack === undefined) return { steps, next: "tobacco-unit-pack" };
  steps.push({ node: null, question: "tobacco-unit-pack", answer: unitPack, byKey: false });
  return { steps, leaf: TOBACCO[unitPack ? PARTS.t12Unit : PARTS.t12Grouping] };
}

// What each symbol can carry.

export type Carries = "all" | "key" | "no";

const BCID: Partial<Record<SpecSymbol, string>> = {
  "databar-omni": "databaromni",
  "databar-stacked-omni": "databarstackedomni",
  "databar-expanded": "databarexpanded",
  "databar-expanded-stacked": "databarexpandedstacked",
  "databar-stacked": "databarstacked",
  "databar-limited": "databarlimited",
  "databar-truncated": "databartruncated",
  "gs1-dotcode": "gs1dotcode",
};

function encodes(bcid: string, text: string): string | null {
  try {
    bwipjs.raw({ bcid, text });
    return null;
  } catch (error) {
    return String(error instanceof Error ? error.message : error).replace(/^bwipp\.\w+#\d+: /, "");
  }
}

/**
 * GS1-128's data characters (section 5.4.4.3): the AIs and their values, and FNC1 where it separates an element
 * string of no predefined length from the next. At most 48.
 */
export function gs1128DataCharacters(input: ParsedInput): number {
  return input.elements.reduce(
    (sum, e, index) => sum + e.ai.length + e.value.length + (index < input.elements.length - 1 && !hasPredefinedLength(e.ai) ? 1 : 0),
    0,
  );
}

/** Whether a symbol carries all that is identified, the GTIN alone, or nothing of it; and why not, when not. */
export function carries(symbol: SpecSymbol, input: ParsedInput): { carries: Carries; reason?: string } {
  const gtin = input.elements.find((e) => e.ai === "01")?.value;
  const alone = input.elements.length === 1;
  const gtinOnly = (): { carries: Carries; reason?: string } =>
    gtin
      ? alone ? { carries: "all" } : { carries: "key", reason: "carries the GTIN alone" }
      : { carries: "no", reason: "carries a GTIN (01)" };
  switch (symbol) {
    case "ean13":
    case "upca":
    case "ean8":
    case "upce": {
      if (!gtin) return { carries: "no", reason: "carries a GTIN (01)" };
      let kind: string | null = null;
      try {
        kind = symbolFor(gtin, symbol === "upce" ? "upce" : "auto")[0];
      } catch (error) {
        if (!(error instanceof NotPossible)) throw error;
      }
      if (kind !== symbol) {
        const what = { ean13: "a GTIN-13", upca: "a GTIN-12", ean8: "a GTIN-8", upce: "a GTIN-12 that zero-suppresses" };
        return { carries: "no", reason: `carries ${what[symbol]}` };
      }
      return gtinOnly();
    }
    case "itf14":
    case "databar-omni":
    case "databar-stacked-omni":
    case "databar-stacked":
    case "databar-truncated":
      return gtinOnly();
    case "databar-limited":
      if (gtin && !/^[01]/.test(gtin)) return { carries: "no", reason: "carries a GTIN starting with 0 or 1" };
      return gtinOnly();
    case "gs1-128": {
      const count = gs1128DataCharacters(input);
      if (count > 48) return { carries: "no", reason: `carries at most 48 data characters; this data has ${count}` };
      return { carries: "all" };
    }
    case "databar-expanded":
    case "databar-expanded-stacked":
    case "gs1-dotcode": {
      const error = encodes(BCID[symbol]!, input.elementString);
      return error ? { carries: "no", reason: error } : { carries: "all" };
    }
    case "gs1-datamatrix":
    case "gs1-qrcode":
      return { carries: "all" };
    case "dl-qrcode":
    case "dl-datamatrix":
      return input.digitalLinkUri
        ? { carries: "all" }
        : { carries: "no", reason: `carries a GS1 Digital Link URI: ${input.digitalLinkError ?? "this data cannot be one"}` };
  }
}

// The guidance.

export interface SymbolOption {
  symbol: SpecSymbol;
  name: string;
  /** A carrier choice of the application, a symbol only in addition to one, or one the table allows besides. */
  role: "carrier" | "in-addition" | "table";
  /** The table's rows that apply (a Digital Link symbol takes the GS1 DataMatrix or GS1 QR Code row where its own is not given). */
  specs: SymbolSpecification[];
  carries: Carries;
  reason?: string;
  /** The studio draws it (GS1 DataBar and GS1 DotCode come with backlog 1.3). */
  drawn: boolean;
}

export interface Guidance {
  leaf: Leaf;
  title: string;
  /** The resolver's scanning environment for the table (environments.ts), where it has one. */
  environment: string | null;
  options: SymbolOption[];
  /** The symbol recommended, and the 2D symbol in addition where the recommended one carries the GTIN alone. */
  recommended: { symbol: SymbologyId; with?: SymbologyId } | null;
  /** Without a recommendation: the first carrier that would carry it all, which the studio does not draw yet. */
  waiting?: SpecSymbol;
}

const GS1_EQUIVALENT: Partial<Record<SpecSymbol, SpecSymbol>> = {
  "dl-datamatrix": "gs1-datamatrix",
  "dl-qrcode": "gs1-qrcode",
};

function rowsFor(leaf: Leaf, symbol: SpecSymbol): SymbolSpecification[] {
  const rows = SPECIFICATION_TABLES[leaf.table]!.rows;
  const applies = (row: SymbolSpecification) => row.part === undefined || (leaf.parts ?? []).includes(row.part);
  const own = rows.filter((row) => row.symbol === symbol && applies(row));
  const equivalent = GS1_EQUIVALENT[symbol];
  if (own.length || !equivalent) return own;
  return rows.filter((row) => row.symbol === equivalent && applies(row)).map((row) => ({ ...row, symbol }));
}

const isDrawn = (symbol: SpecSymbol): symbol is SymbologyId => symbol in SYMBOLOGIES;

/** The symbols a leaf allows for what is identified, in the order of the recommendation, and the recommendation. */
export function guidance(leaf: Leaf, input: ParsedInput): Guidance {
  const table = SPECIFICATION_TABLES[leaf.table]!;
  const option = (symbol: SpecSymbol, role: SymbolOption["role"]): SymbolOption | null => {
    const specs = rowsFor(leaf, symbol);
    if (!specs.length) return null;
    return { symbol, name: SPEC_SYMBOL_NAMES[symbol], role, specs, ...carries(symbol, input), drawn: isDrawn(symbol) };
  };
  const listed = new Set<SpecSymbol>([...leaf.carriers, ...leaf.inAddition]);
  const others = [...new Set(table.rows.map((row) => row.symbol))].filter((s) => !listed.has(s));
  const options = [
    ...leaf.carriers.map((s) => option(s, "carrier")),
    ...leaf.inAddition.map((s) => option(s, "in-addition")),
    ...others.map((s) => option(s, "table")),
  ].filter((o): o is SymbolOption => o !== null);

  const usable = (o: SymbolOption) => o.drawn && o.symbol !== "gs1-qrcode"; // not offered (ADR 0003)
  const carriers = options.filter((o) => o.role === "carrier" && usable(o));
  const full = carriers.find((o) => o.carries === "all");
  let recommended: Guidance["recommended"] = null;
  if (full) recommended = { symbol: full.symbol as SymbologyId };
  else {
    // A symbol in addition never stands alone (e.g. section 2.1.13.1): only beside a carrier of the GTIN.
    const key = carriers.find((o) => o.carries === "key");
    const extra = options.find((o) => o.role === "in-addition" && usable(o) && o.carries === "all");
    if (key && extra) recommended = { symbol: key.symbol as SymbologyId, with: extra.symbol as SymbologyId };
  }
  const waiting = recommended ? undefined : options.find((o) => o.role === "carrier" && !o.drawn && o.carries === "all")?.symbol;
  const environment = Object.entries(ENVIRONMENTS).find(([, env]) => env.table === leaf.table)?.[0] ?? null;
  return { leaf, title: table.title, environment, options, recommended, ...(waiting ? { waiting } : {}) };
}
