import { attributeByCode, attributeComponents, AttributeError, MAX_ATTRIBUTES, resolveDecimal, refuseDayZero } from "./attributes.ts";
import { checkDigit } from "./checkDigit.ts";
import { aiEntry, exclusiveQualifiers, pathAis, qualifiersOf } from "./dictionary.ts";
import { InputError, type ParsedInput, type SyntaxEngine } from "./syntax.ts";

/**
 * What a code identifies, as the editor's fields hold it: a primary key and its value, the key's qualifiers (variant,
 * batch, serial…) and data attributes in the order chosen — the resolver's editor (ADR 0004), without its records.
 * `identify()` turns it into the element string and the GS1 Digital Link URI through the GS1 Barcode Syntax Engine;
 * `fieldsOf()` turns what someone pasted back into fields.
 */
export interface Identification {
  key: string;
  value: string;
  /** Qualifier AI → value; empty values are left out. */
  qualifiers: Record<string, string>;
  /** [AI as chosen (e.g. "310n"), value as typed (e.g. "0,5")], in order. */
  attributes: [string, string][];
  /**
   * The GS1 Digital Link URI's own parameters, [name, value] after the data attributes in its query string (backlog
   * 1.17); never in element strings. A name made only of digits is refused: those are AIs.
   */
  parameters?: [string, string][];
}

export interface Identified extends ParsedInput {
  /** The attributes as they went in: [AI, value] after decimal resolution ("310n", "0,5" → "3101", "000005"). */
  resolvedAttributes: [string, string][];
}

const PATH_AIS = pathAis();

/** A refusal of the key's value, with the expected check digit when that is what is wrong. */
export function checkKeyValue(key: string, value: string): string | null {
  const entry = aiEntry(key);
  if (!entry) return `Unknown key (${key}).`;
  const first = entry.components[0];
  if (!value) return "Enter the identifier.";
  if (first && first.type === "N" && first.min === first.max && entry.components.length === 1) {
    if (!/^[0-9]+$/.test(value)) return "Use digits only.";
    if (value.length !== first.max) return `${value.length} digits entered; this identifier has ${first.max}.`;
    if (first.linters.includes("csum")) {
      const expected = checkDigit(value.slice(0, -1));
      if (String(expected) !== value.at(-1)) return `The check digit does not match: it should be ${expected}.`;
    }
  }
  return null;
}

/**
 * The element string of the identification, in order — key, qualifiers in path order, attributes —, after the
 * resolver's checks on the attributes as chosen ("392n", "17": names the user sees), then decimal conversion.
 */
export function elementStringOf(id: Identification): { elementString: string; resolved: [string, string][] } {
  const inPath = new Set([id.key, ...(PATH_AIS[id.key] ?? [])]);
  const attributes = id.attributes.filter(([ai, value]) => ai || value).map(([ai, value]) => [ai || "?", value.trim()] as [string, string]);
  if (attributes.length > MAX_ATTRIBUTES) throw new AttributeError("attr.tooMany", { max: MAX_ATTRIBUTES });
  const seen = new Set<string>();
  for (const [ai, value] of attributes) {
    if (inPath.has(ai)) throw new AttributeError("attr.inPath", { ai });
    if (!attributeByCode(ai) && !aiEntry(ai)) throw new AttributeError("attr.unknown", { ai });
    if (seen.has(ai)) throw new AttributeError("attr.duplicate", { ai });
    seen.add(ai);
    if (!value) throw new AttributeError("attr.valueRequired", { ai });
  }
  const chosen = new Set<string>();
  const resolved = attributes.map(([ai, value]) => {
    const [code, digits] = resolveDecimal(ai, value);
    if (chosen.has(code)) throw new AttributeError("attr.duplicate", { ai }); // 310n twice, both with the same decimals
    chosen.add(code);
    const components = attributeComponents(code) ?? aiEntry(code)?.components;
    if (components) refuseDayZero(code, digits, components);
    return [code, digits] as [string, string];
  });
  const escape = (value: string) => value.replace(/\(/g, "\\(");
  const filled = qualifiersOf(id.key).filter((ai) => id.qualifiers[ai]?.trim());
  for (const a of filled) {
    const other = filled.find((b) => b !== a && exclusiveQualifiers(id.key, a, b));
    if (other) {
      throw new InputError(
        `Qualifiers (${a}) and (${other}) cannot be used together: ` +
          `(${id.key}) takes ${(aiEntry(id.key)?.dlpkey ?? []).map((seq) => seq.join(", ")).join(" or ")}.`,
      );
    }
  }
  const qualifiers = filled
    .map((ai) => `(${ai})${escape(id.qualifiers[ai]!.trim())}`);
  const elementString =
    `(${id.key})${escape(id.value.trim())}` + qualifiers.join("") + resolved.map(([ai, v]) => `(${ai})${escape(v)}`).join("");
  return { elementString, resolved };
}

/** A GTIN typed in its own length (8, 12 or 13 digits) as the GTIN-14 the element string carries. */
export function normaliseKeyValue(key: string, value: string): string {
  const trimmed = value.trim();
  return (key === "01" || key === "02") && /^([0-9]{8}|[0-9]{12,13})$/.test(trimmed) ? trimmed.padStart(14, "0") : trimmed;
}

/** The identification checked by the GS1 Barcode Syntax Engine: element string, elements with titles, URI. */
export function identify(engine: SyntaxEngine, id: Identification, stem: string | null = null): Identified {
  const value = normaliseKeyValue(id.key, id.value);
  const keyProblem = checkKeyValue(id.key, value);
  if (keyProblem) throw new InputError(keyProblem);
  const { elementString, resolved } = elementStringOf({ ...id, value });
  const parsed = engine.parse(elementString, stem);
  const parameters = (id.parameters ?? []).filter(([name, v]) => name || v);
  if (parameters.length) {
    const problem = parametersProblem(parameters);
    if (problem) throw new InputError(problem);
    if (parsed.digitalLinkUri) parsed.digitalLinkUri = withParameters(parsed.digitalLinkUri, parameters);
  }
  return { ...parsed, resolvedAttributes: resolved };
}

/** What is wrong with the URI's own parameters, or null: a name missing, made only of digits, or given twice. */
export function parametersProblem(parameters: readonly (readonly [string, string])[]): string | null {
  const seen = new Set<string>();
  for (const [raw] of parameters) {
    const name = raw.trim();
    if (!name) return "A parameter of the URI needs a name.";
    if (/^\d+$/.test(name)) return `The parameter "${name}" is made of digits only: such names are GS1 Application Identifiers. Add it as a data attribute, or choose a name with a letter.`;
    if (seen.has(name)) return `The parameter "${name}" is given twice.`;
    seen.add(name);
  }
  return null;
}

/**
 * The URI with its own parameters after the data attributes, names and values percent-encoded (RFC 3986, as the GS1
 * Digital Link standard asks of the query string).
 */
export function withParameters(uri: string, parameters: readonly (readonly [string, string])[]): string {
  const query = parameters.map(([name, value]) => `${encodeURIComponent(name.trim())}=${encodeURIComponent(value)}`).join("&");
  return query ? `${uri}${uri.includes("?") ? "&" : "?"}${query}` : uri;
}

/**
 * The parameters of a pasted GS1 Digital Link URI that are not AIs, decoded, in order: the Syntax Engine leaves them
 * out, so the editor takes them from the text itself.
 */
export function uriParameters(text: string): [string, string][] {
  const trimmed = text.trim();
  if (!/^https?:\/\//i.test(trimmed)) return [];
  const at = trimmed.indexOf("?");
  if (at < 0) return [];
  const decode = (part: string) => {
    try {
      return decodeURIComponent(part.replace(/\+/g, " "));
    } catch {
      return part;
    }
  };
  return trimmed.slice(at + 1).split("#")[0]!.split("&").filter(Boolean).map((pair) => {
    const eq = pair.indexOf("=");
    return [decode(eq < 0 ? pair : pair.slice(0, eq)), eq < 0 ? "" : decode(pair.slice(eq + 1))] as [string, string];
  }).filter(([name]) => name && !/^\d+$/.test(name));
}

/**
 * The fields of what someone pasted: the first primary key is the key, the AIs of its path its qualifiers, the rest
 * attributes in the order given. Attributes keep their GS1 form ("3103", "000500"), which the fields show as typed.
 */
export function fieldsOf(parsed: ParsedInput): Identification {
  const key = parsed.elements.find((e) => aiEntry(e.ai)?.dlpkey)?.ai ?? parsed.elements[0]?.ai ?? "01";
  const inPath = PATH_AIS[key] ?? new Set<string>();
  const id: Identification = { key, value: "", qualifiers: {}, attributes: [] };
  for (const e of parsed.elements) {
    if (e.ai === key && !id.value) id.value = e.value;
    else if (inPath.has(e.ai) && !(e.ai in id.qualifiers)) id.qualifiers[e.ai] = e.value;
    else id.attributes.push([e.ai, e.value]);
  }
  return id;
}

/**
 * The qualifiers and the data attributes as one list of rows, [AI, value] in the order shown (backlog 1.15, the owner's
 * idea of 30 October 2026): the key's qualifiers first, in the order of its GS1 Digital Link path, then the attributes.
 */
export function rowsOf(id: Identification): [string, string][] {
  const qualifiers = qualifiersOf(id.key).filter((ai) => ai in id.qualifiers).map((ai) => [ai, id.qualifiers[ai]!] as [string, string]);
  return [...qualifiers, ...id.attributes];
}

/**
 * Rows of the one list as the identification's qualifiers and attributes: a row whose AI is a qualifier of the key is
 * that qualifier, which the path places in its own order whatever the row's place; any other row, and a qualifier given
 * a second time, is an attribute (refused there with its reason).
 */
export function splitRows(key: string, rows: readonly (readonly [string, string])[]): Pick<Identification, "qualifiers" | "attributes"> {
  const own = new Set(qualifiersOf(key));
  const qualifiers: Record<string, string> = {};
  const attributes: [string, string][] = [];
  for (const [ai, value] of rows) {
    if (own.has(ai) && !(ai in qualifiers)) qualifiers[ai] = value;
    else attributes.push([ai, value]);
  }
  return { qualifiers, attributes };
}

/**
 * Other keys carried beside a key in one element string (backlog 1.12), as the GS1 General Specifications 26.0 pair
 * them: a logistic unit's SSCC with what it contains (section 3.2's (02) and (37); table 4-5: (02) needs (00) and (37))
 * or with the GTIN of the unit when it is itself a trade item, and with the transport keys of section 3.9; a trade item
 * that is also an asset, such as a returnable keg. The Syntax Engine checks the pairs (tables 4-4 and 4-5); in a GS1
 * Digital Link URI the other keys go to the query string.
 */
export const OTHER_KEYS: Readonly<Record<string, readonly { ais: readonly string[]; what: string }[]>> = {
  "00": [
    { ais: ["02", "37"], what: "the GTIN of the trade items it contains, and their count" },
    { ais: ["01"], what: "a GTIN, when the logistic unit is itself a trade item" },
    { ais: ["8026", "37"], what: "the ITIP of the trade item pieces it contains, and their count" },
    { ais: ["401"], what: "the consignment (GINC)" },
    { ais: ["402"], what: "the shipment (GSIN)" },
    { ais: ["403"], what: "a routing code" },
    { ais: ["410"], what: "the ship-to location (GLN)" },
  ],
  "01": [
    { ais: ["8003"], what: "a GRAI, when the trade item is also a returnable asset, such as a keg" },
    { ais: ["8004"], what: "a GIAI, when the trade item is also an individual asset" },
  ],
};

/** Whether an AI is a GS1 key (a GS1 Digital Link primary key, or a key of element strings only such as (02) or (03)). */
export function isKey(ai: string): boolean {
  return Boolean(aiEntry(ai)?.dlpkey) || ["02", "03", "8026"].includes(ai);
}

/**
 * A row's check digit, for an AI made of one fixed run of digits ending in a check digit ((02), (410), (8017)…):
 * the reason when it does not match, null when it does or the AI has none.
 */
export function checkDigitProblem(ai: string, value: string): string | null {
  const entry = aiEntry(ai);
  const only = entry?.components.length === 1 ? entry.components[0] : undefined;
  if (!value.trim() || !only || only.type !== "N" || !only.linters.includes("csum")) return null;
  return checkKeyValue(ai, value.trim());
}
