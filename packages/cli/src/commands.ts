// What gs1ls does (ADR 0009), each a thin layer over the core: no check, encoding or layout of its own. The functions
// take the engine and the font already loaded and return text or files, so that the command line, the local API and
// the tests share them; reading files, arguments and sockets is main.ts's.

import {
  check,
  designFor,
  ENVIRONMENTS,
  fault,
  fieldsOf,
  identify,
  labelEps,
  labelFor,
  labelPdf,
  labelPng,
  labelSvg,
  patternName,
  printFileBytes,
  printFileFor,
  PRINTER_LANGUAGES,
  readingFromText,
  SYMBOLOGIES,
  type CheckResult,
  type HriFont,
  type PrinterLanguage,
  type SymbologyId,
  type SyntaxEngine,
} from "@gs1-label-studio/core";

/** A usage error: what was asked cannot be understood (exit status 2), as opposed to data that fails a check (1). */
export class UsageError extends Error {}

export const IMAGE_FORMATS = ["svg", "png", "pdf", "eps"] as const;
export const FORMATS = [...IMAGE_FORMATS, ...(Object.keys(PRINTER_LANGUAGES) as PrinterLanguage[])] as const;
export type Format = (typeof FORMATS)[number];

const TYPES: Record<(typeof IMAGE_FORMATS)[number], string> = {
  svg: "image/svg+xml", png: "image/png", pdf: "application/pdf", eps: "application/postscript",
};

const text = (value: string) => new TextEncoder().encode(value);

export interface MadeFile {
  name: string;
  type: string;
  bytes: Uint8Array;
}

export interface LabelRequest {
  /** An element string, a GS1 Digital Link URI or a scanner's text, as the editor's step 1 takes it. */
  data: string;
  format: Format;
  /** The symbol; none: the one step 2 recommends in the environment. */
  symbology?: SymbologyId;
  environment?: string;
  size?: number;
  hri?: "full" | "key" | "none";
  /** A print file's resolution; 203 dpi when not given. */
  dpi?: number;
  /** The GS1 Digital Link URI's domain; https://id.gs1.org when not given. */
  stem?: string;
}

/** The checks a request's choices must pass before anything is drawn, as usage errors. */
export function labelProblem(request: LabelRequest): string | null {
  if (!(FORMATS as readonly string[]).includes(request.format)) return `Unknown format: ${request.format}. Use one of: ${FORMATS.join(", ")}.`;
  if (request.symbology && !(request.symbology in SYMBOLOGIES)) {
    return `Unknown symbol: ${request.symbology}. Use one of: ${Object.keys(SYMBOLOGIES).join(", ")}.`;
  }
  if (request.environment && !(request.environment in ENVIRONMENTS)) {
    return `Unknown scanning environment: ${request.environment}. Use one of: ${Object.keys(ENVIRONMENTS).join(", ")}.`;
  }
  if (request.size !== undefined && !(Number.isFinite(request.size) && request.size > 0)) return "The size is a percentage above 0, such as 100.";
  if (request.hri && !["full", "key", "none"].includes(request.hri)) return "The human readable text is full, key or none.";
  if (request.dpi !== undefined && ![152, 203, 300, 600].includes(request.dpi)) return "The print file's resolution is 152, 203, 300 or 600 dpi.";
  return null;
}

/**
 * One label as a file, drawn as the studio draws it: the data identified by the GS1 Barcode Syntax Engine, the design
 * `designFor` gives, then the core's SVG, PNG, PDF, EPS or print file. An `InputError` when the data or the design is
 * refused, with the core's words.
 */
export async function makeLabel(engine: SyntaxEngine, font: HriFont, request: LabelRequest): Promise<MadeFile> {
  const problem = labelProblem(request);
  if (problem) throw new UsageError(problem);
  const identified = identify(engine, fieldsOf(engine.parse(request.data.trim())), request.stem?.trim() || null);
  const design = designFor(identified, {
    ...(request.symbology ? { symbology: request.symbology } : {}),
    ...(request.environment ? { environment: request.environment } : {}),
    ...(request.size !== undefined ? { size: request.size } : {}),
    ...(request.hri ? { hri: request.hri } : {}),
  });
  const drawn = labelFor(identified, design, font);
  const stem = patternName("{symbol}_{key}", 1, design.symbology, identified);
  const { options, layout } = drawn;
  switch (request.format) {
    case "svg":
      return { name: `${stem}.svg`, type: TYPES.svg, bytes: text(labelSvg(options, layout, font)) };
    case "png":
      return { name: `${stem}.png`, type: TYPES.png, bytes: await labelPng(layout, font) };
    case "pdf":
      return { name: `${stem}.pdf`, type: TYPES.pdf, bytes: await labelPdf(options, layout, font) };
    case "eps":
      return { name: `${stem}.eps`, type: TYPES.eps, bytes: text(labelEps(options, layout, font)) };
    default: {
      const language = request.format;
      const dpi = request.dpi ?? 203;
      const file = printFileFor(language, drawn, design, dpi);
      return { name: `${stem}_${dpi}dpi.${PRINTER_LANGUAGES[language].extension}`, type: "text/plain", bytes: printFileBytes(file) };
    }
  }
}

/** One finding as the command line and the API give it: the catalogue's English texts, the data made right if any. */
export interface FindingOut {
  code: string;
  severity: string;
  ai: string | null;
  what: string;
  fix: string;
  sections: string[];
  fixedData?: string;
  engineMessage?: string;
  /** What explains it: the check digit that would be right, the date a day 00 stands for… */
  details?: Record<string, string>;
}

export interface CheckOut {
  verdict: CheckResult["verdict"];
  findings: FindingOut[];
  elements: { ai: string; value: string; title: string }[];
  forms: CheckResult["forms"];
  notChecked: string[];
}

/** The Check Studio's check of one reading typed or pasted (a scanner's text, an element string, a URI). */
export function checkData(engine: SyntaxEngine, data: string): CheckOut {
  const result = check(engine, readingFromText(data, { source: "paste" }));
  return {
    verdict: result.verdict,
    findings: result.findings.map((f) => {
      const entry = fault(f.code);
      return {
        code: f.code, severity: f.severity, ai: f.ai, what: entry.texts.what, fix: entry.texts.fix, sections: f.sections,
        ...(f.fixedData ? { fixedData: f.fixedData } : {}), ...(f.engineMessage ? { engineMessage: f.engineMessage } : {}),
        ...(f.details && Object.keys(f.details).length ? { details: f.details } : {}),
      };
    }),
    elements: result.elements.map(({ ai, value, title }) => ({ ai, value, title })),
    forms: result.forms,
    notChecked: result.notChecked,
  };
}

const VERDICTS: Record<CheckResult["verdict"], string> = {
  follows: "Follows the GS1 rules checked.",
  remarks: "Follows the GS1 rules checked, with remarks.",
  "does-not-follow": "Does not follow the GS1 rules.",
  "not-gs1": "Not GS1 data.",
  "not-assessed": "Not assessed.",
};

/** The check as text for a terminal: the verdict, each finding with how to fix it, the data's other forms. */
export function checkText(out: CheckOut): string {
  const lines = [VERDICTS[out.verdict]];
  for (const f of out.findings) {
    lines.push("", `${f.code} (${f.severity})${f.ai ? ` AI (${f.ai})` : ""}: ${f.what}`, `  How to fix: ${f.fix}`);
    if (f.details) lines.push(...Object.entries(f.details).map(([name, value]) => `  ${name}: ${value}`));
    if (f.fixedData) lines.push(`  Made right: ${f.fixedData}`);
  }
  if (out.elements.length) lines.push("", ...out.elements.map((e) => `(${e.ai}) ${e.title}: ${e.value}`));
  if (out.forms) {
    lines.push("", `Element string: ${out.forms.elementString}`);
    if (out.forms.digitalLinkUri) lines.push(`GS1 Digital Link URI: ${out.forms.digitalLinkUri}`);
  }
  return lines.join("\n") + "\n";
}

/** The exit status of a check: 0 when it follows the rules (remarks included), 1 otherwise. */
export function checkStatus(out: CheckOut): number {
  return out.verdict === "follows" || out.verdict === "remarks" ? 0 : 1;
}
