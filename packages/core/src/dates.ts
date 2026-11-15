import { isoDate } from "./sign.ts";
import { InputError } from "./syntax.ts";

/** The date formats the editor offers for a date field (backlog 4.2): `{17:DD/MM/YYYY}`. */
export const DATE_FORMATS = ["DD/MM/YYYY", "DD.MM.YYYY", "YYYY-MM-DD", "MM/YYYY", "DD MMM YYYY"] as const;

/**
 * The formats offered as well for a date followed by a time, such as (7003)'s: the time's hours and minutes in lower
 * case, hh and mm, so that MM stays the month (backlog 4.2); seconds, ss, are offered when the AI may carry them.
 */
export const TIME_FORMATS = ["DD/MM/YYYY hh:mm", "DD.MM.YYYY hh:mm", "YYYY-MM-DD hh:mm", "hh:mm"] as const;

export const DATE_TOKENS = /YYYY|YY|MMM|MM|DD|hh|mm|ss/g;
export const TIME_TOKENS = /hh|mm|ss/;

/**
 * The languages a date's month (`MMM`) can be written in: English, Portuguese, Spanish, French, German and Italian, the
 * interface's (ADR 0003).
 */
export type MonthLanguage = "en" | "pt" | "es" | "fr" | "de" | "it";

/**
 * Each language's month abbreviations, in capitals as labels print them (the owner, 3 November 2026), in the letters
 * every printer language's font has: French without accents (FEV, AOU, DEC), German's March as MRZ (as German Excel
 * writes it) rather than MÄR.
 */
export const MONTH_NAMES: Record<MonthLanguage, readonly string[]> = {
  en: ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"],
  pt: ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"],
  es: ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"],
  fr: ["JAN", "FEV", "MAR", "AVR", "MAI", "JUN", "JUL", "AOU", "SEP", "OCT", "NOV", "DEC"],
  de: ["JAN", "FEB", "MRZ", "APR", "MAI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEZ"],
  it: ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"],
};

/**
 * What a date is written with: the day its century is chosen from (today), the language of its month (English), and
 * whether the value's year has four digits, YYYYMMDD as (7250)'s (`isFullYearDate`), rather than two (false).
 */
export interface DateOptions {
  today?: Date;
  months?: MonthLanguage;
  fullYear?: boolean;
}

/**
 * A YYMMDD date in a format of DD, MM, MMM (the month's abbreviation in `MONTH_NAMES`), YY and YYYY, what is between
 * them kept: the century as section 7.12 of the General Specifications chooses it, day 00 the month's last
 * (`isoDate`); with `fullYear`, a YYYYMMDD date, as (7250)'s, its year as given. The digits after the date, in such
 * AIs as (7003), (8008) or (7251), are its time: hh the hours, mm the minutes, ss the seconds. A part the value does not have, as (7011) without its time or (8008) without its seconds, is left
 * out with the text before it, so "DD/MM/YYYY hh:mm" of a date alone is its date. A format with none of the parts
 * raises an `InputError`.
 */
export function formatDate(value: string, format: string, { today = new Date(), months = "en", fullYear = false }: DateOptions = {}): string {
  if (!format.match(DATE_TOKENS)) throw new InputError(`The date format “${format}” has none of DD, MM, MMM, YY, YYYY, hh, mm and ss.`);
  const end = fullYear ? 8 : 6;
  const date = fullYear ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : isoDate(value.slice(0, 6), today);
  const [yyyy, mm, dd] = date.split("-") as [string, string, string];
  const parts: Record<string, string> = {
    YYYY: yyyy, YY: yyyy.slice(2), MMM: MONTH_NAMES[months][Number(mm) - 1] ?? mm, MM: mm, DD: dd,
    hh: value.slice(end, end + 2), mm: value.slice(end + 2, end + 4), ss: value.slice(end + 4, end + 6),
  };
  let out = "";
  let from = 0;
  for (const match of format.matchAll(DATE_TOKENS)) {
    const part = parts[match[0]]!;
    if (part.length === 2 || !TIME_TOKENS.test(match[0])) out += format.slice(from, match.index) + part;
    from = match.index + match[0].length;
  }
  return out + format.slice(from);
}
