import { AttributeError } from "./attributes.ts";
import { aiEntry, primaryKeys, qualifiersOf } from "./dictionary.ts";
import { checkKeyValue, identify, normaliseKeyValue, type Identification, type Identified } from "./identify.ts";
import { InputError, type SyntaxEngine } from "./syntax.ts";
import type { Table } from "./table.ts";

// Bulk generation (backlog 2.1): which AI each column of a table holds — guessed from its header, chosen by the
// person —, values the same on every row, and each row as the editor's identification, checked by the GS1 Barcode
// Syntax Engine as a single code is.

/** Each column's AI (or a decimal family such as "310n"), or null for a column left out. */
export type ColumnMapping = (string | null)[];

/** An AI and a value that every row carries, e.g. ["422", "076"]. */
export type FixedValue = [ai: string, value: string];

function plain(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Words people put in headers, in English, Portuguese and Spanish (data, not the interface's language: ADR 0003).
const SYNONYMS: Record<string, string[]> = {
  "01": ["gtin", "gtin 14", "gtin 13", "ean", "ean 13", "ean13", "upc", "barcode", "codigo de barras", "cod barras", "codigo ean"],
  "00": ["sscc"],
  "10": ["batch", "lot", "batch lot", "lot number", "batch number", "lote", "numero do lote", "numero de lote"],
  "21": ["serial", "serial number", "serial no", "sn", "serie", "numero de serie", "n serie", "no serie"],
  "17": ["expiry", "expiry date", "expiration", "expiration date", "use by", "validade", "data de validade", "vencimento",
    "data de vencimento", "caducidad", "fecha de caducidad", "vencimiento"],
  "15": ["best before", "best by", "best before date", "consumir antes de", "consumir preferencialmente antes de"],
  "11": ["production date", "manufacturing date", "manufacture date", "prod date", "fabricacao", "data de fabricacao",
    "fecha de fabricacion"],
  "13": ["pack date", "packaging date", "packing date", "embalagem", "data de embalagem", "data de embalamento"],
  "16": ["sell by", "sell by date"],
  "22": ["cpv", "variant", "variante", "product variant"],
  "310n": ["net weight", "net weight kg", "weight kg", "peso", "peso kg", "peso liquido", "peso liquido kg", "peso neto"],
  "37": ["count", "quantity", "qty", "quantidade", "qtd", "cantidad"],
  "414": ["gln", "location", "localizacao"],
  "422": ["origin", "country of origin", "origem", "pais de origem", "pais de origen"],
};

const BY_WORDS = new Map<string, string>(Object.entries(SYNONYMS).flatMap(([ai, words]) => words.map((w) => [w, ai])));

/**
 * The AI a header names: written as an AI ("(10)", "AI 17", "3103"), as its GS1 data title ("BATCH/LOT"), or in the
 * common words of the synonyms above ("Lote", "Validade"). Null when nothing matches.
 */
export function guessColumn(header: string): string | null {
  const ai = /^\(?\s*(?:ai\s*)?\(?(\d{2,4})\)?\s*(?:[-:–—].*)?$/i.exec(header.trim())?.[1];
  if (ai && aiEntry(ai)) return ai;
  const words = plain(header);
  const known = BY_WORDS.get(words);
  if (known) return known;
  for (const [code, title] of dataTitles()) if (title === words) return code;
  return null;
}

let titles: Map<string, string> | undefined;

/** The GS1 data titles of the keys, their qualifiers and the common attributes, in plain words ("batch lot"). */
function dataTitles(): Map<string, string> {
  titles ??= new Map(
    [...primaryKeys().flatMap((key) => [key, ...qualifiersOf(key)]), "11", "13", "15", "16", "17", "30", "37", "422"]
      .map((ai) => [ai, plain(aiEntry(ai)?.title ?? "")] as [string, string])
      .filter(([, title]) => title),
  );
  return titles;
}

/** The guessed mapping of every header; a column whose AI an earlier column already took is left out. */
export function guessMapping(headers: string[]): ColumnMapping {
  const taken = new Set<string>();
  return headers.map((header) => {
    const ai = guessColumn(header);
    if (!ai || taken.has(ai)) return null;
    taken.add(ai);
    return ai;
  });
}

const DATE_LINTERS = new Set(["yymmd0", "yymmdd"]);

/**
 * A cell as the AI takes it. Dates — AIs whose value starts with YYMMDD — are also read as YYYY-MM-DD (what an Excel
 * date becomes), day first as DD/MM/YYYY or DD/MM/YY (also with "-" or "."), and given as YYMMDD; a time after a date
 * is dropped. Anything else is left as it is, for the Syntax Engine to judge.
 */
export function normaliseCell(ai: string, raw: string): string {
  const value = raw.trim();
  const first = aiEntry(ai)?.components[0];
  if (!first?.linters.some((l) => DATE_LINTERS.has(l))) return value;
  if (/^\d{6}$/.test(value)) return value;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.exec(value);
  if (iso) return iso[1]!.slice(2) + iso[2] + iso[3];
  const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(value);
  if (dayFirst) {
    const [, d, m, y] = dayFirst;
    return y!.slice(-2) + m!.padStart(2, "0") + d!.padStart(2, "0");
  }
  return value;
}

/**
 * A row as the editor's identification: the first column holding a primary key gives the key (a key among the fixed
 * values too), its qualifiers go to the qualifiers, the rest are attributes in the columns' order, the fixed values
 * last. Empty cells are left out.
 */
export function rowIdentification(row: string[], mapping: ColumnMapping, fixed: FixedValue[] = []): Identification {
  const pairs: [string, string][] = [];
  mapping.forEach((ai, column) => {
    const value = row[column]?.trim() ?? "";
    if (ai && value) pairs.push([ai, normaliseCell(ai, value)]);
  });
  for (const [ai, value] of fixed) if (ai && value.trim()) pairs.push([ai, normaliseCell(ai, value)]);
  const keys = new Set(primaryKeys());
  const keyPair = pairs.find(([ai]) => keys.has(ai));
  if (!keyPair) {
    const keyColumn = mapping.findIndex((ai) => ai && keys.has(ai));
    throw new InputError(keyColumn >= 0
      ? `The key's column is empty on this row.`
      : "No column holds a key, such as (01) GTIN or (00) SSCC: choose which one does.");
  }
  const [key, value] = keyPair;
  const qualifiers = new Set(qualifiersOf(key));
  const id: Identification = { key, value, qualifiers: {}, attributes: [] };
  for (const pair of pairs) {
    if (pair === keyPair) continue;
    const [ai, v] = pair;
    if (qualifiers.has(ai) && !(ai in id.qualifiers)) id.qualifiers[ai] = v;
    else id.attributes.push([ai, v]);
  }
  return id;
}

export interface CheckedRow {
  /** 1-based, as a spreadsheet numbers rows after the header: the first data row is row 2. */
  row: number;
  id?: Identification;
  identified?: Identified;
  error?: string;
  /** The columns the error is about (backlog 2.2), when it names an AI a column holds or concerns the key. */
  columns?: number[];
  /** The values for every row the error is about, by their index among the fixed values. */
  fixedAt?: number[];
  /** What may have spoilt the value at fault before it reached the studio (Excel's 15 digits, scientific notation). */
  hint?: string;
}

/** Every row identified and checked by the Syntax Engine, or the reason it cannot be, with the columns at fault. */
export function checkRows(engine: SyntaxEngine, table: Table, mapping: ColumnMapping, fixed: FixedValue[] = [],
  stem: string | null = null): CheckedRow[] {
  const keys = new Set(primaryKeys());
  const keyColumns = mapping.flatMap((ai, column) => (ai && keys.has(ai) ? [column] : []));
  return table.rows.map((cells, index) => {
    const row = index + 2;
    let id: Identification | undefined;
    try {
      id = rowIdentification(cells, mapping, fixed);
      return { row, id, identified: identify(engine, id, stem) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const keyProblem = !id || checkKeyValue(id.key, normaliseKeyValue(id.key, id.value)) !== null;
      const ais = keyProblem ? [id?.key ?? ""] : faultyAis(error);
      const columns = keyProblem && !id ? keyColumns : columnsOf(ais, mapping, cells);
      const fixedAt = fixed.flatMap(([ai], at) => (ai && ais.some((a) => sameAi(a, ai)) ? [at] : []));
      const hint = columns.map((column) => cellHint(cells[column] ?? "", Boolean(table.sheet))).find((h) => h);
      return {
        row, ...(id ? { id } : {}), error: message, columns,
        ...(fixedAt.length && !columns.length ? { fixedAt } : {}), ...(hint ? { hint } : {}),
      };
    }
  });
}

/** The AIs an error is about: "AI (17): …", "(310n): at most 5 decimal places", or the AI before the engine's mark. */
function faultyAis(error: unknown): string[] {
  if (error instanceof AttributeError && typeof error.params.ai === "string") return [error.params.ai];
  const message = error instanceof Error ? error.message : String(error);
  // The AIs before the first colon are the subject ("Qualifiers (22) and (235) cannot be used together: (01) takes…").
  const named = (text: string) => [...text.matchAll(/\((\d{2,4}n?)\)/g)].map((m) => m[1]!);
  const subject = named(message.split(": ")[0]!);
  if (subject.length) return subject;
  if (named(message).length) return named(message);
  const markup = error instanceof InputError ? error.markup : "";
  const before = markup.slice(0, Math.max(0, markup.indexOf("|")));
  const last = [...before.matchAll(/\((\d{2,4})\)/g)].at(-1);
  return last ? [last[1]!] : [];
}

/** "3103" is in the column of its decimal family "310n"; a family is in a column of one of its members. */
function sameAi(a: string, b: string): boolean {
  const family = (ai: string) => (/^3[1-69]\d[\dn]$/.test(ai) ? ai.slice(0, 3) : ai);
  return a === b || (a.length === 4 && b.length === 4 && family(a) === family(b) && (a.endsWith("n") || b.endsWith("n")));
}

/** The columns holding these AIs on this row (a column left empty on the row does not count). */
function columnsOf(ais: string[], mapping: ColumnMapping, cells: string[]): number[] {
  return mapping.flatMap((ai, column) => (ai && cells[column]?.trim() && ais.some((a) => sameAi(a, ai)) ? [column] : []));
}

/**
 * Why a cell's value may not be what was typed: Excel keeps 15 significant digits of a number, so an SSCC typed as a
 * number loses its last digits (they come back as zeros); and a CSV saved by Excel may write a long number in
 * scientific notation.
 */
export function cellHint(value: string, fromWorkbook: boolean): string | undefined {
  const text = value.trim();
  if (/^\d+(?:[.,]\d+)?E\+?\d+$/i.test(text)) {
    return "This value is in scientific notation, as a spreadsheet writes a long number: format the column as text, " +
      "type the codes again and save the file again.";
  }
  if (fromWorkbook && /^\d{15}0+$/.test(text) && text.length > 15) {
    return "Excel keeps 15 digits of a number, so the last digits of this code became zeros: format the column as " +
      "text in Excel and type the codes again.";
  }
  return undefined;
}
