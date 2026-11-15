import { EXAMPLE_VALUES } from "./assistant.ts";
import { checkDigit } from "./checkDigit.ts";
import type { DesignPage } from "./design.ts";
import { qualifiersOf } from "./dictionary.ts";
import type { Answers } from "./guide.ts";
import { rowsOf, type Identification } from "./identify.ts";
import type { SymbologyId } from "./symbologies.ts";

/**
 * Labels by segment (backlog 6.5, mock-up A of two, 14 November 2026): ready-made labels of one's own under *A label*,
 * grouped by segment beside the GS1 Logistic Label, a label of one's own and a work saved. Each is a page of the
 * designer, with the data it shows in step 1 as example values to replace and step 2's answers, so the person changes
 * what it holds and where, as on any label of one's own. Retail first, then healthcare (the owner's rule: the
 * recommended order, open to change); patients and further templates one at a time, each from the General
 * Specifications or GS1's guidelines.
 *
 * The texts on the page stay in English, as the files made do (CLAUDE.md): each data title with its AI and the data
 * exactly as the barcode carries it, as section 4.14.1 asks when they are identical (figure 4-8: GTIN (01) …, EXPIRY
 * (17) 271120), never a date written otherwise beside its AI. The person rewrites them in the designer.
 */

export type TemplateSegment = "retail" | "healthcare";

/** The segments in the order the cards show them, after Logistics (the GS1 Logistic Label). */
export const TEMPLATE_SEGMENTS: readonly TemplateSegment[] = ["retail", "healthcare"];

export interface LabelTemplate {
  id: string;
  segment: TemplateSegment;
  /** Its card's name and line, in English (translated by the page). */
  name: string;
  line: string;
  /** Step 1: the key and the data the page shows, every value an example. */
  identification: Identification;
  /** Step 2's answers, and the symbol picked there. */
  answers: Answers;
  picked: { symbol: SymbologyId; with?: SymbologyId };
  /** The label of one's own it opens. */
  page: DesignPage;
  /** Where its layout comes from: the General Specifications 26.0's sections. */
  section: string;
  /** For a variable measure trade item: a GTIN of step 1 without the indicator digit 9 gives way to the example's (2.1.12). */
  variableMeasure?: true;
}

/** A text block's lines (built so, they read as the label's content rather than as messages of the page). */
const lines = (...each: string[]) => each.join("\n");

const WEIGHED_GTIN = (() => {
  const body = `9${EXAMPLE_VALUES["01"]!.slice(1, 13)}`; // a variable measure trade item: indicator digit 9 (2.1.12)
  return body + checkDigit(body);
})();

export const LABEL_TEMPLATES: readonly LabelTemplate[] = [
  {
    id: "retail-lot-expiry",
    segment: "retail",
    name: "Product with lot and expiry",
    line: "EAN-13 and a QR code, the lot and expiry date under them",
    identification: { key: "01", value: EXAMPLE_VALUES["01"]!, qualifiers: { "10": EXAMPLE_VALUES["10"]! }, attributes: [["17", EXAMPLE_VALUES["17"]!]] },
    answers: { retail: true, distribution: false },
    picked: { symbol: "ean13", with: "dl-qrcode" },
    page: {
      widthMm: 66,
      heightMm: 38,
      elements: [
        { id: "e1", kind: "symbol", symbology: "ean13", ais: ["01"], size: 100, hri: true, xMm: 1, yMm: 2 },
        { id: "e2", kind: "symbol", symbology: "dl-qrcode", ais: null, size: 100, hri: false, xMm: 40, yMm: 2 },
        { id: "e3", kind: "text", text: lines("LOT (10) {10}", "EXPIRY (17) {17}"), heightMm: 2.2, xMm: 4, yMm: 32 },
      ],
    },
    section: "4.15.1, 6.3.3.1",
  },
  {
    id: "retail-weight",
    segment: "retail",
    name: "Fresh food sold by weight",
    line: "GS1 DataBar Expanded Stacked with the weight and price",
    identification: { key: "01", value: WEIGHED_GTIN, qualifiers: {}, attributes: [["310n", "1.25"], ["392n", "15.99"]] },
    answers: { retail: true, distribution: false },
    picked: { symbol: "databar-expanded-stacked" },
    variableMeasure: true,
    page: {
      widthMm: 60,
      heightMm: 54,
      elements: [
        { id: "e1", kind: "symbol", symbology: "databar-expanded-stacked", ais: null, size: 100, hri: true, xMm: 12.5, yMm: 3 },
      ],
    },
    section: "2.1.12, 5.5",
  },
  {
    // A consumer unit's barcode area (backlog 6.5, mock-up A of two, 15 November 2026): the EAN-13 and a QR code with
    // GS1 Digital Link carrying the GTIN alone, the QR code with its quiet zones within 50 mm of the EAN-13's centre, as
    // section 6.3.3.1 asks of a linear and a 2D barcode both scanned at the point of sale, and a call to scan under it.
    // On the back of the pack, lower right (6.3.2, 6.3.3.1), rather than its front, the trading and advertising area.
    // B stacked the QR code above the EAN-13 on a narrow panel.
    id: "retail-digital-link",
    segment: "retail",
    name: "Consumer unit with GS1 Digital Link",
    line: "EAN-13 and a QR code with GS1 Digital Link within 50 mm of it, a call to scan under the QR code",
    identification: { key: "01", value: EXAMPLE_VALUES["01"]!, qualifiers: {}, attributes: [] },
    answers: { retail: true, distribution: false },
    picked: { symbol: "ean13", with: "dl-qrcode" },
    page: {
      widthMm: 64,
      heightMm: 32,
      elements: [
        { id: "e1", kind: "symbol", symbology: "ean13", ais: ["01"], size: 100, hri: true, xMm: 1, yMm: 2 },
        { id: "e2", kind: "symbol", symbology: "dl-qrcode", ais: null, size: 100, hri: false, xMm: 41, yMm: 2 },
        { id: "e3", kind: "text", text: lines("SCAN FOR", "PRODUCT INFO"), heightMm: 1.8, xMm: 43, yMm: 24.5 },
      ],
    },
    section: "6.3.2, 6.3.3.1",
  },
  {
    id: "healthcare-pack",
    segment: "healthcare",
    name: "Medicine or medical device",
    line: "GS1 DataMatrix, the GTIN, expiry, lot and serial number beside it",
    identification: {
      key: "01", value: EXAMPLE_VALUES["01"]!, qualifiers: { "10": EXAMPLE_VALUES["10"]!, "21": EXAMPLE_VALUES["21"]! },
      attributes: [["17", EXAMPLE_VALUES["17"]!]], order: ["17", "10", "21"],
    },
    answers: { retail: false, "healthcare-retail": false, distribution: false, healthcare: true, dpm: false },
    picked: { symbol: "gs1-datamatrix" },
    page: {
      widthMm: 60,
      heightMm: 18,
      elements: [
        { id: "e1", kind: "symbol", symbology: "gs1-datamatrix", ais: null, size: 100, hri: false, xMm: 1, yMm: 2 },
        { id: "e2", kind: "text", text: lines("GTIN (01) {01}", "EXPIRY (17) {17}", "LOT (10) {10}", "SERIAL (21) {21}"), heightMm: 2, xMm: 16, yMm: 4 },
      ],
    },
    section: "4.15, 2.1.4",
  },
  {
    // A medical device's UDI label (backlog 6.5, mock-up A of two, 15 November 2026): the UDI's human readable text as
    // its element strings, an AI in parentheses before each value and no data titles, a line each, as the UDI rules
    // (FDA, EU MDR) take a GS1 carrier's human readable interpretation; the ISO 15223-1 pictograms UDI beside the carrier
    // and MD (the owner: let the UDI pictogram be placed).
    id: "healthcare-udi",
    segment: "healthcare",
    name: "Medical device with its UDI",
    line: "GS1 DataMatrix under the UDI pictogram, the UDI's element strings beside it",
    identification: {
      key: "01", value: EXAMPLE_VALUES["01"]!, qualifiers: { "10": EXAMPLE_VALUES["10"]!, "21": EXAMPLE_VALUES["21"]! },
      attributes: [["17", EXAMPLE_VALUES["17"]!]], order: ["17", "10", "21"],
    },
    answers: { retail: false, "healthcare-retail": false, distribution: false, healthcare: true, dpm: false },
    picked: { symbol: "gs1-datamatrix" },
    page: {
      widthMm: 46,
      heightMm: 21,
      elements: [
        { id: "e1", kind: "symbol", symbology: "gs1-datamatrix", ais: null, size: 100, hri: false, xMm: 1, yMm: 6.5 },
        { id: "e2", kind: "pictogram", pictogram: "udi", heightMm: 4, xMm: 2.5, yMm: 1.5 },
        { id: "e3", kind: "text", text: lines("(01){01}", "(17){17}", "(10){10}", "(21){21}"), heightMm: 2, xMm: 16, yMm: 7.5 },
        { id: "e4", kind: "pictogram", pictogram: "md", heightMm: 4, xMm: 38, yMm: 1.5 },
      ],
    },
    section: "2.1.4, 4.15; ISO 15223-1",
  },
  {
    // A patient's wristband (backlog 6.5, mock-up A of two, 15 November 2026): the GSRN of the service recipient (8018)
    // with the patient's family and given names, date of birth and sex (7253, 7254, 7250, 7252), in a GS1 DataMatrix at
    // each end, so that one faces the scanner however the band curves round the wrist; the name large between them, the
    // date of birth in a format of its own without its AI (4.14.1, figure 4-9) and the GSRN with its AI. B put the GSRN
    // alone in a GS1-128 along the band.
    id: "patient-wristband",
    segment: "healthcare",
    name: "Patient's wristband",
    line: "The GSRN and the patient's name, date of birth and sex in a GS1 DataMatrix at each end",
    identification: {
      key: "8018", value: EXAMPLE_VALUES["8018"]!, qualifiers: {},
      attributes: [["7253", "SILVA"], ["7254", "MARIA"], ["7250", "19800315"], ["7252", "2"]],
    },
    answers: {},
    picked: { symbol: "gs1-datamatrix" },
    page: {
      widthMm: 150,
      heightMm: 25,
      elements: [
        { id: "e1", kind: "symbol", symbology: "gs1-datamatrix", ais: null, size: 100, hri: false, xMm: 2, yMm: 3 },
        { id: "e2", kind: "text", text: lines("{7253}, {7254}"), heightMm: 4, xMm: 24, yMm: 4 },
        { id: "e3", kind: "text", text: lines("DOB {7250:DD/MM/YYYY}   SEX {7252}"), heightMm: 2.5, xMm: 24, yMm: 11 },
        { id: "e4", kind: "text", text: lines("GSRN (8018) {8018}"), heightMm: 2.5, xMm: 24, yMm: 17 },
        { id: "e5", kind: "symbol", symbology: "gs1-datamatrix", ais: null, size: 100, hri: false, xMm: 128, yMm: 3 },
      ],
    },
    section: "2.5.2, 4.14.1",
  },
];

/** The template by its id, or undefined. */
export function templateById(id: string): LabelTemplate | undefined {
  return LABEL_TEMPLATES.find((template) => template.id === id);
}

/** The AIs of an identification's data, its key's apart, as rows give them ("310n" as chosen). */
const dataAis = (id: Identification) => rowsOf(id).map(([ai]) => ai);

/** What choosing a template does to step 1's data (`templateFit`). */
export interface TemplateFit {
  /** Step 1 once the template is chosen, the data it has no place for still in it (`leaveOut` takes it out). */
  identification: Identification;
  /** The values set from the template's examples, by AI (the key's included): what the person still replaces. */
  examples: [ai: string, value: string][];
  /** The AIs of step 1's data that the template has no place for, in their order: kept or left out at the person's word. */
  extra: string[];
  /** Step 1's key was another: the template's key and its example replace it and its data. */
  replaced: boolean;
}

/**
 * Choosing a template with step 1's data (backlog 6.5): a key of the template's own keeps its value, and the data the
 * template shows that step 1 lacks is added with the template's example values; data the template has no place for is
 * named (`extra`), kept until the person leaves it out. Step 1 with another key gives way to the template's example.
 */
export function templateFit(template: LabelTemplate, current: Identification): TemplateFit {
  const own = template.identification;
  const pairs = (id: Identification): [string, string][] => [[id.key, id.value], ...rowsOf(id)];
  if (current.key !== own.key || !current.value.trim()) {
    return { identification: structuredClone(own), examples: pairs(own), extra: [], replaced: current.key !== own.key };
  }
  const have = new Set(dataAis(current));
  const wanted = dataAis(own);
  const examples: [string, string][] = [];
  const qualifiers = { ...current.qualifiers };
  const attributes = current.attributes.map(([ai, value]) => [ai, value] as [string, string]);
  for (const [ai, value] of rowsOf(own)) {
    if (have.has(ai)) continue;
    if (qualifiersOf(own.key).includes(ai)) qualifiers[ai] = value;
    else attributes.push([ai, value]);
    examples.push([ai, value]);
  }
  const identification: Identification = { ...current, qualifiers, attributes };
  if (template.variableMeasure && !current.value.trim().startsWith("9")) {
    identification.value = own.value;
    examples.unshift([own.key, own.value]);
  }
  // The template's order of its data when step 1 had none of its own
  if (own.order && !current.order) identification.order = [...own.order, ...dataAis(current).filter((ai) => !own.order!.includes(ai))];
  else if (current.order) identification.order = [...current.order, ...examples.map(([ai]) => ai).filter((ai) => !current.order!.includes(ai))];
  return { identification, examples, extra: dataAis(current).filter((ai) => !wanted.includes(ai)), replaced: false };
}

/** Step 1 without the data of these AIs (the template's *Leave it out*). */
export function leaveOut(id: Identification, ais: readonly string[]): Identification {
  const gone = new Set(ais);
  const qualifiers = Object.fromEntries(Object.entries(id.qualifiers).filter(([ai]) => !gone.has(ai)));
  const out: Identification = { ...id, qualifiers, attributes: id.attributes.filter(([ai]) => !gone.has(ai)) };
  if (id.order) out.order = id.order.filter((ai) => !gone.has(ai));
  return out;
}
