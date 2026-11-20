// Texts in another language from the page's catalogues (ADR 0003; moved from the page for gs1ls --lang, backlog 5.1 d):
// the English text is the key. The page's own texts are looked up exactly; a message the core or the GS1 Barcode Syntax
// Engine wrote in English is an exact entry first, then the first of its catalogue's templates that matches, whose
// {placeholders} match any text and are translated in turn; a hint made of parts joined by " · " or " + " part by part.
// What a catalogue lacks stays in English. The page and gs1ls share it, so that a message reads the same in both.

export type Locale = "en" | "pt-BR" | "es" | "fr" | "de" | "it";

export const LOCALE_TAGS: readonly Locale[] = ["en", "pt-BR", "es", "fr", "de", "it"];

/**
 * The language asked for, among ours: pt-* → pt-BR, es-* → es, fr-* → fr, de-* → de, it-* → it, en-* → en, the first of
 * the tags we have (a browser's languages, an Accept-Language header's, without their weights); none → English.
 */
export function localeFor(tags: readonly string[]): Locale {
  for (const tag of tags) {
    const language = tag.trim().toLowerCase().split(/[-_;]/)[0];
    if (language === "pt") return "pt-BR";
    if (language === "es" || language === "fr" || language === "de" || language === "it" || language === "en") return language;
  }
  return "en";
}

export interface Translator {
  locale: Locale;
  /** A text of the page in this language, its {placeholders} filled from `params`. */
  t(english: string, params?: Record<string, string | number>): string;
  /** A message the core or the Syntax Engine wrote in English, in this language. */
  tm(message: string): string;
}

const PLACEHOLDER = /\{(\w+)\}/g;
const HAS_PLACEHOLDER = /\{\w+\}/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A text's {placeholders} filled from `params`; those it lacks are left as they are. */
export const fillText = (text: string, params?: Record<string, string | number>) =>
  params ? text.replace(PLACEHOLDER, (whole, name: string) => (name in params ? String(params[name]) : whole)) : text;

/** The translator of a language's two catalogues: the page's texts and the messages'; none for English. */
export function translator(locale: Locale, page: Record<string, string> = {}, messages: Record<string, string> = {}): Translator {
  // Templates with the most fixed text first, so that "AI ({p1}) value is too short" wins over "AI ({p1}): {p2}"; one
  // without two letters of its own ("{symbology} {text}") would match anything.
  const templates = Object.entries(messages)
    .filter(([key]) => HAS_PLACEHOLDER.test(key) && /[A-Za-z].*[A-Za-z]/.test(key.replace(PLACEHOLDER, "")))
    .map(([key, text]) => {
      const names: string[] = [];
      const source = key.split(PLACEHOLDER).map((part, i) => (i % 2 ? (names.push(part), "([\\s\\S]*?)") : escape(part))).join("");
      return { pattern: new RegExp(`^${source}$`), names, text, fixed: key.replace(PLACEHOLDER, "").length };
    })
    .sort((a, b) => b.fixed - a.fixed);
  const tm = (message: string): string => {
    if (locale === "en" || !message) return message;
    const exact = messages[message] ?? page[message];
    if (exact !== undefined) return exact;
    for (const { pattern, names, text } of templates) {
      const match = pattern.exec(message);
      if (!match) continue;
      const params: Record<string, string> = {};
      names.forEach((name, i) => (params[name] = tm(match[i + 1] ?? "")));
      return fillText(text, params);
    }
    // A hint of parts, "6 digits · date YYMMDD" or "… + optional: …": each part on its own
    for (const joint of [" + ", " · "]) {
      if (message.includes(joint)) return message.split(joint).map(tm).join(joint);
    }
    return message;
  };
  return { locale, t: (english, params) => fillText(page[english] ?? messages[english] ?? english, params), tm };
}
