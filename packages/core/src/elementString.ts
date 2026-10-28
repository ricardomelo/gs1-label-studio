/**
 * GS1 element strings in bracketed form, "(01)09506000134352(10)ABC123", as AI and value pairs.
 *
 * A minimal parser for the printer outputs; the GS1 Barcode Syntax Engine takes over input and validation (backlog
 * item 1.1). It does not accept a "(" in a value followed by digits and ")": GS1's bracketed syntax escapes those.
 */
export interface Element {
  ai: string;
  value: string;
}

export function parseElementString(text: string): Element[] {
  const elements: Element[] = [];
  for (const match of text.matchAll(/\((\d{2,4})\)([^(]*)/g)) elements.push({ ai: match[1]!, value: match[2]! });
  const rebuilt = elements.map((element) => `(${element.ai})${element.value}`).join("");
  if (rebuilt !== text) throw new Error(`not a bracketed element string: ${text}`);
  return elements;
}

/**
 * The AIs whose element strings have a predefined length (GS1 General Specifications, figure 7.8.5-2): by their first
 * two digits, the length of AI and value together. Every other element string is followed by FNC1 unless it is last.
 */
const PREDEFINED_LENGTH: Record<string, number> = {
  "00": 20, "01": 16, "02": 16, "03": 16, "04": 18,
  "11": 8, "12": 8, "13": 8, "14": 8, "15": 8, "16": 8, "17": 8, "18": 8, "19": 8, "20": 4,
  "31": 10, "32": 10, "33": 10, "34": 10, "35": 10, "36": 10, "41": 16,
};

export function hasPredefinedLength(ai: string): boolean {
  return ai.slice(0, 2) in PREDEFINED_LENGTH;
}
