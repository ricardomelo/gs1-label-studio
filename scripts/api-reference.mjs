#!/usr/bin/env node
// The core's API reference, generated from its sources (ADR 0005): every name packages/core/src/index.ts exports, with
// its kind, its declaration and the comment above it, module by module, written to docs/core-api.md.
// Usage: node scripts/api-reference.mjs [--check]
//   --check  writes nothing; exits 1 when docs/core-api.md differs from what the sources give
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const src = join(root, "packages/core/src");

/** What each module is for, in a sentence: the reference's section headings. */
const MODULES = {
  "checkDigit.ts": "The GS1 check digit (General Specifications 7.9).",
  "symbologies.ts": "The symbologies the core encodes, with their bwip-js names and symbology identifiers.",
  "encode.ts": "Encoding through bwip-js (and node-qrcode for one QR Code mode) to a format-independent geometry.",
  "dots.ts": "The printer's dot grid: X-dimensions as whole numbers of dots.",
  "raster.ts": "Geometry to a bitmap, for ZPL graphic fields and the tests.",
  "svg.ts": "A bare symbol as SVG (the walking skeleton's exporter).",
  "elementString.ts": "Bracketed element strings split into AIs and values.",
  "zpl.ts": "ZPL II with the printer's own commands, templates with placeholders, graphic fields and the test print.",
  "syntax.ts": "The GS1 Barcode Syntax Engine as the input gate, and the data each symbol carries.",
  "environments.ts": "The resolver's scanning environments: sizes and checks by symbol specification table.",
  "specifications.ts": "Every row of the GS1 symbol specification tables 1 to 13 (General Specifications 5.12.3).",
  "guide.ts": "The decision tree of figure 5-68, section 2's carriers and the recommendation.",
  "hri.ts": "Human readable text drawn as glyph outlines (Liberation Sans through opentype.js).",
  "pyformat.ts": "Python's fixed-point formatting, so that the SVG matches the resolver's byte for byte.",
  "linear.ts": "EAN/UPC encoded as the resolver did, with guard bars and digits.",
  "layout.ts": "The label's layout — symbols, quiet zones, text — and its SVG.",
  "png.ts": "The label as PNG, at 12 pixels a module or at a chosen resolution.",
  "pdf.ts": "The label as PDF, one page or several, written without a library.",
  "eps.ts": "The label as EPS: the PDF's drawing under a PostScript prolog.",
  "zip.ts": "Every file of a label in a zip, with a README.",
  "deflate.ts": "Deflate through the Compression Streams API.",
  "dictionary.ts": "The GS1 Barcode Syntax Dictionary as the resolver read it: keys, qualifiers, AIs.",
  "attributes.ts": "Data attributes, with the resolver's decimal families.",
  "identify.ts": "The editor's identification: key, qualifiers, attributes, parameters → element string and URI.",
  "epc.ts": "EPC for RFID and NFC: every TDS scheme, hexadecimal, tag URI, pure identity URI, NFC links.",
  "gcp.ts": "GS1's GCP length table: the company prefix's length.",
  "scan.ts": "What a reader should give back for each symbol of a label.",
  "table.ts": "Rows from CSV, pasted cells and Excel workbooks, read without a library.",
  "bulk.ts": "Columns mapped to AIs, cells normalised, each row checked.",
  "report.ts": "The validation report: fixes, skips, the report and the corrected rows as CSV.",
  "sequence.ts": "Serial numbers and SSCCs made in the studio.",
  "sheets.ts": "Laser label sheets: Avery's and custom ones.",
  "batch.ts": "Every row's label from one design: files by a name pattern, PDF, sheets, ZPL, a CSV.",
  "gs1128.ts": "GS1-128 over several symbols: the split and the stack.",
  "sign.ts": "GS1 digital signatures (JWS) and verifiable credentials.",
  "ndef.ts": "NDEF URI records for NFC tags.",
  "printer.ts": "Printer profiles, the module in whole dots, the print width.",
  "logistic.ts": "The GS1 Logistic Label (General Specifications 6.6).",
};

/** The exported names of index.ts, grouped by module, in the order they are exported. */
function exportsByModule() {
  const index = readFileSync(join(src, "index.ts"), "utf8");
  const modules = [];
  for (const m of index.matchAll(/export\s*(type\s*)?\{([^}]*)\}\s*from\s*"\.\/([\w.]+)"/g)) {
    const names = m[2].split(",").map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/^type\s+/, ""));
    const existing = modules.find((x) => x.file === m[3]);
    if (existing) existing.names.push(...names);
    else modules.push({ file: m[3], names });
  }
  return modules;
}

/** The declaration of `name` in a module's text: its kind, its first line, the comment above it. */
function declaration(text, name) {
  const lines = text.split("\n");
  const header = moduleHeader(text);
  const re = new RegExp(`^export\\s+(?:declare\\s+)?(async\\s+function|function|const|let|class|interface|type|enum)\\s+${name}\\b`);
  const at = lines.findIndex((l) => re.test(l));
  if (at < 0) return null;
  const kind = re.exec(lines[at])[1].replace("async ", "");
  // The declaration up to its body or its end, on one line.
  let decl = "";
  for (let i = at; i < lines.length && i < at + 12; i++) {
    decl += (decl ? " " : "") + lines[i].trim();
    if (/[{;}]$|=>\s*$|= \{$|= \[$/.test(lines[i].trim()) || /\)\s*:\s*[^=]*\{$/.test(lines[i].trim())) break;
  }
  decl = decl.replace(/^export\s+/, "").replace(/\s*\{\s*\}?$/, "").replace(/\s*=\s*[[{(]$/, "").replace(/\s+/g, " ");
  if (kind === "const" || kind === "let") decl = decl.replace(/\s*=\s*.*$/, "");
  if (decl.length > 160) decl = decl.slice(0, 157) + "…";
  // The JSDoc comment right above (// comments are notes on the code, or a module's header, not the name's description).
  let doc = [];
  let i = at - 1;
  if (i >= 0 && /\*\/\s*$/.test(lines[i])) {
    while (i >= 0 && !/\/\*/.test(lines[i])) doc.unshift(lines[i--]);
    if (i >= 0 && /\/\*\*/.test(lines[i]) && i !== header?.start) doc.unshift(lines[i]);
    else doc = [];
    doc = doc.map((l) => l.replace(/^\s*\/\*\*?\s?|\s*\*\/\s*$|^\s*\*\s?/g, ""));
  }
  const description = doc.join(" ").replace(/@\w+[^.]*$/, "").replace(/\s+/g, " ").trim();
  return { kind, decl, description };
}

/** A module's header: its first JSDoc block of three lines or more, before any export. */
function moduleHeader(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^\/\*\*/.test(l));
  if (start < 0 || lines.slice(0, start).some((l) => /^export\b/.test(l))) return null;
  const end = lines.findIndex((l, i) => i >= start && /\*\/\s*$/.test(l));
  if (end - start < 2) return null;
  const body = lines.slice(start, end + 1).map((l) => l.replace(/^\s*\/\*\*?\s?|\s*\*\/\s*$|^\s*\*\s?/g, ""));
  return { start, text: body.join(" ").replace(/\s+/g, " ").trim() };
}

const cell = (s) => s.replace(/\|/g, "\\|").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function apiReference() {
  const out = [];
  const modules = exportsByModule();
  const total = modules.reduce((n, m) => n + m.names.length, 0);
  out.push("# The core's API reference", "");
  out.push(
    "`@gs1-label-studio/core` (`packages/core`) holds every GS1 rule, encoder and exporter of the studio, with no user " +
      "interface: the web application is one of its users, and a command line or an HTTP API could be others " +
      "([ADR 0001](adr/0001-browser-first-architecture.md)). It runs in the browser, in Web Workers and in Node 22.",
    "",
    `This reference lists the ${total} names \`packages/core/src/index.ts\` exports, module by module, each with its ` +
      "declaration and the comment above it in the source. It is generated by `node scripts/api-reference.mjs`, and " +
      "a test fails when it differs from the sources ([ADR 0005](adr/0005-documentation-and-feature-inventory.md)): " +
      "do not edit it by hand. How the modules fit together: the [developer guide](developer-guide.md).",
    "",
    "The package is not published to npm yet; inside the repository it is imported as `@gs1-label-studio/core`:",
    "",
    "```ts",
    'import { syntaxEngine, labelFor, labelSvg, labelPdf } from "@gs1-label-studio/core";',
    "```",
    "",
    "## Modules",
    "",
    "| Module | What it holds | Names |",
    "|---|---|---:|",
  );
  for (const m of modules) {
    out.push(`| [\`${m.file}\`](#${m.file.replace(/\./g, "").toLowerCase()}) | ${MODULES[m.file] ?? ""} | ${m.names.length} |`);
  }
  out.push("");
  for (const m of modules) {
    const text = readFileSync(join(src, m.file), "utf8");
    const header = moduleHeader(text);
    out.push(`## ${m.file}`, "", MODULES[m.file] ?? "", "");
    if (header) out.push(`> ${header.text}`, "");
    out.push("| Name | Kind | Declaration | Description |", "|---|---|---|---|");
    for (const name of m.names) {
      const d = declaration(text, name);
      if (!d) {
        out.push(`| \`${name}\` | re-export | | |`);
        continue;
      }
      out.push(`| \`${name}\` | ${d.kind} | \`${cell(d.decl).replace(/`/g, "'")}\` | ${cell(d.description)} |`);
    }
    out.push("");
  }
  return out.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = join(root, "docs/core-api.md");
  const text = apiReference();
  if (process.argv.includes("--check")) {
    const same = readFileSync(target, "utf8") === text;
    console.log(same ? "docs/core-api.md is up to date" : "docs/core-api.md differs from the sources: run node scripts/api-reference.mjs");
    process.exit(same ? 0 : 1);
  }
  writeFileSync(target, text);
  console.log(`docs/core-api.md written`);
}
