// gs1ls --lang (backlog 5.1 d, ADR 0009 decision 5): what the command line says about the data in the page's languages,
// from the page's own catalogues (apps/web/src/locales) and the core's translator, so that a finding, a refusal or an
// EPC's reason reads as it does on the page; the command line's own labels from locales.json. The help, the usage errors
// and the files made stay in English, as the page's files do.

import { LOCALE_TAGS, localeFor, translator, type Locale, type Translator } from "@gs1-label-studio/core";
import de from "../../../apps/web/src/locales/de.json";
import deMessages from "../../../apps/web/src/locales/de.messages.json";
import es from "../../../apps/web/src/locales/es.json";
import esMessages from "../../../apps/web/src/locales/es.messages.json";
import fr from "../../../apps/web/src/locales/fr.json";
import frMessages from "../../../apps/web/src/locales/fr.messages.json";
import it from "../../../apps/web/src/locales/it.json";
import itMessages from "../../../apps/web/src/locales/it.messages.json";
import ptBR from "../../../apps/web/src/locales/pt-BR.json";
import ptBRMessages from "../../../apps/web/src/locales/pt-BR.messages.json";
import own from "./locales.json";

const CATALOGUES: Record<Exclude<Locale, "en">, { page: Record<string, string>; messages: Record<string, string> }> = {
  "pt-BR": { page: ptBR, messages: ptBRMessages },
  es: { page: es, messages: esMessages },
  fr: { page: fr, messages: frMessages },
  de: { page: de, messages: deMessages },
  it: { page: it, messages: itMessages },
};

/** The command line's own labels, by language. */
export const OWN: Record<Exclude<Locale, "en">, Record<string, string>> = own;

export const ENGLISH = translator("en");

/** The translator of a language tag as --lang or Accept-Language gives it (pt-BR, pt, es-MX…); English when none. */
export function language(tags: string | readonly string[] | undefined): Translator {
  const list = typeof tags === "string" ? tags.split(",") : tags ?? [];
  const locale = localeFor(list);
  if (locale === "en") return ENGLISH;
  const { page, messages } = CATALOGUES[locale];
  return translator(locale, { ...page, ...OWN[locale] }, messages);
}

/** The tags --lang takes. */
export const LANGUAGES = LOCALE_TAGS;
