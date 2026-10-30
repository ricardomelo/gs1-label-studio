import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { expect } from "vitest";
import { crc32 } from "../src/index.ts";

// Files as other programs read them, for the tests: PDFs drawn by poppler, zips read by a reader of their own.

/** The PDF as a viewer draws it: poppler's pdftoppm (in CI: the poppler-utils package), which must not complain. */
export function drawPdf(pdf: Uint8Array, dpi: number, page = 1): Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), "label-pdf-"));
  try {
    writeFileSync(join(dir, "label.pdf"), pdf);
    const run = spawnSync("pdftoppm", ["-png", "-r", String(dpi), "-f", String(page), "-l", String(page), "-singlefile", "label.pdf", "page"], {
      cwd: dir, encoding: "utf8",
    });
    expect(run.error, "pdftoppm (poppler-utils) is needed").toBeUndefined();
    expect([run.status, run.stderr]).toEqual([0, ""]);
    return new Uint8Array(readFileSync(join(dir, "page.png")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A zip reader for the tests: the central directory, each local header, inflated and checked against its CRC. */
export function unzip(zip: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  expect(at + view.getUint32(end + 12, true)).toBe(end);
  const files = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const nameLength = view.getUint16(at + 28, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    const local = view.getUint32(at + 42, true);
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    expect(zip.subarray(local + 4, local + 30)).toEqual(zip.subarray(at + 6, at + 32));
    const size = view.getUint32(local + 18, true);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = new Uint8Array(inflateRawSync(zip.subarray(start, start + size)));
    expect(data.length).toBe(view.getUint32(local + 22, true));
    expect(crc32(data)).toBe(view.getUint32(local + 14, true));
    files.set(name, data);
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return files;
}

