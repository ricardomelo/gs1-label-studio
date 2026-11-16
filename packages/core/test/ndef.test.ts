import { describe, expect, it } from "vitest";
import { firstUriRecord, ndefRecords, ndefUri, ndefUriMessage } from "../src/index.ts";

// NFC tags (backlog 1.19): the NDEF message of one URI record (NFC Forum URI RTD), byte by byte.

describe("an NDEF URI record", () => {
  it("abbreviates https:// as code 4 in a short record: D1 01 length 55 04 and the rest", () => {
    const message = ndefUriMessage("https://id.gs1.org/01/09506000134376");
    const rest = [..."id.gs1.org/01/09506000134376"].map((c) => c.charCodeAt(0));
    expect([...message]).toEqual([0xd1, 0x01, 1 + rest.length, 0x55, 0x04, ...rest]);
    expect(ndefUri(message)).toBe("https://id.gs1.org/01/09506000134376");
  });

  it("takes the longest prefix (https://www. over https://), urn:epc:id: for an EPC, none for an unknown scheme", () => {
    expect(ndefUriMessage("https://www.example.com/01/1")[4]).toBe(0x02);
    expect(ndefUriMessage("urn:epc:id:sgtin:0614141.112345.400")[4]).toBe(0x1e);
    expect(ndefUriMessage("gs1:01/1")[4]).toBe(0x00);
    for (const uri of ["https://www.example.com/01/1", "urn:epc:id:sgtin:0614141.112345.400", "gs1:01/1", "HTTPS://ID.GS1.ORG/01/09506000134376"]) {
      expect(ndefUri(ndefUriMessage(uri))).toBe(uri);
    }
  });

  it("writes a long record with a four-byte length, and reads one with an ID", () => {
    const uri = `https://id.gs1.org/01/09506000134376?a=${"x".repeat(300)}`;
    const message = ndefUriMessage(uri);
    expect(message[0]).toBe(0xc1); // MB, ME, TNF 1, not short
    const length = 1 + uri.length - "https://".length;
    expect(length).toBeGreaterThan(255);
    expect([...message.subarray(2, 6)]).toEqual([0, 0, length >> 8, length & 255]);
    expect(ndefUri(message)).toBe(uri);
    const withId = Uint8Array.from([0xd9, 0x01, 0x03, 0x02, 0x55, 0x41, 0x42, 0x04, 0x61, 0x62]);
    expect(ndefUri(withId)).toBe("https://ab");
    expect(() => ndefUri(Uint8Array.from([0xd1, 0x01, 0x01, 0x54, 0x00]))).toThrow(/type T, not a URI/);
  });
});

describe("an NDEF message's records (the Check Studio, I3)", () => {
  const text = [0x91, 0x01, 0x03, 0x54, 0x02, 0x65, 0x6e]; // MB, SR, a well-known "T" record, not the last
  const uri = [0x51, 0x01, 0x03, 0x55, 0x04, 0x61, 0x62]; // ME, SR, a URI record https://ab

  it("lists every record in its order, and finds the first URI record wherever it is", () => {
    const message = Uint8Array.from([...text, ...uri]);
    expect(ndefRecords(message).map((r) => [r.tnf, r.type, r.payload.length])).toEqual([[1, "T", 3], [1, "U", 3]]);
    expect(firstUriRecord(message)).toEqual({ index: 1, uri: "https://ab" });
    expect(firstUriRecord(Uint8Array.from(text.map((b, i) => (i === 0 ? 0xd1 : b))))).toBeNull();
    // ndefUri() still wants the URI first
    expect(() => ndefUri(message)).toThrow(/type T, not a URI/);
  });

  it("stops at the record marked last, and refuses a message cut inside a record", () => {
    expect(ndefRecords(Uint8Array.from([0xd1, 0x01, 0x03, 0x55, 0x04, 0x61, 0x62, 0xff, 0xff]))).toHaveLength(1);
    expect(() => ndefRecords(Uint8Array.from([0xd1, 0x01, 0x09, 0x55, 0x04]))).toThrow(/ends inside a record/);
    expect(() => ndefUri(new Uint8Array())).toThrow(/holds no record/);
  });
});
