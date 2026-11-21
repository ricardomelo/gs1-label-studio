import { fillText, localeFor, translator, type Locale, type Translator } from "@gs1-label-studio/core";
import de from "./locales/de.json";
import deMessages from "./locales/de.messages.json";
import es from "./locales/es.json";
import esMessages from "./locales/es.messages.json";
import fr from "./locales/fr.json";
import frMessages from "./locales/fr.messages.json";
import it from "./locales/it.json";
import itMessages from "./locales/it.messages.json";
import ptBR from "./locales/pt-BR.json";
import ptBRMessages from "./locales/pt-BR.messages.json";
import { stored } from "./channel.ts";

// The interface's languages (ADR 0003): English, Brazilian Portuguese and Spanish (the owner, 31 October 2026), French,
// German and Italian (the owner, 8 November 2026). The
// English text is the key: `t("Fill in")` reads as English in the code, and each other language is a catalogue
// (`locales/<tag>.json`) from the English text to its own, with the same {placeholders}. Messages the core and the
// GS1 Barcode Syntax Engine write in English are translated where they are shown (`tm()`), from a catalogue of their
// own (`locales/<tag>.messages.json`), with the core's `translator`, which gs1ls --lang shares: an exact entry first,
// then its templates, whose {placeholders} match any text (the page's short templates, such as "{first} to {last}",
// would match far too much); a hint made of parts joined by " · " or " + " part by part. What a catalogue lacks is
// shown in English.
// `apps/web/test/i18n.test.ts` checks that every text of the page and every message of the core has its translation.

/** Each language named in itself, as the menu shows it. */
export const LOCALES: readonly { tag: Locale; name: string }[] = [
  { tag: "en", name: "English" },
  { tag: "pt-BR", name: "Português (Brasil)" },
  { tag: "es", name: "Español" },
  { tag: "fr", name: "Français" },
  { tag: "de", name: "Deutsch" },
  { tag: "it", name: "Italiano" },
];

const CATALOGUES: Record<Exclude<Locale, "en">, { page: Record<string, string>; messages: Record<string, string> }> = {
  "pt-BR": { page: ptBR, messages: ptBRMessages },
  es: { page: es, messages: esMessages },
  fr: { page: fr, messages: frMessages },
  de: { page: de, messages: deMessages },
  it: { page: it, messages: itMessages },
};
const STORAGE = stored("gs1-label-studio.locale");

export { localeFor, type Locale };

/** The language chosen in this browser before, or the browser's own. */
export function initialLocale(): Locale {
  try {
    const kept = localStorage.getItem(STORAGE);
    if (kept && LOCALES.some((l) => l.tag === kept)) return kept as Locale;
  } catch {
    // Storage blocked: the browser's language.
  }
  return localeFor(typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language]);
}

let current: Locale = "en";
let active: Translator = translator("en");

/** Uses `locale` from now on, keeping it for the next visit; sets the page's `lang`. */
export function setLocale(locale: Locale, keep = true): void {
  current = locale;
  active = locale === "en" ? translator("en") : translator(locale, CATALOGUES[locale].page, CATALOGUES[locale].messages);
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  if (keep) {
    try {
      localStorage.setItem(STORAGE, locale);
    } catch {
      // Not kept: the browser's language next time.
    }
  }
}

export const locale = (): Locale => current;

const fill = fillText;

/** Marks a text kept in a constant, to be shown later through t(): what the catalogue check reads (gettext's N_). */
export const en = <T extends string>(english: T): T => english;

/** The page's text `english` in the current language, its {placeholders} filled from `params`. */
export function t(english: string, params?: Record<string, string | number>): string {
  return active.t(english, params);
}

/** The text in English whatever the page's language, its {placeholders} filled: for the files made, which stay English. */
export function inEnglish(english: string, params?: Record<string, string | number>): string {
  return fill(english, params);
}

/**
 * A message the core or the Syntax Engine wrote in English, in the current language (the core's `translator`): an exact
 * entry, else the first template that matches, its placeholders' values translated in turn.
 */
export function tm(message: string): string {
  return active.tm(message);
}

/** Numbers as the language writes them: 1,089 in English, 1.089 in Portuguese, Spanish, German and Italian, 1 089 in French. */
export const formatNumber = (n: number, digits?: number) =>
  n.toLocaleString(current, digits === undefined ? undefined : { minimumFractionDigits: digits, maximumFractionDigits: digits });
