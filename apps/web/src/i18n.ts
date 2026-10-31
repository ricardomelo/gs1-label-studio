import es from "./locales/es.json";
import esMessages from "./locales/es.messages.json";
import ptBR from "./locales/pt-BR.json";
import ptBRMessages from "./locales/pt-BR.messages.json";

// The interface's languages (the owner, 31 October 2026; ADR 0003): English, Brazilian Portuguese and Spanish. The
// English text is the key: `t("Fill in")` reads as English in the code, and each other language is a catalogue
// (`locales/<tag>.json`) from the English text to its own, with the same {placeholders}. Messages the core and the
// GS1 Barcode Syntax Engine write in English are translated where they are shown (`tm()`), from a catalogue of their
// own (`locales/<tag>.messages.json`): an exact entry first, then its templates, whose {placeholders} match any text
// (the page's short templates, such as "{first} to {last}", would match far too much); a hint made of parts joined by
// " · " or " + " part by part. What a catalogue lacks is shown in English.
// `apps/web/test/i18n.test.ts` checks that every text of the page and every message of the core has its translation.

export type Locale = "en" | "pt-BR" | "es";

/** Each language named in itself, as the menu shows it. */
export const LOCALES: readonly { tag: Locale; name: string }[] = [
  { tag: "en", name: "English" },
  { tag: "pt-BR", name: "Português (Brasil)" },
  { tag: "es", name: "Español" },
];

const CATALOGUES: Record<Exclude<Locale, "en">, { page: Record<string, string>; messages: Record<string, string> }> = {
  "pt-BR": { page: ptBR, messages: ptBRMessages },
  es: { page: es, messages: esMessages },
};
const STORAGE = "gs1-label-studio.locale";

/** The language a browser asks for, among ours: pt-* → pt-BR, es-* → es, anything else → English. */
export function localeFor(tags: readonly string[]): Locale {
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (lower.startsWith("pt")) return "pt-BR";
    if (lower.startsWith("es")) return "es";
    if (lower.startsWith("en")) return "en";
  }
  return "en";
}

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
let catalogue: Record<string, string> = {};
let messages: Record<string, string> = {};
let templates: { pattern: RegExp; names: string[]; text: string; fixed: number }[] = [];

const PLACEHOLDER = /\{(\w+)\}/g;
const HAS_PLACEHOLDER = /\{\w+\}/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Uses `locale` from now on, keeping it for the next visit; sets the page's `lang`. */
export function setLocale(locale: Locale, keep = true): void {
  current = locale;
  catalogue = locale === "en" ? {} : CATALOGUES[locale].page;
  messages = locale === "en" ? {} : CATALOGUES[locale].messages;
  // Templates with the most fixed text first, so that "AI ({p1}) value is too short" wins over "AI ({p1}): {p2}"; one
  // without two letters of its own ("{symbology} {text}") would match anything.
  templates = Object.entries(messages)
    .filter(([key]) => HAS_PLACEHOLDER.test(key) && /[A-Za-z].*[A-Za-z]/.test(key.replace(PLACEHOLDER, "")))
    .map(([key, text]) => {
      const names: string[] = [];
      const source = key.split(PLACEHOLDER).map((part, i) => (i % 2 ? (names.push(part), "([\\s\\S]*?)") : escape(part))).join("");
      return { pattern: new RegExp(`^${source}$`), names, text, fixed: key.replace(PLACEHOLDER, "").length };
    })
    .sort((a, b) => b.fixed - a.fixed);
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

const fill = (text: string, params?: Record<string, string | number>) =>
  params ? text.replace(PLACEHOLDER, (whole, name: string) => (name in params ? String(params[name]) : whole)) : text;

/** Marks a text kept in a constant, to be shown later through t(): what the catalogue check reads (gettext's N_). */
export const en = <T extends string>(english: T): T => english;

/** The page's text `english` in the current language, its {placeholders} filled from `params`. */
export function t(english: string, params?: Record<string, string | number>): string {
  return fill(catalogue[english] ?? messages[english] ?? english, params);
}

/**
 * A message the core or the Syntax Engine wrote in English, in the current language: an exact entry, else the first
 * template that matches, its placeholders' values translated in turn (an engine message quoting a linter's).
 */
export function tm(message: string): string {
  if (current === "en" || !message) return message;
  const exact = messages[message] ?? catalogue[message];
  if (exact !== undefined) return exact;
  for (const { pattern, names, text } of templates) {
    const match = pattern.exec(message);
    if (!match) continue;
    const params: Record<string, string> = {};
    names.forEach((name, i) => (params[name] = tm(match[i + 1] ?? "")));
    return fill(text, params);
  }
  // A hint of parts, "6 digits · date YYMMDD" or "… + optional: …": each part on its own
  for (const joint of [" + ", " · "]) {
    if (message.includes(joint)) return message.split(joint).map(tm).join(joint);
  }
  return message;
}

/** Numbers as the language writes them: 1,089 in English, 1.089 in Portuguese and Spanish. */
export const formatNumber = (n: number, digits?: number) =>
  n.toLocaleString(current, digits === undefined ? undefined : { minimumFractionDigits: digits, maximumFractionDigits: digits });
