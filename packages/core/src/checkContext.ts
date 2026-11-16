import type { AddFinding, CheckContext } from "./checkValues.ts";
import { guidance, leafOfEnvironment, rowsFor } from "./guide.ts";
import type { Reading } from "./reading.ts";
import { SPEC_SYMBOL_NAMES, type SpecSymbol } from "./specifications.ts";
import type { SymbologyId } from "./symbologies.ts";
import type { SyntaxEngine } from "./syntax.ts";

// The Check Studio's checks of the reading context (backlog 7.1 d; the check studio's project, sections 3.6 and 4,
// group F): whether the symbol read is one the context's symbol specification table allows (F1), with the symbols it
// allows for this data, recommended first, as step 2 of the Label Studio lists them (guidance()); a 2D symbol alone at
// a retail point of sale (F3); an EAN/UPC asked to carry attributes (F2). "I do not know" is a real answer: F5, and the
// checks that need the context listed as not assessed, never as passed.

/** The checks that need the reading context (group H, the estimates, joins them with item 7.1 m). */
export const CONTEXT_CODES = ["F1", "F3"] as const;

/** Contexts with a general retail point of sale, where 4.15.4 asks for a linear symbol beside a 2D one. */
const RETAIL = new Set(["retail", "retail-gd"]);

const TWO_D: ReadonlySet<SpecSymbol> = new Set(["gs1-datamatrix", "gs1-qrcode", "dl-datamatrix", "dl-qrcode", "gs1-dotcode"]);
const EAN_UPC: ReadonlySet<SpecSymbol> = new Set(["ean13", "upca", "ean8", "upce"]);

const DATABAR_BY_FORMAT: Readonly<Record<string, SpecSymbol[]>> = {
  DataBar: ["databar-omni", "databar-truncated", "databar-stacked", "databar-stacked-omni"],
  DataBarExpanded: ["databar-expanded", "databar-expanded-stacked"],
  DataBarLimited: ["databar-limited"],
};

const isUri = (text: string) => /^https?:\/\//i.test(text);

/**
 * The symbols of the specification tables a reading may be, as far as its identifier and the decoder's format tell:
 * ZXing gives a UPC-A as its EAN-13 and does not tell GS1 DataBar Truncated or Stacked from their siblings
 * (docs/conformance.md, 3.1), so a reading may be one of several. Empty when nothing says (a paste without an
 * identifier) or the symbol is not a GS1 one.
 */
export function symbolsOf(reading: Reading): SpecSymbol[] {
  const id = reading.symbologyIdentifier ?? "";
  const format = reading.format ?? "";
  const digits = reading.text.length;
  if (id === "]E0" || id === "]E3") {
    if (format === "UPCE") return ["upce"];
    if (format === "UPCA" || digits === 12) return ["upca"];
    return reading.text.startsWith("0") ? ["ean13", "upca"] : ["ean13"];
  }
  if (id === "]E4") return ["ean8"];
  if (/^\]I[01]$/.test(id)) return ["itf14"];
  if (id === "]C1") return ["gs1-128"];
  if (id === "]e0") return DATABAR_BY_FORMAT[format] ?? [...new Set(Object.values(DATABAR_BY_FORMAT).flat())];
  if (id === "]J1") return ["gs1-dotcode"];
  if (id === "]d1" || id === "]d2") return isUri(reading.text) ? ["dl-datamatrix"] : id === "]d2" ? ["gs1-datamatrix"] : [];
  if (id === "]Q1" || id === "]Q3") return isUri(reading.text) ? ["dl-qrcode"] : id === "]Q3" ? ["gs1-qrcode"] : [];
  return [];
}

/** Whether a reading is a 2D symbol; an NFC tag or an RFID tag is not one. */
export const isTwoD = (reading: Reading) => reading.carrier === "barcode" && symbolsOf(reading).some((s) => TWO_D.has(s));

/** Whether a reading is a linear symbol a retail point of sale scans: an EAN/UPC or a GS1 DataBar. */
export const isPointOfSaleLinear = (reading: Reading) =>
  reading.carrier === "barcode" && symbolsOf(reading).some((s) => EAN_UPC.has(s) || s.startsWith("databar"));

/**
 * Adds group F's findings for a reading checked alone. `elementString` is the data once valid, for the symbols that
 * would carry it; null when it is not valid. Returns the codes that could not be assessed.
 */
export function contextRules(engine: SyntaxEngine, reading: Reading, context: CheckContext, elementString: string | null, add: AddFinding): string[] {
  const symbols = symbolsOf(reading);
  if (context.attributesExpected && symbols.some((s) => EAN_UPC.has(s))) add("F2", []);
  if (context.environment === undefined) return [];
  if (context.environment === null) {
    add("F5", []);
    return [...CONTEXT_CODES];
  }
  const leaf = leafOfEnvironment(context.environment);
  if (!leaf) throw new RangeError(`unknown-environment:${context.environment}`);
  const notChecked: string[] = [];
  if (symbols.length === 0) notChecked.push("F1");
  else if (!symbols.some((s) => rowsFor(leaf, s).length > 0)) {
    const details: Record<string, string> = { table: String(leaf.table), symbol: symbols.map((s) => SPEC_SYMBOL_NAMES[s]).join(" / ") };
    const allowed = allowedSymbols(engine, leaf, elementString);
    details.allowed = allowed.allowed.join(", ");
    if (allowed.recommended) details.recommended = allowed.recommended;
    add("F1", [], { details });
  }
  if (RETAIL.has(context.environment) && symbols.length > 0 && symbols.every((s) => TWO_D.has(s))) add("F3", []);
  return notChecked;
}

/**
 * The symbols a leaf allows, as step 2 of the Label Studio lists them: the recommended first (and the 2D symbol in
 * addition, where it carries the GTIN alone), then the carriers that carry the data, then the others.
 */
function allowedSymbols(engine: SyntaxEngine, leaf: NonNullable<ReturnType<typeof leafOfEnvironment>>, elementString: string | null): { allowed: string[]; recommended: string | null } {
  if (elementString === null) {
    return { allowed: [...leaf.carriers, ...leaf.inAddition].map((s) => SPEC_SYMBOL_NAMES[s]), recommended: null };
  }
  const advice = guidance(leaf, engine.parse(elementString));
  const recommended = advice.recommended ? [advice.recommended.symbol, ...(advice.recommended.with ? [advice.recommended.with] : [])] : [];
  const rank = (o: (typeof advice.options)[number]) => (recommended.includes(o.symbol as SymbologyId) ? 0 : o.carries === "all" ? 1 : o.carries === "key" ? 2 : 3);
  const ordered = [...advice.options].filter((o) => o.carries !== "no").sort((a, b) => rank(a) - rank(b));
  return {
    allowed: ordered.map((o) => o.name),
    recommended: recommended.length ? recommended.map((s) => SPEC_SYMBOL_NAMES[s]).join(" + ") : null,
  };
}
