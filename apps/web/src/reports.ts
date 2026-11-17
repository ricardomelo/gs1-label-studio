import {
  bytesToHex, bytesToText, fault, RECORD_VERDICTS, recordVerdict, symbologyName, keyOf, type CheckedRecord, type CheckResult, type GroupKind, type GroupResult,
  type Reading, type RecordVerdict, type ReportBlock, type ReportDocument, type SurveyCounts,
} from "@gs1-label-studio/core";
import { SIMPLE_TEXTS } from "./checkTexts.ts";
import { B3_KEYBOARD, detailLines, NOT_CHECKED, readable, SEVERITIES, SOURCE_NAMES, VERDICTS } from "./checkWords.ts";
import { columnsText, GROUP_KINDS, groupDetailLines, memberName } from "./group.ts";
import type { Releases } from "./history.ts";
import { en, locale, t, tm } from "./i18n.ts";
import { aiTitle, ENVIRONMENT_NAMES } from "./texts.ts";

// The Check Studio's reports (backlog 7.1 k; the check studio's project, section 7.3; ADR 0007 decision 17): one
// reading, one item (a group) and a session, built here in the interface's language from the words the screen uses
// (the project's Q6: codes and sections unchanged) and laid out as a PDF by the core's reportPdf(). A session's
// counts come from the core's surveyCounts() over the readings the history lists, so the report counts what the
// filters show.

const NO_BARCODE = en("No barcode");
const PRINT_QUALITY = en("Print quality: a phone or a page cannot grade it; that needs a barcode verifier.");

/** A verdict's word, "No barcode" for an item recorded without one. */
export function verdictWord(verdict: RecordVerdict): string {
  return verdict === "no-barcode" ? t(NO_BARCODE) : t(VERDICTS[verdict].word);
}

/** The line at the foot of every page: the tool, the day, the releases that gave the verdicts. */
function footer(releases: Releases, now: Date): string {
  return t("GS1 Label Studio · {date} · checked with the GS1 Barcode Syntax Engine {engine}, dictionary {dictionary}", {
    date: now.toLocaleDateString(locale()),
    engine: releases.engine,
    dictionary: releases.dictionary,
  });
}

/** Bytes as text a page can show: a group separator as {GS}, other control characters by their hexadecimal code. */
function shown(bytes: Uint8Array): string {
  return bytesToText(bytes).replace(/\x1d/g, "{GS}").replace(/[\x00-\x1f\x7f]/g, (c) => `{${c.charCodeAt(0).toString(16).padStart(2, "0").toUpperCase()}}`);
}

/** A reading's name: its symbol, its kind of tag, or what the user typed. */
export function readingName(reading: Reading): string {
  if (reading.carrier === "rfid") return t("RFID tag");
  if (reading.carrier === "nfc") return t("NFC tag");
  return symbologyName(reading) ?? t("A symbol");
}

const time = (iso: string) => new Date(iso).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" });

/** The simple view as blocks: the verdict, what the code says, a card per finding, what was not checked. */
function simpleBlocks(reading: Reading, result: CheckResult, environment: string | null): ReportBlock[] {
  const today = new Date();
  const verdict = VERDICTS[result.verdict];
  const blocks: ReportBlock[] = [
    {
      kind: "pairs",
      rows: [
        [t("Verdict"), `${t(verdict.word)}. ${t(verdict.line)}`],
        [t("Symbol"), readingName(reading)],
        [t("Read on"), time(reading.at)],
        [t("Read from"), t(SOURCE_NAMES[reading.source])],
        [t("Where it is scanned"), environment ? t(ENVIRONMENT_NAMES[environment] ?? environment) : t("Not given")],
      ],
    },
  ];
  if (result.elements.length) {
    blocks.push({ kind: "heading", text: t("What the code says") });
    blocks.push({ kind: "pairs", rows: result.elements.map((e) => [`${aiTitle(e.ai, e.title)} (${e.ai})`, readable(e.ai, e.value, today)] as const) });
  }
  const judged = result.findings.filter((f) => f.severity !== "not-assessed");
  const keyboard = reading.source === "wedge" || reading.source === "paste";
  if (judged.length) {
    blocks.push({ kind: "heading", text: `${t("What is wrong")} (${judged.length})` });
    judged.forEach((f, i) => {
      const texts = SIMPLE_TEXTS[f.code];
      const what = f.code === "B3" && keyboard ? t(B3_KEYBOARD.what) : texts ? t(texts.what) : f.code;
      blocks.push({ kind: "paragraph", style: "bold", text: `${i + 1}. ${t(SEVERITIES[f.severity])} · ${f.code} — ${what}` });
      const where = f.ranges.length ? f.ranges.map(([a, b]) => `«${shown(reading.bytes.slice(a, b))}»`).join(" ") : t("the symbol as a whole");
      const ai = f.ai ? ` · ${aiTitle(f.ai, result.elements.find((e) => e.ai === f.ai)?.title ?? "")} (${f.ai})` : "";
      blocks.push({ kind: "paragraph", text: `${t("Where:")} ${where}${ai}` });
      if (texts) {
        blocks.push({ kind: "paragraph", text: `${t("Why it matters:")} ${t(texts.why)}` });
        blocks.push({ kind: "paragraph", text: `${t("How to fix:")} ${t(texts.fix)}` });
        if (f.code === "B3" && keyboard) blocks.push({ kind: "paragraph", text: t(B3_KEYBOARD.scanner) });
      }
      for (const line of detailLines(f)) blocks.push({ kind: "paragraph", style: "mono", text: line });
      if (f.fixedData) blocks.push({ kind: "paragraph", text: `${t("The data made right:")} ${f.fixedData}` });
    });
  }
  const notAssessed = [...new Set([...result.findings.filter((f) => f.severity === "not-assessed").map((f) => f.code), ...result.notChecked])];
  blocks.push({ kind: "heading", text: t("What was not checked") });
  for (const code of notAssessed) {
    blocks.push({ kind: "paragraph", text: `• ${NOT_CHECKED[code] ? t(NOT_CHECKED[code]!) : SIMPLE_TEXTS[code] ? t(SIMPLE_TEXTS[code]!.what) : code}` });
  }
  blocks.push({ kind: "paragraph", text: `• ${t(PRINT_QUALITY)}` });
  return blocks;
}

/** The expert view as blocks: the reading, the bytes, the element strings, every finding with its sections. */
function expertBlocks(reading: Reading, result: CheckResult, releases: Releases): ReportBlock[] {
  const blocks: ReportBlock[] = [
    { kind: "heading", text: t("For experts") },
    {
      kind: "pairs",
      rows: [
        [t("Symbology identifier"), reading.symbologyIdentifier ?? t("none given")],
        [t("Decoder's symbology"), reading.format ?? "—"],
        [t("Length"), t("{n} bytes", { n: String(reading.bytes.length) })],
        [t("Engine"), `GS1 Barcode Syntax Engine ${releases.engine}`],
        [t("Dictionary"), releases.dictionary],
      ],
    },
    { kind: "paragraph", style: "bold", text: t("The bytes, in hexadecimal") },
    { kind: "paragraph", style: "mono", text: bytesToHex(reading.bytes) },
    { kind: "paragraph", style: "bold", text: t("The bytes as text") },
    { kind: "paragraph", style: "mono", text: shown(reading.bytes) },
  ];
  if (result.forms) {
    blocks.push({ kind: "paragraph", style: "bold", text: t("Element string") }, { kind: "paragraph", style: "mono", text: result.forms.elementString });
    if (result.forms.digitalLinkUri) blocks.push({ kind: "paragraph", style: "bold", text: t("GS1 Digital Link URI") }, { kind: "paragraph", style: "mono", text: result.forms.digitalLinkUri });
  }
  if (result.findings.length) {
    blocks.push({
      kind: "table",
      head: [t("Code"), t("Severity"), "AI", t("Sections"), t("Engine message")],
      widths: [0.6, 1, 0.6, 1.6, 4],
      rows: result.findings.map((f) => [f.code, t(SEVERITIES[f.severity]), f.ai ?? "", [...f.sections, ...(fault(f.code).references ?? [])].join(", "), f.engineMessage ?? ""]),
    });
  }
  return blocks;
}

/** The report of one reading (section 7.3): the simple view, then the expert annex, in one or two pages. */
export function readingReport(reading: Reading, result: CheckResult, environment: string | null, releases: Releases, now = new Date()): ReportDocument {
  return {
    title: t("Check report"),
    footer: footer(releases, now),
    blocks: [{ kind: "title", text: `${t("Check report")}: ${readingName(reading)}` }, ...simpleBlocks(reading, result, environment), ...expertBlocks(reading, result, releases)],
  };
}

export interface ReportMember {
  reading: Reading;
  result: CheckResult;
}

/** The report of one item (section 7.3): the matrix of section 5.3, the group's findings, each code's summary. */
export function itemReport(members: readonly ReportMember[], group: GroupResult, kind: GroupKind, releases: Releases, now = new Date()): ReportDocument {
  const kindText = t(GROUP_KINDS.find((k) => k.value === kind)?.text ?? kind);
  const names = members.map((m, i) => `${i + 1} ${memberName(m.reading, group.columns[i])}`);
  const blocks: ReportBlock[] = [
    { kind: "title", text: `${t("Item report")}: ${kindText}` },
    { kind: "pairs", rows: [[t("Verdict"), `${t(VERDICTS[group.verdict].word)}. ${t(VERDICTS[group.verdict].line)}`], [t("Codes compared"), String(members.length)]] },
    { kind: "heading", text: t("What each code says") },
    {
      kind: "table",
      head: [t("Detail"), ...names],
      widths: [1.6, ...names.map(() => 2)],
      rows: group.matrix.map((row) => [`${aiTitle(row.ai, row.title)} (${row.ai})`, ...row.values.map((v) => v ?? "—")]),
      bold: group.matrix.map((row) => [false, ...row.values.map((v) => row.differs && v !== null)]),
    },
  ];
  if (group.matrix.some((r) => r.differs)) blocks.push({ kind: "paragraph", style: "small", text: t("In bold: the codes that carry this detail do not agree, character for character.") });
  if (group.findings.length) {
    blocks.push({ kind: "heading", text: `${t("What is wrong with the item")} (${group.findings.length})` });
    group.findings.forEach((f, i) => {
      const texts = SIMPLE_TEXTS[f.code];
      blocks.push({ kind: "paragraph", style: "bold", text: `${i + 1}. ${t(SEVERITIES[f.severity])} · ${f.code} — ${texts ? t(texts.what) : f.code}` });
      blocks.push({ kind: "paragraph", text: `${t("Where:")} ${columnsText(f.columns)}${f.ai ? ` · (${f.ai})` : ""}` });
      if (texts) blocks.push({ kind: "paragraph", text: `${t("How to fix:")} ${t(texts.fix)}` });
      for (const line of groupDetailLines(f)) blocks.push({ kind: "paragraph", style: "mono", text: line });
    });
  }
  blocks.push({ kind: "heading", text: t("Each code") });
  blocks.push({
    kind: "table",
    head: ["#", t("Code"), t("Verdict"), t("Faults")],
    widths: [0.4, 2.4, 2.4, 2],
    rows: members.map((m, i) => [String(i + 1), memberName(m.reading, group.columns[i]), t(VERDICTS[m.result.verdict].word), [...new Set(m.result.findings.filter((f) => f.severity !== "not-assessed").map((f) => f.code))].join(" ")]),
  });
  if (group.notChecked.length) {
    blocks.push({ kind: "heading", text: t("What was not checked") });
    for (const code of group.notChecked) blocks.push({ kind: "paragraph", text: `• ${NOT_CHECKED[code] ? t(NOT_CHECKED[code]!) : SIMPLE_TEXTS[code] ? t(SIMPLE_TEXTS[code]!.what) : code}` });
  }
  return { title: t("Item report"), footer: footer(releases, now), blocks };
}

const share = (n: number, total: number) => (total ? `${Math.round((100 * n) / total)} %` : "—");

/** The report of a session (section 7.3, a survey): the counts, then one line per reading. */
export function sessionReport(name: string, records: readonly CheckedRecord[], counts: SurveyCounts, releases: Releases, now = new Date()): ReportDocument {
  const total = counts.total;
  const times = records.map((r) => r.at).sort();
  const blocks: ReportBlock[] = [
    { kind: "title", text: `${t("Session report")}: ${name}` },
    {
      kind: "pairs",
      rows: [
        [t("Readings"), String(total)],
        [t("First reading"), times.length ? time(times[0]!) : "—"],
        [t("Last reading"), times.length ? time(times.at(-1)!) : "—"],
      ],
    },
    { kind: "heading", text: t("By verdict") },
    {
      kind: "table",
      head: [t("Verdict"), t("Readings"), t("Share")],
      widths: [4, 1, 1],
      rows: RECORD_VERDICTS.filter((v) => counts.verdicts[v] > 0).map((v) => [verdictWord(v), String(counts.verdicts[v]), share(counts.verdicts[v], total)]),
    },
    { kind: "heading", text: t("GS1, non-GS1 and no barcode") },
    {
      kind: "table",
      head: [t("Kind"), t("Readings"), t("Share")],
      widths: [4, 1, 1],
      rows: [
        [t("A code with GS1 data"), String(counts.gs1), share(counts.gs1, total)],
        [t("A code without GS1 data"), String(counts.nonGs1), share(counts.nonGs1, total)],
        [t(NO_BARCODE), String(counts.noBarcode), share(counts.noBarcode, total)],
      ],
    },
  ];
  if (counts.symbologies.length) {
    blocks.push({ kind: "heading", text: t("By symbology") });
    blocks.push({ kind: "table", head: [t("Symbology"), t("Readings"), t("Share")], widths: [4, 1, 1], rows: counts.symbologies.map(([s, n]) => [tm(s), String(n), share(n, total)]) });
  }
  if (counts.faults.length) {
    blocks.push({ kind: "heading", text: t("The ten most frequent faults") });
    blocks.push({
      kind: "table",
      head: [t("Code"), t("What is wrong"), t("Readings")],
      widths: [0.7, 5, 1],
      rows: counts.faults.map(([code, n]) => [code, SIMPLE_TEXTS[code] ? t(SIMPLE_TEXTS[code]!.what) : code, String(n)]),
    });
  }
  if (counts.prefixes.length) {
    blocks.push({ kind: "heading", text: counts.companyPrefixes ? t("By company prefix") : t("By GS1 prefix (load GS1's table of company prefixes for the companies)") });
    blocks.push({ kind: "table", head: [t("Prefix"), t("Readings"), t("Share")], widths: [4, 1, 1], rows: counts.prefixes.map(([p, n]) => [tm(p), String(n), share(n, total)]) });
  }
  blocks.push({ kind: "page-break" });
  blocks.push({ kind: "heading", text: t("Every reading") });
  blocks.push({
    kind: "table",
    head: ["#", t("Read on"), t("Symbol"), t("Key"), t("Verdict"), t("Faults")],
    widths: [0.45, 1.5, 1.7, 2.6, 1.9, 1.2],
    mono: [3],
    rows: records.map((r, i) => {
      const key = keyOf(r.result);
      return [
        String(i + 1), time(r.at), r.reading ? readingName(r.reading) : t(NO_BARCODE), key ? `(${key.ai}) ${key.value}` : "", verdictWord(recordVerdict(r)),
        [...new Set(r.result?.findings.filter((f) => f.severity !== "not-assessed").map((f) => f.code) ?? [])].join(" "),
      ];
    }),
  });
  return { title: t("Session report"), footer: footer(releases, now), blocks };
}

// The share texts (backlog 7.1 l; the check studio's project, section 7.4): what a message says, enough to act on
// without the file, in the interface's language as the reports are. The link, when one fits, goes under it.

const wrongLines = (findings: readonly { code: string }[]) =>
  [...new Set(findings.map((f) => f.code))].map((code) => `• ${code} — ${SIMPLE_TEXTS[code] ? t(SIMPLE_TEXTS[code]!.what) : code}`);

/** One reading: the verdict, the symbol, what the code says, each finding in one line with its code, the element string. */
export function readingShareText(reading: Reading, result: CheckResult): string {
  const today = new Date();
  const verdict = VERDICTS[result.verdict];
  const lines = [`${t(verdict.word)}. ${t(verdict.line)}`, `${t("Symbol")}: ${readingName(reading)}`];
  if (result.elements.length) {
    lines.push("", `${t("What the code says")}:`, ...result.elements.map((e) => `${aiTitle(e.ai, e.title)} (${e.ai}): ${readable(e.ai, e.value, today)}`));
  }
  const judged = result.findings.filter((f) => f.severity !== "not-assessed");
  if (judged.length) lines.push("", `${t("What is wrong")} (${judged.length}):`, ...wrongLines(judged));
  if (result.forms) lines.push("", `${t("Element string")}: ${result.forms.elementString}`);
  lines.push("", t("Checked with GS1 Label Studio."));
  return lines.join("\n");
}

/** One item: its kind and verdict, the codes compared, the item's findings, each code's verdict. */
export function itemShareText(members: readonly ReportMember[], group: GroupResult, kind: GroupKind): string {
  const kindText = t(GROUP_KINDS.find((k) => k.value === kind)?.text ?? kind);
  const lines = [`${t("Item report")}: ${kindText}`, `${t(VERDICTS[group.verdict].word)}. ${t(VERDICTS[group.verdict].line)}`, `${t("Codes compared")}: ${members.length}`];
  if (group.findings.length) lines.push("", `${t("What is wrong with the item")} (${group.findings.length}):`, ...wrongLines(group.findings));
  lines.push("", `${t("Each code")}:`, ...members.map((m, i) => `${i + 1}. ${memberName(m.reading, group.columns[i])} — ${t(VERDICTS[m.result.verdict].word)}`));
  lines.push("", t("Checked with GS1 Label Studio."));
  return lines.join("\n");
}

/** A session or what the history lists: the counts by verdict and by kind, the most frequent faults. */
export function sessionShareText(name: string, counts: SurveyCounts): string {
  const total = counts.total;
  const lines = [`${t("Session report")}: ${name}`, `${t("Readings")}: ${total}`, ""];
  for (const v of RECORD_VERDICTS) if (counts.verdicts[v] > 0) lines.push(`${verdictWord(v)}: ${counts.verdicts[v]} (${share(counts.verdicts[v], total)})`);
  lines.push("", `${t("A code with GS1 data")}: ${counts.gs1} · ${t("A code without GS1 data")}: ${counts.nonGs1} · ${t(NO_BARCODE)}: ${counts.noBarcode}`);
  if (counts.faults.length) {
    lines.push("", `${t("The most frequent faults")}:`, ...counts.faults.slice(0, 5).map(([code, n]) => `• ${code} — ${SIMPLE_TEXTS[code] ? t(SIMPLE_TEXTS[code]!.what) : code}: ${n}`));
  }
  lines.push("", t("Checked with GS1 Label Studio."));
  return lines.join("\n");
}
