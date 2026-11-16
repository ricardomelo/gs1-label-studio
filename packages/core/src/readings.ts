import type { CheckResult, Verdict } from "./check.ts";
import { fault } from "./faults.ts";
import { bytesToHex, bytesToText, type Reading, type ReadingCarrier, type ReadingSource } from "./reading.ts";
import { toDelimited } from "./report.ts";

// The Check Studio's readings as files (backlog 7.1 k; the check studio's project, section 7.2; ADR 0007 decision 17):
// readings.json, lossless, opened again on another device; readings.csv, one row per reading, and findings.csv, one row
// per finding, for a spreadsheet; and the counts of a session's report (section 7.3), which the history's filters give
// too. The files stay in English (CLAUDE.md), with stable column names; the CSV starts with a byte order mark so that
// Excel reads its accents, and has a semicolon variant for spreadsheets that expect one.

/** The `format` of a readings file, as `WORK_FORMAT` names a work file. */
export const READINGS_FORMAT = "gs1-label-studio.readings";
export const READINGS_VERSION = 1;

/** A reading as the history keeps it, with what a report or a file needs around it. */
export interface ReadingRecord {
  /** Null for an item recorded as having no barcode (the project's Q9). */
  reading: Reading | null;
  /** When it was read or recorded, ISO 8601 in UTC. */
  at: string;
  /** The session's name, when it was read in one. */
  session: string | null;
  /** The item (a group of codes) it was read with, when it was. */
  group: string | null;
  /** The scanning environment it was checked against. */
  environment: string | null;
  note: string;
}

/** A record with its check under the current release; null for an item with no barcode. */
export interface CheckedRecord extends ReadingRecord {
  result: CheckResult | null;
}

/** The decoder's names of the symbologies, as a person knows them. */
const FORMAT_NAMES: Readonly<Record<string, string>> = {
  DataMatrix: "Data Matrix",
  QRCode: "QR Code",
  Code128: "Code 128",
  EAN13: "EAN-13",
  EAN8: "EAN-8",
  UPCA: "UPC-A",
  UPCE: "UPC-E",
  ITF: "ITF",
  DataBar: "GS1 DataBar",
  DataBarOmni: "GS1 DataBar",
  DataBarLtd: "GS1 DataBar Limited",
  DataBarLimited: "GS1 DataBar Limited",
  DataBarExp: "GS1 DataBar Expanded",
  DataBarExpanded: "GS1 DataBar Expanded",
  DataBarStk: "GS1 DataBar Stacked",
  DataBarExpStk: "GS1 DataBar Expanded Stacked",
};
/** The GS1 names a symbology identifier gives the same symbols (General Specifications 5.1.3, table 5-2). */
const GS1_NAMES: Readonly<Record<string, string>> = { "]d2": "GS1 DataMatrix", "]Q3": "GS1 QR Code", "]C1": "GS1-128", "]I1": "ITF-14" };
/** The symbols a symbology identifier names when no decoder did (a scanner's text, a paste). */
const IDENTIFIER_NAMES: Readonly<Record<string, string>> = {
  "]e0": "GS1 DataBar", "]E0": "EAN-13 / UPC-A", "]E4": "EAN-8", "]d1": "Data Matrix", "]Q1": "QR Code", "]C0": "Code 128",
};
const TAG_NAMES: Readonly<Record<string, string>> = { rfid: "RFID tag", nfc: "NFC tag" };

/**
 * A reading's symbology as a person knows it: its GS1 name when its identifier gives one, else the decoder's, else the
 * one its identifier names; "RFID tag" or "NFC tag" for a tag; null when nothing names it (a text without an identifier).
 */
export function symbologyName(reading: Reading): string | null {
  if (TAG_NAMES[reading.carrier]) return TAG_NAMES[reading.carrier]!;
  const id = reading.symbologyIdentifier ?? "";
  return GS1_NAMES[id] ?? FORMAT_NAMES[reading.format ?? ""] ?? reading.format ?? IDENTIFIER_NAMES[id] ?? null;
}

// readings.json

interface StoredReading extends Omit<Reading, "bytes"> {
  /** The bytes as hexadecimal. */
  bytes: string;
}

interface StoredRecord extends Omit<ReadingRecord, "reading"> {
  reading: StoredReading | null;
}

/** The records as a readings file: everything, bytes as hexadecimal, so that a re-check gives the same findings. */
export function readingsJson(records: readonly ReadingRecord[]): string {
  const stored: StoredRecord[] = records.map(({ reading, ...rest }) => {
    if (!reading) return { ...rest, reading: null };
    const { bytes, ...fields } = reading;
    return { ...rest, reading: { ...fields, bytes: bytesToHex(bytes).replace(/ /g, "") } };
  });
  return JSON.stringify({ format: READINGS_FORMAT, version: READINGS_VERSION, readings: stored }, null, 1) + "\n";
}

const SOURCES: readonly ReadingSource[] = ["camera", "image", "nfc", "wedge", "paste"];
const CARRIERS: readonly ReadingCarrier[] = ["barcode", "nfc", "rfid"];

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

function hexBytes(hex: string): Uint8Array {
  if (!/^(?:[0-9A-Fa-f]{2})*$/.test(hex)) throw new Error("The readings file has bytes that are not hexadecimal.");
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

/** A reading from the file, every field checked: a file from elsewhere is data, never trusted. */
function readingOf(value: unknown): Reading {
  if (!value || typeof value !== "object") throw new Error("The readings file has a reading that is not an object.");
  const r = value as Record<string, unknown>;
  const source = SOURCES.find((s) => s === r.source);
  const carrier = CARRIERS.find((c) => c === r.carrier);
  if (!source || !carrier || typeof r.bytes !== "string" || typeof r.at !== "string")
    throw new Error("The readings file has a reading without its source, carrier, bytes or time.");
  const bytes = hexBytes(r.bytes);
  const point = (p: unknown): [number, number] | null =>
    Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number") ? [p[0] as number, p[1] as number] : null;
  const position = Array.isArray(r.position) && r.position.length === 4 && r.position.every((p) => point(p)) ? r.position.map((p) => point(p)!) : null;
  const image = r.image && typeof r.image === "object" ? (r.image as Record<string, unknown>) : null;
  const nfc = r.nfc && typeof r.nfc === "object" ? (r.nfc as Record<string, unknown>) : null;
  return {
    at: r.at,
    source,
    carrier,
    symbologyIdentifier: text(r.symbologyIdentifier),
    format: text(r.format),
    bytes,
    text: text(r.text) ?? bytesToText(bytes), // an EPC's text is the hexadecimal as given, not its bytes
    eci: r.eci === true,
    ecLevel: text(r.ecLevel),
    version: text(r.version),
    mirrored: r.mirrored === true,
    inverted: r.inverted === true,
    position,
    image: image && typeof image.width === "number" && typeof image.height === "number" ? { width: image.width, height: image.height } : null,
    nfc: nfc && typeof nfc.recordIndex === "number" && typeof nfc.recordType === "string"
      ? { serialNumber: text(nfc.serialNumber), recordIndex: nfc.recordIndex, recordType: nfc.recordType }
      : null,
    identifierAssumed: r.identifierAssumed === true,
  };
}

/** The records of a readings file; an error, in English, when it is not one this release reads. */
export function parseReadingsJson(json: string): ReadingRecord[] {
  let file: unknown;
  try {
    file = JSON.parse(json);
  } catch {
    throw new Error("This is not a readings file of GS1 Label Studio.");
  }
  const f = file as Record<string, unknown> | null;
  if (!f || f.format !== READINGS_FORMAT || !Array.isArray(f.readings)) throw new Error("This is not a readings file of GS1 Label Studio.");
  if (f.version !== READINGS_VERSION) throw new Error("This readings file was written by a later release of GS1 Label Studio.");
  return f.readings.map((value: unknown) => {
    const r = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    const reading = r.reading === null ? null : readingOf(r.reading);
    const at = text(r.at) ?? reading?.at;
    if (!at) throw new Error("The readings file has a reading without its source, carrier, bytes or time.");
    return { reading, at, session: text(r.session), group: text(r.group), environment: text(r.environment), note: text(r.note) ?? "" };
  });
}

// readings.csv and findings.csv

/** The columns of readings.csv, in the order of the project's section 7.2. */
export const READINGS_COLUMNS = [
  "Time (UTC)", "Session", "Group", "Source", "Symbology identifier", "Symbology", "Verdict", "Errors", "Warnings", "Fault codes",
  "Key AI", "Key value", "GTIN-14", "Batch", "Expiry", "Serial", "Element string", "Digital Link URI", "Raw text", "Raw hex",
  "Context", "Note",
] as const;

/** The columns of findings.csv. */
export const FINDINGS_COLUMNS = ["Reading", "Code", "Severity", "AI", "Position", "Rule", "Sections", "Engine message"] as const;

/** The AIs of the identification keys, the first found being a reading's key (the history's order). */
export const KEY_AIS = ["01", "00", "414", "8017", "8018", "253", "255", "8003", "8004", "401", "402", "417", "8006", "8010", "8013"] as const;

/** A verdict as the files write it: the code's own word. */
export type RecordVerdict = Verdict | "no-barcode";

export function recordVerdict(record: CheckedRecord): RecordVerdict {
  return record.reading && record.result ? record.result.verdict : "no-barcode";
}

/** The findings that judge: errors, warnings and notes, not what could not be assessed. */
const judged = (result: CheckResult | null) => result?.findings.filter((f) => f.severity !== "not-assessed") ?? [];

/** A record's key: the first identification key, else its first element string. */
export function keyOf(result: CheckResult | null): { ai: string; value: string } | null {
  const elements = result?.elements ?? [];
  const key = KEY_AIS.map((ai) => elements.find((e) => e.ai === ai)).find(Boolean) ?? elements[0];
  return key ? { ai: key.ai, value: key.value } : null;
}

/** The text read with its group separators written {GS}, so that a spreadsheet cell shows them. */
function rawText(reading: Reading): string {
  return reading.text.replace(/\x1d/g, "{GS}").replace(/[\x00-\x1f\x7f]/g, (c) => `{${c.charCodeAt(0).toString(16).padStart(2, "0").toUpperCase()}}`);
}

/**
 * readings.csv: a byte order mark, then a header and one row per record, checked under the current release; a record
 * with no barcode has its time, session, group, verdict and note only.
 */
export function readingsCsv(records: readonly CheckedRecord[], delimiter: "," | ";" = ","): string {
  const rows = records.map((record) => {
    const { reading, result } = record;
    const value = (ai: string) => result?.elements.find((e) => e.ai === ai)?.value ?? "";
    const findings = judged(result);
    const key = keyOf(result);
    return [
      record.at, record.session ?? "", record.group ?? "", reading?.source ?? "", reading?.symbologyIdentifier ?? "",
      reading ? symbologyName(reading) ?? "" : "", recordVerdict(record),
      reading ? String(findings.filter((f) => f.severity === "error").length) : "",
      reading ? String(findings.filter((f) => f.severity === "warning").length) : "",
      [...new Set(findings.map((f) => f.code))].join(" "),
      key?.ai ?? "", key?.value ?? "", value("01"), value("10"), value("17"), value("21"),
      result?.forms?.elementString ?? "", result?.forms?.digitalLinkUri ?? "",
      reading ? rawText(reading) : "", reading ? bytesToHex(reading.bytes) : "", record.environment ?? "", record.note,
    ];
  });
  return "﻿" + toDelimited([[...READINGS_COLUMNS], ...rows], delimiter);
}

/**
 * findings.csv: one row per finding (what could not be assessed included, as such), the reading numbered as its row in
 * readings.csv (1 for the first); the rule is the catalogue's English line, the position the bytes it points at.
 */
export function findingsCsv(records: readonly CheckedRecord[], delimiter: "," | ";" = ","): string {
  const rows: string[][] = [];
  records.forEach((record, index) => {
    for (const finding of record.result?.findings ?? []) {
      rows.push([
        String(index + 1), finding.code, finding.severity, finding.ai ?? "",
        finding.ranges.map(([start, end]) => (end - start > 1 ? `${start}-${end - 1}` : String(start))).join(" "),
        fault(finding.code).texts.what, finding.sections.join(" "), finding.engineMessage ?? "",
      ]);
    }
  });
  return "﻿" + toDelimited([[...FINDINGS_COLUMNS], ...rows], delimiter);
}

// The counts of a session's report

/** The verdicts in the order a report lists them. */
export const RECORD_VERDICTS: readonly RecordVerdict[] = ["follows", "remarks", "does-not-follow", "not-gs1", "not-assessed", "no-barcode"];

export interface SurveyCounts {
  total: number;
  verdicts: Record<RecordVerdict, number>;
  /** The HBSA's three (the project's Q9): a code carrying GS1 data, a code carrying none, an item with no barcode. */
  gs1: number;
  nonGs1: number;
  noBarcode: number;
  /** By symbology, the most first. */
  symbologies: [string, number][];
  /** The ten most frequent fault codes, by the readings they are found in, the most first. */
  faults: [string, number][];
  /** By company prefix (or by GS1 prefix when no GCP table is given), the most first. */
  prefixes: [string, number][];
  /** Whether `prefixes` holds company prefixes (a GCP table was given) or the GS1 prefixes of three digits. */
  companyPrefixes: boolean;
}

/** The labels a session's counts use where there is no name: the report translates them. */
const COUNT_LABELS = { noIdentifier: "Text without a symbology identifier", notInTable: "Not in the GCP table" } as const;

const KEYS_WITH_GCP = new Set(["01", "00", "414", "8017", "8018", "253", "255", "8003", "8004", "401", "402", "417", "8006", "8010", "8013"]);

/** The GS1 company prefix part of a key's value: the GTIN-14 and the SSCC start with one digit before it. */
function companyPart(key: { ai: string; value: string }): string | null {
  if (!KEYS_WITH_GCP.has(key.ai) || !/^\d{8,}/.test(key.value)) return null;
  if (key.ai === "01" || key.ai === "00" || key.ai === "8006" || key.ai === "8003") return key.value.slice(1);
  return key.value;
}

const ranked = (counts: Map<string, number>): [string, number][] => [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

function bump(counts: Map<string, number>, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * A session's counts (section 7.3): by verdict, GS1 / non-GS1 / no barcode, by symbology, the ten most frequent faults
 * and by company prefix. `gcpLength` gives a company prefix's length from the GCP table, when it is loaded.
 */
export function surveyCounts(records: readonly CheckedRecord[], gcpLength?: (companyPart: string) => number | null): SurveyCounts {
  const verdicts = Object.fromEntries(RECORD_VERDICTS.map((v) => [v, 0])) as Record<RecordVerdict, number>;
  const symbologies = new Map<string, number>();
  const faults = new Map<string, number>();
  const prefixes = new Map<string, number>();
  let gs1 = 0;
  let nonGs1 = 0;
  let noBarcode = 0;
  for (const record of records) {
    verdicts[recordVerdict(record)]++;
    const { reading, result } = record;
    if (!reading || !result) {
      noBarcode++;
      continue;
    }
    // GS1 data: element strings, or an RFID tag's EPC (a GS1 standard even where the EPC tables are not at hand)
    if (result.elements.length > 0 || result.tag || reading.carrier === "rfid") gs1++;
    else nonGs1++;
    bump(symbologies, symbologyName(reading) ?? COUNT_LABELS.noIdentifier);
    for (const code of new Set(judged(result).map((f) => f.code))) bump(faults, code);
    const key = keyOf(result);
    const part = key && companyPart(key);
    if (part) {
      const length = gcpLength?.(part) ?? null;
      bump(prefixes, gcpLength ? (length ? part.slice(0, length) : COUNT_LABELS.notInTable) : part.slice(0, 3));
    }
  }
  return {
    total: records.length, verdicts, gs1, nonGs1, noBarcode, symbologies: ranked(symbologies), faults: ranked(faults).slice(0, 10),
    prefixes: ranked(prefixes), companyPrefixes: Boolean(gcpLength),
  };
}
