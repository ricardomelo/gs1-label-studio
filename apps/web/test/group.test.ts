import { readingFromEpc, readingFromNdef, readingFromText, ndefUriMessage, type GroupColumn, type GroupFinding } from "@gs1-label-studio/core";
import { describe, expect, it } from "vitest";
import { columnsText, groupDetailLines, guessKind, memberName, sameReading } from "../src/group.ts";

// The Check Studio's group on screen (backlog 7.1 i; the check studio's project, section 5): what the screen says
// without a browser. The group itself is the core's checkGroup() (packages/core/test/check-group.test.ts); the screen,
// e2e/check-group.spec.ts.

const GS = "\u001d";
const text = (data: string) => readingFromText(data, { source: "paste" });
const epc = () => readingFromEpc("30364433400d1ec0000001a1", { source: "paste" });
const column = (over: Partial<GroupColumn>): GroupColumn => ({ carrier: "barcode", symbologyIdentifier: null, symbol: null, scheme: null, ...over });
const finding = (code: string, details: Record<string, string>): GroupFinding => ({ code, severity: "error", columns: [0, 1], ai: null, sections: [], details });

describe("the kind of group", () => {
  it("is guessed from the readings until the user names it", () => {
    expect(guessKind([text("]E09506000134352"), text("]d20109506000134352")])).toBe("consumer-pack");
    expect(guessKind([text("]d20109506000134352"), epc()])).toBe("tag-and-code");
    expect(guessKind([text("]d20109506000134352"), readingFromNdef(ndefUriMessage("https://id.gs1.org/01/09506000134352"), {})])).toBe("tag-and-code");
    expect(guessKind([text("]C10109506000134352"), text("]d20109506000134352")])).toBe("case");
    expect(guessKind([text("]C100095060001000000017"), text("]C10209506000134352"), text("]d20109506000134352")])).toBe("logistic-label");
    expect(guessKind([])).toBe("consumer-pack");
  });
});

describe("a code already in the group", () => {
  it("is the same carrier, identifier and bytes", () => {
    expect(sameReading(text(`]d20109506000134352${GS}10A`), text(`]d20109506000134352${GS}10A`))).toBe(true);
    expect(sameReading(text("]d20109506000134352"), text("]Q30109506000134352"))).toBe(false);
    expect(sameReading(text("]d20109506000134352"), text("]d20109506000134369"))).toBe(false);
    expect(sameReading(text("]d20109506000134352"), text("]d2010950600013435"))).toBe(false);
    expect(sameReading(text("https://id.gs1.org/01/09506000134352"), { ...text("https://id.gs1.org/01/09506000134352"), carrier: "nfc" })).toBe(false);
  });
});

describe("a column's name", () => {
  it("names the symbol, or the tag and its scheme", () => {
    expect(memberName(text("]d20109506000134352"), column({ symbol: "GS1 DataMatrix" }))).toBe("GS1 DataMatrix");
    expect(memberName(text("]E09506000134352"), column({ symbol: "EAN-13" }))).toBe("EAN-13");
    expect(memberName(epc(), column({ carrier: "rfid", scheme: "sgtin-96" }))).toBe("RFID tag (SGTIN-96)");
    expect(memberName(epc(), undefined)).toBe("RFID tag");
    expect(memberName(readingFromNdef(ndefUriMessage("https://example.com"), {}), undefined)).toBe("NFC tag");
  });
  it("numbers the codes a finding concerns", () => {
    expect(columnsText([0])).toBe("Code 1");
    expect(columnsText([1, 2])).toBe("Codes 2 and 3");
    expect(columnsText([0, 1, 3])).toBe("Codes 1, 2 and 4");
  });
});

describe("a group finding's details", () => {
  it("say what differs in plain words", () => {
    expect(groupDetailLines(finding("J7", { barcode: "00417", tag: "417", cannotFit: "sgtin-96" }))).toEqual([
      "The barcode: 00417 · the tag: 417",
      "An SGTIN-96 holds only a serial number of digits without leading zeros: write the tag as SGTIN-198, or give the item such a serial number.",
    ]);
    expect(groupDetailLines(finding("J7", { reason: "scheme", scheme: "sscc-96", key: "01" }))).toEqual(["The tag carries another kind of key than the barcode: sscc-96 and (01)."]);
    expect(groupDetailLines(finding("J1", { values: "09506000134352, 09506000134369" }))).toEqual(["The values: 09506000134352, 09506000134369"]);
    expect(groupDetailLines(finding("J6", { ais: "10, 17" }))).toEqual(["Missing from the 2D symbol: (10), (17)"]);
    expect(groupDetailLines(finding("J9", { reason: "missing", ai: "37" }))).toEqual(["Missing from the label: (37)"]);
    expect(groupDetailLines(finding("J8", { field: "host", symbol: "id.gs1.org", tag: "example.com" }))).toEqual(["The symbol: id.gs1.org · the tag: example.com"]);
    expect(groupDetailLines(finding("J8", { field: "element", symbol: "ABC", tag: "" }))).toEqual(["The symbol: ABC · the tag: —"]);
    expect(groupDetailLines(finding("J9", { reason: "sscc", values: "1, 2" }))).toEqual(["The values: 1, 2", "A logistic label carries one SSCC."]);
    expect(groupDetailLines(finding("J4", {}))).toEqual([]);
  });
});
