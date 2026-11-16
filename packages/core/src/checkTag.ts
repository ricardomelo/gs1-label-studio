import { COMPANY_START, type AddFinding, type CheckContext } from "./checkValues.ts";
import { decodeEpc } from "./epc.ts";
import { decodeEpcPlus } from "./epcPlus.ts";
import { gcpLengthOf } from "./gcp.ts";
import type { Reading } from "./reading.ts";

// The Check Studio's checks of an RFID tag's EPC (backlog 7.1 d; the check studio's project, section 4, group I): a
// header that is no GS1 scheme, or one whose fields do not decode (I1); fields that contradict each other or the GCP
// table (I2). What decodes becomes element strings, which check() then sends through the engine and the own rules like
// any other data, and which the group's matrix compares with the barcodes (checkGroup.ts).

/** What the tag's EPC says besides its element strings. */
export interface TagEpc {
  /** Lower case, as in the tag URI: "sgtin-96"; for an EPC+, the scheme and its form: "sgtin+", "dsgtin++". */
  scheme: string;
  filter: number;
  /** The company prefix's length the partition says; null for an EPC+, which has no partition. */
  prefixLength: number | null;
  /** The GS1 Digital Link URI the EPC means. */
  digitalLink: string;
  /** An EPC '++': the hostname it carries. */
  hostname?: string;
}

export interface TagOutcome {
  /** The key, its qualifiers, a DSGTIN's date and the +AIDC data, in the order the tag holds them. */
  elements: [string, string][];
  epc: TagEpc | null;
  notChecked: string[];
}

/** The headers of the classic GS1 schemes (TDS 2.3, table 14-1): GDTI-96 at 0x2C to ITIP-212 at 0x41. */
const isClassicGs1Header = (header: number) => header >= 0x2c && header <= 0x41;
/** The headers of the EPC '+' and '++' schemes (TDS 14.2): 0xE6 to 0xFD. */
const isPlusHeader = (header: number) => header >= 0xe6 && header <= 0xfd;

/** The SGTIN filter values TDS reserves (table 10-2: 3 and 5). */
const RESERVED_SGTIN_FILTERS = new Set([3, 5]);

/** Checks an RFID reading's EPC, adds group I's findings and returns what it decodes to. */
export function checkTag(reading: Reading, context: CheckContext, add: AddFinding): TagOutcome {
  const text = reading.text;
  const isHex = /^[0-9A-F]+$/.test(text);
  const header = isHex ? parseInt(text.slice(0, 2), 16) : NaN;
  let epc: TagEpc | null = null;
  let elements: [string, string][] = [];
  if (isHex && isPlusHeader(header)) {
    try {
      const plus = decodeEpcPlus(text);
      if (plus) {
        epc = { scheme: plus.scheme.toLowerCase(), filter: plus.filter, prefixLength: null, digitalLink: plus.digitalLink, ...(plus.hostname ? { hostname: plus.hostname } : {}) };
        elements = [...plus.elements, ...(plus.data ?? [])];
      }
    } catch {
      // a GS1 header whose fields do not decode: I1 below, as an Error
    }
  } else if (context.epcSchemes) {
    const classic = decodeEpc(context.epcSchemes, text);
    if (classic) {
      epc = { scheme: classic.scheme, filter: classic.filter, prefixLength: classic.prefixLength, digitalLink: classic.digitalLink };
      elements = classic.elements;
    }
  } else if (!isHex || isClassicGs1Header(header)) {
    // a classic EPC cannot be read without the schemes
    return { elements: [], epc: null, notChecked: ["I1", "I2"] };
  }
  if (!epc) {
    const gs1 = isHex ? isClassicGs1Header(header) || isPlusHeader(header) : /^urn:epc:(?:tag|id):/.test(text);
    add("I1", [], gs1 ? { severity: "error", details: { header: isHex ? text.slice(0, 2) : "" } } : { details: { header: isHex ? text.slice(0, 2) : "" } });
    return { elements: [], epc: null, notChecked: [] };
  }

  const notChecked: string[] = [];
  const [ai, value] = elements[0] ?? ["", ""];
  const reservedFilter = /^sgtin/.test(epc.scheme) && RESERVED_SGTIN_FILTERS.has(epc.filter);
  if (reservedFilter) add("I2", [], { ai, details: { field: "filter", filter: String(epc.filter) } });
  if (epc.prefixLength !== null) {
    const start = COMPANY_START[ai];
    if (start === undefined) {
      // a key without a company prefix of fixed place
    } else if (context.gcp) {
      const expected = gcpLengthOf(context.gcp, value.slice(start));
      if (expected !== null && expected !== 0 && expected !== epc.prefixLength) {
        add("I2", [], { ai, details: { field: "partition", prefixLength: String(epc.prefixLength), expected: String(expected) } });
      }
    } else if (!reservedFilter) notChecked.push("I2"); // the partition, against no table
  }
  return { elements, epc, notChecked };
}
