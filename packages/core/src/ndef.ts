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

/** The URI of an NDEF message's first URI record; an Error when it has none. */
export function ndefUri(message: Uint8Array): string {
  const flags = message[0]!;
  if ((flags & 0x07) !== 0x01) throw new Error("The first record is not of a well-known type.");
  const typeLength = message[1]!;
  const short = (flags & 0x10) !== 0;
  let at = 2;
  const length = short ? message[at++]! : ((message[at++]! << 24) | (message[at++]! << 16) | (message[at++]! << 8) | message[at++]!) >>> 0;
  const idLength = flags & 0x08 ? message[at++]! : 0; // IL: an ID's length, then the ID after the type
  const type = new TextDecoder().decode(message.subarray(at, at + typeLength));
  at += typeLength + idLength;
  if (type !== "U") throw new Error(`The first record is of type ${type}, not a URI.`);
  const payload = message.subarray(at, at + length);
  const prefix = URI_PREFIXES[payload[0]!];
  if (prefix === undefined) throw new Error(`Unknown URI identifier code ${payload[0]}.`);
  return prefix + new TextDecoder().decode(payload.subarray(1));
}
