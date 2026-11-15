import SECOND_TITLES from "./data/data_titles.json";
import { formatDate, type MonthLanguage } from "./dates.ts";
import { aiEntry, isDateAi, isFullYearDate } from "./dictionary.ts";
import { InputError } from "./syntax.ts";

/**
 * The languages a label's data titles can add to English (6.6.4.2: "If there is no other language agreed between
 * trading partners, data titles must be printed in English. As an option left at the discretion of the labeller, a
 * second language can be added"), each named in itself.
 */
export const SECOND_LANGUAGES = { "pt-BR": "Português", es: "Español", fr: "Français", de: "Deutsch", it: "Italiano" } as const;
export type SecondLanguage = keyof typeof SECOND_LANGUAGES;

/**
 * A data title in a second language (`data/data_titles.json`, drafts by Claude to be reviewed by native speakers):
 * the AI's own entry where one English title has two meanings ((4305) SHIP TO LOC is a town, (410)'s a GLN), else the
 * English title's; also the label's own FROM and TO. Null where the title is the same in every language, an acronym
 * such as SSCC or GTIN.
 */
export function secondTitle(english: string, language: SecondLanguage, ai?: string): string | null {
  const titles = (SECOND_TITLES as Record<SecondLanguage, Record<string, string>>)[language];
  return (ai !== undefined ? titles[`(${ai})`] : undefined) ?? titles[english] ?? null;
}

/**
 * How the human readable text writes each element string (backlog 6.11, the owner, 15 November 2026): the AI in
 * parentheses and the data, `(17)271231`, as the symbols have always been drawn; the data title and the data,
 * `USE BY or EXPIRY 271231`; both, `USE BY or EXPIRY (17) 271231` (General Specifications 4.14.1, figure 4-8); or a
 * pattern of one's own.
 */
export const HRI_STYLES = ["ai", "title", "both", "own"] as const;
export type HriStyle = (typeof HRI_STYLES)[number];

export interface HriFormat {
  style: HriStyle;
  /** The pattern of `own`: `{ai}`, `{title}` and `{value}`, a date's `{value:DD MMM YYYY}` (`formatDate`). */
  pattern?: string;
  /** The data titles' language; English when not given. */
  language?: SecondLanguage;
}

/** The patterns of the styles that are not one's own, and the one a pattern of one's own starts from. */
export const HRI_PATTERNS: Record<Exclude<HriStyle, "own">, string> = {
  ai: "({ai}){value}",
  title: "{title} {value}",
  both: "{title} ({ai}) {value}",
};

const TOKEN = /\{([^{}]*)\}/g;
const LINE = /^\((\d{2,4})\)(.*)$/s;
/** A value left for the printer to fill (a ZPL template's field): no date is written from it. */
const PLACEHOLDER = /^\{\{\d+\}\}$/;

const MONTHS: Record<SecondLanguage | "en", MonthLanguage> = { en: "en", "pt-BR": "pt", es: "es", fr: "fr", de: "de", it: "it" };

/** The data title of `ai` in `language` (English when not given): the dictionary's, or its translation. */
export function dataTitle(ai: string, language?: SecondLanguage): string {
  const english = aiEntry(ai)?.title ?? ai;
  return (language ? secondTitle(english, language, ai) : null) ?? english;
}

/**
 * Refuses a pattern of one's own that cannot write the text: one without `{value}` (the human readable text shows the
 * data), a name in braces other than `ai`, `title` and `value`, or a format after `ai` or `title`.
 */
export function checkHriPattern(pattern: string): void {
  let value = false;
  for (const [whole, inside] of pattern.matchAll(TOKEN)) {
    const [, name, format] = /^(ai|title|value)(?::(.*))?$/s.exec(inside!) ?? [];
    if (!name) throw new InputError(`The text's format knows {ai}, {title} and {value}, not ${whole}.`);
    if (format !== undefined && name !== "value") throw new InputError(`Only {value} takes a date format, not ${whole}.`);
    if (name === "value") value = true;
  }
  if (!value) throw new InputError("The text's format must show the data: put {value} in it.");
}

/**
 * The line `(ai)value` written in `format`; a line that is not an element string (an EAN/UPC's or ITF-14's digits)
 * as it is. A date's value in a format of its own, `{value:DD MMM YYYY}`, takes its data title without the AI (figure
 * 4-9: the AI is shown only with the data as it is encoded); another AI's value is written as encoded whatever format
 * follows it. A pattern `checkHriPattern` refuses raises its `InputError`.
 */
export function hriText(line: string, format?: HriFormat): string {
  if (!format || format.style === "ai") return line;
  const [, ai, value] = LINE.exec(line) ?? [];
  if (ai === undefined || value === undefined) return line;
  let pattern = format.style === "own" ? (format.pattern ?? "") : HRI_PATTERNS[format.style];
  checkHriPattern(pattern);
  const dated = isDateAi(ai) && !PLACEHOLDER.test(value) && /\{value:[^{}]*\}/.test(pattern);
  if (dated) pattern = pattern.replace(/\(\s*\{ai\}\s*\)|\{ai\}/g, "");
  const language = format.language;
  const text = pattern.replace(TOKEN, (_whole, inside: string) => {
    const [name, ...rest] = inside.split(":");
    if (name === "ai") return ai;
    if (name === "title") return dataTitle(ai, language);
    return dated && rest.length ? formatDate(value, rest.join(":"), { months: MONTHS[language ?? "en"], fullYear: isFullYearDate(ai) }) : value;
  });
  return dated ? text.replace(/\s{2,}/g, " ").trim() : text;
}

/** What joins element strings that share a line under a linear symbol: nothing between `(01)…(17)…`, else two spaces. */
export function hriJoiner(format?: HriFormat): string {
  return !format || format.style === "ai" ? "" : "  ";
}
