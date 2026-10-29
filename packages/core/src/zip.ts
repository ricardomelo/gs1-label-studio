import { crc32, deflate, utf8 } from "./deflate.ts";
import { ENVIRONMENTS, xDimension, linearXDimension } from "./environments.ts";
import type { HriFont } from "./hri.ts";
import { labelEps } from "./eps.ts";
import { labelSvg, QUIET_ZONE, reductionNote, specDescription, type LabelOptions, type Layout } from "./layout.ts";
import { BAR_HEIGHT, LINEAR_NAMES, type LinearKind } from "./linear.ts";
import { labelPdf } from "./pdf.ts";
import { labelPng } from "./png.ts";
import { pyFixed } from "./pyformat.ts";
import { SYMBOLOGIES } from "./symbologies.ts";

// The label in every format in one zip, as the resolver's render_zip made it (ADR 0004): SVG, PNG and PDF, and a
// README.txt with the data, the symbol, its sizes and how to print it.

const LINEAR_X_MM = 0.33; // EAN/UPC X-dimension at 100 % magnification

/** A name a file system takes: letters, digits, "_", "." and "-" (the resolver's zip_name). */
export function fileName(name: string): string {
  return name.replace(/[^A-Za-z0-9_.-]/g, "-");
}

function linearLine(kind: LinearKind, digits: string, environment: string, percent: number): string {
  const x = linearXDimension(environment, percent);
  const target = ENVIRONMENTS[environment]?.linear?.[1] ?? LINEAR_X_MM;
  return `${LINEAR_NAMES[kind]}: ${digits}, X = ${pyFixed(x, 3)} mm (${percent} % of the target ${pyFixed(target, 3)} mm, ` +
    `magnification ${pyFixed((x / LINEAR_X_MM) * 100, 0)} %), bar height ${pyFixed(BAR_HEIGHT[kind] * x, 2)} mm`;
}

/** The README.txt: what the symbol holds, its size and its X-dimension, the label's size, and how to print it. */
export function labelReadme(options: LabelOptions, layout: Layout): string {
  const symbology = SYMBOLOGIES[options.symbology];
  const environment = options.environment ?? "retail";
  const size = options.size ?? 100;
  const lines: string[] = [];
  if (symbology.data === "uri") lines.push(`GS1 Digital Link: ${options.data}`);
  if (symbology.data === "element-string") lines.push(`GS1 element string: ${options.data}`);
  if (options.spec) {
    lines.push(specDescription(options, layout));
  } else if (symbology.kind === "linear") {
    lines.push(linearLine(options.symbology as LinearKind, options.data, environment, options.linearSize ?? size));
  } else {
    const target = ENVIRONMENTS[environment]!["2d"][1];
    const symbol = layout.version
      ? `${options.symbology === "dl-qrcode" ? "QR code" : symbology.name}: version ${layout.version}, error correction ` +
        `${(options.error ?? "m").toUpperCase()}, ${layout.modules} x ${layout.modules} modules,`
      : `${symbology.name}: ECC 200, ${layout.modules} x ${layout.modules} modules,`;
    lines.push(`${symbol} X = ${pyFixed(xDimension(environment, size), 3)} mm (${size} % of the target ` +
      `${pyFixed(target, 3)} mm of the scanning environment ${environment}), quiet zone ${QUIET_ZONE}X`);
    if (options.linear) lines.push(linearLine(options.linear[0], options.linear[1], environment, options.linearSize ?? size));
  }
  if (options.barWidthReduction) lines.push(`Prepress: ${reductionNote(options).slice(2)}; black is 100 % K in the PDF and EPS`);
  const texts = layout.texts.length && symbology.kind === "linear" && !options.spec
    ? `${layout.texts.map((t) => t.text).join(" ")} (under the bars)`
    : options.showHri && layout.texts.length ? (options.spec ? layout.texts.map((t) => t.text) : options.hriLines).join(" ") : "none";
  lines.push(
    `Human readable text: ${texts}`,
    `Label size: ${pyFixed(layout.width * layout.xMm, 1)} x ${pyFixed(layout.height * layout.xMm, 1)} mm; print at 100 % ` +
      "(no scaling) to keep these dimensions.",
    "Files: SVG, PDF and EPS are vector (for artwork); PNG is for screens and documents (its DPI gives the size).",
  );
  return lines.join("\r\n") + "\r\n";
}

/** MS-DOS date and time, as zip entries hold them (local time, two-second steps). */
function dosDateTime(date: Date): [number, number] {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return [time, day];
}

/** A zip of the files, each deflated (no folders, no encryption, no zip64: labels are small). */
export async function zipArchive(files: { name: string; bytes: Uint8Array }[], date = new Date()): Promise<Uint8Array<ArrayBuffer>> {
  const [time, day] = dosDateTime(date);
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = utf8(file.name);
    const data = await deflate(file.bytes, "deflate-raw");
    const crc = crc32(file.bytes);
    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true); // version needed: 2.0, deflate
    l.setUint16(6, 0x0800, true); // names in UTF-8
    l.setUint16(8, 8, true); // deflated
    l.setUint16(10, time, true);
    l.setUint16(12, day, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, file.bytes.length, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    const entry = new Uint8Array(46 + name.length);
    const c = new DataView(entry.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true); // made by: 2.0
    entry.set(local.subarray(4, 30), 6); // the local header's fields, from "version needed" to the name's length
    c.setUint32(42, offset, true);
    entry.set(name, 46);
    parts.push(local, data);
    central.push(entry);
    offset += local.length + data.length;
  }
  const centralSize = central.reduce((n, e) => n + e.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The label as SVG, PNG, PDF and EPS, and its README.txt, in one zip; the files named `name`. */
export async function labelZip(
  options: LabelOptions,
  layout: Layout,
  font: HriFont,
  name: string,
  svg = labelSvg(options, layout, font),
): Promise<Uint8Array<ArrayBuffer>> {
  const base = fileName(name);
  return zipArchive([
    { name: `${base}.svg`, bytes: utf8(svg) },
    { name: `${base}.png`, bytes: await labelPng(layout, font) },
    { name: `${base}.pdf`, bytes: await labelPdf(options, layout, font) },
    { name: `${base}.eps`, bytes: utf8(labelEps(options, layout, font)) },
    { name: "README.txt", bytes: utf8(labelReadme(options, layout)) },
  ]);
}
