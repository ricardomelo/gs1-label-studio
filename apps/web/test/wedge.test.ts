import { firstUriRecord, ndefRecords, readingFromNdef } from "@gs1-label-studio/core";
import { describe, expect, it } from "vitest";
import { messageOf, ndefRecordOf, type WebNdefRecord } from "../src/nfc.ts";
import { describeRecord } from "../src/Tag.tsx";
import { LAYOUTS, layoutRepairs, undoLayout, WedgeListener } from "../src/wedge.ts";

// The Check Studio's scanner in keyboard mode and NFC tags (backlog 7.1 h; the check studio's project, sections 3.4
// and 3.5): a scan told from typing by its rhythm, a keyboard layout's damage undone, Web NFC's records made an NDEF
// message again. The screens are e2e/check-scan.spec.ts.

const typeAt = (listener: WedgeListener, text: string, start: number, gap: number) => {
  [...text].forEach((c, i) => listener.key(c, start + i * gap));
  return start + (text.length - 1) * gap;
};

describe("a scanner's rhythm", () => {
  it("takes keystrokes a few milliseconds apart, ended by Enter, as a scan", () => {
    const w = new WedgeListener();
    const last = typeAt(w, "]d20109506000134352", 0, 8);
    expect(w.end(last + 10)).toBe("]d20109506000134352");
  });
  it("does not take a person's typing, a short burst or a late Enter as a scan", () => {
    const w = new WedgeListener();
    expect(w.end(typeAt(w, "0109506000134352", 0, 120) + 10)).toBeNull();
    expect(w.end(typeAt(w, "123", 1000, 5) + 5)).toBeNull();
    expect(w.end(typeAt(w, "0109506000134352", 2000, 5) + 400)).toBeNull();
  });
  it("starts again after a pause: what a person typed before the scan is not part of it", () => {
    const w = new WedgeListener();
    typeAt(w, "abc", 0, 150);
    const last = typeAt(w, "0109506000134352", 1000, 6);
    expect(w.end(last + 6)).toBe("0109506000134352");
    // and forgets the burst once Enter is pressed
    expect(w.end(last + 12)).toBeNull();
  });
});

describe("a keyboard layout's damage", () => {
  const layout = (id: string) => LAYOUTS.find((l) => l.id === id)!;
  it("is undone character by character", () => {
    // A US-layout scanner on French AZERTY: the digits come as the characters on their keys, "]" as "$"
    expect(undoLayout("$d2&àà(çàà_&&é&-", layout("fr"))).toBe("]d21005900811216");
    expect(undoLayout("+d2Y", layout("de"))).toBe("]d2Z");
    expect(undoLayout("[d2", layout("pt-BR"))).toBe("]d2");
  });
  it("is offered when undoing it brings back the identifier or the digits, layouts with the same result together", () => {
    const plus = layoutRepairs("+d201095060001343521727123110ABC123");
    expect(plus).toHaveLength(1);
    expect(plus[0]!.text).toBe("]d201095060001343521727123110ABC123");
    expect(plus[0]!.layouts.map((l) => l.id)).toEqual(["de", "es", "it"]);
    expect(layoutRepairs("[d20109506000134352")[0]!.layouts.map((l) => l.id)).toEqual(["pt-BR"]);
    const azerty = layoutRepairs("à&àç(à-àààà&\"'\"(é");
    expect(azerty.map((r) => [r.layouts[0]!.id, r.text])).toEqual([["fr", "01095060000134352"]]);
  });
  it("is not offered for a scan that is already well formed", () => {
    expect(layoutRepairs("]d201095060001343521727123110ABC123")).toEqual([]);
    expect(layoutRepairs("0109506000134352")).toEqual([]);
    expect(layoutRepairs("https://id.gs1.org/01/09506000134352")).toEqual([]);
  });
});

describe("an NFC tag read by Web NFC", () => {
  const view = (bytes: Uint8Array | string) => {
    const b = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
    return new DataView(b.buffer, b.byteOffset, b.byteLength);
  };
  it("gives each record back as the NDEF record it was", () => {
    const url = ndefRecordOf({ recordType: "url", data: view("https://id.gs1.org/01/09506000134352") });
    expect([url.tnf, url.type, url.payload[0]]).toEqual([1, "U", 0]);
    const text = ndefRecordOf({ recordType: "text", data: view("Olá"), lang: "pt-BR", encoding: "utf-8" });
    expect([text.tnf, text.type, ...text.payload.subarray(0, 6)]).toEqual([1, "T", 5, ...new TextEncoder().encode("pt-BR")]);
    expect(ndefRecordOf({ recordType: "text", data: view("A"), lang: "en", encoding: "utf-16" }).payload[0]).toBe(0x82);
    expect(ndefRecordOf({ recordType: "mime", mediaType: "application/json", data: view("{}") })).toMatchObject({ tnf: 2, type: "application/json" });
    expect(ndefRecordOf({ recordType: "absolute-url", data: view("https://example.com/") })).toMatchObject({ tnf: 3, type: "https://example.com/" });
    expect(ndefRecordOf({ recordType: "example.com:thing", data: view("x") })).toMatchObject({ tnf: 4, type: "example.com:thing" });
    expect(ndefRecordOf({ recordType: ":act", data: view("x") })).toMatchObject({ tnf: 1, type: "act" });
    expect(ndefRecordOf({ recordType: "smart-poster", data: view("x") })).toMatchObject({ tnf: 1, type: "Sp" });
    expect(ndefRecordOf({ recordType: "empty" })).toMatchObject({ tnf: 0, type: "" });
    expect(ndefRecordOf({ recordType: "unknown", data: view("x") })).toMatchObject({ tnf: 5 });
  });
  it("makes a message the core reads as it reads an .ndef file, the URI found where it is", () => {
    const records: WebNdefRecord[] = [
      { recordType: "text", data: view("Scan me"), lang: "en", encoding: "utf-8" },
      { recordType: "url", data: view("https://id.gs1.org/01/09506000134352") },
    ];
    const message = messageOf(records);
    expect(firstUriRecord(message)).toEqual({ index: 1, uri: "https://id.gs1.org/01/09506000134352" });
    const reading = readingFromNdef(message, { serialNumber: "04:a2:3b" });
    expect(reading).toMatchObject({ source: "nfc", text: "https://id.gs1.org/01/09506000134352", nfc: { serialNumber: "04:a2:3b", recordIndex: 1, recordType: "U" } });
    expect(ndefRecords(message).map(describeRecord)).toEqual([
      { type: "Text", holds: "Scan me" },
      { type: "Link (URI)", holds: "https://id.gs1.org/01/09506000134352" },
    ]);
  });
});
