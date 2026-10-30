import { checkDigit } from "./checkDigit.ts";
import type { Table } from "./table.ts";

// Generated sequences (backlog 2.3): serial numbers and SSCCs, as rows of their own or as a column added to the rows of
// a file. Each value is then checked by the GS1 Barcode Syntax Engine like any other cell.

export type Sequence =
  | {
      kind: "serial";
      /** The first number, the count and the step between numbers. */
      first: number;
      count: number;
      step?: number;
      /** Written before each number, e.g. "S-". */
      prefix: string;
      /** Each number padded with zeros to this many digits; 0 for none. */
      digits: number;
    }
  | {
      kind: "sscc";
      first: number;
      count: number;
      step?: number;
      /** The extension digit, 0 to 9, chosen by the company that makes the SSCC. */
      extension: string;
      /** The GS1 Company Prefix (4 to 12 digits): the serial reference takes the digits left of the 17. */
      companyPrefix: string;
    };

/** The most rows a sequence makes at once: the studio draws every label in the browser. */
export const MAX_SEQUENCE = 100_000;

/** AI (21)'s characters (GS1 AI encodable character set 82), without "(", which the barcode encoder cannot take. */
const SET_82 = /^[!"%&')*+,\-./0-9:;<=>?A-Z_a-z]*$/;
const SERIAL_LENGTH = 20;

/** The column's header: one that names its AI, so that the studio maps it without asking. */
export function sequenceHeader(sequence: Sequence): string {
  return sequence.kind === "sscc" ? "(00) SSCC" : "(21) Serial number";
}

/** The last number of the sequence. */
function last(sequence: Sequence): number {
  return sequence.first + (sequence.count - 1) * (sequence.step ?? 1);
}

/** What is wrong with a sequence, or null. */
export function sequenceProblem(sequence: Sequence): string | null {
  const step = sequence.step ?? 1;
  if (![sequence.first, sequence.count, step].every(Number.isSafeInteger) || sequence.first < 0 || step < 1) {
    return "The first number, the count and the step must be whole numbers, the first from 0 and the step from 1.";
  }
  if (sequence.count < 1 || sequence.count > MAX_SEQUENCE) return `The count must be from 1 to ${MAX_SEQUENCE.toLocaleString("en-GB")}.`;
  if (sequence.kind === "serial") {
    if (!SET_82.test(sequence.prefix)) {
      return "The prefix may hold letters, digits and ! \" % & ' ) * + , - . / : ; < = > ? _ only (GS1's character set 82, without \"(\").";
    }
    const longest = sequence.prefix.length + Math.max(sequence.digits, String(last(sequence)).length);
    if (longest > SERIAL_LENGTH) return `A serial number has at most ${SERIAL_LENGTH} characters; the last would have ${longest}.`;
    if (sequence.digits && String(last(sequence)).length > sequence.digits) {
      return `The last number, ${last(sequence)}, has more than ${sequence.digits} digits.`;
    }
    return null;
  }
  if (!/^\d$/.test(sequence.extension)) return "The extension digit is one digit, 0 to 9.";
  if (!/^\d{4,12}$/.test(sequence.companyPrefix)) return "The GS1 Company Prefix has 4 to 12 digits.";
  const room = 16 - sequence.companyPrefix.length;
  if (String(last(sequence)).length > room) {
    return `With a company prefix of ${sequence.companyPrefix.length} digits the serial reference has ${room}: ` +
      `the last, ${last(sequence)}, does not fit.`;
  }
  return null;
}

/** An SSCC: the extension digit, the company prefix, the serial reference padded to fill 17 digits, the check digit. */
export function ssccFor(extension: string, companyPrefix: string, reference: number): string {
  const body = extension + companyPrefix + String(reference).padStart(16 - companyPrefix.length, "0");
  return body + checkDigit(body);
}

/** The sequence's values, in order; a `RangeError` with `sequenceProblem()`'s reason when it has one. */
export function sequenceValues(sequence: Sequence): string[] {
  const problem = sequenceProblem(sequence);
  if (problem) throw new RangeError(problem);
  const step = sequence.step ?? 1;
  return Array.from({ length: sequence.count }, (_, i) => {
    const n = sequence.first + i * step;
    return sequence.kind === "sscc"
      ? ssccFor(sequence.extension, sequence.companyPrefix, n)
      : sequence.prefix + String(n).padStart(sequence.digits, "0");
  });
}

/** Rows of the sequence alone, one a value. */
export function sequenceTable(sequence: Sequence): Table {
  return { headers: [sequenceHeader(sequence)], rows: sequenceValues(sequence).map((value) => [value]) };
}

/** The table with the sequence as its last column, a value a row (the count is the table's). */
export function withSequence(table: Table, sequence: Sequence): Table {
  const values = sequenceValues({ ...sequence, count: table.rows.length });
  return { ...table, headers: [...table.headers, sequenceHeader(sequence)], rows: table.rows.map((row, i) => [...row, values[i]!]) };
}
