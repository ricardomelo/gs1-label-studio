#!/usr/bin/env node
// Development indicators measured from the repository, for the project's closing report (docs/metrics/README.md).
// Usage: node scripts/metrics.mjs [--no-tests] [--write]
//   --write     also saves docs/metrics/snapshots/<date>.json
//   --no-tests  skips running the test suites (the test count is then left out)
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const args = new Set(process.argv.slice(2));
const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" });
const hasCommits = (() => {
  try {
    git("rev-parse", "--verify", "-q", "HEAD");
    return true;
  } catch {
    return false;
  }
})();

// Every tracked file falls in one category. Effort is estimated from code, tests and docs only; data and
// translations, configuration and generated files are counted but not weighed as programming effort.
const CATEGORIES = [
  ["generated", (f) => /(^|\/)pnpm-lock\.yaml$/.test(f) || f.startsWith("docs/metrics/snapshots/")],
  ["excluded", (f) => f === "LICENSE" || /\.(png|jpe?g|gif|ico|woff2?|ttf|otf|pdf|wasm)$/i.test(f)],
  ["tests", (f) => /(^|\/)(test|tests|e2e)\//.test(f) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(f)],
  ["docs", (f) => /\.md$/i.test(f) || f.startsWith("docs/")],
  ["data", (f) => /(^|\/)(locales|data)\//.test(f) || /\.(csv|tsv)$/i.test(f)],
  ["config", (f) => /(^|\/)(package\.json|tsconfig[^/]*\.json|pnpm-workspace\.yaml|vite\.config\.ts|\.[^/]+)$/.test(f)
    || f.startsWith(".github/")],
  ["code", () => true],
];
const categoryOf = (file) => CATEGORIES.find(([, test]) => test(file))[0];

function lineCounts() {
  const counts = {};
  for (const file of git("ls-files", "-z").split("\0").filter(Boolean)) {
    const category = categoryOf(file);
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    const lines = text.length === 0 ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
    counts[category] ??= { files: 0, lines: 0 };
    counts[category].files += 1;
    counts[category].lines += lines;
  }
  return counts;
}

function commits() {
  const log = hasCommits ? git("log", "--format=%H%x09%aI%x09%s", "--no-merges").trim() : "";
  const list = log ? log.split("\n").map((line) => line.split("\t")) : [];
  const perDay = {};
  for (const [, date] of list) perDay[date.slice(0, 10)] = (perDay[date.slice(0, 10)] ?? 0) + 1;
  const days = Object.keys(perDay).sort();
  const first = days[0];
  const last = days.at(-1);
  const calendarDays = first ? Math.round((Date.parse(last) - Date.parse(first)) / 86400000) + 1 : 0;
  return { total: list.length, first, last, daysWithCommits: days.length, calendarDays, perDay };
}

function tests() {
  let total = 0;
  for (const dir of ["packages", "apps"].flatMap((base) =>
    existsSync(join(root, base)) ? execFileSync("ls", [join(root, base)], { encoding: "utf8" }).split("\n")
      .filter(Boolean).map((name) => join(root, base, name)) : [])) {
    const pkg = join(dir, "package.json");
    if (!existsSync(pkg) || !JSON.parse(readFileSync(pkg, "utf8")).devDependencies?.vitest) continue;
    const tmp = mkdtempSync(join(tmpdir(), "metrics-"));
    const report = join(tmp, "vitest.json");
    execFileSync("npx", ["vitest", "run", "--reporter=json", `--outputFile=${report}`], { cwd: dir, stdio: "ignore" });
    total += JSON.parse(readFileSync(report, "utf8")).numTotalTests;
    rmSync(tmp, { recursive: true });
  }
  return total;
}

const snapshot = {
  date: new Date().toISOString().slice(0, 10),
  head: hasCommits ? git("rev-parse", "--short", "HEAD").trim() : "(no commits)",
  commits: commits(),
  lines: lineCounts(),
  ...(args.has("--no-tests") ? {} : { tests: tests() }),
};

const effort = ["code", "tests", "docs"].reduce((sum, c) => sum + (snapshot.lines[c]?.lines ?? 0), 0);
console.log(`Indicators at ${snapshot.head} (${snapshot.date})`);
console.log(`  commits: ${snapshot.commits.total} in ${snapshot.commits.daysWithCommits} days with commits, ` +
  `${snapshot.commits.calendarDays} calendar days (${snapshot.commits.first} → ${snapshot.commits.last})`);
for (const [category, { files, lines }] of Object.entries(snapshot.lines)) {
  console.log(`  ${category.padEnd(10)} ${String(lines).padStart(7)} lines in ${files} files`);
}
console.log(`  code + tests + docs: ${effort} lines`);
if (snapshot.tests !== undefined) console.log(`  automated tests: ${snapshot.tests}`);

if (args.has("--write")) {
  const file = join(root, "docs/metrics/snapshots", `${snapshot.date}.json`);
  writeFileSync(file, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`  saved ${file.slice(root.length)}`);
}
