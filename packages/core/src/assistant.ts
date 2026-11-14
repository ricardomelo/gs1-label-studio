import { checkDigit } from "./checkDigit.ts";
import type { Answers } from "./guide.ts";
import type { Identification } from "./identify.ts";
import type { LogisticSize } from "./logistic.ts";
import type { SymbologyId } from "./symbologies.ts";

/**
 * The assistant for first-time users (backlog 6.10, ADR 0006): a few questions in a seller's words — what is identified
 * and what for, where it is sold, what goes on each unit, whether a QR code opens the brand's website, how it will be
 * printed — that set up the editor's three steps and say which rules of the General Specifications apply.
 *
 * The assistant never chooses a symbol of its own: it answers step 2's decision tree (figure 5-68), whose table still
 * recommends the symbol. Only where the person asks for a QR code that the table allows *in addition* (a GTIN alone at a
 * retail point of sale, which an EAN-13 carries) does it pick the pair the step already offers. A need written in one's
 * own words is read by keywords in the six languages of the page (`readNeed`): offline, nothing leaves the browser.
 */

export type AssistantScenario = "product" | "healthcare" | "case" | "pallet" | "other";
export type AssistantPrint = "artwork" | "label-printer" | "sheets";
export type OtherKey = "8004" | "8003" | "414" | "253" | "8018";

/** The person's answers, as the screens collect them. */
export interface AssistantAnswers {
  scenario?: AssistantScenario;
  /** A product: where it is sold. */
  sold?: "shops" | "online" | "both";
  /** The AIs printed on each unit, among the step's choices; empty: none. */
  data?: string[];
  /** A product: a QR code that a phone's camera opens — the brand's own website, GS1's resolver, or none. */
  web?: "own" | "gs1" | "no";
  /** The brand's website, for `web: "own"`. */
  domain?: string;
  /** A medicine or medical device: for consumers in a pharmacy, or for hospitals and clinics. */
  care?: "pharmacy" | "hospital";
  /** A case of several units: whether the case itself is sold at a till (then it is a product). */
  caseTill?: "yes" | "no";
  /** Something else: its key. */
  other?: OtherKey;
  /** Marked directly on the item, and then read from metres away. */
  dpm?: "yes" | "no";
  far?: "yes" | "no";
  print?: AssistantPrint;
}

export type AssistantStep = "scenario" | "sold" | "data" | "web" | "care" | "case-till" | "other-key" | "dpm" | "far" | "print";

export interface AssistantOption {
  value: string;
  text: string;
  help: string;
}

export interface AssistantQuestion {
  text: string;
  help: string;
  /** Why it is asked: the rule it serves, in a few words. */
  why?: string;
  /** Several options may be chosen (the data on each unit), none included. */
  multiple?: boolean;
  options: AssistantOption[];
}

const PRINT: AssistantOption[] = [
  { value: "artwork", text: "On the packaging's artwork", help: "I send a file to a print shop or a designer (SVG, PDF, EPS)." },
  { value: "label-printer", text: "On labels, with a label printer", help: "Zebra, Argox, Elgin, TSC… (ZPL, PPLA, TSPL…)." },
  { value: "sheets", text: "On label sheets, with an office printer", help: "Laser or inkjet, A4 or Letter sheets." },
];

const DATA_TEXTS: Record<string, AssistantOption> = {
  "10": { value: "10", text: "Batch or lot", help: "The same for a whole production run: AI (10)." },
  "15": { value: "15", text: "Best before date", help: "AI (15)." },
  "17": { value: "17", text: "Expiry date", help: "Use by: AI (17)." },
  "21": { value: "21", text: "Serial number", help: "A different number on each unit: AI (21)." },
  "11": { value: "11", text: "Production date", help: "AI (11)." },
};

/** The data each scenario offers to print on its units. */
export const ASSISTANT_DATA: Record<"product" | "healthcare" | "case", string[]> = {
  product: ["10", "17", "15", "21"],
  healthcare: ["10", "17", "21", "11"],
  case: ["10", "17", "15"],
};

/** Every screen's question and options; `data`'s options depend on the scenario (`assistantQuestion`). */
export const ASSISTANT_QUESTIONS: Record<AssistantStep, AssistantQuestion> = {
  scenario: {
    text: "What do you want to identify?",
    help: "Answer a few simple questions: the studio chooses the barcode and its size and sets up the label for you.",
    options: [
      { value: "product", text: "A product I sell", help: "In shops, supermarkets, on a marketplace or in my online shop." },
      { value: "healthcare", text: "A medicine or a medical device", help: "Traceability and UDI, as health regulators ask." },
      { value: "case", text: "A case of several units", help: "A shipping case or a pack of the same product." },
      { value: "pallet", text: "A pallet or a parcel I ship", help: "To a customer or a distribution centre." },
      { value: "other", text: "Something else", help: "An asset of my company, a returnable container, a location, a document." },
    ],
  },
  sold: {
    text: "Where will it be sold?",
    help: "Where it is scanned decides the barcode and the smallest size of its bars.",
    why: "At a shop's till the scanner needs an EAN-13: the General Specifications ask for it at a retail point of sale. Marketplaces ask for the GTIN too, and it must come from your company's prefix.",
    options: [
      { value: "shops", text: "In shops", help: "It goes through the till of a supermarket, pharmacy or shop." },
      { value: "online", text: "Online only", help: "On a marketplace or in my online shop." },
      { value: "both", text: "Both", help: "In shops and online." },
    ],
  },
  data: {
    text: "Does each unit carry a lot, a date or a serial number?",
    help: "Tick what is printed on each unit. You may tick none.",
    why: "An EAN-13 carries the GTIN alone. A lot or a date goes in a 2D barcode beside it, which carries the GTIN too: both always with the same GTIN.",
    multiple: true,
    options: [],
  },
  web: {
    text: "Should a phone's camera open a web page?",
    help: "One QR code serves the till and the customer: it holds a GS1 Digital Link URI.",
    why: "The QR code goes beside the EAN-13, and the till reads either. It opens the address it holds, so your website must answer it.",
    options: [
      { value: "own", text: "Yes, my website", help: "The QR code opens an address on my own domain." },
      { value: "gs1", text: "Yes, through GS1", help: "id.gs1.org, GS1's resolver, decides where the phone goes." },
      { value: "no", text: "No", help: "The barcode alone." },
    ],
  },
  care: {
    text: "Who receives it?",
    help: "Health regulators ask for the GTIN and, as they require, the lot, the expiry date or a serial number (UDI).",
    options: [
      { value: "pharmacy", text: "Consumers, in a pharmacy", help: "Sold in a retail pharmacy." },
      { value: "hospital", text: "Hospitals and clinics", help: "Used by healthcare providers, not sold at retail." },
    ],
  },
  "case-till": {
    text: "Is the case itself sold at a till?",
    help: "A case sold to consumers as it is (a pack of six, a box of twelve) is a product: it needs an EAN-13.",
    why: "A case only shipped and stored has a GTIN of its own, often starting with an indicator digit from 1 to 8, which an EAN-13 cannot carry.",
    options: [
      { value: "no", text: "No, it is only shipped and stored", help: "Warehouses and distribution centres scan it." },
      { value: "yes", text: "Yes, consumers buy it as it is", help: "It goes through a till." },
    ],
  },
  "other-key": {
    text: "What is it?",
    help: "Each has a GS1 key of its own.",
    options: [
      { value: "8004", text: "An asset of my company", help: "Equipment, furniture, a tool: GIAI." },
      { value: "8003", text: "A returnable container", help: "A crate, a keg, a gas cylinder: GRAI." },
      { value: "414", text: "A location", help: "A shop, a warehouse, a shelf: GLN." },
      { value: "253", text: "A document", help: "A certificate, an invoice, a form: GDTI." },
      { value: "8018", text: "A service relationship", help: "A member, a customer, a patient: GSRN." },
    ],
  },
  dpm: {
    text: "Is the code marked directly on the item?",
    help: "Laser, dot peen, chemical etching or ink jet on the part itself, rather than printed on a label.",
    options: [
      { value: "no", text: "No, on a label", help: "Printed on a label stuck to it." },
      { value: "yes", text: "Yes, directly on the item", help: "Marked on its surface." },
    ],
  },
  far: {
    text: "Must it be scanned from a long distance?",
    help: "Durable marks read from metres away, such as on racks, containers or vehicles.",
    options: [
      { value: "no", text: "No, close up", help: "With a handheld scanner." },
      { value: "yes", text: "Yes, from metres away", help: "On racks, containers or vehicles." },
    ],
  },
  print: {
    text: "How will you print it?",
    help: "The studio prepares the right file for each.",
    options: PRINT,
  },
};

/** A screen's question, `data`'s options being the scenario's. */
export function assistantQuestion(step: AssistantStep, answers: AssistantAnswers): AssistantQuestion {
  const question = ASSISTANT_QUESTIONS[step];
  if (step !== "data") return question;
  const scenario = answers.scenario === "healthcare" || answers.scenario === "case" ? answers.scenario : "product";
  return { ...question, options: ASSISTANT_DATA[scenario].map((ai) => DATA_TEXTS[ai]!) };
}

/** A case sold at a till is a product. */
const isProduct = (a: AssistantAnswers) => a.scenario === "product" || (a.scenario === "case" && a.caseTill === "yes");

/** The screens for the answers given so far, in order: the next one is the first not answered. */
export function assistantSteps(a: AssistantAnswers): AssistantStep[] {
  const steps: AssistantStep[] = ["scenario"];
  switch (a.scenario) {
    case "product":
      steps.push("sold", "data", "web");
      break;
    case "healthcare":
      steps.push("care", "data");
      break;
    case "case":
      steps.push("case-till");
      if (a.caseTill === "yes") steps.push("sold", "data", "web");
      else steps.push("data");
      break;
    case "pallet":
      break;
    case "other":
      steps.push("other-key");
      if (a.other && a.other !== "8018") {
        steps.push("dpm");
        if (a.dpm === "yes") steps.push("far");
      }
      break;
    default:
      return steps;
  }
  steps.push("print");
  return steps;
}

const answered = (step: AssistantStep, a: AssistantAnswers): boolean => {
  switch (step) {
    case "scenario": return a.scenario !== undefined;
    case "sold": return a.sold !== undefined;
    case "data": return a.data !== undefined;
    case "web": return a.web !== undefined;
    case "care": return a.care !== undefined;
    case "case-till": return a.caseTill !== undefined;
    case "other-key": return a.other !== undefined;
    case "dpm": return a.dpm !== undefined;
    case "far": return a.far !== undefined;
    case "print": return a.print !== undefined;
  }
};

/** The first screen not answered yet; undefined once every one is. */
export function nextAssistantStep(a: AssistantAnswers): AssistantStep | undefined {
  return assistantSteps(a).find((step) => !answered(step, a));
}

// Example values: GS1's own example company prefix (950 6000), never one to sell with, and data a person replaces.

const withCheck = (body: string) => body + checkDigit(body);
export const EXAMPLE_VALUES: Record<string, string> = {
  "01": "09506000134352",
  case: withCheck("1950600013435"),
  "00": withCheck("10950600000000001"),
  "8004": "9506000134352ABC",
  "8003": `${withCheck("0950600013435")}C1`,
  "414": withCheck("950600013435"),
  "253": `${withCheck("950600013435")}D1`,
  "8018": withCheck("95060001343520000"),
  "10": "ABC123",
  "15": "291231",
  "17": "291231",
  "21": "1001",
  "11": "261101",
};

export interface AssistantRule {
  text: string;
  /** The General Specifications 26.0's section, or empty. */
  section: string;
}

/** What the assistant sets up. */
export interface AssistantOutcome {
  /** Step 1: the key and its data, with example values to replace (`examples`). */
  identification: Identification;
  /** The AIs (the key's included) whose values are examples. */
  examples: string[];
  /** Step 2: the decision tree's answers. */
  answers: Answers;
  /** Step 2's choice, where it is a pair the table allows in addition rather than the one it recommends. */
  choice?: { symbol: SymbologyId; with?: SymbologyId };
  /** The GS1 Digital Link URI's domain, when the brand's own. */
  stem?: string;
  /** A GS1 Logistic Label for a pallet's SSCC. */
  logistic?: LogisticSize;
  print: AssistantPrint;
  rules: AssistantRule[];
}

const RULES = {
  prefix: { text: "Use a GTIN from your company's GS1 Company Prefix, licensed by the GS1 office of your country; the example GTIN is only for trying the studio.", section: "1.2.3, 1.5" },
  prefixKey: { text: "Use a key from your company's GS1 Company Prefix, licensed by the GS1 office of your country; the example is only for trying the studio.", section: "1.2.3, 1.5" },
  marketplace: { text: "Marketplaces ask for each product's GTIN and may check that it belongs to your company's prefix.", section: "" },
  placement: { text: "On the back, in the lower right quarter, at least 8 mm and at most 100 mm from the edge.", section: "6.3.3.1, 6.3.3.3" },
  adjacent: { text: "The two barcodes side by side, keeping their white margins (quiet zones); which goes left or right is your choice.", section: "4.15.1" },
  radius: { text: "The whole 2D barcode, its margins included, within 50 mm of the EAN-13's centre, so that the till knows both belong to the same item.", section: "6.3.3.1" },
  same: { text: "The same GTIN, and the same lot and dates, in both barcodes.", section: "4.15.1" },
  eanSize: { text: "Between 80 % and 200 % of the EAN-13's nominal size, never with its bars cut shorter.", section: "5.12.3, table 1" },
  ownSite: { text: "Your website must answer the address the QR code holds (your domain, then /01/ and the GTIN): a redirection is enough. Scan it with a phone before printing.", section: "" },
  gs1Site: { text: "With id.gs1.org, GS1's resolver decides where the phone goes: ask your GS1 office which links it can hold for your GTIN.", section: "" },
  healthcare: { text: "Your regulator says which of the lot, the expiry date, the serial number and the production date your item needs.", section: "" },
  readable: { text: "Keep the text under the barcode: people read the data when no scanner is at hand.", section: "" },
  caseKey: { text: "The case has a GTIN of its own, different from the unit's, often the unit's with an indicator digit from 1 to 8 in front.", section: "" },
  caseSides: { text: "On two adjacent sides of the case, the bars upright, the barcode's bottom 32 mm from the base and at least 19 mm from the vertical edges.", section: "6.7.1, 6.7.1.2" },
  pallet: { text: "On two adjacent sides of the pallet, between 400 mm and 800 mm from its base and at least 50 mm from the vertical edges.", section: "6.7.1.1" },
  ssccOnce: { text: "Each pallet or parcel has its own SSCC, never used again.", section: "1.3.5" },
  logisticLabel: { text: "The GS1 Logistic Label: who sends it and who receives it at the top, the SSCC's barcode lowest.", section: "6.6" },
  artwork: { text: "Ask the print shop for the bar width reduction its press needs; dark bars on a light background, black on white is best.", section: "" },
  labelPrinter: { text: "Choose your printer's profile in the Printer section: the studio sizes the bars to its whole dots.", section: "" },
  sheets: { text: "Print the PDF at 100 % (actual size), never fitted to the page; for many labels, In bulk lays them out on label sheets.", section: "" },
  scanTest: { text: "Run the Scan test, then print one and scan it before a production run.", section: "" },
} satisfies Record<string, AssistantRule>;

/** What the answers set up, once every screen is answered; null until then. */
export function assistantOutcome(a: AssistantAnswers): AssistantOutcome | null {
  if (nextAssistantStep(a) !== undefined) return null;
  const print = a.print!;
  const rules: AssistantRule[] = [];
  const data = (a.data ?? []).map((ai) => [ai, EXAMPLE_VALUES[ai]!] as [string, string]);
  // The GTIN's own qualifiers go in `qualifiers` ((22), (10) and (21) in the URI's path; the Syntax Engine orders them),
  // the rest in `attributes`, in the order chosen.
  const gtin = (value: string): Identification => {
    const q: Record<string, string> = {};
    const attributes: [string, string][] = [];
    for (const [ai, v] of data) (ai === "10" || ai === "21" ? (q[ai] = v) : attributes.push([ai, v]));
    return { key: "01", value, qualifiers: q, attributes };
  };
  let outcome: Omit<AssistantOutcome, "print" | "rules">;

  if (isProduct(a)) {
    const twoD = data.length > 0 || a.web === "own" || a.web === "gs1";
    outcome = {
      identification: gtin(EXAMPLE_VALUES["01"]!),
      examples: ["01", ...data.map(([ai]) => ai)],
      answers: { retail: true, distribution: false },
      ...(twoD ? { choice: { symbol: "ean13", with: "dl-qrcode" } } : {}),
      ...(a.web === "own" && a.domain ? { stem: websiteStem(a.domain) } : {}),
    };
    rules.push(RULES.prefix);
    if (a.sold !== "shops") rules.push(RULES.marketplace);
    rules.push(RULES.placement);
    if (twoD) rules.push(RULES.adjacent, RULES.radius, RULES.same);
    rules.push(RULES.eanSize);
    if (a.web === "own") rules.push(RULES.ownSite);
    if (a.web === "gs1") rules.push(RULES.gs1Site);
  } else if (a.scenario === "healthcare") {
    outcome = {
      identification: gtin(EXAMPLE_VALUES["01"]!),
      examples: ["01", ...data.map(([ai]) => ai)],
      answers: a.care === "pharmacy"
        ? { retail: false, "healthcare-retail": true, distribution: false }
        : { retail: false, "healthcare-retail": false, distribution: false, healthcare: true, dpm: false },
    };
    rules.push(RULES.prefix, RULES.healthcare, RULES.readable);
  } else if (a.scenario === "case") {
    outcome = {
      identification: gtin(EXAMPLE_VALUES.case!),
      examples: ["01", ...data.map(([ai]) => ai)],
      answers: { retail: false, "healthcare-retail": false, distribution: true, tobacco: false, "healthcare-non-retail": false },
    };
    rules.push(RULES.prefix, RULES.caseKey, RULES.caseSides);
  } else if (a.scenario === "pallet") {
    outcome = {
      identification: { key: "00", value: EXAMPLE_VALUES["00"]!, qualifiers: {}, attributes: [] },
      examples: ["00"],
      answers: { distribution: true, tobacco: false },
      logistic: print === "label-printer" ? "4x6" : "a6",
    };
    rules.push(RULES.prefixKey, RULES.ssccOnce, RULES.logisticLabel, RULES.pallet);
  } else {
    const key = a.other!;
    outcome = {
      identification: { key, value: EXAMPLE_VALUES[key]!, qualifiers: {}, attributes: [] },
      examples: [key],
      answers: key === "8018" ? {} : { dpm: a.dpm === "yes", ...(a.dpm === "yes" ? { "long-distance": a.far === "yes" } : {}) },
    };
    rules.push(RULES.prefixKey);
  }
  rules.push(print === "artwork" ? RULES.artwork : print === "label-printer" ? RULES.labelPrinter : RULES.sheets, RULES.scanTest);
  return { ...outcome, print, rules };
}

/** "minhamarca.com.br", "https://www.minhamarca.com.br/" → "https://minhamarca.com.br", "https://www.minhamarca.com.br". */
export function websiteStem(domain: string): string {
  const trimmed = domain.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Reading a need written in one's own words (ADR 0006, decision 2): keywords in English, Portuguese, Spanish, French,
// German and Italian, without accents and in lower case. A word of four letters or more also matches the words it
// starts ("vend" → vender, vendo, venda); a shorter one, a phrase, or a word ending in "=" only as it stands ("arte=":
// not "artesanal").

interface Keyword {
  words: string[];
  /** What the words say: a scenario with its weight, or an answer. */
  scenario?: AssistantScenario;
  weight?: number;
  answer?: Partial<AssistantAnswers>;
  data?: string;
}

const KEYWORDS: Keyword[] = [
  { scenario: "product", weight: 1, words: [
    "product", "produto", "producto", "produit", "produkt", "prodotto", "sell", "selling", "sold", "vend", "verkauf", "verkaufen",
    "item", "artigo", "articulo", "article", "artikel", "articolo", "mercadoria", "merchandise", "embalagem", "packaging", "envase", "emballage", "verpackung", "confezione",
  ] },
  { scenario: "product", weight: 1, answer: { sold: "shops" }, words: [
    "shop", "shops", "store", "stores", "retail", "supermarket", "loja", "lojas", "varejo", "supermercado", "tienda", "minorista",
    "magasin", "boutique", "supermarche", "detail", "laden", "geschaft", "einzelhandel", "supermarkt", "negozio", "dettaglio", "till", "checkout",
  ] },
  { scenario: "product", weight: 1, answer: { sold: "online" }, words: [
    "marketplace", "marketplaces", "online", "internet", "ecommerce", "e commerce", "amazon", "mercado livre", "mercado libre", "shopee", "magalu",
    "loja virtual", "loja online", "tienda online", "boutique en ligne", "en ligne", "onlineshop", "negozio online",
  ] },
  { answer: { web: "own" }, words: [
    "site", "website", "web", "webpage", "pagina", "sitio", "webseite", "homepage", "sito", "dominio", "domain", "url", "link", "landing",
  ] },
  { scenario: "healthcare", weight: 3, words: [
    "udi", "anvisa", "fda", "mdr", "medic", "medicament", "medicamento", "medicine", "remedio", "farmac", "pharma", "apotheke", "arzneimittel",
    "dispositivo medico", "medical device", "dispositif medical", "medizinprodukt", "hospital", "hospit", "clinic", "clinica", "klinik",
    "krankenhaus", "ospedale", "saude", "salud", "sante", "gesundheit", "sanita", "healthcare", "drogaria",
  ] },
  { answer: { care: "pharmacy" }, words: ["farmacia", "farmacias", "pharmacy", "pharmacie", "apotheke", "drogaria", "drugstore"] },
  { answer: { care: "hospital" }, words: ["hospital", "hospitais", "hospitales", "hopital", "krankenhaus", "ospedale", "clinic", "clinica", "klinik"] },
  { scenario: "case", weight: 1, words: ["caixa", "caixas", "box", "boxes", "caja", "cajas", "carton", "karton", "cartone", "scatola"] },
  { scenario: "case", weight: 3, words: [
    "fardo", "fardos", "caixa de embarque", "caixa master", "embalagem de embarque", "shipping case", "outer case", "case of",
    "caja de embarque", "bulto", "carton d expedition", "umkarton", "versandkarton", "cartone di spedizione", "imballo",
  ] },
  { scenario: "pallet", weight: 3, words: [
    "palete", "paletes", "pallet", "pallets", "palet", "palets", "palette", "paletten", "parcel", "volume", "volumes", "sscc",
    "expedicao", "transportadora", "centro de distribuicao", "shipment", "logistic", "logistica", "logistique", "logistik", "colis",
    "sendung", "spedizione", "pacco", "paquete", "etiqueta logistica",
  ] },
  { scenario: "other", weight: 3, answer: { other: "8004" }, words: ["patrimonio", "ativo", "asset", "assets", "activo", "actif", "anlagegut", "inventar", "cespite", "equipamento", "equipment", "equipo"] },
  { scenario: "other", weight: 3, answer: { other: "8003" }, words: ["retornavel", "retornaveis", "returnable", "retornable", "reutilizavel", "consigne", "mehrweg", "rendere", "vasilhame", "barril", "keg", "botijao", "cilindro"] },
  { scenario: "other", weight: 3, answer: { other: "414" }, words: ["localizacao", "location", "ubicacion", "emplacement", "standort", "ubicazione", "gln"] },
  { scenario: "other", weight: 3, answer: { other: "253" }, words: ["documento", "document", "documents", "dokument", "certificado", "certificate", "gdti"] },
  { scenario: "other", weight: 3, answer: { other: "8018" }, words: ["socio", "associado", "member", "membro", "miembro", "membre", "mitglied", "gsrn", "paciente", "patient", "paziente"] },
  { data: "10", words: ["lote", "lotes", "lot", "batch", "lotto", "charge", "chargen"] },
  { data: "17", words: ["validade", "vencimento", "expiry", "expiration", "caducidad", "vencimiento", "peremption", "verfall", "verfallsdatum", "scadenza"] },
  { data: "15", words: ["best before", "consumir de preferencia", "consumir preferencialmente", "a consommer de preference", "mindesthaltbarkeit", "da consumarsi"] },
  { data: "21", words: ["serie", "serial", "seriennummer", "numero de serie", "serialized", "serializado", "matricola", "rastreabilidade unitaria"] },
  { data: "11", words: ["fabricacao", "fabricacion", "fabrication", "production date", "data de producao", "herstelldatum", "data di produzione"] },
  { answer: { print: "artwork" }, words: ["grafica", "arte=", "artwork", "designer", "print shop", "imprenta", "imprimerie", "druckerei", "tipografia", "rotulo", "rotulos"] },
  { answer: { print: "label-printer" }, words: [
    "zebra", "argox", "elgin", "tsc", "datamax", "termica", "thermal", "termico", "thermique", "etikettendrucker",
    "impressora de etiquetas", "label printer", "impresora de etiquetas", "imprimante d etiquettes", "stampante per etichette",
  ] },
  { answer: { print: "sheets" }, words: ["a4", "folha", "folhas", "sheet", "sheets", "pimaco", "jato de tinta", "inkjet", "hoja", "feuille", "bogen", "foglio"] },
];

/** Lower case, no accents, letters and digits only, one space between words. */
export function normaliseNeed(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matches(normalised: string, tokens: string[], word: string): boolean {
  if (word.endsWith("=")) return tokens.includes(word.slice(0, -1));
  if (word.includes(" ")) return ` ${normalised} `.includes(` ${word} `);
  return word.length >= 4 ? tokens.some((token) => token.startsWith(word)) : tokens.includes(word);
}

/**
 * The scenario and the answers a sentence gives, for the person to check on the screens: the scenario whose words weigh
 * most (a medicine sold in a shop is healthcare), and the answers its words give. Nothing when no word is known.
 */
export function readNeed(text: string): AssistantAnswers {
  const normalised = normaliseNeed(text);
  if (!normalised) return {};
  const tokens = normalised.split(" ");
  const weights = new Map<AssistantScenario, number>();
  const found: AssistantAnswers = {};
  const data: string[] = [];
  const sold = new Set<NonNullable<AssistantAnswers["sold"]>>();
  for (const keyword of KEYWORDS) {
    if (!keyword.words.some((word) => matches(normalised, tokens, word))) continue;
    if (keyword.scenario) weights.set(keyword.scenario, (weights.get(keyword.scenario) ?? 0) + keyword.weight!);
    if (keyword.data && !data.includes(keyword.data)) data.push(keyword.data);
    if (keyword.answer?.sold) sold.add(keyword.answer.sold);
    if (keyword.answer) for (const [name, value] of Object.entries(keyword.answer)) (found as Record<string, unknown>)[name] ??= value;
  }
  let scenario: AssistantScenario | undefined;
  for (const [name, weight] of weights) if (!scenario || weight > weights.get(scenario)!) scenario = name;
  // A QR code with a website, or data on each unit, says a product when nothing else is said.
  if (!scenario && (found.web || data.length)) scenario = "product";
  if (!scenario) return {};
  const answers: AssistantAnswers = { scenario };
  if (scenario === "product") {
    if (sold.size) answers.sold = sold.size > 1 ? "both" : [...sold][0]!;
    if (found.web) answers.web = found.web;
  }
  if (scenario === "healthcare" && found.care) answers.care = found.care;
  if (scenario === "other" && found.other) answers.other = found.other;
  const offered = scenario === "product" || scenario === "healthcare" || scenario === "case" ? ASSISTANT_DATA[scenario] : [];
  const chosen = offered.filter((ai) => data.includes(ai));
  if (chosen.length) answers.data = chosen;
  if (found.print) answers.print = found.print;
  return answers;
}
