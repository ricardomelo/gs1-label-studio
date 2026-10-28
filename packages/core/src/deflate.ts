// Compression for the files the studio writes (PNG, PDF, zip): the platform's own deflate (the Compression Streams
// API, in browsers and in Node.js 18 and later), so that no library is needed.

/** `bytes` compressed: "deflate" is the zlib format (PNG, PDF's FlateDecode); "deflate-raw" is the zip's. */
export async function deflate(bytes: Uint8Array, format: "deflate" | "deflate-raw"): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

let table: Uint32Array | undefined;

/** The CRC-32 of PNG chunks and zip entries (ISO 3309, polynomial 0xEDB88320). */
export function crc32(bytes: Uint8Array, crc = 0): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = ~crc >>> 0;
  for (const byte of bytes) c = table[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
}

/** Text as the bytes of a file: UTF-8. */
export const utf8 = (text: string) => new TextEncoder().encode(text);
