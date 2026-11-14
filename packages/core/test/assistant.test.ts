import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
  ASSISTANT_QUESTIONS,
  assistantOutcome,
  assistantQuestion,
  assistantSteps,
  encode,
  guidance,
  identify,
  nextAssistantStep,
  rasterize,
  readNeed,
  syntaxEngine,
  walk,
  websiteStem,
  type AssistantAnswers,
  type SymbologyId,
  type SyntaxEngine,
} from "../src/index.ts";

// The assistant for first-time users (backlog 6.10, ADR 0006): its screens, what its answers set up — step 2's
// decision tree reaching the table and the symbol it recommends, each symbol read back by ZXing — and a need written in
// one's own words read by keywords.

let engine: SyntaxEngine;
beforeAll(async () => {
  engine = await syntaxEngine();
  const require = createRequire(import.meta.url);
  const wasmBinary = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")).buffer as ArrayBuffer;
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
});

async function readBack(symbology: SymbologyId, data: string) {
  const bitmap = rasterize(encode(symbology, data), { dotsPerModule: 4, quietZone: 10 });
  const rgba = new Uint8ClampedArray(bitmap.width * bitmap.height * 4);
  bitmap.dark.forEach((dark, index) => {
    rgba.fill(dark ? 0 : 255, index * 4, index * 4 + 3);
    rgba[index * 4 + 3] = 255;
  });
  const image = { data: rgba, width: bitmap.width, height: bitmap.height, colorSpace: "srgb" } as ImageData;
  const [result] = await readBarcodes(image, { formats: [], textMode: "HRI", tryHarder: true });
  return `${result?.symbologyIdentifier} ${result?.text}`;
}

/** What a symbol carries of the identification, and what a reader returns for it. */
function carried(symbol: SymbologyId, input: { elementString: string; digitalLinkUri: string; elements: { ai: string; value: string }[] }) {
  const key = input.elements[0]!;
  switch (symbol) {
    case "ean13": return { data: key.value.slice(1), read: `]E0 ${key.value.slice(1)}` };
    case "itf14": return { data: key.value, read: `]I1 ${key.value}` };
    case "dl-qrcode": return { data: input.digitalLinkUri, read: `]Q1 ${input.digitalLinkUri}` };
    case "gs1-datamatrix": return { data: input.elementString, read: `]d2 ${input.elementString}` };
    case "gs1-128": return { data: input.elementString, read: `]C1 ${input.elementString}` };
    case "databar-expanded": return { data: input.elementString, read: `]e0 ${input.elementString}` };
    default: throw new Error(`not in these scenarios: ${symbol}`);
  }
}

// Each scenario: the answers, the screens asked, step 2's table, the symbols drawn (the choice, else the table's
// recommendation) and the rules' sections that must be said.
const SCENARIOS: [name: string, answers: AssistantAnswers, steps: string, table: number, symbols: SymbologyId[], sections: string[]][] = [
  ["a product sold in shops, nothing else", { scenario: "product", sold: "shops", data: [], web: "no", print: "artwork" },
    "scenario sold data web print", 1, ["ean13"], ["1.2.3, 1.5", "6.3.3.1, 6.3.3.3", "5.12.3.1"]],
  ["a product with a QR code to the brand's website (the owner's example)", { scenario: "product", sold: "shops", data: [], web: "own", domain: "minhamarca.com.br", print: "artwork" },
    "scenario sold data web print", 1, ["ean13", "dl-qrcode"], ["4.15.1", "6.3.3.1"]],
  ["a product for a marketplace with a lot and an expiry date", { scenario: "product", sold: "online", data: ["10", "17"], web: "no", print: "label-printer" },
    "scenario sold data web print", 1, ["ean13", "dl-qrcode"], ["4.15.1", "6.3.3.1"]],
  ["a medicine for a pharmacy", { scenario: "healthcare", care: "pharmacy", data: ["10", "17", "21"], print: "label-printer" },
    "scenario care data print", 10, ["gs1-datamatrix"], ["1.2.3, 1.5"]],
  ["a medical device for hospitals (UDI)", { scenario: "healthcare", care: "hospital", data: ["10", "17", "11"], print: "sheets" },
    "scenario care data print", 6, ["gs1-datamatrix"], ["1.2.3, 1.5"]],
  ["a shipping case, its GTIN alone", { scenario: "case", caseTill: "no", data: [], print: "artwork" },
    "scenario case-till data print", 2, ["itf14"], ["6.7.1, 6.7.1.2"]],
  ["a shipping case with a lot", { scenario: "case", caseTill: "no", data: ["10"], print: "label-printer" },
    "scenario case-till data print", 2, ["gs1-128"], ["6.7.1, 6.7.1.2"]],
  ["a case sold at a till, which is a product", { scenario: "case", caseTill: "yes", sold: "both", data: [], web: "gs1", print: "artwork" },
    "scenario case-till sold data web print", 1, ["ean13", "dl-qrcode"], ["4.15.1"]],
  ["a pallet", { scenario: "pallet", print: "label-printer" }, "scenario print", 5, ["gs1-128"], ["6.6", "6.7.1.1", "1.3.5"]],
  ["an asset on a label", { scenario: "other", other: "8004", dpm: "no", print: "label-printer" }, "scenario other-key dpm print", 9, ["gs1-128"], []],
  ["an asset marked directly, close up", { scenario: "other", other: "8004", dpm: "yes", far: "no", print: "artwork" }, "scenario other-key dpm far print", 7, ["gs1-datamatrix"], []],
  ["a returnable container", { scenario: "other", other: "8003", dpm: "no", print: "label-printer" }, "scenario other-key dpm print", 9, ["gs1-128"], []],
  ["a location", { scenario: "other", other: "414", dpm: "no", print: "sheets" }, "scenario other-key dpm print", 9, ["gs1-128"], []],
  ["a document", { scenario: "other", other: "253", dpm: "no", print: "sheets" }, "scenario other-key dpm print", 9, ["gs1-128"], []],
  ["a service relationship", { scenario: "other", other: "8018", print: "sheets" }, "scenario other-key print", 11, ["databar-expanded"], []],
];

describe("the assistant's scenarios", () => {
  it.each(SCENARIOS)("%s: its screens, step 2's table and symbol, read back by ZXing", async (_, answers, steps, table, symbols, sections) => {
    expect(assistantSteps(answers).join(" ")).toBe(steps);
    expect(nextAssistantStep(answers)).toBeUndefined();
    const outcome = assistantOutcome(answers)!;
    const id = outcome.identification;
    const input = identify(engine, id, outcome.stem ?? null);
    const leaf = walk(id.key, outcome.answers).leaf!;
    expect(leaf.table).toBe(table);
    const guide = guidance(leaf, input);
    const drawn = outcome.choice ?? guide.recommended!;
    expect([drawn.symbol, ...(drawn.with ? [drawn.with] : [])]).toEqual(symbols);
    if (outcome.choice) {
      // A pair the table allows: the EAN-13 a carrier, the QR code in addition — never a symbol of the assistant's own
      expect(leaf.carriers).toContain(outcome.choice.symbol);
      expect(leaf.inAddition).toContain(outcome.choice.with);
    }
    for (const symbol of symbols) {
      const { data, read } = carried(symbol, input);
      expect(await readBack(symbol, data)).toBe(read);
    }
    const said = outcome.rules.map((rule) => rule.section);
    for (const section of sections) expect(said).toContain(section);
    expect(outcome.rules.at(-1)!.text).toMatch(/Scan test/);
    expect(outcome.examples[0]).toBe(id.key);
  });

  it("the brand's own website is the GS1 Digital Link URI's domain; GS1's leaves id.gs1.org", () => {
    const own = assistantOutcome({ scenario: "product", sold: "shops", data: ["10"], web: "own", domain: "www.minhamarca.com.br/", print: "artwork" })!;
    expect(own.stem).toBe("https://www.minhamarca.com.br");
    expect(identify(engine, own.identification, own.stem).digitalLinkUri).toBe("https://www.minhamarca.com.br/01/09506000134352/10/ABC123");
    expect(own.rules.map((r) => r.text).join(" ")).toMatch(/must answer the address/);
    const gs1 = assistantOutcome({ scenario: "product", sold: "shops", data: [], web: "gs1", print: "artwork" })!;
    expect(gs1.stem).toBeUndefined();
    expect(gs1.rules.map((r) => r.text).join(" ")).toMatch(/id\.gs1\.org/);
    expect(websiteStem("https://loja.example/")).toBe("https://loja.example");
  });

  it("the rules for two barcodes are said only when there are two", () => {
    const alone = assistantOutcome({ scenario: "product", sold: "shops", data: [], web: "no", print: "artwork" })!;
    expect(alone.rules.map((r) => r.section)).not.toContain("4.15.1");
    const marketplace = (sold: "shops" | "online") =>
      assistantOutcome({ scenario: "product", sold, data: [], web: "no", print: "artwork" })!.rules.some((r) => /Marketplaces/.test(r.text));
    expect(marketplace("online")).toBe(true);
    expect(marketplace("shops")).toBe(false);
  });

  it("a pallet gets a GS1 Logistic Label, 4 × 6 in on a label printer and A6 otherwise", () => {
    expect(assistantOutcome({ scenario: "pallet", print: "label-printer" })!.logistic).toBe("4x6");
    expect(assistantOutcome({ scenario: "pallet", print: "sheets" })!.logistic).toBe("a6");
    expect(assistantOutcome({ scenario: "product", sold: "shops", data: [], web: "no", print: "sheets" })!.logistic).toBeUndefined();
  });

  it("asks screen by screen, and sets nothing up until every one is answered", () => {
    expect(nextAssistantStep({})).toBe("scenario");
    expect(nextAssistantStep({ scenario: "product" })).toBe("sold");
    expect(nextAssistantStep({ scenario: "product", sold: "online" })).toBe("data");
    expect(nextAssistantStep({ scenario: "product", sold: "online", data: [] })).toBe("web");
    expect(assistantOutcome({ scenario: "product", sold: "online", data: [] })).toBeNull();
    expect(assistantSteps({ scenario: "other", other: "8004", dpm: "no" }).join(" ")).toBe("scenario other-key dpm print");
  });

  it("the data offered depends on the scenario; every question has options", () => {
    const data = (scenario: AssistantAnswers["scenario"]) => assistantQuestion("data", { scenario }).options.map((o) => o.value).join(" ");
    expect(data("product")).toBe("10 17 15 21");
    expect(data("healthcare")).toBe("10 17 21 11");
    expect(data("case")).toBe("10 17 15");
    for (const [step, question] of Object.entries(ASSISTANT_QUESTIONS)) if (step !== "data") expect(question.options.length).toBeGreaterThan(1);
  });
});

describe("a need written in one's own words", () => {
  it.each<[string, AssistantAnswers]>([
    // The owner's three examples (13 November 2026)
    ["Preciso adicionar um QR Code com o site da minha marca no produto que vou vender no varejo", { scenario: "product", sold: "shops", web: "own" }],
    ["um produto para vender no marketplace", { scenario: "product", sold: "online" }],
    ["preciso montar uma etiqueta de UDI", { scenario: "healthcare" }],
    // Other languages, and answers that the words give
    ["I sell a product in shops and on Amazon, with a lot and an expiry date", { scenario: "product", sold: "both", data: ["10", "17"] }],
    ["Medicamento para farmácia com lote, validade e número de série", { scenario: "healthcare", care: "pharmacy", data: ["10", "17", "21"] }],
    ["dispositivo médico para hospitais, impressora de etiquetas Zebra", { scenario: "healthcare", care: "hospital", print: "label-printer" }],
    ["Etiqueta para palete enviado ao centro de distribuição", { scenario: "pallet" }],
    ["caixa de embarque com 12 unidades", { scenario: "case" }],
    ["Patrimônio da empresa", { scenario: "other", other: "8004" }],
    ["barril retornável", { scenario: "other", other: "8003" }],
    ["Un producto para vender en una tienda, con un código QR que abra mi sitio web", { scenario: "product", sold: "shops", web: "own" }],
    ["Un produit vendu en magasin, imprimé chez l'imprimerie", { scenario: "product", sold: "shops", print: "artwork" }],
    ["Ein Produkt für den Einzelhandel mit Charge und Verfallsdatum", { scenario: "product", sold: "shops", data: ["10", "17"] }],
    ["Un prodotto da vendere in negozio con lotto", { scenario: "product", sold: "shops", data: ["10"] }],
    ["QR code com o meu site", { scenario: "product", web: "own" }],
  ])("%s", (text, answers) => {
    expect(readNeed(text)).toEqual(answers);
  });

  it("finds nothing in a sentence with no known word, or an empty one", () => {
    expect(readNeed("bom dia")).toEqual({});
    expect(readNeed("   ")).toEqual({});
  });

  it("does not take a word for another that it only starts like", () => {
    expect(readNeed("produto artesanal").print).toBeUndefined(); // arte= is a word of its own
    expect(readNeed("produto para arte da embalagem").print).toBe("artwork");
    expect(readNeed("vender no caixa do supermercado").scenario).toBe("product"); // a till, not a case
    expect(readNeed("vou vender um medicamento na farmácia").scenario).toBe("healthcare"); // healthcare's words weigh more
  });
});
