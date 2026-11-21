import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

// A release (backlog 0.4, ADR 0010, docs/release-process.md): scripts/release.mjs writes the version into the four
// package.json files and cuts the CHANGELOG's 'Unreleased' list into the release's section, which the release workflow
// gives the GitHub release as its notes. The files of the repository are kept at one version.

const root = join(import.meta.dirname, "../../..");
const read = (file: string) => readFileSync(join(root, file), "utf8");
const script = (await import(pathToFileURL(join(root, "scripts/release.mjs")).href)) as {
  PACKAGES: string[];
  isVersion(version: string): boolean;
  compareVersions(a: string, b: string): number;
  withVersion(text: string, version: string): string;
  cutChangelog(text: string, version: string, date: string): string;
  releaseNotes(text: string, version: string): string;
  currentVersion(): string;
};

const CHANGELOG = "# Changelog\n\n## Unreleased\n\n- One.\n- Two.\n\n## 1.0.0 — 2026-11-21\n\n- First.\n";

describe("releases", () => {
  it("knows a release's version and their order", () => {
    expect(["1.0.0", "0.10.2", "12.0.31"].map(script.isVersion)).toEqual([true, true, true]);
    expect(["1.0", "v1.0.0", "1.0.0-rc.1", "01.0.0", "1.0.0 "].map(script.isVersion)).toEqual([false, false, false, false, false]);
    expect(script.compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(script.compareVersions("1.2.0", "1.10.0")).toBe(-1);
    expect(script.compareVersions("2.0.0", "1.99.99")).toBe(1);
    expect(script.compareVersions("1.0.1", "1.0.0")).toBe(1);
  });

  it("sets a package.json's version and nothing else", () => {
    const text = '{\n  "name": "x",\n  "version": "0.0.0",\n  "dependencies": { "y": "1.0.0" }\n}\n';
    expect(script.withVersion(text, "1.1.0")).toBe(text.replace('"version": "0.0.0"', '"version": "1.1.0"'));
    expect(() => script.withVersion('{ "name": "x" }', "1.1.0")).toThrow(/No version/);
  });

  it("cuts 'Unreleased' into the release's section, with a new empty one above", () => {
    const cut = script.cutChangelog(CHANGELOG, "1.1.0", "2026-12-01");
    expect(cut).toBe("# Changelog\n\n## Unreleased\n\n## 1.1.0 — 2026-12-01\n\n- One.\n- Two.\n\n## 1.0.0 — 2026-11-21\n\n- First.\n");
    expect(script.releaseNotes(cut, "1.1.0")).toBe("- One.\n- Two.\n");
    expect(script.releaseNotes(cut, "1.0.0")).toBe("- First.\n");
    expect(() => script.cutChangelog(cut, "1.2.0", "2026-12-02")).toThrow(/Nothing unreleased/);
    expect(() => script.cutChangelog(CHANGELOG, "1.0.0", "2026-12-02")).toThrow(/already/);
    expect(() => script.cutChangelog(CHANGELOG, "1.1", "2026-12-02")).toThrow(/version/);
    expect(() => script.cutChangelog(CHANGELOG, "1.1.0", "1 December")).toThrow(/date/);
    expect(() => script.cutChangelog("# Changelog\n", "1.1.0", "2026-12-02")).toThrow(/Unreleased/);
    expect(() => script.releaseNotes(CHANGELOG, "1.1.0")).toThrow(/No section/);
  });

  it("keeps the repository's package.json files at one version, the CHANGELOG with a section for it once released", () => {
    const version = script.currentVersion();
    expect(script.isVersion(version)).toBe(true);
    for (const file of script.PACKAGES) expect(JSON.parse(read(file)).version, file).toBe(version);
    const changelog = read("CHANGELOG.md");
    expect(changelog).toMatch(/^# Changelog\n\n## Unreleased\n/);
    if (version !== "0.0.0") expect(script.releaseNotes(changelog, version).length).toBeGreaterThan(0);
  });
});
