import { beforeAll, describe, expect, it } from "vitest";
import {
  check, checkDigit, checkGroup, encodeEpc, encodeEpcPlus, epcSchemes, guidance, leafOfEnvironment, ndefUriMessage, parseGcpTable,
  readingFromEpc, readingFromNdef, readingFromText, SPEC_SYMBOL_NAMES, SyntaxEngine, type CheckContext, type CheckResult, type EpcScheme,
  type GroupKind, type Reading,
} from "../src/index.ts";

// The Check Studio's context, tags and several carriers (backlog 7.1 d; the check studio's project, sections 3.6, 4
// and 5): group F (the symbol against the context's specification table), group I (an RFID tag's EPC, an NFC tag's
// record) and group J (several carriers of one item, compared in a matrix).

let engine: SyntaxEngine;
let schemes: Record<string, EpcScheme>;
beforeAll(async () => {
  engine = await SyntaxEngine.create();
  schemes = await epcSchemes();
});

const AT = new Date("2026-11-15T23:00:00Z");
const GS = "\u001d";
const GTIN = "09506000134352";
const withCheck = (digits: string) => digits + checkDigit(digits);
const scanned = (text: string) => readingFromText(text, { source: "wedge", at: AT });
const tagged = (hex: string) => readingFromEpc(hex, { source: "paste", at: AT });
const nfc = (uri: string) => readingFromNdef(ndefUriMessage(uri), { at: AT });
const codes = (result: CheckResult) => result.findings.map((f) => `${f.code} ${f.severity}`);
const run = (reading: Reading, context: CheckContext = {}) => check(engine, reading, { epcSchemes: schemes, ...context });
const group = (readings: Reading[], kind: GroupKind, environment?: string | null) =>
  checkGroup(readings.map((reading) => ({ reading, result: run(reading, environment === undefined ? {} : { environment }) })), kind, { environment });
const groupCodes = (g: ReturnType<typeof group>) => g.findings.map((f) => `${f.code} ${f.severity} ${f.columns.join(",")}${f.ai ? ` (${f.ai})` : ""}`);

describe("group F: the reading context", () => {
  it("the same reading gives different verdicts in different contexts, and not assessed findings without one", () => {
    const itf = scanned(`]I1${GTIN}`);
    expect([run(itf, { environment: "retail" }).verdict, codes(run(itf, { environment: "retail" }))]).toEqual(["does-not-follow", ["F1 error"]]);
    expect([run(itf, { environment: "distribution" }).verdict, codes(run(itf, { environment: "distribution" }))]).toEqual(["follows", []]);
    const unknown = run(itf, { environment: null });
    expect([unknown.verdict, codes(unknown)]).toEqual(["follows", ["F5 not-assessed"]]);
    expect(unknown.notChecked).toEqual(expect.arrayContaining(["F1", "F3"]));
    // Not asked at all (an API call without a context): the context's checks are left out
    expect(codes(run(itf))).toEqual([]);
    expect(() => run(itf, { environment: "moon" })).toThrow(/unknown-environment/);
  });

  it("F1 lists the symbols allowed for this data, recommended first, exactly as step 2 of the Label Studio does", () => {
    const qr = run(scanned(`]Q1https://id.gs1.org/01/${GTIN}/17/271231/10/ABC`), { environment: "healthcare" });
    const f1 = qr.findings.find((f) => f.code === "F1")!;
    const advice = guidance(leafOfEnvironment("healthcare")!, engine.parse(`(01)${GTIN}(17)271231(10)ABC`));
    expect(f1.details).toMatchObject({ table: "6", symbol: "QR code (GS1 Digital Link)", recommended: SPEC_SYMBOL_NAMES[advice.recommended!.symbol] });
    const allowed = f1.details!.allowed!.split(", ");
    expect(allowed[0]).toBe("GS1 DataMatrix");
    // A symbol that carries the GTIN alone comes after those that carry it all
    expect(allowed.indexOf("EAN-13")).toBeGreaterThan(allowed.indexOf("GS1-128"));
    // At a retail till a GTIN alone: the EAN-13 first, then what else the table allows
    const gs1128 = run(scanned(`]C101${GTIN}`), { environment: "retail" }).findings.find((f) => f.code === "F1")!;
    expect(gs1128.details!.recommended).toBe("EAN-13");
    expect(gs1128.details!.allowed!.split(", ")[0]).toBe("EAN-13");
  });

  it("F1 for an EAN/UPC on a logistic unit and a GS1 QR Code nowhere a table names it; a Data Matrix with a URI where GS1 DataMatrix is allowed", () => {
    expect(codes(run(scanned(`]E0${GTIN.slice(1)}`), { environment: "logistics" }))).toContain("F1 error");
    expect(codes(run(scanned(`]d1https://id.gs1.org/01/${GTIN}`), { environment: "healthcare" }))).not.toContain("F1 error");
    expect(codes(run(scanned(`]Q301${GTIN}`), { environment: "pharmacy" }))).toContain("F1 error");
    // A GS1 DataBar the decoder cannot name precisely: allowed when one of the symbols it may be is allowed
    expect(codes(run(scanned(`]e001${GTIN}`), { environment: "retail" }))).toEqual([]);
  });

  it("F2, F3, F4: attributes asked of an EAN/UPC, a 2D symbol alone at a retail till, an add-on", () => {
    expect(codes(run(scanned(`]E0${GTIN.slice(1)}`), { attributesExpected: true }))).toEqual(["F2 note"]);
    expect(codes(run(scanned(`]d201${GTIN}`), { environment: "retail" }))).toEqual(["F3 warning"]);
    expect(codes(run(scanned(`]d201${GTIN}`), { environment: "healthcare" }))).toEqual([]);
    const addOn = run(scanned(`]E3${GTIN.slice(1)}12`));
    expect([codes(addOn), addOn.findings[0]!.ranges, addOn.elements.map((e) => e.value)]).toEqual([["F4 note"], [[13, 15]], [GTIN]]);
    expect(codes(run(scanned("]E212345")))).toEqual(["F4 note"]);
    const five = run(scanned(`]E3${GTIN.slice(1)}52495`));
    expect([five.findings[0]!.ranges, five.elements.map((e) => e.value)]).toEqual([[[13, 18]], [GTIN]]);
  });
});

describe("group I: tags", () => {
  it("an SGTIN-96 decodes to its key and serial, which go through the engine and the own rules", () => {
    const epc = encodeEpc(schemes, "01", GTIN, { "21": "417" }, 7, 1);
    const result = run(tagged(epc.hex));
    expect([result.verdict, codes(result), result.elements.map((e) => `${e.ai}=${e.value}`)]).toEqual(["follows", [], [`01=${GTIN}`, "21=417"]]);
    expect(result.tag).toMatchObject({ scheme: "sgtin-96", filter: 1, prefixLength: 7 });
    expect(result.notChecked).toContain("I2");
    // Without the schemes a classic EPC is not assessed
    const blind = check(engine, tagged(epc.hex));
    expect([blind.verdict, blind.notChecked]).toEqual(["not-assessed", ["I1", "I2"]]);
  });

  it("I1: a header no GS1 scheme has is a note; a GS1 header whose fields do not decode, an error", () => {
    const other = run(tagged("E2801160600002"));
    expect([other.verdict, codes(other)]).toEqual(["not-gs1", ["I1 note"]]);
    expect(codes(run(tagged("F7FF")))).toEqual(["I1 error"]);
    expect(codes(run(tagged("urn:epc:id:sgtin:950.nothing")))).toEqual(["I1 error"]);
  });

  it("I2: a reserved filter, and a partition the GCP table contradicts", () => {
    const filter = run(tagged(encodeEpc(schemes, "01", GTIN, { "21": "417" }, 7, 3).hex));
    expect([codes(filter), filter.findings[0]!.details]).toEqual([["I2 error"], { field: "filter", filter: "3" }]);
    const gcp = parseGcpTable('<GCPPrefixFormatList date="2026-01-01T00:00:00Z"><entry prefix="950" gcpLength="7"/></GCPPrefixFormatList>');
    const partition = run(tagged(encodeEpc(schemes, "01", GTIN, { "21": "417" }, 8, 1).hex), { gcp });
    expect([codes(partition), partition.findings[0]!.details]).toEqual([["I2 error"], { field: "partition", prefixLength: "8", expected: "7" }]);
    expect(codes(run(tagged(encodeEpc(schemes, "01", GTIN, { "21": "417" }, 7, 1).hex), { gcp }))).toEqual([]);
  });

  it("an EPC+ needs no schemes and keeps a serial's leading zeros", () => {
    const plus = run(tagged(encodeEpcPlus([["01", GTIN], ["21", "00417"]], { form: "+", filter: 1 }).hex), { epcSchemes: undefined });
    expect([plus.tag?.scheme, plus.elements.map((e) => e.value)]).toEqual(["sgtin+", [GTIN, "00417"]]);
  });

  it("I3: the URI not in the first record, not in a URI record, or not https; I4: the URI itself, as group G", () => {
    const text = Uint8Array.from([0x91, 1, 3, 0x54, 2, 0x65, 0x6e]); // a text record "en", not the message's last
    const uri = ndefUriMessage(`https://id.gs1.org/01/${GTIN}`);
    const second = run(readingFromNdef(Uint8Array.from([...text, ...uri]), { at: AT }));
    expect([second.verdict, codes(second), second.findings[0]!.details]).toEqual(["does-not-follow", ["I3 error"], { recordIndex: "1", scheme: "https:" }]);
    expect(codes(run(readingFromNdef(Uint8Array.from([0xd1, 1, 3, 0x54, 2, 0x65, 0x6e]), { at: AT })))).toEqual(["I3 error"]);
    expect(codes(run(nfc(`http://id.gs1.org/01/${GTIN}`)))).toEqual(["I3 error", "G8 warning", "I4 warning"]);
    expect(codes(run(nfc(`https://id.gs1.org/01/${GTIN}`)))).toEqual([]);
  });
});

describe("group J: several carriers on one item", () => {
  it("an EAN-13, a GS1 DataMatrix and an SGTIN-96 that lost the serial's leading zeros: J7 and the matrix of section 5.3", () => {
    const epc = encodeEpc(schemes, "01", GTIN, { "21": "417" }, 7, 1);
    const g = group([scanned(`]E0${GTIN.slice(1)}`), scanned(`]d201${GTIN}17271231` + `10ABC123${GS}2100417`), tagged(epc.hex)], "consumer-pack", "retail");
    expect(g.columns.map((c) => [c.carrier, c.symbol, c.symbologyIdentifier, c.scheme])).toEqual([
      ["barcode", "EAN-13", "]E0", null], ["barcode", "GS1 DataMatrix", "]d2", null], ["rfid", null, null, "sgtin-96"],
    ]);
    expect(g.matrix.map((r) => [r.ai, ...r.values, r.differs])).toEqual([
      ["01", GTIN, GTIN, GTIN, false], // padding a GTIN-13 to 14 digits is not a difference
      ["17", null, "271231", null, false],
      ["10", null, "ABC123", null, false],
      ["21", null, "00417", "417", true],
    ]);
    expect(groupCodes(g)).toEqual(["J7 error 1,2 (21)", "J5 not-assessed 0,1"]);
    expect(g.findings[0]!.details).toEqual({ barcode: "00417", tag: "417", cannotFit: "sgtin-96" });
    // A serial the SGTIN-96 could hold: only the difference
    const other = group([scanned(`]d201${GTIN}21418`), tagged(epc.hex)], "tag-and-code");
    expect(other.findings.map((f) => f.details)).toEqual([{ barcode: "418", tag: "417" }]);
    expect([g.verdict, g.notChecked]).toEqual(["does-not-follow", ["J5"]]);
    // The DataMatrix's F3 is answered by the EAN-13 beside it
    expect(g.resolved).toEqual([{ column: 1, code: "F3", by: "group" }]);
  });

  it("J7: a tag of another scheme than the barcode's key", () => {
    const sscc = encodeEpc(schemes, "00", "095060001343520018", {}, 7, 0);
    expect(groupCodes(group([scanned(`]E0${GTIN.slice(1)}`), tagged(sscc.hex)], "tag-and-code"))).toEqual(["J7 error 0,1 (01)"]);
  });

  it("J1, with the question of packaging levels when the GTINs differ in the indicator only; J2", () => {
    const box = withCheck(`1${GTIN.slice(1, 13)}`);
    const j1 = group([scanned(`]E0${GTIN.slice(1)}`), scanned(`]I1${box}`)], "case");
    expect(groupCodes(j1)).toEqual(["J1 error 0,1 (01)"]);
    expect(j1.findings[0]!.details!.indicatorOnly).toBe("true");
    // On a case the GS1-128's batch is also missing from the 2D symbol (J6)
    expect(groupCodes(group([scanned(`]d201${GTIN}10ABC`), scanned(`]C101${GTIN}10ABD`)], "case"))).toEqual(["J2 error 0,1 (10)", "J6 error 0,1 (10)"]);
  });

  it("C9 and E1 of a reading are resolved, with J3, when a companion in the group carries the key", () => {
    const g = group([scanned("]C110ABC"), scanned(`]E0${GTIN.slice(1)}`)], "consumer-pack");
    expect(run(scanned("]C110ABC")).findings.map((f) => f.code)).toEqual(["C9"]);
    expect(groupCodes(g)).toEqual(["J3 warning 0,1 (10)"]);
    expect(g.resolved).toEqual([{ column: 0, code: "C9", by: "J3" }]);
    // The matrix lists the keys first, whichever carrier came first
    expect(g.matrix.map((r) => r.ai)).toEqual(["01", "10"]);
    expect(g.verdict).toBe("remarks");
    expect(groupCodes(group([scanned("]d210ABC"), scanned(`]E0${GTIN.slice(1)}`)], "consumer-pack"))).toEqual(["J3 error 0,1 (10)", "J5 not-assessed 0,1"]);
  });

  it("J4: a retail consumer pack's 2D symbol with no linear one, F3 then answered by J4; not assessed without a context", () => {
    const g = group([scanned(`]d201${GTIN}`)], "consumer-pack", "retail");
    expect([groupCodes(g), g.resolved]).toEqual([["J4 warning 0"], [{ column: 0, code: "F3", by: "J4" }]]);
    expect(group([scanned(`]d201${GTIN}`)], "consumer-pack").notChecked).toEqual(["J4"]);
  });

  it("J6: a case's GS1-128 element strings missing from its supplemental 2D symbol", () => {
    const g = group([scanned(`]C101${GTIN}10ABC`), scanned(`]d201${GTIN}`)], "case");
    expect(groupCodes(g)).toEqual(["J6 error 0,1 (10)"]);
    expect(g.findings[0]!.details).toEqual({ ais: "10" });
  });

  it("J8 compares host, scheme, key and each data element of an NFC URI with a QR Code's", () => {
    const g = group([scanned(`]Q1https://example.com/01/${GTIN}/10/ABD`), nfc(`https://id.gs1.org/01/${GTIN}/10/ABC`)], "tag-and-code");
    expect(groupCodes(g)).toEqual(["J8 error 0,1", "J8 error 0,1 (10)"]);
    expect(g.findings.map((f) => f.details!.field)).toEqual(["host", "element"]);
    // A data element the tag carries and the symbol does not
    const extra = group([scanned(`]Q1https://id.gs1.org/01/${GTIN}`), nfc(`https://id.gs1.org/01/${GTIN}/10/ABC`)], "tag-and-code");
    expect(extra.findings.map((f) => [f.code, f.ai, f.details])).toEqual([["J8", "10", { field: "element", symbol: "", tag: "ABC" }]]);
    const scheme = group([scanned(`]Q1https://id.gs1.org/01/${GTIN}`), nfc(`http://id.gs1.org/01/${GTIN}`)], "tag-and-code");
    expect(scheme.findings.map((f) => `${f.code} ${f.details!.field}`)).toEqual(["J8 scheme"]);
  });

  it("J9: a logistic label with two SSCCs, or (02) without (37) or the SSCC on any of its symbols; its symbols' associations answered by the label", () => {
    const two = group([scanned("]C100095060001343520018"), scanned("]C100095060001343520025")], "logistic-label");
    expect(groupCodes(two)).toEqual(["J9 error 0,1 (00)"]);
    const split = group([scanned(`]C102${GTIN}`), scanned("]C13712")], "logistic-label");
    expect(groupCodes(split)).toEqual(["J9 error 0 (02)"]);
    expect(split.findings[0]!.details).toEqual({ reason: "missing", ai: "00" });
    expect(split.resolved.map((r) => `${r.column} ${r.code}`)).toEqual(["0 E1", "1 C9"]);
  });

  it("J10: a symbol that is not a GS1 one on the pack", () => {
    expect(groupCodes(group([scanned(`]E0${GTIN.slice(1)}`), scanned("]C0HELLO")], "consumer-pack"))).toEqual(["J10 note 1"]);
  });
});
