import type { ColumnMapping, FixedValue } from "./bulk.ts";
import type { DesignElement, DesignPage, MonthLanguage } from "./design.ts";
import type { Answers } from "./guide.ts";
import type { Identification } from "./identify.ts";
import type { PrinterProfile } from "./printer.ts";
import { PRINTER_LANGUAGES, type PrinterLanguage } from "./printFile.ts";
import { SYMBOLOGIES, type SymbologyId } from "./symbologies.ts";
import { InputError } from "./syntax.ts";

// The work saved on one's own computer and opened again (backlog 4.3, mock-up A of two, 3 November 2026): what was
// typed and chosen, as a JSON file the person keeps; the studio's own ZPL carries the same work in `^FX` comments, which
// printers and Labelary ignore, so that it opens too. A ZPL made elsewhere is refused: its commands do not keep what
// the studio needs (the fields such as `{17:DD/MM/YYYY}`, the GS1 meaning of the data, sizes in millimetres).

/** The `format` of a work file. */
export const WORK_FORMAT = "gs1-label-studio.work";
/** The work file's version: one this studio cannot read is refused. */
export const WORK_VERSION = 1;

/** A label setting as the editor keeps it: text, a number, a choice, nothing, or a list of numbers. */
export type WorkValue = string | number | boolean | null | number[];

export interface Work {
  mode: "one" | "bulk";
  /** The data typed in step 1. */
  identification: Identification;
  /** Step 2's answers, and the symbol picked there (null: the one recommended). */
  answers: Answers;
  picked: { symbol: SymbologyId; with?: SymbologyId } | null;
  /** The label's settings by the editor's names; the page of a label of one's own apart. */
  settings: Record<string, WorkValue>;
  page: DesignPage | null;
  /** The printer the print files are for, and the module's whole dots chosen (null: the nearest in the range). */
  printer: { profile: PrinterProfile; moduleDots: number | null } | null;
  /** In bulk, the columns chosen for the spreadsheet's headers; the rows stay in the spreadsheet. */
  columns: { headers: string[]; mapping: ColumnMapping; fixed: FixedValue[] } | null;
}

/** The work file: JSON with its format, version and the time it was saved. */
export function workFile(work: Work, saved: Date = new Date()): string {
  return JSON.stringify({ format: WORK_FORMAT, version: WORK_VERSION, saved: saved.toISOString(), ...work }, null, 2) + "\n";
}

const ZPL_MARK = "GS1 Label Studio work";
const ZPL_CHUNK = 1000; // characters of base64 a comment, well within any printer's command buffer

function base64(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function unbase64(text: string): string {
  const binary = atob(text);
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/**
 * The ZPL with the work in comments after its first `^XA`: `^FX GS1 Label Studio work 1/3 …`, base64 in parts of 1,000
 * characters (base64 has no `^` or `~`, which would end a comment).
 */
export function zplWithWork(zpl: string, work: Work, saved: Date = new Date()): string {
  const start = zpl.indexOf("^XA");
  if (start < 0) throw new InputError("The ZPL has no ^XA, so it cannot carry the work.");
  const encoded = base64(workFile(work, saved));
  const parts: string[] = [];
  for (let i = 0; i < encoded.length; i += ZPL_CHUNK) parts.push(encoded.slice(i, i + ZPL_CHUNK));
  const comments = parts.map((part, i) => `^FX ${ZPL_MARK} ${i + 1}/${parts.length} ${part}\n`).join("");
  const after = start + 3;
  const lineEnd = zpl[after] === "\n" ? after + 1 : after;
  return `${zpl.slice(0, after)}${lineEnd > after ? "\n" : ""}${comments}${zpl.slice(lineEnd)}`;
}

/** The work file inside a ZPL the studio wrote, or null when it carries none. */
function workInZpl(zpl: string): string | null {
  const parts = [...zpl.matchAll(/\^FX GS1 Label Studio work (\d+)\/(\d+) ([A-Za-z0-9+/=]*)/g)];
  if (parts.length === 0) return null;
  const total = Number(parts[0]![2]);
  const ordered = parts.filter((p) => Number(p[2]) === total).sort((a, b) => Number(a[1]) - Number(b[1]));
  if (new Set(ordered.map((p) => p[1])).size !== total) {
    throw new InputError("Part of the work in this ZPL is missing: download the ZPL again.");
  }
  try {
    return unbase64(ordered.map((p) => p[3]).join(""));
  } catch {
    throw new InputError("Part of the work in this ZPL is missing: download the ZPL again.");
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isPair = (value: unknown): value is [string, string] => Array.isArray(value) && value.length === 2 && value.every(isString);
const MONTHS: readonly MonthLanguage[] = ["en", "pt", "es"];

/** The parts of a work file a refusal names. */
const PARTS = {
  mode: "the mode",
  data: "the data",
  answers: "step 2's answers",
  picked: "the symbol picked in step 2",
  settings: "the label's settings",
  page: "the label's page",
  printer: "the printer",
  columns: "the spreadsheet's columns",
} as const;

function elementPart(n: number): string {
  return `element ${n} of the label's page`;
}

function damaged(what: string): never {
  throw new InputError(`The work file is damaged: ${what} is not as the studio writes it.`);
}

function identification(value: unknown): Identification {
  if (!isRecord(value) || !isString(value.key) || !isString(value.value) || !isRecord(value.qualifiers)
    || !Object.values(value.qualifiers).every(isString) || !Array.isArray(value.attributes) || !value.attributes.every(isPair)
    || (value.parameters !== undefined && !(Array.isArray(value.parameters) && value.parameters.every(isPair)))) {
    damaged(PARTS.data);
  }
  return {
    key: value.key, value: value.value, qualifiers: { ...(value.qualifiers as Record<string, string>) },
    attributes: (value.attributes as [string, string][]).map(([ai, v]) => [ai, v]),
    ...(value.parameters ? { parameters: (value.parameters as [string, string][]).map(([n, v]) => [n, v]) } : {}),
  };
}

const isSymbology = (value: unknown): value is SymbologyId => isString(value) && Object.hasOwn(SYMBOLOGIES, value);

function element(value: unknown, at: string): DesignElement {
  if (!isRecord(value) || !isString(value.id) || !isNumber(value.xMm) || !isNumber(value.yMm)) damaged(at);
  const { id, xMm, yMm } = value as { id: string; xMm: number; yMm: number };
  switch (value.kind) {
    case "symbol":
      if (!isSymbology(value.symbology) || !(value.ais === null || (Array.isArray(value.ais) && value.ais.every(isString)))
        || !isNumber(value.size) || typeof value.hri !== "boolean") damaged(at);
      return { id, kind: "symbol", symbology: value.symbology, ais: value.ais === null ? null : [...(value.ais as string[])], size: value.size as number, hri: value.hri as boolean, xMm, yMm };
    case "text":
      if (!isString(value.text) || !isNumber(value.heightMm) || (value.months !== undefined && !MONTHS.includes(value.months as MonthLanguage))) damaged(at);
      return { id, kind: "text", text: value.text, heightMm: value.heightMm as number, ...(value.months ? { months: value.months as MonthLanguage } : {}), xMm, yMm };
    case "line":
      if (typeof value.vertical !== "boolean" || !isNumber(value.lengthMm) || !isNumber(value.thicknessMm)) damaged(at);
      return { id, kind: "line", vertical: value.vertical, lengthMm: value.lengthMm as number, thicknessMm: value.thicknessMm as number, xMm, yMm };
    case "box":
      if (!isNumber(value.widthMm) || !isNumber(value.heightMm) || !isNumber(value.thicknessMm) || typeof value.filled !== "boolean") damaged(at);
      return { id, kind: "box", widthMm: value.widthMm as number, heightMm: value.heightMm as number, thicknessMm: value.thicknessMm as number, filled: value.filled as boolean, xMm, yMm };
    default:
      return damaged(at);
  }
}

function page(value: unknown): DesignPage | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || !isNumber(value.widthMm) || !isNumber(value.heightMm) || !Array.isArray(value.elements)) damaged(PARTS.page);
  const elements = (value.elements as unknown[]).map((e, i) => element(e, elementPart(i + 1)));
  if (new Set(elements.map((e) => e.id)).size !== elements.length) damaged(PARTS.page);
  return { widthMm: value.widthMm as number, heightMm: value.heightMm as number, elements };
}

const isWorkValue = (value: unknown): value is WorkValue =>
  value === null || isString(value) || isNumber(value) || typeof value === "boolean" || (Array.isArray(value) && value.every(isNumber));

function printer(value: unknown): Work["printer"] {
  if (value === null || value === undefined) return null;
  const profile = isRecord(value) ? value.profile : undefined;
  if (!isRecord(value) || !isRecord(profile) || !isString(profile.id) || !isString(profile.name) || !isNumber(profile.dpi)
    || !isNumber(profile.widthMm) || (profile.language !== undefined && !(isString(profile.language) && Object.hasOwn(PRINTER_LANGUAGES, profile.language)))
    || !(value.moduleDots === null || isNumber(value.moduleDots))) {
    damaged(PARTS.printer);
  }
  return {
    profile: { id: profile.id, name: profile.name, dpi: profile.dpi, widthMm: profile.widthMm, ...(profile.language ? { language: profile.language as PrinterLanguage } : {}) },
    moduleDots: value.moduleDots as number | null,
  };
}

function columns(value: unknown): Work["columns"] {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || !Array.isArray(value.headers) || !value.headers.every(isString) || !Array.isArray(value.mapping)
    || value.mapping.length !== value.headers.length || !value.mapping.every((m) => m === null || isString(m))
    || !Array.isArray(value.fixed) || !value.fixed.every(isPair)) {
    damaged(PARTS.columns);
  }
  return { headers: [...(value.headers as string[])], mapping: [...(value.mapping as (string | null)[])], fixed: (value.fixed as [string, string][]).map(([a, v]) => [a, v]) };
}

/**
 * The work in a work file, or in a ZPL the studio wrote. Refused (InputError) when the text is neither, when the file
 * comes from a newer version of the studio, or when a part of it is not as the studio writes it.
 */
export function readWork(text: string): Work {
  let json: string = text;
  let fromZpl = false;
  if (!/^\s*\{/.test(text)) {
    const carried = /\^XA/.test(text) ? workInZpl(text) : null;
    if (carried === null) {
      throw new InputError(/\^XA/.test(text)
        ? "This ZPL carries no work: only the ZPL that GS1 Label Studio downloads can be opened here."
        : "This file is not a work saved by GS1 Label Studio.");
    }
    json = carried;
    fromZpl = true;
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new InputError(fromZpl ? "Part of the work in this ZPL is missing: download the ZPL again." : "This file is not a work saved by GS1 Label Studio.");
  }
  if (!isRecord(value) || value.format !== WORK_FORMAT || !Number.isInteger(value.version)) {
    throw new InputError("This file is not a work saved by GS1 Label Studio.");
  }
  if ((value.version as number) > WORK_VERSION) {
    throw new InputError("This work was saved by a newer version of GS1 Label Studio: reload the page to update it, then open it again.");
  }
  if (value.mode !== "one" && value.mode !== "bulk") damaged(PARTS.mode);
  if (!isRecord(value.answers) || !Object.values(value.answers).every((a) => typeof a === "boolean")) damaged(PARTS.answers);
  const picked = value.picked;
  if (!(picked === null || picked === undefined || (isRecord(picked) && isSymbology(picked.symbol) && (picked.with === undefined || isSymbology(picked.with))))) {
    damaged(PARTS.picked);
  }
  if (!isRecord(value.settings) || !Object.values(value.settings).every(isWorkValue)) damaged(PARTS.settings);
  return {
    mode: value.mode,
    identification: identification(value.identification),
    answers: { ...(value.answers as Answers) },
    picked: isRecord(picked) ? { symbol: picked.symbol as SymbologyId, ...(picked.with ? { with: picked.with as SymbologyId } : {}) } : null,
    settings: { ...(value.settings as Record<string, WorkValue>) },
    page: page(value.page),
    printer: printer(value.printer),
    columns: columns(value.columns),
  };
}
