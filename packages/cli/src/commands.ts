// What gs1ls does (ADR 0009), each a thin layer over the core: no check, encoding or layout of its own. The functions
// take the engine and the font already loaded and return text or files, so that the command line, the local API and
// the tests share them; reading files, arguments and sockets is main.ts's.

import {
  checkRows,
  encoderCsv,
  EPC_CHOICES,
  epcOf,
  epcSchemes,
  generateBatch,
  guessMapping,
  parseTableFile,
  patternProblem,
  tagFor,
  unzip,
  zipArchive,
  zplRfidCommands,
  zplRfidLabel,
  DEFAULT_PATTERN,
  type BatchFile,
  type BatchRow,
  type EpcChoices,
  type GcpTable,
  type RfidTagRow,
  type RfidWriteFrom,
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
  InputError,
  type CheckResult,
  type HriFont,
  type PrinterLanguage,
  type SymbologyId,
  type SyntaxEngine,
  type Translator,
} from "@gs1-label-studio/core";
import { ENGLISH } from "./lang.ts";
// The Check Studio's plain words for each finding, as the page shows them (ADR 0007 decision 8): the page's own texts,
// translated by its catalogues, which --lang reads too
import { SIMPLE_TEXTS } from "../../../apps/web/src/checkTexts.ts";

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
  /** The Check Studio's plain words: what is wrong, why it matters, how to fix it and who does it, in the language asked. */
  plain?: { what: string; why: string; fix: string };
}

export interface CheckOut {
  verdict: CheckResult["verdict"];
  findings: FindingOut[];
  elements: { ai: string; value: string; title: string }[];
  forms: CheckResult["forms"];
  notChecked: string[];
}

/** The Check Studio's check of one reading typed or pasted (a scanner's text, an element string, a URI). */
export function checkData(engine: SyntaxEngine, data: string, lang: Translator = ENGLISH): CheckOut {
  const result = check(engine, readingFromText(data, { source: "paste" }));
  return {
    verdict: result.verdict,
    findings: result.findings.map((f) => {
      const entry = fault(f.code);
      return {
        code: f.code, severity: f.severity, ai: f.ai, what: entry.texts.what, fix: entry.texts.fix, sections: f.sections,
        ...(f.fixedData ? { fixedData: f.fixedData } : {}), ...(f.engineMessage ? { engineMessage: lang.tm(f.engineMessage) } : {}),
        ...(f.details && Object.keys(f.details).length ? { details: f.details } : {}),
        ...(SIMPLE_TEXTS[f.code] ? { plain: { what: lang.t(SIMPLE_TEXTS[f.code]!.what), why: lang.t(SIMPLE_TEXTS[f.code]!.why), fix: lang.t(SIMPLE_TEXTS[f.code]!.fix) } } : {}),
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
export function checkText(out: CheckOut, lang: Translator = ENGLISH): string {
  const lines = [lang.t(VERDICTS[out.verdict])];
  for (const f of out.findings) {
    // In English the catalogue's expert texts, as before; in another language the Check Studio's plain words, which the
    // page translates (the catalogue's stay in English)
    const words = lang.locale !== "en" && f.plain ? f.plain : null;
    lines.push("", `${f.code} (${f.severity})${f.ai ? ` AI (${f.ai})` : ""}: ${words ? words.what : f.what}`);
    if (words) lines.push(`  ${lang.t("Why it matters:")} ${words.why}`);
    lines.push(`  ${lang.t("How to fix:")} ${words ? words.fix : f.fix}`);
    if (f.details) lines.push(...Object.entries(f.details).map(([name, value]) => `  ${name}: ${value}`));
    if (f.fixedData) lines.push(`  ${lang.t("Made right: {data}", { data: f.fixedData })}`);
  }
  if (out.elements.length) lines.push("", ...out.elements.map((e) => `(${e.ai}) ${e.title}: ${e.value}`));
  if (out.forms) {
    lines.push("", lang.t("Element string: {value}", { value: out.forms.elementString }));
    if (out.forms.digitalLinkUri) lines.push(lang.t("GS1 Digital Link URI: {value}", { value: out.forms.digitalLinkUri }));
  }
  return lines.join("\n") + "\n";
}

/** The exit status of a check: 0 when it follows the rules (remarks included), 1 otherwise. */
export function checkStatus(out: CheckOut): number {
  return out.verdict === "follows" || out.verdict === "remarks" ? 0 : 1;
}

/** The EPC choices as gs1ls takes them: the scheme by name, the rest as the RFID Studio's steps 2 and 3. */
export interface EpcRequest {
  scheme?: "classic" | "plus" | "plusplus";
  prefixLength?: number;
  filter?: number;
  /** A DSGTIN's date by its AI, such as 17. */
  date?: string;
  withData?: boolean;
  umi?: boolean;
  hazmat?: boolean;
  stem?: string;
  gcp?: GcpTable | null;
}

const FORMS = { classic: "classic", plus: "+", plusplus: "++" } as const;

/** The choices of a request, or a usage error. */
export function epcChoices(request: EpcRequest): EpcChoices {
  if (request.scheme && !(request.scheme in FORMS)) throw new UsageError("The EPC scheme is classic, plus or plusplus.");
  if (request.prefixLength !== undefined && !(Number.isInteger(request.prefixLength) && request.prefixLength >= 6 && request.prefixLength <= 12)) {
    throw new UsageError("The company prefix length is 6 to 12 digits.");
  }
  if (request.filter !== undefined && !(Number.isInteger(request.filter) && request.filter >= 0 && request.filter <= 7)) {
    throw new UsageError("The filter is 0 to 7.");
  }
  return {
    ...EPC_CHOICES, form: FORMS[request.scheme ?? "classic"], prefix: request.prefixLength ?? null, filter: request.filter ?? null,
    date: request.date ?? "", withData: Boolean(request.withData), umi: Boolean(request.umi), hazmat: Boolean(request.hazmat),
  };
}

/** The tag of one datum as gs1ls epc gives it. */
export interface EpcOut {
  scheme: string;
  filter: number;
  bits: number;
  /** The EPC from bit 20h, zero-filled to the word: what most readers report and ZPL's ^RF writes when the printer sets the PC. */
  epc: string;
  /** The StoredPC and the EPC, from bit 10h. */
  pcAndEpc: string;
  storedPc: string;
  storedCrc: string;
  pureIdentity?: string;
  tagUri?: string;
  digitalLinkUri?: string;
  /** Where the company prefix's length came from, when GS1's list gave it. */
  source?: string;
  /** +AIDC data the EPC+ could not carry, with the reasons. */
  left?: string[];
  tag: RfidTagRow;
}

const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");

/**
 * The EPC of one element string, URI or scanner's text with the choices, as the RFID Studio writes it: the core's
 * `epcOf` and `tagFor`. An `InputError` when the data are refused; the reason there is no EPC as an `InputError` too.
 */
export async function epcData(engine: SyntaxEngine, data: string, request: EpcRequest, lang: Translator = ENGLISH): Promise<EpcOut> {
  const choices = epcChoices(request);
  const id = fieldsOf(engine.parse(data.trim()));
  const identified = identify(engine, id, request.stem?.trim() || null);
  const elements = identified.elements.map((e) => [e.ai, e.value] as [string, string]);
  const { result, filter } = epcOf({ id, stem: request.stem ?? "", gcp: request.gcp ?? null, elements, choices }, await epcSchemes());
  const tag = tagFor(1, result, choices);
  if (!tag.bank) throw new InputError(lang.tm(tag.error ?? "No EPC for this row."));
  const scheme = result.epc?.scheme ?? (choices.form === "+" ? "epc+" : "epc++");
  return {
    scheme, filter, bits: tag.bank.bits, epc: tag.bank.fromEpc, pcAndEpc: tag.bank.fromPc, storedPc: hex4(tag.bank.pc), storedCrc: hex4(tag.bank.crc),
    ...(tag.identity && result.epc ? { pureIdentity: tag.identity } : {}),
    ...(tag.tagUri ? { tagUri: tag.tagUri } : {}),
    ...(result.link ? { digitalLinkUri: result.link } : {}),
    ...(result.source ? { source: lang.tm(result.source) } : {}),
    ...(result.left?.length ? { left: result.left.map(lang.tm) } : {}),
    tag,
  };
}

/** The tag as text for a terminal. */
export function epcText(out: EpcOut, lang: Translator = ENGLISH): string {
  const lines = [
    lang.t("EPC (from bit 20h): {epc}", { epc: out.epc }),
    lang.t("StoredPC and EPC (from bit 10h): {hex}", { hex: out.pcAndEpc }),
    lang.t("Scheme: {scheme}, filter {filter}, {bits} bits", { scheme: out.scheme, filter: out.filter, bits: out.bits }),
    lang.t("StoredCRC: {crc}  StoredPC: {pc}", { crc: out.storedCrc, pc: out.storedPc }),
  ];
  if (out.pureIdentity) lines.push(lang.t("EPC Pure Identity URI: {uri}", { uri: out.pureIdentity }));
  if (out.tagUri) lines.push(lang.t("EPC Tag URI: {uri}", { uri: out.tagUri }));
  if (out.digitalLinkUri) lines.push(lang.t("GS1 Digital Link URI: {value}", { value: out.digitalLinkUri }));
  if (out.source) lines.push(out.source);
  for (const reason of out.left ?? []) lines.push(lang.t("Not carried: {reason}", { reason }));
  return lines.join("\n") + "\n";
}

/** A ZPL label that writes the tag and prints its EPC and identity, for an RFID printer (the RFID Studio's step 4). */
export function epcZpl(out: EpcOut, options: { dpi?: number; from?: RfidWriteFrom }): Uint8Array {
  const bank = out.tag.bank!;
  return text(zplRfidLabel(bank, [bank.fromEpc, out.tag.identity ?? ""].filter(Boolean), { dpi: options.dpi ?? 203, from: options.from ?? "pc" }));
}

export interface BulkRequest {
  /** A file of each kind for every row: svg, png, pdf, eps. */
  files?: BatchFile[];
  /** One PDF with a label a page. */
  pdf?: boolean;
  /** One print file with every label, in this printer language, at `dpi`. */
  print?: Exclude<Format, (typeof IMAGE_FORMATS)[number]>;
  dpi?: number;
  pattern?: string;
  symbology?: SymbologyId;
  environment?: string;
  size?: number;
  hri?: "full" | "key" | "none";
  stem?: string;
  /** Each row's tag: written after each ^XA of the ZPL file, and as tags.csv for an encoder. */
  rfid?: EpcRequest & { from?: RfidWriteFrom };
}

export interface BulkOut {
  zip: Uint8Array;
  rows: number;
  generated: number;
  left: number;
  /** generated.csv: each row, what was made of it or why nothing was. */
  csv: string;
}

/**
 * Every row of a CSV or Excel file as the editor's bulk generation makes it: the columns guessed from their headers
 * (`guessMapping`), each row checked (`checkRows`), one design for all from the first row that passes (`designFor`
 * with the choices), then `generateBatch`'s zip. With `rfid`, each row's tag as the RFID Studio writes many.
 */
export async function bulkFile(engine: SyntaxEngine, font: HriFont, bytes: Uint8Array, request: BulkRequest): Promise<BulkOut> {
  const files = request.files ?? (request.print || request.pdf ? [] : ["svg"]);
  const unknown = files.find((f) => !(IMAGE_FORMATS as readonly string[]).includes(f));
  if (unknown) throw new UsageError(`Unknown file kind: ${unknown}. Use svg, png, pdf or eps.`);
  if (request.print && !(request.print in PRINTER_LANGUAGES)) throw new UsageError(`Unknown printer language: ${request.print}. Use one of: ${Object.keys(PRINTER_LANGUAGES).join(", ")}.`);
  const problem = labelProblem({ data: "", format: "svg", ...pick(request) });
  if (problem) throw new UsageError(problem);
  if (request.rfid && request.print && request.print !== "zpl") throw new UsageError("RFID tags are written in ZPL only: use --print zpl.");
  const table = await parseTableFile(bytes);
  const pattern = request.pattern ?? DEFAULT_PATTERN;
  const patternError = patternProblem(pattern, table.headers);
  if (patternError) throw new UsageError(patternError);
  const mapping = guessMapping(table.headers);
  const checked = checkRows(engine, table, mapping, [], request.stem?.trim() || null);
  const first = checked.find((row) => row.identified);
  if (!first) throw new InputError(checked[0]?.error ?? "The file has no rows.");
  const design = designFor(first.identified!, {
    ...(request.symbology ? { symbology: request.symbology } : {}),
    ...(request.environment ? { environment: request.environment } : {}),
    ...(request.size !== undefined ? { size: request.size } : {}),
    ...(request.hri ? { hri: request.hri } : {}),
  });
  const cellsOf = (index: number) => Object.fromEntries(table.headers.map((h, i) => [h, table.rows[index]?.[i]?.trim() ?? ""]).filter(([h]) => h!.trim()));
  let tags: RfidTagRow[] = [];
  if (request.rfid) {
    const choices = epcChoices(request.rfid);
    const schemes = await epcSchemes();
    tags = checked.map((row) => {
      if (!row.id || !row.identified) return { row: row.row, error: row.error ?? "Not checked" };
      const elements = row.identified.elements.map((e) => [e.ai, e.value] as [string, string]);
      return tagFor(row.row, epcOf({ id: row.id, stem: request.stem ?? "", gcp: request.rfid!.gcp ?? null, elements, choices }, schemes).result, choices);
    });
  }
  const rows: BatchRow[] = checked.map((row, index) => {
    const tag = tags[index]?.bank;
    return {
      row: row.row, cells: cellsOf(index),
      ...(row.identified ? { identified: row.identified } : { error: row.error ?? "Not checked" }),
      ...(tag ? { rfid: zplRfidCommands(tag, request.rfid?.from ?? "pc") } : {}),
    };
  });
  const print = request.print ?? (request.rfid ? "zpl" : undefined);
  const result = await generateBatch(rows, {
    design, files, pattern, pdf: Boolean(request.pdf),
    ...(print ? { zplDpi: request.dpi ?? 203, printLanguage: print } : {}),
  }, font);
  let zip: Uint8Array = result.zip;
  if (request.rfid) {
    const entries = [...(await unzip(result.zip))].map(([name, content]) => ({ name, bytes: content }));
    zip = await zipArchive([...entries, { name: "tags.csv", bytes: text(encoderCsv(tags)) }]);
  }
  return { zip, rows: checked.length, generated: result.generated, left: result.left, csv: result.csv };
}

const pick = (request: BulkRequest) => ({
  ...(request.symbology ? { symbology: request.symbology } : {}),
  ...(request.environment ? { environment: request.environment } : {}),
  ...(request.size !== undefined ? { size: request.size } : {}),
  ...(request.hri ? { hri: request.hri } : {}),
  ...(request.dpi !== undefined ? { dpi: request.dpi } : {}),
});
