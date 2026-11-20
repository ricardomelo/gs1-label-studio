import { describe, expect, it } from "vitest";
import { bankFor, EPC_CHOICES, epcOf, epcSchemes, parseGcpTable, tagFor, type EpcChoices, type Identification } from "../src/index.ts";

// The EPC with the person's choices (backlog 5.1 b moved it from the page into the core for gs1ls epc): the editor's
// card, the RFID Studio and the command line give the same EPC and the same reasons.

const schemes = await epcSchemes();
const gtin: Identification = { key: "01", value: "09506000134352", qualifiers: { "21": "12345" }, attributes: [["17", "271231"], ["10", "B42"]] };
const choices = (more: Partial<EpcChoices> = {}): EpcChoices => ({ ...EPC_CHOICES, ...more });
const gcp = parseGcpTable('<GCPPrefixFormatList date="2026-01-01T00:00:00Z"><entry prefix="950" gcpLength="7"/><entry prefix="951" gcpLength="0"/></GCPPrefixFormatList>');

describe("epcOf", () => {
  it("encodes the classic EPC with the prefix length chosen, the key's filter by default", () => {
    const { result, filter } = epcOf({ id: gtin, stem: "", gcp: null, choices: choices({ prefix: 7 }) }, schemes);
    expect(filter).toBe(1);
    expect(result.epc?.pureIdentity).toBe("urn:epc:id:sgtin:9506000.013435.12345");
    expect(result.epc?.tagUri).toBe("urn:epc:tag:sgtin-96:1.9506000.013435.12345");
    expect(result.source).toBe("");
  });

  it("takes the prefix length from GS1's list and says so; a range that is no prefix, or none listed, gives the reason", () => {
    expect(epcOf({ id: gtin, stem: "", gcp, choices: choices() }, schemes).result.source).toBe("A company prefix of 7 digits, from GS1's list of 2026-01-01.");
    const notGcp = { ...gtin, value: "09516000134359" };
    expect(epcOf({ id: notGcp, stem: "", gcp, choices: choices() }, schemes).result.message).toMatch(/^GS1's list says this key's range is not a GS1 Company Prefix/);
    const unlisted = { ...gtin, value: "04012345000016" };
    expect(epcOf({ id: unlisted, stem: "", gcp, choices: choices() }, schemes).result.message).toBe("GS1's list of 2026-01-01 has no entry for this key: choose the company prefix length.");
    expect(epcOf({ id: gtin, stem: "", gcp: null, choices: choices() }, schemes).result.message).toBe("Choose the company prefix length, or load GS1's GCP length table.");
  });

  it("names what the key lacks before anything else, and a key with no EPC scheme", () => {
    const noSerial = { ...gtin, qualifiers: {} };
    expect(epcOf({ id: noSerial, stem: "", gcp: null, choices: choices({ prefix: 7 }) }, schemes).result.message).toBe("This key's EPC needs its qualifier (21), such as the serial number.");
    const gsin: Identification = { key: "402", value: "95060001343500001", qualifiers: {}, attributes: [] };
    expect(epcOf({ id: gsin, stem: "", gcp: null, choices: choices() }, schemes).result.message).toBe("This key has no EPC scheme in the EPC Tag Data Standard.");
  });

  it("writes an EPC+ that decodes to the GS1 Digital Link URI, with +AIDC data and a DSGTIN's date when chosen", () => {
    const elements: [string, string][] = [["01", "09506000134352"], ["21", "12345"], ["17", "271231"], ["10", "B42"]];
    const plain = epcOf({ id: gtin, stem: "", gcp: null, elements, choices: choices({ form: "+" }) }, schemes);
    expect(plain.result.link).toBe("https://id.gs1.org/01/09506000134352/21/12345");
    expect(plain.result.after).toEqual([["17", "271231"], ["10", "B42"]]);
    const withData = epcOf({ id: gtin, stem: "", gcp: null, elements, choices: choices({ form: "+", withData: true }) }, schemes);
    expect(withData.result.plus!.bits).toBeGreaterThan(plain.result.plus!.bits);
    const dated = epcOf({ id: gtin, stem: "", gcp: null, elements, choices: choices({ form: "+", date: "17" }) }, schemes);
    expect(dated.date).toEqual(["17", "271231"]);
    expect(dated.result.after).toEqual([["10", "B42"]]);
    const plusPlus = epcOf({ id: gtin, stem: "https://example.com/", gcp: null, elements, choices: choices({ form: "++" }) }, schemes);
    expect(plusPlus.hostname).toBe("example.com");
    expect(plusPlus.result.link).toBe("https://example.com/01/09506000134352/21/12345");
  });
});

describe("tagFor and bankFor", () => {
  it("gives the row's bank and URIs, the tag URI with the control fields step 3's bits set", () => {
    const { result } = epcOf({ id: gtin, stem: "", gcp: null, choices: choices({ prefix: 7 }) }, schemes);
    const tag = tagFor(4, result, { umi: true, hazmat: true });
    expect(tag.row).toBe(4);
    expect(tag.bank?.bits).toBe(96);
    expect(tag.identity).toBe("urn:epc:id:sgtin:9506000.013435.12345");
    expect(tag.tagUri).toMatch(/^urn:epc:tag:\[att=x01\]\[umi=1\]:sgtin-96:/);
    expect(tagFor(4, result, { umi: false, hazmat: false }).tagUri).toBe("urn:epc:tag:sgtin-96:1.9506000.013435.12345");
  });

  it("gives the reason when there is no EPC, and refuses an EPC larger than the memory", () => {
    expect(tagFor(2, { message: "Why" }, EPC_CHOICES)).toEqual({ row: 2, error: "Why" });
    expect(tagFor(2, {}, EPC_CHOICES)).toEqual({ row: 2, error: "No EPC for this row." });
    const huge = { plus: { hex: "0".repeat(128), bits: 512, header: "", elements: [] } } as never;
    expect(bankFor(huge, EPC_CHOICES)).toBeNull();
    expect(tagFor(3, huge, EPC_CHOICES).error).toBe("More than the 496 bits (31 words) an EPC memory can hold.");
  });
});
