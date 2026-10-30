import { hasPredefinedLength, parseElementString, type Element } from "./elementString.ts";

// GS1-128 over several symbols (backlog 1.13): a symbol carries at most 48 data characters — the AIs, their data and
// the FNC1 separating a variable-length element string from the next — and is at most 165.10 mm long with its quiet
// zones (General Specifications 26.0, section 5.4.4.3). Data beyond that goes in more symbols, the key in the first and
// the element strings in their order, stacked as the GS1 Logistic Label stacks them.

export const GS1_128_MAX_DATA = 48;
export const GS1_128_MAX_MM = 165.1;

/** The data characters of element strings in one GS1-128 symbol (section 5.4.4.3). */
export function dataCharacters(elements: readonly Element[]): number {
  return elements.reduce(
    (sum, e, index) => sum + e.ai.length + e.value.length + (index < elements.length - 1 && !hasPredefinedLength(e.ai) ? 1 : 0),
    0,
  );
}

const text = (elements: readonly Element[]) => elements.map((e) => `(${e.ai})${e.value}`).join("");

/**
 * A bracketed element string as the element strings of each GS1-128 symbol: those the person chose to start a symbol
 * (`starts`, indexes of element strings after the first), else as many as fit, in order — within 48 data characters
 * and, when `fits` is given, within what it says fits (the layout's 165.10 mm). A `RangeError` when one element string,
 * or a symbol chosen, has more than 48 data characters.
 */
export function splitGs1128(elementString: string, starts?: readonly number[], fits?: (elementString: string) => boolean): string[] {
  const elements = parseElementString(elementString);
  const parts: Element[][] = [];
  if (starts) {
    let from = 0;
    for (const at of [...new Set(starts)].filter((i) => i > 0 && i < elements.length).sort((a, b) => a - b).concat(elements.length)) {
      parts.push(elements.slice(from, at));
      from = at;
    }
  } else {
    for (const element of elements) {
      const last = parts.at(-1);
      if (last && dataCharacters([...last, element]) <= GS1_128_MAX_DATA && (!fits || fits(text([...last, element])))) last.push(element);
      else parts.push([element]);
    }
  }
  for (const part of parts) {
    const count = dataCharacters(part);
    if (count > GS1_128_MAX_DATA) {
      throw new RangeError(`A GS1-128 symbol carries at most ${GS1_128_MAX_DATA} data characters (GS1 General Specifications ` +
        `5.4.4.3); ${text(part)} has ${count}.`);
    }
  }
  return parts.map(text);
}
