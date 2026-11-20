// The EPC of one identification with the person's choices (backlog 6.7, 6.12; moved from the page for gs1ls, backlog
// 5.1 b): the scheme (classic, EPC+ or EPC++), the company prefix's length or GS1's GCP length table, a DSGTIN's date,
// the filter, +AIDC data, and the StoredPC's bits. The editor's card, the RFID Studio (one tag and many) and gs1ls epc
// share it; its messages are in English, which the page translates (tm).

import { companyPart, defaultFilter, encodeEpc, EpcError, EPC_QUALIFIERS, epcMissing, KEY_SCHEMES, type EpcScheme } from "./epc.ts";
import { decodeEpcPlus, encodeEpcPlus, PLUS_KEYS, PRIORITISED_DATES } from "./epcPlus.ts";
import { gcpLengthOf, type GcpTable } from "./gcp.ts";
import { normaliseKeyValue, type Identification } from "./identify.ts";
import type { RfidTagRow } from "./rfidBatch.ts";
import { EPC_MEMORY_LIMITS, epcBank, type EpcBank } from "./tagMemory.ts";

export type EpcForm = "classic" | "+" | "++";

/** What the person chooses for the EPC, kept by the application so that the editor's card and the RFID Studio agree. */
export interface EpcChoices {
  form: EpcForm;
  /** The company prefix's length; null: from GS1's GCP length table. */
  prefix: number | null;
  /** The filter value; null: the key's usual one (`defaultFilter`). */
  filter: number | null;
  /** The AI of the date a DSGTIN carries before its GTIN (EPC+ and EPC++ of a GTIN); "" for none. */
  date: string;
  /** +AIDC data: the data's other element strings after an EPC+ or EPC++. */
  withData: boolean;
  /** The StoredPC's user memory indicator and hazardous material attribute bit, as the RFID Studio's step 3 sets them. */
  umi: boolean;
  hazmat: boolean;
}

export const EPC_CHOICES: EpcChoices = { form: "classic", prefix: null, filter: null, date: "", withData: false, umi: false, hazmat: false };

export interface EpcInput {
  id: Identification;
  /** The GS1 Digital Link URI's domain, whose hostname an EPC++ carries; https://id.gs1.org when empty. */
  stem: string;
  gcp: GcpTable | null;
  /** The data's element strings as the barcode carries them, for +AIDC data after an EPC+ (backlog 6.7 B). */
  elements?: [string, string][];
  choices: EpcChoices;
}

export interface EpcResult {
  /** Why there is no EPC, in English. */
  message?: string;
  epc?: ReturnType<typeof encodeEpc>;
  /** Where the company prefix's length came from, in English, when GS1's list gave it. */
  source?: string;
  plus?: ReturnType<typeof encodeEpcPlus>;
  /** The GS1 Digital Link URI an EPC+ or EPC++ decodes to. */
  link?: string;
  /** +AIDC data the EPC+ can carry, and the reasons for those it cannot. */
  after?: [string, string][];
  left?: string[];
}

export interface EpcOutcome {
  result: EpcResult;
  filter: number;
  base: string;
  hostname: string;
  /** The data's dates a DSGTIN can put first, as six digits, and the one chosen. */
  dates: [string, string][];
  date: [string, string] | undefined;
}

const message = (code: string, params?: Record<string, string | number>) => new EpcError(code, params).message;

/** The EPC of one identification with the choices; the schemes are `epcSchemes()`'s. */
export function epcOf({ id, stem, gcp, elements = [], choices }: EpcInput, schemes: Record<string, EpcScheme>): EpcOutcome {
  const { form, prefix: prefixChoice, withData } = choices;
  const value = normaliseKeyValue(id.key, id.value);
  const filter = choices.filter ?? defaultFilter(id.key);
  const base = (stem.trim() || "https://id.gs1.org").replace(/\/$/, "");
  const hostname = (() => {
    try {
      return new URL(base).hostname;
    } catch {
      return "";
    }
  })();
  const dates = id.key === "01" ? id.attributes.filter(([ai, v]) => (PRIORITISED_DATES as readonly string[]).includes(ai) && /^\d{6}$/.test(v.trim())) : [];
  const date = dates.find(([ai]) => ai === choices.date);

  const result = ((): EpcResult => {
    if (!(id.key in KEY_SCHEMES)) return { message: message("epc.unsupported") };
    const qualifiers = Object.fromEntries(Object.entries(id.qualifiers).map(([ai, v]) => [ai, v.trim()]).filter(([, v]) => v));
    // What the key lacks comes first, as the resolver's route checked it: no prefix length would help.
    const need = epcMissing(id.key, value, qualifiers);
    if (need) return { message: message(need.qualifier ? "epc.needsQualifier" : "epc.needsSerial", need as Record<string, string | number>) };
    if (form !== "classic") {
      if (!(id.key in PLUS_KEYS)) return { message: message("epc.unsupported") };
      try {
        const options = {
          form, filter, ...(form === "++" ? { hostname } : {}), ...(date ? { date: [date[0], date[1].trim()] as [string, string] } : {}),
        };
        const own: [string, string][] = [[id.key, value], ...(Object.entries(qualifiers) as [string, string][])];
        const plain = encodeEpcPlus(own, options);
        // +AIDC data: the data's other element strings, each that table F can write; the others said
        const carried = new Set([id.key, ...EPC_QUALIFIERS, ...(date ? [date[0]] : [])]);
        const after: [string, string][] = [];
        const left: string[] = [];
        for (const element of elements.filter(([ai]) => !carried.has(ai))) {
          try {
            encodeEpcPlus(own, { ...options, aidc: [element] });
            after.push(element);
          } catch (error) {
            left.push(error instanceof Error ? error.message : String(error));
          }
        }
        const plus = withData && after.length ? encodeEpcPlus(own, { ...options, aidc: after }) : plain;
        return { plus, link: decodeEpcPlus(plus.hex)?.digitalLink ?? "", after, left };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    let length = prefixChoice;
    let source = "";
    if (length === null) {
      const listed = gcp ? gcpLengthOf(gcp, companyPart(id.key, value)) : null;
      if (listed === 0) return { message: message("epc.notGcp") };
      if (!listed) return { message: gcp ? message("epc.notListed", { date: gcp.date.slice(0, 10) }) : message("epc.choosePrefix") };
      length = listed;
      source = message("epc.prefixFromList", { n: listed, date: gcp!.date.slice(0, 10) });
    }
    try {
      return { epc: encodeEpc(schemes, id.key, value, qualifiers, length, filter), source };
    } catch (error) {
      return { message: error instanceof Error ? error.message : String(error) };
    }
  })();
  return { result, filter, base, hostname, dates, date };
}

/** The EPC's hexadecimal and length, whichever form was chosen; null while there is none. */
export function epcBits(result: EpcResult): { hex: string; bits: number } | null {
  if (result.plus) return { hex: result.plus.hex, bits: result.plus.bits };
  if (result.epc) return { hex: result.epc.hex, bits: result.epc.bits.length };
  return null;
}

/** The tag's EPC bank for the EPC and the choices' StoredPC bits; null while there is no EPC or it does not fit. */
export function bankFor(result: EpcResult, choices: Pick<EpcChoices, "umi" | "hazmat">): EpcBank | null {
  const own = epcBits(result);
  if (!own || own.bits > EPC_MEMORY_LIMITS.withoutXpc) return null;
  return epcBank(own.hex, own.bits, { umi: choices.umi, attributes: choices.hazmat ? 1 : 0 });
}

/**
 * A row's tag (backlog 6.12 d): its bank with the StoredPC's bits, its identity and tag URIs (the tag URI with the
 * control fields the bits set), or why it has none: the EPC's message, or more than an EPC memory holds.
 */
export function tagFor(row: number, result: EpcResult, choices: Pick<EpcChoices, "umi" | "hazmat">): RfidTagRow {
  const bank = bankFor(result, choices);
  if (!bank) return { row, error: result.message ?? (epcBits(result) ? "More than the 496 bits (31 words) an EPC memory can hold." : "No EPC for this row.") };
  const tagUri = result.epc?.tagUri;
  const identity = result.epc?.pureIdentity ?? result.link;
  return {
    row, bank, ...(identity ? { identity } : {}),
    ...(tagUri ? { tagUri: bank.controls ? tagUri.replace(/^urn:epc:tag:/, `urn:epc:tag:${bank.controls}:`) : tagUri } : {}),
  };
}
