import { dataAttributes, elementStringAttributes, formatHint, pathAis, type Attribute, type Component } from "./dictionary.ts";

/**
 * Data attributes — informative AIs (expiry date, net weight, price…) beside the identification (backlog item 1.9):
 * in the query string of a GS1 Digital Link URI, or after the key and its qualifiers in an element string. Ported from
 * the resolver's `portal/syntax.py` and the attribute rows of its editor (ADR 0004): the AIs offered, decimal families
 * typed as people write numbers ("0,5" kg), day 00 refused, and the messages. The GS1 Barcode Syntax Engine then checks
 * formats, check digits, dates and associations.
 */
export interface Offered extends Attribute {
  /** A decimal family ("310n"): its members' fourth digit is the number of decimal places. */
  family?: boolean;
  members?: string[];
  decimals?: number;
}

/** An offered AI chosen as a member of a family ("3103": three decimal places). */
export interface Resolved extends Offered {
  fixedDecimals?: number;
}

/** A refusal with the resolver's code, its parameters and the English text. */
export class AttributeError extends Error {
  constructor(
    readonly code: string,
    readonly params: Record<string, string | number> = {},
  ) {
    super(message(code, params));
    this.name = "AttributeError";
  }
}

const MESSAGES: Record<string, string> = {
  "attr.tooMany": "Use at most {max} attributes: each one makes the symbol larger.",
  "attr.unknown": "({ai}) is not a GS1 Application Identifier.",
  "attr.inPath": "({ai}) is part of the identification, not an attribute: enter it with the key's qualifiers.",
  "attr.duplicate": "Attribute ({ai}) appears more than once.",
  "attr.valueRequired": "Enter the value of attribute ({ai}).",
  "attr.decimalSeparator": "({ai}): use a single decimal separator, comma or point, without thousands separators (e.g. 1234.5).",
  "attr.decimals": "({ai}): at most {max} decimal places.",
  "attr.tooManyDigits": "({ai}): at most {max} digits, decimal places included.",
  "attr.notNumber": "({ai}): enter a number, with a comma or point before the decimal places.",
  "attr.dayZero": "({ai}): day 00 (“end of month”) is not accepted. Use the first day ({first}) or the last day of the month ({last}).",
};

function message(code: string, params: Record<string, string | number>): string {
  return (MESSAGES[code] ?? code).replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ""));
}

export const MAX_ATTRIBUTES = 100;
/** Offered first in the list, as in the resolver's editor. */
export const COMMON_ATTRIBUTES = ["17", "15", "11", "13", "16", "7003", "310n", "392n", "30", "422", "02", "37", "10"];

/**
 * AIs whose fourth digit gives the number of decimal places — measures 31nn-36nn, amounts and prices 39nn — grouped as
 * the GS1 General Specifications write them: 310n NET WEIGHT (kg) for 3100-3105.
 */
export function decimalFamilies(attributes: Record<string, Attribute>): Record<string, Offered> {
  const families: Record<string, Offered> = {};
  for (const [code, attribute] of Object.entries(attributes)) {
    if (code.length === 4 && ["31", "32", "33", "34", "35", "36", "39"].includes(code.slice(0, 2))) {
      const key = code.slice(0, 3) + "n";
      const family = (families[key] ??= {
        ai: key, title: attribute.title, components: attribute.components, members: [], decimals: 0, family: true,
      });
      family.members!.push(code);
      family.decimals = Math.max(family.decimals!, Number(code[3]));
    }
  }
  return families;
}

const ATTRIBUTES = dataAttributes();
const ELEMENT_STRING = elementStringAttributes();
const FAMILIES = decimalFamilies(ATTRIBUTES);
const PATH_AIS = pathAis();
const MEMBERS = new Set(Object.values(FAMILIES).flatMap((f) => f.members!));

/** The AIs offered as attributes, families in place of their members, sorted as the resolver's list. */
export function offeredAttributes(): Offered[] {
  const offered: Offered[] = [
    ...Object.values(ATTRIBUTES).filter((a) => !MEMBERS.has(a.ai)),
    ...Object.values(FAMILIES),
  ];
  // Python's sort by the tuple (first two characters, AI): string comparison as Python's, by code point
  return offered.sort((a, b) => cmp(a.ai.slice(0, 2), b.ai.slice(0, 2)) || cmp(a.ai, b.ai));
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The attributes for a key: its own AI and its qualifiers go in the identification, so they are not offered. Besides
 * the resolver's (the GS1 Digital Link attributes), those of element strings only, marked so (backlog 1.11).
 */
export function attributesForKey(key: string): Offered[] {
  const inPath = new Set([key, ...(PATH_AIS[key] ?? [])]);
  return [...offeredAttributes(), ...Object.values(ELEMENT_STRING)]
    .filter((a) => !inPath.has(a.ai))
    .sort((a, b) => cmp(a.ai.slice(0, 2), b.ai.slice(0, 2)) || cmp(a.ai, b.ai));
}

/** An offered AI, a decimal family ("310n") or a member of one ("3103": 3 decimals, typed in the list). */
export function attributeByCode(code: string): Resolved | undefined {
  const found = ATTRIBUTES[code] && !MEMBERS.has(code) ? ATTRIBUTES[code] : (FAMILIES[code] ?? ELEMENT_STRING[code]);
  if (found || !/^\d{4}$/.test(code)) return found;
  const family = FAMILIES[code.slice(0, 3) + "n"];
  return family && Number(code[3]) <= family.decimals!
    ? { ...family, ai: code, family: false, fixedDecimals: Number(code[3]) }
    : undefined;
}

/** The format hint under an attribute's value, as the resolver's editor wrote it. */
export function attributeHint(attribute: Resolved): string {
  const last = attribute.components.at(-1)!;
  const prefix = attribute.components.length > 1 ? "ISO 4217 currency code (e.g. 826) followed by the " : "";
  if (attribute.family) {
    return `${prefix}number with up to ${attribute.decimals} decimal places, after a comma or point (e.g. 123.45); ` +
      `up to ${last.max} digits in all`;
  }
  if (attribute.fixedDecimals !== undefined) {
    return `${prefix}${attribute.fixedDecimals} decimal places: type with a comma or point (e.g. 1.5) or the digits only`;
  }
  return formatHint(attribute.components);
}

const DECIMAL_SEPARATORS = /[.,]/g;

/**
 * AIs whose last digit is the number of decimal places (310n net weight, 392n price…) as people write numbers: "310n"
 * with "123,45" becomes (3102) 012345; a member such as "3922" with "12,5" becomes (3922) 1250. Comma or point is the
 * decimal separator (a single one, no thousands separator); digits without a separator keep the GS1 meaning. Anything
 * else is left unchanged.
 */
export function resolveDecimal(ai: string, value: string): [string, string] {
  const familyCode = ai in FAMILIES ? ai : ai.slice(0, 3) + "n" in FAMILIES ? ai.slice(0, 3) + "n" : null;
  if (!familyCode || !value) return [ai, value];
  const family = FAMILIES[familyCode]!;
  const fixed = ai === familyCode ? null : Number(ai[3]); // decimals of a member chosen directly
  const prefixLength = family.components.slice(0, -1).reduce((sum, c) => sum + c.max, 0); // e.g. 393n's ISO 4217 code
  const compact = value.replace(/ /g, "");
  const prefix = compact.slice(0, prefixLength);
  const number = compact.slice(prefixLength);
  const separators = number.match(DECIMAL_SEPARATORS) ?? [];
  if (separators.length > 1) throw new AttributeError("attr.decimalSeparator", { ai });
  let whole: string;
  let fraction: string;
  if (!separators.length) {
    if (fixed !== null) return [ai, value]; // GS1 digits as typed
    [whole, fraction] = [number, ""];
  } else {
    [whole, fraction] = number.split(DECIMAL_SEPARATORS) as [string, string];
  }
  const digitsOnly = (s: string) => /^[0-9]+$/.test(s);
  if (!digitsOnly(whole + fraction) || (prefixLength && !digitsOnly(prefix))) {
    throw new AttributeError("attr.notNumber", { ai });
  }
  const decimals = fixed === null ? fraction.length : fixed;
  if (fraction.length > decimals || decimals > family.decimals!) {
    throw new AttributeError("attr.decimals", { ai, max: fixed === null ? family.decimals! : fixed });
  }
  let digits = (whole.replace(/^0+/, "") + fraction.padEnd(decimals, "0")).replace(/^0+/, "") || "0";
  const last = family.components.at(-1)!;
  if (digits.length > last.max) throw new AttributeError("attr.tooManyDigits", { ai, max: last.max });
  if (last.min === last.max) digits = digits.padStart(last.max, "0");
  return [`${familyCode.slice(0, 3)}${decimals}`, prefix + digits];
}

/**
 * GS1 allows day 00 in some dates (yymmd0: 17, 15, 11…) to mean "end of the month". Refused, as the resolver did: a
 * reader of the label, or a system receiving the data, may not know the convention; the first or last day of the
 * month says the same without ambiguity.
 */
export function refuseDayZero(ai: string, value: string, components: Component[]): void {
  let offset = 0;
  for (const component of components) {
    if (component.min !== component.max) return; // offsets after a variable-length part are unknown
    const date = value.slice(offset, offset + 6);
    const month = Number(date.slice(2, 4));
    if (component.linters.includes("yymmd0") && /^[0-9]{6}$/.test(date) && date.endsWith("00") && month >= 1 && month <= 12) {
      const year = 2000 + Number(date.slice(0, 2)); // the century does not change leap years here
      const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
      throw new AttributeError("attr.dayZero", { ai, first: date.slice(0, 4) + "01", last: `${date.slice(0, 4)}${String(last).padStart(2, "0")}` });
    }
    offset += component.max;
  }
}

/** The components of any AI the dictionary knows (attributes and the others), for day-zero checks. */
export function attributeComponents(ai: string): Component[] | undefined {
  return ATTRIBUTES[ai]?.components;
}
