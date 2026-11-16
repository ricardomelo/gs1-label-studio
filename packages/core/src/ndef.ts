// NFC tags (backlog 1.19): a URI as an NDEF message of one URI record (NFC Forum URI Record Type Definition), its
// prefix abbreviated by the RTD's identifier code, for a tag writer where the browser cannot write the tag itself.

/** The URI RTD's identifier codes: the prefix each abbreviates, by code. */
export const URI_PREFIXES = [
  "", "http://www.", "https://www.", "http://", "https://", "tel:", "mailto:", "ftp://anonymous:anonymous@", "ftp://ftp.",
  "ftps://", "sftp://", "smb://", "nfs://", "ftp://", "dav://", "news:", "telnet://", "imap:", "rtsp://", "urn:", "pop:",
  "sip:", "sips:", "tftp:", "btspp://", "btl2cap://", "btgoep://", "tcpobex://", "irdaobex://", "file://", "urn:epc:id:",
  "urn:epc:tag:", "urn:epc:pat:", "urn:epc:raw:", "urn:epc:", "urn:nfc:",
] as const;

/** The NDEF message of one URI record: the longest prefix abbreviated, a short record when the payload allows it. */
export function ndefUriMessage(uri: string): Uint8Array<ArrayBuffer> {
  let code = 0;
  for (let i = 1; i < URI_PREFIXES.length; i++) {
    if (uri.startsWith(URI_PREFIXES[i]!) && URI_PREFIXES[i]!.length > URI_PREFIXES[code]!.length) code = i;
  }
  const rest = new TextEncoder().encode(uri.slice(URI_PREFIXES[code]!.length));
  const payload = new Uint8Array(1 + rest.length);
  payload[0] = code;
  payload.set(rest, 1);
  const short = payload.length < 256;
  // MB and ME (the message's only record), SR when short, TNF 1: an NFC Forum well-known type, here "U"
  const header = [0x80 | 0x40 | (short ? 0x10 : 0) | 0x01, 1];
  const length = short ? [payload.length] : [(payload.length >>> 24) & 255, (payload.length >>> 16) & 255, (payload.length >>> 8) & 255, payload.length & 255];
  return Uint8Array.from([...header, ...length, 0x55, ...payload]);
}

export interface NdefRecord {
  /** The type name format: 1 for an NFC Forum well-known type ("U", "T"), 2 for a media type, 3 for an absolute URI… */
  tnf: number;
  type: string;
  payload: Uint8Array;
}

/** The records of an NDEF message, in their order (chunked records are not joined: a GS1 tag holds none). */
export function ndefRecords(message: Uint8Array): NdefRecord[] {
  const records: NdefRecord[] = [];
  let at = 0;
  while (at < message.length) {
    const flags = message[at++]!;
    const typeLength = message[at++] ?? 0;
    const short = (flags & 0x10) !== 0;
    const length = short ? (message[at++] ?? 0) : ((message[at++]! << 24) | (message[at++]! << 16) | (message[at++]! << 8) | message[at++]!) >>> 0;
    const idLength = flags & 0x08 ? message[at++]! : 0; // IL: an ID's length, then the ID after the type
    const type = new TextDecoder().decode(message.subarray(at, at + typeLength));
    at += typeLength + idLength;
    if (at + length > message.length) throw new Error("The NDEF message ends inside a record.");
    records.push({ tnf: flags & 0x07, type, payload: message.subarray(at, at + length) });
    at += length;
    if (flags & 0x40) break; // ME: the message's last record
  }
  return records;
}

/** The URI a URI record's payload holds: its identifier code's prefix, then the rest. */
export function ndefRecordUri(record: NdefRecord): string {
  const prefix = URI_PREFIXES[record.payload[0]!];
  if (prefix === undefined) throw new Error(`Unknown URI identifier code ${record.payload[0]}.`);
  return prefix + new TextDecoder().decode(record.payload.subarray(1));
}

const isUriRecord = (r: NdefRecord) => r.tnf === 1 && r.type === "U";

/** The URI of an NDEF message's first record, which must be a URI record; an Error when it is not. */
export function ndefUri(message: Uint8Array): string {
  const first = ndefRecords(message)[0];
  if (!first) throw new Error("The NDEF message holds no record.");
  if (first.tnf !== 1) throw new Error("The first record is not of a well-known type.");
  if (!isUriRecord(first)) throw new Error(`The first record is of type ${first.type}, not a URI.`);
  return ndefRecordUri(first);
}

/** The first URI record of an NDEF message, wherever it is, and its place; null when it has none. */
export function firstUriRecord(message: Uint8Array): { index: number; uri: string } | null {
  const records = ndefRecords(message);
  const index = records.findIndex(isUriRecord);
  return index === -1 ? null : { index, uri: ndefRecordUri(records[index]!) };
}
