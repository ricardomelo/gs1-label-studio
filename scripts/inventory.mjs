#!/usr/bin/env node
// The inventory of features drawn from the tests (ADR 0005): every test of the core's suite, of the web application's
// unit tests and of the editor's browser tests, grouped by area, written to docs/test-inventory.md and docs/test-inventory.json.
// Usage: node scripts/inventory.mjs [--from <vitest.json>]
//   Runs the core's tests with Vitest's JSON reporter (or reads a report already written, --from) and lists the
//   browser tests with Playwright (--list: their names do not depend on a run). Refuses to write when a test failed.
//   Run it with LABELARY=1 (and NODE_USE_ENV_PROXY=1 behind a proxy) so that the ZPL tests through Labelary are run
//   too; without it they are listed as skipped locally.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);
const fromIndex = args.indexOf("--from");

/** Areas in the order of the user guide; each test file (a "program", as in the resolver's inventory) in one. */
export const AREAS = [
  ["Input and identification: the Syntax Engine, keys, qualifiers, attributes", ["syntax", "identify", "identifiers", "attributes", "checkDigit"]],
  ["Where it is scanned: the guided choice and the symbol specification tables", ["guide", "specifications", "environments"]],
  ["Symbols and the label's layout", ["layout", "labelsvg", "bars", "hriplace", "gs1128", "qrmode", "logistic", "pyformat"]],
  ["Exports and prepress: SVG, PNG, PDF, EPS, zip", ["render", "prepress", "roundtrip"]],
  ["In bulk: rows, the report, sequences, generation", ["table", "bulk", "report", "sequence", "batch"]],
  ["Printers: the dot grid, profiles and ZPL", ["dots", "printer", "zpl", "labelary"]],
  ["RFID, NFC and digital signatures", ["epc", "ndef", "sign"]],
  ["The interface's languages: English, Brazilian Portuguese, Spanish", ["i18n"]],
  ["The documents", ["docs"]],
  ["The editor in the browser (Playwright, desktop, phone and tablet)", ["editor", "layouts"]],
];

const programOf = (file) => basename(file).replace(/\.(test|spec)\.tsx?$/, "");

function vitestReport(cwd, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), "inventory-"));
  const out = join(dir, "vitest.json");
  try {
    try {
      execFileSync("npx", ["vitest", "run", "--reporter=json", `--outputFile=${out}`, ...extra], {
        cwd: join(root, cwd), stdio: ["ignore", "ignore", "inherit"],
      });
    } catch {
      // A failed test exits non-zero; the report says which, below.
    }
    return JSON.parse(readFileSync(out, "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function browserList() {
  const json = execFileSync("npx", ["playwright", "test", "--list", "--reporter=json"], {
    cwd: join(root, "apps/web"), encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  const report = JSON.parse(json);
  const programs = new Map();
  const walk = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      const program = programOf(spec.file);
      const name = [...titles, spec.title].join(" › ");
      const entry = programs.get(program) ?? new Map();
      const projects = entry.get(name) ?? new Set();
      for (const t of spec.tests) projects.add(t.projectName);
      entry.set(name, projects);
      programs.set(program, entry);
    }
    for (const child of suite.suites ?? []) walk(child, [...titles, child.title]);
  };
  for (const suite of report.suites) walk(suite, []);
  return [...programs].map(([program, tests]) => ({
    program,
    file: `apps/web/e2e/${program}.spec.ts`,
    kind: "browser",
    tests: [...tests].map(([name, projects]) => ({ name, status: "listed", projects: [...projects].sort() })),
  }));
}

// The documents' own test checks this inventory, so it is listed rather than run: it runs after the inventory is written
// (pnpm check, CI).
const report = fromIndex >= 0 ? JSON.parse(readFileSync(args[fromIndex + 1], "utf8")) : vitestReport("packages/core", ["--exclude", "test/docs.test.ts"]);
const docsList = JSON.parse(execFileSync("npx", ["vitest", "list", "test/docs.test.ts", "--json"], { cwd: join(root, "packages/core"), encoding: "utf8" }));
report.testResults = report.testResults.filter((f) => !f.name.endsWith("/docs.test.ts"));
report.testResults.push({
  name: join(root, "packages/core/test/docs.test.ts"), status: "passed",
  assertionResults: docsList.map((t) => {
    const parts = t.name.split(" > ");
    return { ancestorTitles: parts.slice(0, -1), title: parts.at(-1), fullName: parts.join(" "), status: "passed" };
  }),
});
const webReport = vitestReport("apps/web");
report.testResults.push(...webReport.testResults.map((f) => ({ ...f, web: true })));
const failed = report.testResults.flatMap((f) => [
  ...f.assertionResults.filter((a) => a.status === "failed").map((a) => a.fullName),
  ...(f.status === "failed" && !f.assertionResults.some((a) => a.status === "failed") ? [`${basename(f.name)}: ${f.message}`] : []),
]);
if (failed.length) {
  console.error(`Not written: ${failed.length} test(s) failed:\n- ${failed.join("\n- ")}`);
  process.exit(1);
}
const core = report.testResults
  .map((f) => ({
    program: programOf(f.name),
    file: f.web ? `apps/web/test/${basename(f.name)}` : `packages/core/test/${basename(f.name)}`,
    kind: "unit",
    tests: f.assertionResults.map((a) => ({
      name: [...a.ancestorTitles, a.title].join(" › "),
      status: a.status === "passed" ? "passed" : "skipped",
    })),
  }))
  .sort((a, b) => a.program.localeCompare(b.program));
const programs = [...core, ...browserList()];

const area = new Map(AREAS.flatMap(([name, list]) => list.map((p) => [p, name])));
const unplaced = programs.filter((p) => !area.has(p.program)).map((p) => p.program);
if (unplaced.length) {
  console.error(`Not written: no area for ${unplaced.join(", ")} — add them to AREAS in scripts/inventory.mjs`);
  process.exit(1);
}
for (const p of programs) p.area = area.get(p.program);

const date = new Date().toISOString().slice(0, 10);
const count = (list) => list.reduce((n, p) => n + p.tests.length, 0);
const skipped = programs.flatMap((p) => p.tests.filter((t) => t.status === "skipped")).length;
const fmt = (n) => n.toLocaleString("en-GB");
const anchor = (s) => s.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");

writeFileSync(join(root, "docs/test-inventory.json"), JSON.stringify({ date, skipped, programs }, null, 1) + "\n");

const md = [];
md.push("# Inventory of features from the tests", "");
md.push(
  `Every test of the core's suite, of the web application's unit tests and of the editor's browser tests on ${date}: ${fmt(count(programs))} tests in ` +
    `${programs.length} files. Each line is a test's name, a sentence that says what is true when it passes; together ` +
    `they say what the studio does and that it works. Each feature of [features.md](features.md) names the tests that ` +
    `prove it. Generated by \`node scripts/inventory.mjs\` from a complete run of the core's tests and the list of the ` +
    `browser tests ([ADR 0005](adr/0005-documentation-and-feature-inventory.md)); do not edit by hand.`,
  "",
);
md.push(
  skipped
    ? `${fmt(skipped)} tests were skipped in the run that wrote this file (the ZPL printed by Labelary, which CI runs with \`LABELARY=1\`).`
    : "Every unit test ran and passed in the run that wrote this file, the ZPL printed by Labelary included (`LABELARY=1`), but " +
        "the documents' own test (`docs`), which checks this file and runs right after it is written. The browser tests are " +
        "listed by Playwright and run by CI against the built application, on a desktop, a phone and a tablet held horizontally " +
        "(a test about one layout is skipped in the others).",
  "",
);
md.push("| Area | Files | Tests |", "|---|---|---:|");
for (const [name] of AREAS) {
  const list = programs.filter((p) => p.area === name);
  md.push(`| [${name}](#${anchor(name)}) | ${list.map((p) => `\`${p.program}\``).join(", ")} | ${fmt(count(list))} |`);
}
md.push("");
for (const [name] of AREAS) {
  md.push(`## ${name}`, "");
  for (const p of programs.filter((x) => x.area === name)) {
    md.push(`<details><summary><code>${p.program}</code> — ${p.tests.length} tests (<code>${p.file}</code>)</summary>`, "");
    for (const t of p.tests) md.push(`- ${t.name.replace(/([<>|*_`[\]])/g, "\\$1")}${t.status === "skipped" ? " *(skipped locally)*" : ""}`);
    md.push("", "</details>", "");
  }
}
writeFileSync(join(root, "docs/test-inventory.md"), md.join("\n"));
// The developer guide's table of tests (section 9) follows the inventory's counts; a file it does not list yet is said.
const guidePath = join(root, "docs/developer-guide.md");
let guide = readFileSync(guidePath, "utf8");
const counts = new Map(programs.map((p) => [p.program, p.tests.length]));
const listed = new Set();
guide = guide.replace(/^(\| `([\w-]+)` \| [^|]+ \| )([\d,]+)( \|)$/gm, (line, head, program, _n, tail) => {
  listed.add(program);
  return counts.has(program) ? `${head}${fmt(counts.get(program))}${tail}` : line;
});
writeFileSync(guidePath, guide);
const unlisted = programs.filter((p) => !listed.has(p.program)).map((p) => p.program);
if (unlisted.length) console.warn(`docs/developer-guide.md, section 9: add a row for ${unlisted.join(", ")}`);
console.log(`docs/test-inventory.md and .json: ${fmt(count(programs))} tests in ${programs.length} files, ${skipped} skipped`);
