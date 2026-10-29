// Rows for bulk generation (backlog 2.1): a CSV file, rows pasted from a spreadsheet, or an Excel workbook, read in the
// browser without a library. The first row holds the headers. Cells stay text, as typed: a GTIN keeps its leading
// zeros; a date Excel stores as a number comes out as YYYY-MM-DD.

export interface Table {
  headers: string[];
  rows: string[][];
  /** The worksheet read, for an Excel workbook (its first). */
  sheet?: string;
}

export class TableError extends Error {}

/**
 * Delimited text: comma, semicolon (the CSV of a spreadsheet set to a language with decimal commas, such as Portuguese)
 * or tab (rows copied from a spreadsheet), whichever the first line has most of outside quotes; quoted fields as RFC
 * 4180 has them (a doubled quote inside, line breaks allowed). Empty lines are left out; short rows are filled with "".
 */
export function parseDelimited(text: string): Table {
  const input = text.replace(/^﻿/, "");
  const delimiter = detectDelimiter(input);
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  let i = 0;
  const endRecord = () => {
    record.push(field);
    if (record.some((cell) => cell.trim() !== "")) records.push(record);
    record = [];
    field = "";
  };
  while (i < input.length) {
    const c = input[i]!;
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) {
      record.push(field);
      field = "";
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      endRecord();
    } else field += c;
    i++;
  }
  if (quoted) throw new TableError("A quoted field is not closed.");
  if (field !== "" || record.length) endRecord();
  return fromRecords(records);
}

function detectDelimiter(text: string): string {
  const firstLine: string[] = [];
  let quoted = false;
  for (const c of text) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === "\n" || c === "\r")) break;
    else if (!quoted) firstLine.push(c);
  }
  const counts = ["\t", ";", ","].map((d) => [d, firstLine.filter((c) => c === d).length] as const);
  const best = counts.reduce((a, b) => (b[1] > a[1] ? b : a));
  return best[1] > 0 ? best[0] : ",";
}

function fromRecords(records: string[][], sheet?: string): Table {
  if (!records.length) throw new TableError("There are no rows.");
  const width = Math.max(...records.map((r) => r.length));
  const filled = records.map((r) => Array.from({ length: width }, (_, i) => (r[i] ?? "").trim()));
  const [headers, ...rows] = filled;
  return { headers: headers!.map((h, i) => h || `Column ${i + 1}`), rows, ...(sheet ? { sheet } : {}) };
}

// Excel workbooks (.xlsx, Office Open XML): a zip of XML parts.

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The files of a zip by name, read from its central directory (stored or deflated entries). */
export async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new TableError("This is not an Excel workbook (.xlsx) or a zip.");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new TableError("The workbook's zip directory is damaged.");
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, await inflateRaw(data));
    else throw new TableError(`The workbook's part ${name} is compressed in a way not read here (method ${method}).`);
    at += 46 + nameLength + extra + comment;
  }
  return files;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function unescapeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (whole, name: string) =>
    name[0] === "#"
      ? String.fromCodePoint(name[1] === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1)))
      : (ENTITIES[name] ?? whole));
}

/** The text of the <t> elements inside a piece of XML (a shared string, an inline string): rich text joined. */
function texts(xml: string): string {
  return [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>|<(?:\w+:)?t(?:\s[^>]*)?\/>/g)]
    .map((m) => unescapeXml(m[1] ?? ""))
    .join("");
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

/** Built-in number formats that are dates (ECMA-376, 18.8.30), and custom ones that show a day, month or year. */
const DATE_FORMATS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

function dateStyles(styles: string | undefined): Set<number> {
  const out = new Set<number>();
  if (!styles) return out;
  const custom = new Map<number, string>();
  for (const [tag] of styles.matchAll(/<(?:\w+:)?numFmt\s[^>]*>/g)) {
    custom.set(Number(attribute(tag, "numFmtId")), unescapeXml(attribute(tag, "formatCode") ?? ""));
  }
  const xfs = /<(?:\w+:)?cellXfs[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/.exec(styles)?.[1] ?? "";
  [...xfs.matchAll(/<(?:\w+:)?xf\s[^>]*>/g)].forEach(([tag], index) => {
    const id = Number(attribute(tag, "numFmtId") ?? 0);
    const code = (custom.get(id) ?? "").replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
    if (DATE_FORMATS.has(id) || /[dy]/i.test(code) || /m/i.test(code.replace(/h+[^a-z]*m+|m+[^a-z]*s+/gi, ""))) out.add(index);
  });
  return out;
}

/** An Excel date serial (1900 system, after its 29 February 1900) as YYYY-MM-DD. */
export function excelDate(serial: number): string {
  const days = Math.floor(serial) - 25569; // 1970-01-01
  return new Date(days * 86_400_000).toISOString().slice(0, 10);
}

/** A number cell as Excel shows it: at most 15 significant digits (0.1 + 0.2 is 0.3, not 0.30000000000000004). */
export function excelNumber(value: string): string {
  const number = Number(value);
  return Number.isFinite(number) ? String(Number(number.toPrecision(15))) : value;
}

function column(reference: string): number {
  const letters = /^[A-Z]+/.exec(reference)?.[0] ?? "A";
  return [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
}

/** The first worksheet of an Excel workbook as a table. */
export async function parseXlsx(bytes: Uint8Array): Promise<Table> {
  const files = await unzip(bytes);
  const text = (name: string) => {
    const file = files.get(name);
    return file ? new TextDecoder().decode(file) : undefined;
  };
  const workbook = text("xl/workbook.xml");
  if (!workbook) throw new TableError("This zip is not an Excel workbook (.xlsx): it has no xl/workbook.xml.");
  const firstSheet = /<(?:\w+:)?sheet\s[^>]*>/.exec(workbook)?.[0];
  if (!firstSheet) throw new TableError("The workbook has no worksheet.");
  const sheetName = unescapeXml(attribute(firstSheet, "name") ?? "");
  const relationId = /\sr:id="([^"]*)"/.exec(firstSheet)?.[1];
  const relations = text("xl/_rels/workbook.xml.rels") ?? "";
  const target = [...relations.matchAll(/<Relationship\s[^>]*>/g)].map(([tag]) => tag)
    .find((tag) => attribute(tag, "Id") === relationId);
  const path = target ? attribute(target, "Target")! : "worksheets/sheet1.xml";
  const sheetPath = path.startsWith("/") ? path.slice(1) : `xl/${path}`;
  const sheet = text(sheetPath);
  if (!sheet) throw new TableError(`The workbook's first worksheet (${sheetPath}) is missing.`);
  const shared = [...(text("xl/sharedStrings.xml") ?? "").matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => texts(m[1]!));
  const dates = dateStyles(text("xl/styles.xml"));

  const records: string[][] = [];
  for (const [, rowXml] of sheet.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const record: string[] = [];
    for (const [, tag, body] of rowXml!.matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const reference = attribute(tag!, "r");
      const index = reference ? column(reference) : record.length;
      const type = attribute(tag!, "t") ?? "n";
      const value = unescapeXml(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body ?? "")?.[1] ?? "");
      let cell: string;
      if (type === "s") cell = shared[Number(value)] ?? "";
      else if (type === "inlineStr") cell = texts(body ?? "");
      else if (type === "b") cell = value === "1" ? "TRUE" : "FALSE";
      else if (type === "n" && value && dates.has(Number(attribute(tag!, "s") ?? 0))) cell = excelDate(Number(value));
      else if (type === "n" && value) cell = excelNumber(value);
      else cell = value;
      while (record.length < index) record.push("");
      record[index] = cell;
    }
    if (record.some((cell) => cell.trim() !== "")) records.push(record);
  }
  return fromRecords(records, sheetName);
}

/** A file the person chose: an Excel workbook by its zip signature, else text (UTF-8, or Latin-1 if not UTF-8). */
export async function parseTableFile(bytes: Uint8Array): Promise<Table> {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return parseXlsx(bytes);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return parseDelimited(text);
}
