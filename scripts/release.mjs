#!/usr/bin/env node
// A release (backlog 0.4, ADR 0010; docs/release-process.md): the version written into the four package.json files
// (the root's, which the page and gs1ls show, and each package's), and the CHANGELOG's 'Unreleased' list cut into the
// release's own section, with a new empty 'Unreleased' above it. The tag, its GitHub release and gs1ls's archive are
// made by .github/workflows/release.yml when the tag vX.Y.Z is pushed; that workflow reads the release's notes with
// --notes.
// Usage: node scripts/release.mjs <X.Y.Z> [--date YYYY-MM-DD]   (on develop, before main is moved to it)
//        node scripts/release.mjs --notes <X.Y.Z>               (prints that release's section of the CHANGELOG)
//        node scripts/release.mjs --check <X.Y.Z>               (exits 1 unless the files are at that release)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;

/** The package.json files that carry the version, from the repository's root. */
export const PACKAGES = ["package.json", "packages/core/package.json", "packages/cli/package.json", "apps/web/package.json"];

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Whether `version` is a release's version (X.Y.Z, no pre-release: develop's builds name their commit instead). */
export function isVersion(version) {
  return SEMVER.test(version);
}

/** -1, 0 or 1 as `a` is before, the same as or after `b`. */
export function compareVersions(a, b) {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

/** A package.json's text with its version set to `version`, everything else as it was. */
export function withVersion(text, version) {
  const out = text.replace(/^(\s*"version":\s*)"[^"]*"/m, `$1"${version}"`);
  if (out === text && !text.includes(`"version": "${version}"`)) throw new Error("No version field to set");
  return out;
}

/**
 * The CHANGELOG with its 'Unreleased' list moved under '## X.Y.Z — YYYY-MM-DD' and a new empty 'Unreleased' above.
 * Refused when the release is already there or nothing is unreleased.
 */
export function cutChangelog(text, version, date) {
  if (!isVersion(version)) throw new Error(`Not a release's version: ${version}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Not a date: ${date}`);
  if (new RegExp(`^## ${version.replaceAll(".", "\\.")}\\b`, "m").test(text)) throw new Error(`${version} is already in the CHANGELOG`);
  const start = text.indexOf("\n## Unreleased\n");
  if (start < 0) throw new Error("No '## Unreleased' section");
  const body = text.slice(start + "\n## Unreleased\n".length);
  const next = body.search(/^## /m);
  const unreleased = next < 0 ? body : body.slice(0, next);
  if (!unreleased.trim()) throw new Error("Nothing unreleased to release");
  return `${text.slice(0, start)}\n## Unreleased\n\n## ${version} — ${date}\n${body}`;
}

/** The section of release `version` in the CHANGELOG, without its heading: the GitHub release's notes. */
export function releaseNotes(text, version) {
  const heading = new RegExp(`^## ${version.replaceAll(".", "\\.")} — \\d{4}-\\d{2}-\\d{2}\\n`, "m");
  const match = heading.exec(text);
  if (!match) throw new Error(`No section for ${version} in the CHANGELOG`);
  const body = text.slice(match.index + match[0].length);
  const next = body.search(/^## /m);
  return `${(next < 0 ? body : body.slice(0, next)).trim()}\n`;
}

/** The version the root package.json carries. */
export function currentVersion(read = (file) => readFileSync(join(root, file), "utf8")) {
  return JSON.parse(read("package.json")).version;
}

function main(args) {
  const read = (file) => readFileSync(join(root, file), "utf8");
  if (args[0] === "--notes") {
    process.stdout.write(releaseNotes(read("CHANGELOG.md"), args[1] ?? ""));
    return 0;
  }
  if (args[0] === "--check") {
    const wrong = PACKAGES.filter((file) => JSON.parse(read(file)).version !== args[1]);
    if (wrong.length) {
      console.error(`Not at ${args[1]}: ${wrong.join(", ")}`);
      return 1;
    }
    releaseNotes(read("CHANGELOG.md"), args[1]);
    return 0;
  }
  const version = args[0] ?? "";
  const dateAt = args.indexOf("--date");
  const date = dateAt >= 0 ? args[dateAt + 1] : new Date().toISOString().slice(0, 10);
  if (!isVersion(version)) {
    console.error("Usage: node scripts/release.mjs <X.Y.Z> [--date YYYY-MM-DD] | --notes <X.Y.Z> | --check <X.Y.Z>");
    return 2;
  }
  const current = currentVersion(read);
  if (compareVersions(version, current) <= 0) {
    console.error(`${version} does not follow the current version, ${current}`);
    return 1;
  }
  const changelog = cutChangelog(read("CHANGELOG.md"), version, date);
  for (const file of PACKAGES) writeFileSync(join(root, file), withVersion(read(file), version));
  writeFileSync(join(root, "CHANGELOG.md"), changelog);
  console.log(`${version} of ${date}: ${PACKAGES.join(", ")} and CHANGELOG.md written. Next: docs/release-process.md, step 3.`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
