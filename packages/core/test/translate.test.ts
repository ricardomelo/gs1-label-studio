import { describe, expect, it } from "vitest";
import { fillText, localeFor, translator } from "../src/index.ts";

// The translator the page and gs1ls share (backlog 5.1 d moved it from the page into the core): exact texts, the
// messages' templates with the most fixed text first and their values translated in turn, hints part by part.

describe("translator", () => {
  const messages = {
    "AI ({p1}): {p2}": "IA ({p1}): {p2}",
    "AI ({p1}) value is too short": "Valor da IA ({p1}) curto demais",
    "AI ({p1}): the value is too long: {p2}": "IA ({p1}): o valor é longo demais: {p2}",
    "The numeric check digit is incorrect.": "Dígito verificador incorreto.",
    "{symbology} {text}": "nunca",
    "6 digits": "6 dígitos",
    "date YYMMDD": "data AAMMDD",
  };
  const pt = translator("pt-BR", { "How to fix:": "Como corrigir:", "{n} rows": "{n} linhas" }, messages);

  it("looks the page's texts up exactly and fills their placeholders", () => {
    expect(pt.t("How to fix:")).toBe("Como corrigir:");
    expect(pt.t("{n} rows", { n: 3 })).toBe("3 linhas");
    expect(pt.t("Not in the catalogue {x}", { x: 1 })).toBe("Not in the catalogue 1");
  });

  it("translates a message through the template with the most fixed text, its values in turn", () => {
    expect(pt.tm("AI (01) value is too short")).toBe("Valor da IA (01) curto demais");
    // both "AI ({p1}): {p2}" and the longer template match: the longer, with more of its own text, wins
    expect(pt.tm("AI (10): the value is too long: 21")).toBe("IA (10): o valor é longo demais: 21");
    expect(pt.tm("AI (01): The numeric check digit is incorrect.")).toBe("IA (01): Dígito verificador incorreto.");
    // a template without two letters of its own would match anything: never used
    expect(pt.tm("QR Code something")).toBe("QR Code something");
    expect(pt.tm("6 digits · date YYMMDD")).toBe("6 dígitos · data AAMMDD");
  });

  it("leaves English as it is", () => {
    const en = translator("en", {}, messages);
    expect(en.tm("AI (01): The numeric check digit is incorrect.")).toBe("AI (01): The numeric check digit is incorrect.");
    expect(en.t("{n} rows", { n: 2 })).toBe("2 rows");
    expect(fillText("{a} and {b}", { a: 1 })).toBe("1 and {b}");
  });

  it("picks ours among a browser's languages or an Accept-Language header", () => {
    expect(localeFor(["pt-PT"])).toBe("pt-BR");
    expect(localeFor(["nl", "es-MX"])).toBe("es");
    expect(localeFor("fr-CH, fr;q=0.9, en;q=0.8".split(","))).toBe("fr");
    expect(localeFor(["de;q=0.7"])).toBe("de");
    expect(localeFor(["*"])).toBe("en");
  });
});
