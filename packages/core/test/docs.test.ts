import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

// The documents kept in step with the code and the tests (ADR 0005): the core's API reference is what its sources
// give, every feature names tests that exist, the developer guide's counts are the inventory's, and links lead to files.

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

interface Program {
  program: string;
  file: string;
  kind: "unit" | "browser";
  area: string;
  tests: { name: string; status: string }[];
}
const inventory = JSON.parse(read("docs/test-inventory.json")) as { programs: Program[] };
const programs = new Map(inventory.programs.map((p) => [p.program, p]));
// This file's own tests, from its source: a feature may name them before the inventory lists them (it is written from a
// run in which this file must already pass).
programs.set("docs", {
  program: "docs", file: "packages/core/test/docs.test.ts", kind: "unit", area: "The documents",
  tests: [...readFileSync(fileURLToPath(import.meta.url), "utf8").matchAll(/\bit\("([^"]+)"/g)].map((m) => ({ name: m[1]!, status: "passed" })),
});

/** The references of a features.md cell: `program` alone, or `program`: words found in one of its tests' names. */
export function references(cell: string): { program: string; words?: string }[] {
  return cell
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = /^`([\w-]+)`(?::\s*(.+))?$/.exec(part);
      if (!m) return { program: `(not a reference: ${part})` };
      return { program: m[1]!, words: m[2]?.trim() };
    });
}

/** What is wrong with a reference, or null. */
export function referenceProblem(ref: { program: string; words?: string }, known: Map<string, Program>): string | null {
  const program = known.get(ref.program);
  if (!program) return `no test file ${ref.program}`;
  if (ref.words && !program.tests.some((t) => t.name.includes(ref.words!))) return `no test of ${ref.program} says "${ref.words}"`;
  return null;
}

/** The rows of features.md's tables: the feature's name and its Tests cell. */
function featureRows(): { feature: string; tests: string }[] {
  const rows: { feature: string; tests: string }[] = [];
  let testsColumn = -1;
  for (const line of read("docs/features.md").split("\n")) {
    if (!line.startsWith("|")) {
      testsColumn = -1;
      continue;
    }
    const cells = line.slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim());
    if (testsColumn < 0) {
      testsColumn = cells.indexOf("Tests");
      continue;
    }
    if (/^-+$/.test((cells[0] ?? "").replace(/:/g, ""))) continue;
    rows.push({ feature: cells[0] ?? "", tests: cells[testsColumn] ?? "" });
  }
  return rows;
}

describe("the core's API reference", () => {
  it("is what the sources give (node scripts/api-reference.mjs)", async () => {
    const generator = (await import(pathToFileURL(join(root, "scripts/api-reference.mjs")).href)) as { apiReference(): string };
    expect(read("docs/core-api.md") === generator.apiReference(), "docs/core-api.md is out of date: run node scripts/api-reference.mjs").toBe(true);
  });
});

describe("the inventory of tests", () => {
  it("lists every test file there is, and no other", () => {
    const onDisk = [
      ...readdirSync(join(root, "packages/core/test")).filter((f) => f.endsWith(".test.ts")).map((f) => `packages/core/test/${f}`),
      ...readdirSync(join(root, "apps/web/test")).filter((f) => f.endsWith(".test.ts")).map((f) => `apps/web/test/${f}`),
      ...readdirSync(join(root, "apps/web/e2e")).filter((f) => f.endsWith(".spec.ts")).map((f) => `apps/web/e2e/${f}`),
    ].sort();
    expect(inventory.programs.map((p) => p.file).sort()).toEqual(onDisk);
  });
});

describe("features.md", () => {
  const rows = featureRows();

  it("lists the features in tables with a Tests column", () => {
    expect(rows.length).toBeGreaterThan(100);
  });

  it("every feature names at least one test, and every test it names exists", () => {
    const problems: string[] = [];
    for (const row of rows) {
      const refs = references(row.tests);
      if (refs.length === 0) problems.push(`${row.feature}: names no test`);
      for (const ref of refs) {
        const problem = referenceProblem(ref, programs);
        if (problem) problems.push(`${row.feature}: ${problem}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("a reference to words no test has is caught", () => {
    expect(referenceProblem({ program: "zpl", words: "no test says this" }, programs)).toMatch(/no test of zpl/);
    expect(referenceProblem({ program: "nothing" }, programs)).toMatch(/no test file/);
    expect(references("`zpl`: ^BC · `editor`")).toEqual([{ program: "zpl", words: "^BC" }, { program: "editor", words: undefined }]);
  });
});

describe("the developer guide", () => {
  it("counts each test file's tests as the inventory does", () => {
    const text = read("docs/developer-guide.md");
    const counted = new Map<string, number>();
    for (const m of text.matchAll(/^\| `([\w-]+)` \| [^|]+ \| ([\d,]+) \|/gm)) counted.set(m[1]!, Number(m[2]!.replace(/,/g, "")));
    const expected = new Map(inventory.programs.map((p) => [p.program, p.tests.length]));
    expect(Object.fromEntries(counted)).toEqual(Object.fromEntries(expected));
  });
});

describe("links between the documents", () => {
  it("lead to files that exist", () => {
    const documents = ["README.md", "CHANGELOG.md", ...readdirSync(join(root, "docs")).filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`),
      ...readdirSync(join(root, "docs/adr")).map((f) => `docs/adr/${f}`), "docs/metrics/README.md"];
    const broken: string[] = [];
    for (const doc of documents) {
      const text = read(doc).replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
      for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = (m[1] ?? "").split("#")[0];
        if (!target || /^(https?:|mailto:)/.test(target)) continue;
        if (!existsSync(join(root, dirname(doc), decodeURIComponent(target)))) broken.push(`${doc} → ${m[1]}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
