import { GS1encoder } from "gs1encoder";
import { checkDigit } from "./checkDigit.ts";
import type { SymbologyId } from "./symbologies.ts";
import { SYMBOLOGIES } from "./symbologies.ts";

/**
 * Input through the GS1 Barcode Syntax Engine (ADR 0001; backlog item 1.1), the same engine the resolver used: whatever
 * a person pastes — a GTIN, an element string with or without brackets, a GS1 Digital Link URI, what a scanner sends —
 * is recognised, checked against the GS1 rules (AI syntax, check digits, dates, associations) and turned into the
 * forms the symbols carry. bwip-js only draws.
 */
export type InputKind = "gtin" | "element-string" | "unbracketed" | "digital-link" | "scan";

export interface ParsedElement {
  ai: string;
  value: string;
  /** The AI's data title from the GS1 Barcode Syntax Dictionary, e.g. "BATCH/LOT". */
  title: string;
}

export interface ParsedInput {
  kind: InputKind;
  /** Bracketed, as GS1 writes it: "(01)09506000134352(10)ABC123". */
  elementString: string;
  elements: ParsedElement[];
  /** On the canonical stem, https://id.gs1.org/, unless another is given. Empty when the data cannot be one. */
  digitalLinkUri: string;
  /** Why there is no GS1 Digital Link URI (no primary key, an AI that is not a data attribute…), in the engine's words. */
  digitalLinkError?: string;
}

export class InputError extends Error {
  /** The element string with the offending characters between "|", e.g. "(17)27|13|31", when the engine gives it. */
  readonly markup: string;
  constructor(message: string, markup = "") {
    super(message);
    this.name = "InputError";
    this.markup = markup;
  }
}

const GS = "\u001d";

export class SyntaxEngine {
  private constructor(private readonly encoder: GS1encoder) {}

  static async create(): Promise<SyntaxEngine> {
    return new SyntaxEngine(await GS1encoder.create());
  }

  /** The engine's build, for the record. */
  get version(): string {
    return this.encoder.version;
  }

  /**
   * Recognises and checks `text`. Scanner output may show the group separator as the character itself, as "{GS}" or as
   * "\x1d"; the symbology identifier ("]d2", "]C1", "]Q3", "]E0"…) must be included for scan data.
   */
  parse(text: string, stem: string | null = null): ParsedInput {
    const input = text.trim().replace(/\{GS\}|\\x1d|<GS>/gi, GS);
    const gs = this.encoder;
    let kind: InputKind;
    try {
      if (input === "") throw new InputError("Type or paste a GTIN, an element string or a GS1 Digital Link URI.");
      if (/^\d{8}$|^\d{12,14}$/.test(input)) {
        kind = "gtin";
        gs.aiDataStr = `(01)${input.padStart(14, "0")}`;
      } else if (input.startsWith("(")) {
        kind = "element-string";
        gs.aiDataStr = input;
      } else if (/^https?:\/\//i.test(input)) {
        kind = "digital-link";
        gs.dataStr = input;
      } else if (input.startsWith("]")) {
        kind = "scan";
        gs.scanData = input;
        // EAN/UPC scans carry the digits alone: read them as the GTIN they are.
        if (/^\d+$/.test(gs.dataStr)) gs.aiDataStr = `(01)${gs.dataStr.padStart(14, "0")}`;
      } else if (/^\^?\d{2}/.test(input)) {
        kind = "unbracketed";
        gs.dataStr = `^${input.replace(/^\^/, "").split(GS).join("^")}`;
      } else {
        throw new InputError(
          "Not recognised. Expected a GTIN (8, 12, 13 or 14 digits), an element string such as " +
            "(01)09506000134352(10)ABC123, a GS1 Digital Link URI, or a scanner's output starting with its symbology " +
            "identifier, such as ]d2.",
        );
      }
    } catch (error) {
      if (error instanceof InputError) throw error;
      throw new InputError(error instanceof Error ? error.message : String(error), gs.errMarkup);
    }
    const elementString = gs.aiDataStr;
    if (!elementString) throw new InputError("The data holds no GS1 Application Identifiers.");
    if (elementString.includes("\\(")) {
      throw new InputError('A "(" inside a value is not supported yet: the barcode encoder cannot take it.');
    }

    gs.includeDataTitlesInHRI = false;
    const plain = gs.hri;
    gs.includeDataTitlesInHRI = true;
    const titled = gs.hri;
    const elements = plain.map((line, index) => {
      const [, ai, value] = /^\((\d{2,4})\) (.*)$/.exec(line) ?? [];
      if (ai === undefined || value === undefined) throw new Error(`unexpected HRI line: ${line}`);
      const withTitle = titled[index] ?? "";
      return { ai, value, title: withTitle.slice(0, Math.max(0, withTitle.lastIndexOf(` (${ai}) `))) };
    });
    let digitalLinkUri = "";
    let digitalLinkError: string | undefined;
    try {
      digitalLinkUri = gs.getDLuri(stem);
    } catch (error) {
      // No primary key, or an AI a GS1 Digital Link URI cannot carry: the element string symbols still can.
      digitalLinkError = error instanceof Error ? error.message : String(error);
    }
    return { kind, elementString, elements, digitalLinkUri, ...(digitalLinkError ? { digitalLinkError } : {}) };
  }

  free(): void {
    this.encoder.free();
  }
}

let shared: Promise<SyntaxEngine> | undefined;

/** One engine for the page or the process: the WebAssembly module is loaded once. */
export function syntaxEngine(): Promise<SyntaxEngine> {
  shared ??= SyntaxEngine.create();
  return shared;
}

/**
 * What `symbology` carries for this input: the GTIN in the length the symbol takes (EAN/UPC, ITF-14), the element
 * string (GS1-128, GS1 DataMatrix, GS1 QR Code) or the GS1 Digital Link URI (QR code and Data Matrix with a URI).
 * Throws an InputError, saying why, when the symbol cannot carry it.
 */
export function dataFor(symbology: SymbologyId, input: ParsedInput): string {
  const { data, name } = SYMBOLOGIES[symbology];
  if (data === "element-string") return input.elementString;
  if (data === "uri") {
    if (!input.digitalLinkUri) {
      throw new InputError(
        `${name} carries a GS1 Digital Link URI, and this data cannot be one: ${input.digitalLinkError ?? "it has no primary key"}.`,
      );
    }
    return input.digitalLinkUri;
  }
  const gtin = input.elements.find((e) => e.ai === "01")?.value;
  if (!gtin) throw new InputError(`${name} carries a GTIN (01).`);
  if (input.elements.length > 1) {
    throw new InputError(
      `${name} carries the GTIN alone. Batches, dates and serial numbers go in a 2D symbol (GS1 DataMatrix, or a QR ` +
        "code with a GS1 Digital Link URI) or in GS1-128.",
    );
  }
  switch (symbology) {
    case "ean13":
      if (!gtin.startsWith("0")) throw new InputError("EAN-13 carries a GTIN-13: this GTIN-14 starts with an indicator.");
      return gtin.slice(1);
    case "upca":
      if (!gtin.startsWith("00")) throw new InputError("UPC-A carries a GTIN-12 (a GTIN-14 starting with 00).");
      return gtin.slice(2);
    case "ean8":
      if (!gtin.startsWith("000000")) throw new InputError("EAN-8 carries a GTIN-8 (a GTIN-14 starting with 000000).");
      return gtin.slice(6);
    case "upce": {
      const upce = gtin.startsWith("00") ? zeroSuppress(gtin.slice(2)) : null;
      if (!upce) throw new InputError("UPC-E carries a GTIN-12 of number system 0 that can be zero-suppressed.");
      return upce;
    }
    case "itf14":
      return gtin;
    default:
      throw new InputError(`${name} does not carry a GTIN alone.`);
  }
}

/**
 * The UPC-E form (eight digits) of a GTIN-12, or null when it has none: number system 0 and one of the four
 * zero-suppression patterns (the inverse of zpl.ts's upcaManufacturerAndProduct()).
 */
export function zeroSuppress(gtin12: string): string | null {
  if (!/^0\d{11}$/.test(gtin12)) return null;
  const m = gtin12.slice(1, 6);
  const p = gtin12.slice(6, 11);
  const check = gtin12[11]!;
  let body: string | null = null;
  if (/^\d\d[012]00$/.test(m) && /^00\d{3}$/.test(p)) body = m[0]! + m[1]! + p.slice(2) + m[2]!;
  else if (/^\d\d[3-9]00$/.test(m) && /^000\d\d$/.test(p)) body = m.slice(0, 3) + p.slice(3) + "3";
  else if (/^\d{3}[1-9]0$/.test(m) && /^0000\d$/.test(p)) body = m.slice(0, 4) + p[4]! + "4";
  else if (/^\d{4}[1-9]$/.test(m) && /^0000[5-9]$/.test(p)) body = m + p[4]!;
  if (!body) return null;
  if (String(checkDigit(gtin12.slice(0, 11))) !== check) return null;
  return `0${body}${check}`;
}
