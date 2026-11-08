#!/usr/bin/env node
// Following the GS1 Barcode Syntax Engine's releases (docs/developer-guide.md, "A new Syntax Engine release").
//
// Two files of this repository are derived from the engine's sources rather than written by hand:
//   packages/core/src/data/gs1_dictionary.json  the GS1 Barcode Syntax Dictionary (gs1-syntax-dictionary.txt)
//   apps/web/test/engine-messages.json          the engine's English messages (tr_EN.h) and its linters' messages
//                                               (gs1syntaxdictionary.h and .c), which each language must translate
// This script makes both from a release's sources, as the GS1 Digital Link Resolver CE's portal did when they were
// first ported, and moves the release named in package.json and the documents along with them.
//
//   node scripts/syntax-engine.mjs --latest            the newest gs1encoder on npm, and whether ours is behind
//   node scripts/syntax-engine.mjs --verify            the two files made again from our release's sources, compared
//   node scripts/syntax-engine.mjs --update [VERSION]  move to VERSION (default: the newest on npm), the core's API
//                                                      reference with it; then run pnpm install and pnpm check
//
// --latest writes "current=…", "latest=…" and "behind=true|false" to $GITHUB_OUTPUT when it is set
// (.github/workflows/syntax-engine.yml). The sources are fetched with git from github.com/gs1/gs1-syntax-engine at the
// tag that names the release (1.4.1, …), into a temporary directory that is removed afterwards.

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_REPOSITORY = "https://github.com/gs1/gs1-syntax-engine";
export const DICTIONARY_FILE = "packages/core/src/data/gs1_dictionary.json";
export const MESSAGES_FILE = "apps/web/test/engine-messages.json";
const PACKAGE_FILE = "packages/core/package.json";
const MESSAGES_SOURCE =
  "GS1 Barcode Syntax Engine's tr_EN.h and its linters, as the GS1 Digital Link Resolver CE read them (portal/engine_messages.json)";

// The documents that name the engine's release, each with the words around it, so that a release elsewhere in the
// same file (epc-tds 1.4.1, a dated history) is left alone. history.md and CHANGELOG.md tell what was, so they are not
// in this list.
export const RELEASE_MENTIONS = [
  ["README.md", /(GS1%20Barcode%20Syntax%20Engine-)(\d+\.\d+\.\d+)/g],
  ["README.md", /(!\[GS1 Barcode Syntax Engine )(\d+\.\d+\.\d+)/g],
  ["docs/features.md", /(`gs1encoder` )(\d+\.\d+\.\d+)/g],
  ["docs/conformance.md", /(GS1 Barcode Syntax Engine )(\d+\.\d+\.\d+)/g],
  ["docs/conformance.md", /(`gs1encoder` )(\d+\.\d+\.\d+)/g],
  ["docs/third-party.md", /(\(`gs1encoder`, WebAssembly\) \| )(\d+\.\d+\.\d+)/g],
  ["docs/third-party.md", /(Resolver CE's portal read it \(release )(\d+\.\d+\.\d+)/g],
  ["docs/developer-guide.md", /(as the resolver read it, release )(\d+\.\d+\.\d+)/g],
  ["packages/core/src/dictionary.ts", /(Syntax Engine release )(\d+\.\d+\.\d+)/g],
];

/** A C string literal's text: \" and \\ as the characters they stand for. */
function unescaped(text) {
  return text.replace(/\\(["\\])/g, "$1");
}

/** A printf conversion of tr_EN.h as the placeholders {p1}, {p2}… that the translations carry. */
function placeholders(format) {
  let n = 0;
  return format.replace(/%(?:\.\*|\.\d+)?[sdc]/g, () => `{p${++n}}`).replace(/%%/g, "%");
}

/** The engine's own messages, in the order of tr_EN.h: TR_EN_NAME "text" → NAME: text with {p1}… */
export function engineMessages(trEN) {
  const messages = {};
  for (const [, name, text] of trEN.matchAll(/^#define TR_EN_(\w+) "((?:[^"\\]|\\.)*)"/gm)) {
    messages[name] = placeholders(unescaped(text));
  }
  return messages;
}

/** The linters' messages: the names of gs1_lint_err_t with gs1_lint_err_str's texts, in the same order. */
export function linterMessages(header, source) {
  const body = /typedef enum\s*\{([\s\S]*?)\}\s*gs1_lint_err_t/.exec(header)?.[1];
  const array = /gs1_lint_err_str\[\]\s*=\s*\{([\s\S]*?)\};/.exec(source)?.[1];
  if (body === undefined || array === undefined) throw new Error("gs1_lint_err_t or gs1_lint_err_str not found");
  const names = [...body.matchAll(/^\s*GS1_LINTER_(\w+)/gm)].map((m) => m[1]);
  const texts = [...array.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => unescaped(m[1]));
  if (names.length !== texts.length) throw new Error(`${names.length} linter codes but ${texts.length} texts`);
  const linters = {};
  names.forEach((name, i) => {
    if (name !== "OK" && !/^UNUSED_\d+$/.test(name)) linters[name] = texts[i];
  });
  return linters;
}

/** One component of a specification: "N14,csum,gcppos2", "[N2],mi", "X..20". */
function component(spec) {
  const optional = spec.startsWith("[");
  const [type, ...linters] = spec.replace(/^\[([^\]]*)\]/, "$1").split(",");
  const m = /^([NXYZ])(\.\.)?(\d+)$/.exec(type ?? "");
  if (!m) throw new Error(`a component the dictionary script does not know: ${spec}`);
  const length = Number(m[3]);
  return { linters, max: length, min: m[2] ? 1 : length, optional, type: m[1] };
}

/** "01+21,02,35nn" → [["01", "21"], ["02"], ["35nn"]]. */
function groups(list) {
  return list.split(",").map((group) => group.split("+"));
}

/** Every AI of an entry: "91-99" → 91…99, "3100-3105" → 3100…3105. */
function range(ais) {
  const [first, last] = ais.split("-");
  if (last === undefined) return [first];
  const out = [];
  for (let n = Number(first); n <= Number(last); n++) out.push(String(n).padStart(first.length, "0"));
  return out;
}

/**
 * The GS1 Barcode Syntax Dictionary (gs1-syntax-dictionary.txt) as gs1_dictionary.json holds it: [AI, entry] in the
 * dictionary's order (an object would put "30" or "90" before "00", as integer keys come first).
 */
export function dictionaryEntries(text) {
  const ais = [];
  for (const raw of text.split("\n")) {
    if (/^\s*(#|$)/.test(raw)) continue;
    const hash = raw.indexOf("#");
    const title = hash < 0 ? "" : raw.slice(hash + 1).trim();
    const words = (hash < 0 ? raw : raw.slice(0, hash)).trim().split(/\s+/);
    const keys = range(words.shift());
    const flags = /^[NXYZ[]/.test(words[0] ?? "") ? "" : words.shift();
    const components = [];
    while (words.length && /^(\[?[NXYZ])/.test(words[0])) components.push(component(words.shift()));
    const entry = { components };
    const ex = [];
    const req = [];
    for (const word of words) {
      const [key, value] = word.split("=");
      if (key === "dlpkey") entry.dlpkey = value === undefined ? [[]] : value.split("|").map((seq) => seq.split(","));
      else if (key === "ex") ex.push(groups(value));
      else if (key === "req") req.push(groups(value));
      else throw new Error(`an attribute the dictionary script does not know: ${word}`);
    }
    Object.assign(entry, { ex, flags, req, title });
    for (const ai of keys) ais.push([ai, sorted(entry)]);
  }
  return ais;
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sorted(value[k])]));
  }
  return value;
}

/** The dictionary's own release date, from its header: "# Release: 2026-01-27". */
export function dictionaryRelease(text) {
  const date = /^#\s*Release:\s*(\S+)/m.exec(text)?.[1];
  if (!date) throw new Error("the dictionary names no release date");
  return date;
}

/** gs1_dictionary.json's text: one AI a line, as Python's json.dumps(sort_keys=True) wrote it for the resolver. */
export function dictionaryJson(release, date, ais) {
  const lines = ais.map(([ai, entry]) => `    ${JSON.stringify(ai)}: ${pythonJson(entry)}`);
  return `{\n  "release": ${JSON.stringify(release)},\n  "dictionary": ${JSON.stringify(date)},\n  "ais": {\n${lines.join(",\n")}\n  }\n}\n`;
}

function pythonJson(value) {
  if (Array.isArray(value)) return `[${value.map(pythonJson).join(", ")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${pythonJson(v)}`).join(", ")}}`;
  }
  return JSON.stringify(value);
}

/** engine-messages.json's text. */
export function messagesJson(release, messages, linters) {
  return `${JSON.stringify({ release, source: MESSAGES_SOURCE, messages, linters }, null, 1)}`;
}

/** Both files from a checkout of the engine's sources at a release's tag. */
export function derivedFiles(sources, release) {
  const lib = join(sources, "src/c-lib");
  const dictionary = readFileSync(join(lib, "gs1-syntax-dictionary.txt"), "utf8");
  return {
    [DICTIONARY_FILE]: dictionaryJson(release, dictionaryRelease(dictionary), dictionaryEntries(dictionary)),
    [MESSAGES_FILE]: messagesJson(
      release,
      engineMessages(readFileSync(join(lib, "tr_EN.h"), "utf8")),
      linterMessages(
        readFileSync(join(lib, "syntax/gs1syntaxdictionary.h"), "utf8"),
        readFileSync(join(lib, "syntax/gs1syntaxdictionary.c"), "utf8"),
      ),
    ),
  };
}

/** The documents' mentions of the engine's release moved from one to another; the files changed. */
export function moveMentions(read, write, from, to) {
  const changed = new Set();
  for (const [file, pattern] of RELEASE_MENTIONS) {
    const text = read(file);
    const next = text.replace(pattern, (whole, before, version) => (version === from ? before + to : whole));
    if (next !== text) {
      write(file, next);
      changed.add(file);
    }
  }
  return [...changed];
}

/** The keys of the engine's messages and linters that one release has and the other has not, or whose text moved. */
export function messageChanges(before, after) {
  const out = { added: [], removed: [], changed: [] };
  for (const part of ["messages", "linters"]) {
    for (const [key, text] of Object.entries(after[part])) {
      if (!(key in before[part])) out.added.push(text);
      else if (before[part][key] !== text) out.changed.push(`${before[part][key]} → ${text}`);
    }
    for (const [key, text] of Object.entries(before[part])) if (!(key in after[part])) out.removed.push(text);
  }
  return out;
}

const file = (name) => join(root, name);
const read = (name) => readFileSync(file(name), "utf8");
const write = (name, text) => writeFileSync(file(name), text);

function installedRelease() {
  return JSON.parse(read(PACKAGE_FILE)).dependencies.gs1encoder;
}

function latestRelease() {
  return execFileSync("npm", ["view", "gs1encoder", "version"], { encoding: "utf8" }).trim();
}

/** Whether release a comes after release b: 1.10.0 after 1.9.9. */
export function newer(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

function withSources(release, use) {
  const dir = mkdtempSync(join(tmpdir(), "gs1-syntax-engine-"));
  try {
    execFileSync("git", ["-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--branch", release, ENGINE_REPOSITORY, dir], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    return use(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function output(values) {
  for (const [k, v] of Object.entries(values)) console.log(`${k}=${v}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(""));
  }
}

async function main(args) {
  const current = installedRelease();
  if (args[0] === "--latest") {
    const latest = latestRelease();
    output({ current, latest, behind: newer(latest, current) });
    return 0;
  }
  if (args[0] === "--verify") {
    const files = withSources(current, (dir) => derivedFiles(dir, current));
    const stale = Object.entries(files).filter(([name, text]) => read(name) !== text).map(([name]) => name);
    for (const name of stale) console.error(`${name} is not what release ${current}'s sources give`);
    if (!stale.length) console.log(`${Object.keys(files).join(" and ")}: as release ${current}'s sources give them`);
    return stale.length ? 1 : 0;
  }
  if (args[0] === "--update") {
    const named = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
    const release = named ?? latestRelease();
    if (!/^\d+\.\d+\.\d+$/.test(release)) throw new Error(`not a release: ${release}`);
    if (release === current) {
      console.log(`gs1encoder is already ${release}`);
      return 0;
    }
    const before = JSON.parse(read(MESSAGES_FILE));
    const files = withSources(release, (dir) => derivedFiles(dir, release));
    for (const [name, text] of Object.entries(files)) write(name, text);
    const pkg = read(PACKAGE_FILE);
    write(PACKAGE_FILE, pkg.replace(`"gs1encoder": "${current}"`, `"gs1encoder": "${release}"`));
    const changed = moveMentions(read, write, current, release);
    // The core's API reference quotes dictionary.ts's comment, which names the release.
    const { apiReference } = await import(pathToFileURL(join(root, "scripts/api-reference.mjs")).href);
    const reference = apiReference();
    if (reference !== read("docs/core-api.md")) {
      write("docs/core-api.md", reference);
      changed.push("docs/core-api.md");
    }
    const notes = messageChanges(before, JSON.parse(files[MESSAGES_FILE]));
    const report = [
      `gs1encoder ${current} → ${release}`,
      `Made again from the release's sources: ${Object.keys(files).join(", ")}`,
      `The release named in: ${[PACKAGE_FILE, ...changed].join(", ")}`,
      `Engine messages added (to translate in each language): ${notes.added.length}`,
      ...notes.added.map((m) => `  + ${m}`),
      `Engine messages whose English changed (their translations to check): ${notes.changed.length}`,
      ...notes.changed.map((m) => `  ~ ${m}`),
      `Engine messages removed: ${notes.removed.length}`,
      ...notes.removed.map((m) => `  - ${m}`),
    ].join("\n");
    console.log(report);
    const reportFile = args.includes("--report") ? args[args.indexOf("--report") + 1] : undefined;
    if (reportFile) writeFileSync(reportFile, `${report}\n`);
    return 0;
  }
  console.error("usage: node scripts/syntax-engine.mjs --latest | --verify | --update [VERSION] [--report FILE]");
  return 2;
}

if (process.argv[1] && existsSync(process.argv[1]) && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main(process.argv.slice(2));
}
