import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localeFor, setLocale, t, tm } from "../src/i18n.ts";
import es from "../src/locales/es.json";
import esMessages from "../src/locales/es.messages.json";
import ptBR from "../src/locales/pt-BR.json";
import ptBRMessages from "../src/locales/pt-BR.messages.json";
import { coreTexts, dynamicCalls, pageTexts } from "./texts.ts";

// The interface's languages (ADR 0003, the owner's request of 31 October 2026): every text of the page and every message
// of the core and of the GS1 Barcode Syntax Engine in Brazilian Portuguese and Spanish, with the same placeholders.

const engine = JSON.parse(readFileSync(new URL("./engine-messages.json", import.meta.url), "utf8")) as {
  messages: Record<string, string>;
  linters: Record<string, string>;
};
const engineTexts = [...Object.values(engine.messages), ...Object.values(engine.linters)];
const CATALOGUES: Record<string, { page: Record<string, string>; messages: Record<string, string> }> = {
  "pt-BR": { page: ptBR, messages: ptBRMessages },
  es: { page: es, messages: esMessages },
};
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/** What is wrong with a catalogue against the texts it must hold. */
export function catalogueProblems(catalogue: Record<string, string>, required: readonly string[], known: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  for (const text of required) {
    const translation = catalogue[text];
    if (translation === undefined) problems.push(`missing: ${text}`);
    else if (!translation.trim()) problems.push(`empty: ${text}`);
    else if (placeholders(translation).join() !== placeholders(text).join()) problems.push(`placeholders differ: ${text}`);
  }
  for (const key of Object.keys(catalogue)) if (!known.has(key)) problems.push(`not used: ${key}`);
  return problems;
}

describe("the catalogues", async () => {
  const page = (await pageTexts()).map((p) => p.text);
  const core = coreTexts().map((c) => c.text);
  const messages = [...new Set([...core, ...engineTexts])];

  for (const [tag, catalogue] of Object.entries(CATALOGUES)) {
    it(`${tag}: every text of the page, with the same placeholders, and nothing else`, () => {
      expect(catalogueProblems(catalogue.page, page, new Set(page))).toEqual([]);
    });
    it(`${tag}: every message of the core and of the Syntax Engine, with the same placeholders, and nothing else`, () => {
      expect(catalogueProblems(catalogue.messages, messages, new Set(messages))).toEqual([]);
    });
  }

  it("finds the texts: the page's own, the core's messages and the engine's", () => {
    expect(page).toContain("What does the code identify?");
    expect(page).toContain("Retail point of sale (table 1)"); // texts.ts
    expect(core).toContain("The check digit does not match: it should be {expected}.");
    expect(core).toContain("Is it scanned at a general retail point of sale?");
    expect(engineTexts).toContain("AI ({p1}): {p2}");
  });

  it("a missing, empty or unknown entry and different placeholders are caught", () => {
    expect(catalogueProblems({ "{n} rows": "{m} linhas", Stale: "Velho", Empty: " " }, ["{n} rows", "Empty", "Missing"], new Set(["{n} rows", "Empty", "Missing"])))
      .toEqual(["placeholders differ: {n} rows", "empty: Empty", "missing: Missing", "not used: Stale"]);
  });

  it("t() never takes a text built at run time, which no catalogue can hold", () => {
    expect(dynamicCalls()).toEqual([]);
  });
});

describe("translating", () => {
  it("chooses the browser's language among English, Brazilian Portuguese and Spanish", () => {
    expect(localeFor(["pt-PT", "en"])).toBe("pt-BR");
    expect(localeFor(["es-MX"])).toBe("es");
    expect(localeFor(["fr-FR", "en-GB"])).toBe("en");
    expect(localeFor(["de"])).toBe("en");
  });

  it("fills placeholders, and translates a core or engine message by its template, the linter's text inside too", () => {
    setLocale("pt-BR", false);
    expect(t("Fill in")).toBe(ptBR["Fill in"]);
    expect(t("{n} rows ready", { n: 3 })).toBe(ptBR["{n} rows ready"]!.replace("{n}", "3"));
    expect(tm("The check digit does not match: it should be 6.")).toBe(
      ptBRMessages["The check digit does not match: it should be {expected}."]!.replace("{expected}", "6"),
    );
    expect(tm("AI (17): The date contains an illegal day of the month.")).toBe(
      `AI (17): ${ptBRMessages["The date contains an illegal day of the month."]}`,
    );
    expect(tm("A message the catalogue does not have")).toBe("A message the catalogue does not have");
    // A hint of parts, each translated; a short template of the page never matches a message
    expect(tm("up to 20 characters")).toBe(ptBRMessages["up to {n} characters"]!.replace("{n}", "20"));
    expect(tm("6 digits · date YYMMDD")).toBe(`${ptBRMessages["{n} digits"]!.replace("{n}", "6")} · ${ptBRMessages["date YYMMDD"]}`);
    // Two values of one name told apart
    expect(tm("The label (40.0 × 30.0 mm at 100 %) is larger than the sheet's labels (38.1 × 21.2 mm); it is never scaled. Choose a smaller size or a larger sheet."))
      .toContain("(38.1 × 21.2 mm)");
    setLocale("es", false);
    expect(t("Fill in")).toBe(es["Fill in"]);
    setLocale("en", false);
    expect(t("Fill in")).toBe("Fill in");
    expect(tm("The check digit does not match: it should be 6.")).toBe("The check digit does not match: it should be 6.");
  });
});
