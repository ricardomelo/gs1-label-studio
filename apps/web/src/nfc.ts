import { ndefMessage, type NdefRecord } from "@gs1-label-studio/core";

// Web NFC, shared by the tag writer (backlog 1.19) and the Check Studio's tag reading (7.1 h). Only Chrome on Android
// has it; it reads and writes NDEF and nothing below it (no tag type, no memory size). A reading comes as records
// already parsed; the Check Studio makes them an NDEF message again, so that the core reads a tag from the browser as
// it reads an .ndef file.

/** A record as Web NFC gives it, which TypeScript's DOM library does not describe. */
export interface WebNdefRecord {
  recordType: string;
  mediaType?: string | null;
  data?: DataView | null;
  encoding?: string | null;
  lang?: string | null;
}
export interface WebNdefReader extends EventTarget {
  write(message: { records: { recordType: string; data: string }[] }, options?: { signal?: AbortSignal }): Promise<void>;
  scan(options?: { signal?: AbortSignal }): Promise<void>;
}
declare global {
  interface Window {
    NDEFReader?: new () => WebNdefReader;
  }
}

/** True when this browser can read and write NFC tags. */
export const nfcAvailable = (): boolean => typeof window !== "undefined" && typeof window.NDEFReader === "function";

const bytesOf = (view: DataView | null | undefined): Uint8Array =>
  view ? new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice() : new Uint8Array(0);
const encoded = (text: string) => new TextEncoder().encode(text);

/**
 * A Web NFC record as the NDEF record it was read from (NFC Forum RTDs): a URL as a URI record (Web NFC gives it with
 * its prefix written out, so code 0), a text with its status byte and language, a media type, an absolute URI, an
 * external or local type, a smart poster with its message as payload.
 */
export function ndefRecordOf(record: WebNdefRecord): NdefRecord {
  const data = bytesOf(record.data);
  switch (record.recordType) {
    case "empty":
      return { tnf: 0, type: "", payload: data };
    case "url":
      return { tnf: 1, type: "U", payload: Uint8Array.from([0, ...data]) };
    case "text": {
      const lang = encoded(record.lang ?? "en");
      const utf16 = (record.encoding ?? "utf-8").toLowerCase().startsWith("utf-16") ? 0x80 : 0;
      return { tnf: 1, type: "T", payload: Uint8Array.from([utf16 | (lang.length & 0x3f), ...lang, ...data]) };
    }
    case "smart-poster":
      return { tnf: 1, type: "Sp", payload: data };
    case "mime":
      return { tnf: 2, type: record.mediaType ?? "application/octet-stream", payload: data };
    case "absolute-url":
      return { tnf: 3, type: new TextDecoder().decode(data), payload: new Uint8Array(0) };
    case "unknown":
      return { tnf: 5, type: "", payload: data };
    default:
      // ":t" is a local type (well-known within its message); "domain:type" an external one
      return record.recordType.startsWith(":") ? { tnf: 1, type: record.recordType.slice(1), payload: data } : { tnf: 4, type: record.recordType, payload: data };
  }
}

/** The NDEF message of a Web NFC reading's records. */
export const messageOf = (records: readonly WebNdefRecord[]): Uint8Array => ndefMessage(records.map(ndefRecordOf));

/** One tag read: its records as Web NFC gives them, and its serial number when the browser gives it. */
export interface TagRead {
  records: WebNdefRecord[];
  serialNumber: string | null;
}

/**
 * Waits for one tag held to the phone and gives what it holds; rejects when the tag cannot be read or the scan cannot
 * start (permission refused, NFC switched off). Aborting the signal ends the wait.
 */
export function scanTag(signal: AbortSignal): Promise<TagRead> {
  return new Promise((resolve, reject) => {
    if (!window.NDEFReader) {
      reject(new DOMException("Web NFC is not available.", "NotSupportedError"));
      return;
    }
    const reader = new window.NDEFReader();
    const stop = new AbortController();
    signal.addEventListener("abort", () => stop.abort(), { once: true });
    reader.addEventListener(
      "reading",
      (event) => {
        stop.abort();
        const e = event as Event & { message?: { records: WebNdefRecord[] }; serialNumber?: string };
        resolve({ records: e.message?.records ?? [], serialNumber: e.serialNumber || null });
      },
      { once: true },
    );
    reader.addEventListener(
      "readingerror",
      () => {
        stop.abort();
        reject(new DOMException("The tag could not be read.", "NotReadableError"));
      },
      { once: true },
    );
    reader.scan({ signal: stop.signal }).catch(reject);
  });
}
