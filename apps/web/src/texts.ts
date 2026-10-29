// The page's texts, apart from the code so that a translation stays possible (ADR 0003). Key, qualifier and scanning
// environment texts are the resolver's English ones (portal/static/i18n.js, ADR 0004).

export interface KeyText {
  name: string;
  short: string;
  label: string;
  placeholder: string;
  hint: string;
}

export const KEY_TEXTS: Record<string, KeyText> = {
  "01": {
    "name": "Product (GTIN) (01)",
    "short": "GTIN",
    "label": "GTIN",
    "placeholder": "e.g. 9506000134376",
    "hint": "8, 12, 13 or 14 digits, the last one being the check digit."
  },
  "00": {
    "name": "Logistic unit (SSCC) (00)",
    "short": "SSCC",
    "label": "SSCC number",
    "placeholder": "e.g. 095060001343520000",
    "hint": "18 digits, the last one being the check digit."
  },
  "414": {
    "name": "Physical location (GLN) (414)",
    "short": "GLN",
    "label": "GLN number",
    "placeholder": "e.g. 9506000134376",
    "hint": "13 digits, the last one being the check digit."
  },
  "417": {
    "name": "Party (GLN) (417)",
    "short": "GLN",
    "label": "GLN number",
    "placeholder": "e.g. 9506000134376",
    "hint": "13 digits, the last one being the check digit."
  },
  "415": {
    "name": "Invoicing party (GLN) (415)",
    "short": "GLN",
    "label": "GLN number",
    "placeholder": "e.g. 9506000134376",
    "hint": "13 digits, the last one being the check digit. Requires the payment reference (8020)."
  },
  "8006": {
    "name": "Individual trade item piece (ITIP) (8006)",
    "short": "ITIP",
    "label": "ITIP number",
    "placeholder": "e.g. 095060001343520102",
    "hint": "18 digits: the GTIN (14 digits) + the piece number (2) + the total number of pieces (2)."
  },
  "8010": {
    "name": "Component/Part Identifier (CPID) (8010)",
    "short": "CPID",
    "label": "CPID number",
    "placeholder": "e.g. 9506000ABC-1",
    "hint": "Up to 30 characters (digits, capital letters and hyphen), starting with the GS1 Company Prefix."
  },
  "8013": {
    "name": "Global Model Number (GMN) (8013)",
    "short": "GMN",
    "label": "GMN number",
    "placeholder": "e.g. 1987654Ad4X4bL5ttr2310c2K",
    "hint": "Up to 25 characters: starts with the GS1 Company Prefix and ends with the check-character pair."
  },
  "253": {
    "name": "Document (GDTI) (253)",
    "short": "GDTI",
    "label": "GDTI number",
    "placeholder": "e.g. 9506000134376ABC",
    "hint": "13 digits (the last one is the check digit), optionally followed by up to 17 serial characters."
  },
  "255": {
    "name": "Global Coupon Number (GCN) (255)",
    "short": "GCN",
    "label": "GCN number",
    "placeholder": "e.g. 95060001343761234",
    "hint": "13 digits (the last one is the check digit), optionally followed by up to 12 serial digits."
  },
  "401": {
    "name": "Consignment (GINC) (401)",
    "short": "GINC",
    "label": "GINC number",
    "placeholder": "e.g. 9506000ABC",
    "hint": "Up to 30 characters (unaccented letters, digits, full stop and hyphen), starting with the GS1 Company Prefix."
  },
  "402": {
    "name": "Shipment (GSIN) (402)",
    "short": "GSIN",
    "label": "GSIN number",
    "placeholder": "e.g. 95060001343760123",
    "hint": "17 digits, the last one being the check digit."
  },
  "8003": {
    "name": "Returnable asset (GRAI) (8003)",
    "short": "GRAI",
    "label": "GRAI number",
    "placeholder": "e.g. 09506000134352ABC",
    "hint": "0 + 13 digits (the last one is the check digit), optionally followed by up to 16 serial characters."
  },
  "8004": {
    "name": "Individual asset (GIAI) (8004)",
    "short": "GIAI",
    "label": "GIAI number",
    "placeholder": "e.g. 9506000ABC123",
    "hint": "Up to 30 characters (unaccented letters, digits, full stop and hyphen), starting with the GS1 Company Prefix."
  },
  "8017": {
    "name": "Service provider (GSRN) (8017)",
    "short": "GSRN",
    "label": "GSRN number",
    "placeholder": "e.g. 950600013437612342",
    "hint": "18 digits, the last one being the check digit."
  },
  "8018": {
    "name": "Service recipient (GSRN) (8018)",
    "short": "GSRN",
    "label": "GSRN number",
    "placeholder": "e.g. 950600013437612342",
    "hint": "18 digits, the last one being the check digit."
  }
};

export const QUALIFIER_LABELS: Record<string, string> = {
  "22": "Product variant (22)",
  "10": "Batch/lot (10)",
  "21": "Serial number (21)",
  "235": "Third-party serialised extension — TPX (235)",
  "8011": "Component serial number (8011)",
  "254": "GLN extension (254)",
  "7040": "UIC with extension and importer index (7040)",
  "8020": "Payment reference number (8020)",
  "8019": "Service relation instance number (8019)"
};

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

export const ERROR_NAMES = { l: "L — low (7 %)", m: "M — medium (15 %)", q: "Q — quartile (25 %)", h: "H — high (30 %)" } as const;

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
  nothing: "No symbol this table allows carries this data.",
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
