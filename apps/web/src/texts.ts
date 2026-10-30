// The page's texts, apart from the code so that a translation stays possible (ADR 0003). Key, qualifier and scanning
// environment texts are the resolver's English ones (portal/static/i18n.js, ADR 0004).

export interface KeyText {
  /** What the key identifies, shown after the AI and the key's abbreviation: "(01) GTIN Product". */
  name: string;
  short: string;
  label: string;
  placeholder: string;
  hint: string;
}

export const KEY_TEXTS: Record<string, KeyText> = {
  "01": {
    "name": "Product",
    "short": "GTIN",
    "label": "GTIN",
    "placeholder": "e.g. 9506000134376",
    "hint": "8, 12, 13 or 14 digits, the last one being the check digit."
  },
  "00": {
    "name": "Logistic unit",
    "short": "SSCC",
    "label": "SSCC number",
    "placeholder": "e.g. 095060001343520000",
    "hint": "18 digits, the last one being the check digit."
  },
  "414": {
    "name": "Physical location",
    "short": "GLN",
    "label": "GLN number",
    "placeholder": "e.g. 9506000134376",
    "hint": "13 digits, the last one being the check digit."
  },
  "417": {
    "name": "Party",
    "short": "GLN",
    "label": "GLN number",
    "placeholder": "e.g. 9506000134376",
    "hint": "13 digits, the last one being the check digit."
  },
  "415": {
    "name": "Invoicing party",
    "short": "GLN",
    "label": "GLN number",
    "placeholder": "e.g. 9506000134376",
    "hint": "13 digits, the last one being the check digit. Requires the payment reference (8020)."
  },
  "8006": {
    "name": "Individual trade item piece",
    "short": "ITIP",
    "label": "ITIP number",
    "placeholder": "e.g. 095060001343520102",
    "hint": "18 digits: the GTIN (14 digits) + the piece number (2) + the total number of pieces (2)."
  },
  "8010": {
    "name": "Component/part",
    "short": "CPID",
    "label": "CPID number",
    "placeholder": "e.g. 9506000ABC-1",
    "hint": "Up to 30 characters (digits, capital letters and hyphen), starting with the GS1 Company Prefix."
  },
  "8013": {
    "name": "Model",
    "short": "GMN",
    "label": "GMN number",
    "placeholder": "e.g. 1987654Ad4X4bL5ttr2310c2K",
    "hint": "Up to 25 characters: starts with the GS1 Company Prefix and ends with the check-character pair."
  },
  "253": {
    "name": "Document",
    "short": "GDTI",
    "label": "GDTI number",
    "placeholder": "e.g. 9506000134376ABC",
    "hint": "13 digits (the last one is the check digit), optionally followed by up to 17 serial characters."
  },
  "255": {
    "name": "Coupon",
    "short": "GCN",
    "label": "GCN number",
    "placeholder": "e.g. 95060001343761234",
    "hint": "13 digits (the last one is the check digit), optionally followed by up to 12 serial digits."
  },
  "401": {
    "name": "Consignment",
    "short": "GINC",
    "label": "GINC number",
    "placeholder": "e.g. 9506000ABC",
    "hint": "Up to 30 characters (unaccented letters, digits, full stop and hyphen), starting with the GS1 Company Prefix."
  },
  "402": {
    "name": "Shipment",
    "short": "GSIN",
    "label": "GSIN number",
    "placeholder": "e.g. 95060001343760123",
    "hint": "17 digits, the last one being the check digit."
  },
  "8003": {
    "name": "Returnable asset",
    "short": "GRAI",
    "label": "GRAI number",
    "placeholder": "e.g. 09506000134352ABC",
    "hint": "0 + 13 digits (the last one is the check digit), optionally followed by up to 16 serial characters."
  },
  "8004": {
    "name": "Individual asset",
    "short": "GIAI",
    "label": "GIAI number",
    "placeholder": "e.g. 9506000ABC123",
    "hint": "Up to 30 characters (unaccented letters, digits, full stop and hyphen), starting with the GS1 Company Prefix."
  },
  "8017": {
    "name": "Service provider",
    "short": "GSRN",
    "label": "GSRN number",
    "placeholder": "e.g. 950600013437612342",
    "hint": "18 digits, the last one being the check digit."
  },
  "8018": {
    "name": "Service recipient",
    "short": "GSRN",
    "label": "GSRN number",
    "placeholder": "e.g. 950600013437612342",
    "hint": "18 digits, the last one being the check digit."
  },
  "03": {
    "name": "Made-to-order product",
    "short": "MtO GTIN",
    "label": "Made-to-Order GTIN",
    "placeholder": "e.g. 09506000134376",
    "hint": "14 digits, the last one being the check digit. In GS1-128, GS1 DataMatrix and GS1 DataBar Expanded only: a GS1 Digital Link URI cannot carry it (GS1 General Specifications 1.3.1.6)."
  }
};

/** The qualifiers' names, shown after the AI as every AI choice is: "(10) Batch/lot" (the owner, 30 October 2026). */
export const QUALIFIER_LABELS: Record<string, string> = {
  "22": "Product variant",
  "10": "Batch/lot",
  "21": "Serial number",
  "235": "TPX Third-party serialised extension",
  "8011": "Component serial number",
  "254": "GLN extension",
  "7040": "UIC with extension and importer index",
  "8020": "Payment reference number",
  "8019": "SRIN Service relation instance number"
};

/** An AI as every choice of one shows it: the AI, the key's abbreviation, its name — "(01) GTIN Product". */
export function aiText(ai: string, title?: string): string {
  const key = KEY_TEXTS[ai];
  return `(${ai}) ${key ? `${key.short} ${key.name}` : (QUALIFIER_LABELS[ai] ?? title ?? "")}`.trim();
}

/**
 * AIs in the order of the text shown, which starts with the AI: character by character, as the GS1 General
 * Specifications list them ("(00)", "(01)", "(10)", "(235)", "(30)", "(8003)", "(90)").
 */
export const byAi = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const ENVIRONMENT_NAMES: Record<string, string> = {
  "retail": "Retail point of sale (table 1)",
  "retail-gd": "Retail point of sale and general distribution (table 3)",
  "distribution": "General distribution only (table 2)",
  "pharmacy": "Healthcare: retail pharmacy (table 10)",
  "pharmacy-gd": "Healthcare and general distribution (table 8)",
  "healthcare": "Healthcare, non-retail, e.g. hospitals (table 6)",
  "other": "Neither retail nor distribution (table 4)",
  "logistics": "Logistic units, SSCC (table 5)",
  "assets": "GDTI, GRAI, GIAI and GLN (table 9)",
  "gsrn": "GSRN (table 11)",
  "dpm": "Direct part marking (table 7)"
};

export const HRI_CHOICES = { full: "Full (every element)", key: "Identification key only", none: "None" } as const;
export type HriChoice = keyof typeof HRI_CHOICES;

// Where the human readable text goes and how high (GS1 General Specifications 4.14; backlog 1.16).
export const HRI_POSITION_NAMES = {
  below: "Below the symbol",
  above: "Above it",
  split: "Key below, attributes above",
  left: "Left of it",
  right: "Right of it",
} as const;
export const HRI_HEIGHTS: [number, string][] = [
  [2, "2.0 mm (the minimum)"], [2.2, "2.2 mm (default)"], [2.5, "2.5 mm"], [3, "3.0 mm (GS1 Logistic Label)"], [3.5, "3.5 mm"],
  [4, "4.0 mm"], [5, "5.0 mm"],
];

export const ERROR_NAMES = { l: "L — low (7 %)", m: "M — medium (15 %)", q: "Q — quartile (25 %)", h: "H — high (30 %)" } as const;

// ITF-14's bearer bars (GS1 General Specifications 5.3.2.4).
export const BEARER_CHOICES = {
  frame: "A frame, 4.83 mm (any printing; needed with printing plates)",
  bars: "Top and bottom, 2X (printing without plates: thermal, laser)",
} as const;

export const LINEAR_CHOICES = {
  none: "None",
  auto: "EAN-13 / UPC-A / EAN-8, as the GTIN takes",
  upce: "UPC-E (a GTIN-12 that zero-suppresses)",
} as const;
export type LinearChoice = keyof typeof LINEAR_CHOICES;

// Step 2, where the code is scanned (backlog 1.2). The questions themselves are the core's (guide.ts: QUESTIONS).
export const GUIDE_TEXTS = {
  answer: "Answer to see the symbols the GS1 General Specifications allow here, and the one recommended for this data.",
  fixData: "Correct the data in step 1 to see the symbols this table allows.",
  waiting: "The studio does not draw the symbol this needs yet:",
  notDrawn: "The studio draws a symbol only once an independent decoder reads it back in its tests, and none reads GS1 DotCode yet.",
  nothing: "No symbol this table allows carries this data.",
  together: "This data needs two symbols:",
  togetherLater: "The label lays a symbol in addition out beside an EAN/UPC only, for now: choose one of them below.",
  gtinAlone: "Carries the GTIN alone: the rest of the data is left out.",
  notOffered: "Not offered here: beside the QR code with a GS1 Digital Link URI it confuses.",
  oneSymbol: "For now the label lays out a symbol in addition beside an EAN/UPC only.",
  expert: "You are choosing the symbol and the scanning environment yourself, in step 3.",
  expertOffer: "every symbol, with the key's scanning environments.",
} as const;

/** What the key answers in the decision tree, by question and answer. */
export const BY_KEY: Record<string, string> = {
  "key-asset:true": "an asset, document or location (GDTI, GRAI, GIAI, GLN)",
  "key-asset:false": "not an asset, document or location",
  "key-gsrn:true": "a service relationship (GSRN)",
  "key-gsrn:false": "not a service relationship (GSRN)",
  "key-logistic:true": "a logistic unit",
  "key-logistic:false": "not a logistic unit",
  "retail:false": "not sold at a retail till",
  "healthcare-retail:false": "not sold in a pharmacy",
};

// In bulk (backlog 2.1).
export const BULK_TEXTS = {
  drop:
    "Drop a CSV or Excel file here, or paste rows copied from a spreadsheet below, the header row first. A header " +
    "that starts with an AI, such as (01) or (17) Expiry, always goes to that AI.",
  pastePlaceholder: "(01) GTIN\t(10) Batch\t(17) Expiry\n09506000134376\tB42\t31/12/2027",
  fixedHint: "For an AI with the same value on every row, such as a country of origin (422).",
  remembered: "The columns are remembered for files with the same headers, in this browser.",
  noRows: "Add rows: a CSV or Excel file, or rows pasted from a spreadsheet.",
  report:
    "A value fixed here is checked at once; the file itself is not changed: download the corrected rows to fix it at " +
    "its source. Skipped rows are left out of what is generated.",
} as const;

// In bulk, generating every row (backlog 2.4).
export const GENERATE_TEXTS = {
  intro: "The label above, with its options, drawn for every row ready or fixed.",
  pattern: "{row}, {symbol}, {key} (the key's value) or an AI such as {01} or {10}; a name repeated is numbered.",
  sheet: "Labels are printed at 100 %, centred in their place; a label larger than the sheet's is left out.",
  zip: "One zip: the files chosen and generated.csv, which lists every row and what was made of it.",
  nothing: "Choose at least one file to generate.",
} as const;

// In bulk, sequences made in the studio (backlog 2.3).
export const SEQUENCE_TEXTS = {
  title: "…or make a sequence: serial numbers or SSCCs",
  sscc:
    "Each SSCC is the extension digit, your company prefix, the serial reference and the check digit; one is not used " +
    "again within a year of its shipment (GS1 General Specifications 2.2.1).",
} as const;
