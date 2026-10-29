import type { CheckedRow, ColumnMapping } from "./bulk.ts";
import type { Table } from "./table.ts";

// The validation report of bulk generation (backlog 2.2, mock-up A of 29 October 2026): each row ready, fixed, in
// error or skipped; a value fixed in the studio without changing the file; the report and the corrected rows as CSV.

/** Values fixed in the studio: by data row (0 for the first row after the header), then by column. */
export type CellEdits = Record<number, Record<number, string>>;

export type RowStatus = "ready" | "fixed" | "error" | "skipped";

/** The table with the values fixed in the studio in place of the file's. */
export function applyEdits(table: Table, edits: CellEdits): Table {
  if (!Object.keys(edits).length) return table;
  return {
    ...table,
    rows: table.rows.map((cells, index) => {
      const fixed = edits[index];
      return fixed ? cells.map((cell, column) => fixed[column] ?? cell) : cells;
    }),
  };
}

/**
 * The edits with one cell set: a value equal to the file's undoes that cell's edit, and a row with no edit left goes.
 */
export function editCell(edits: CellEdits, original: Table, index: number, column: number, value: string): CellEdits {
  const row = { ...edits[index] };
  if (value === (original.rows[index]?.[column] ?? "")) delete row[column];
  else row[column] = value;
  const next = { ...edits };
  if (Object.keys(row).length) next[index] = row;
  else delete next[index];
  return next;
}

/** A skipped row is left out whatever its check; a row fixed in the studio and now ready is "fixed". */
export function rowStatus(row: CheckedRow, index: number, edits: CellEdits, skipped: ReadonlySet<number>): RowStatus {
  if (skipped.has(index)) return "skipped";
  if (row.error) return "error";
  return edits[index] ? "fixed" : "ready";
}

export interface ReportCounts {
  ready: number;
  fixed: number;
  error: number;
  skipped: number;
  /** The rows that will be generated: ready and fixed. */
  generated: number;
}

export function reportCounts(rows: CheckedRow[], edits: CellEdits, skipped: ReadonlySet<number>): ReportCounts {
  const counts: ReportCounts = { ready: 0, fixed: 0, error: 0, skipped: 0, generated: 0 };
  rows.forEach((row, index) => counts[rowStatus(row, index, edits, skipped)]++);
  counts.generated = counts.ready + counts.fixed;
  return counts;
}

/** Delimited text as RFC 4180 writes it: a field with the delimiter, a quote or a line break is quoted. */
export function toDelimited(lines: string[][], delimiter = ","): string {
  const field = (value: string) =>
    value.includes(delimiter) || /["\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return lines.map((cells) => cells.map(field).join(delimiter)).join("\r\n") + "\r\n";
}

/**
 * The report as CSV: each row's number in the file, its status, the reason and the columns at fault, then its values
 * as the studio checked them (fixed values included), each column headed by its header and the AI it goes to.
 */
export function reportCsv(table: Table, mapping: ColumnMapping, rows: CheckedRow[], edits: CellEdits,
  skipped: ReadonlySet<number>): string {
  const edited = applyEdits(table, edits);
  const headers = table.headers.map((header, column) => (mapping[column] ? `${header} (${mapping[column]})` : header));
  const lines = rows.map((row, index) => [
    String(row.row),
    rowStatus(row, index, edits, skipped),
    row.error ?? "",
    (row.columns ?? []).map((column) => table.headers[column] ?? "").join("; "),
    Object.keys(edits[index] ?? {}).map((column) => table.headers[Number(column)] ?? "").join("; "),
    ...(edited.rows[index] ?? []),
  ]);
  return toDelimited([["Row", "Status", "Reason", "Columns at fault", "Fixed in the studio", ...headers], ...lines]);
}

/** The file's rows with the values fixed in the studio, to correct the file at its source. */
export function correctedCsv(table: Table, edits: CellEdits): string {
  return toDelimited([table.headers, ...applyEdits(table, edits).rows]);
}
