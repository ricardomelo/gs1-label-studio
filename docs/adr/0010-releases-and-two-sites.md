# ADR 0010 — Releases: main stable at the site's root, develop under /develop/

| | |
|---|---|
| Status | **Proposed** (21 November 2026); the recommended options taken under the owner's rule, open to change |
| Decided by | backlog 0.4 (*release process, as in the resolver's project*: the owner, 29 October 2026), set up at the first release; every other open item waits for the owner's hardware (3.8, 3.9) or is left as it is (6.8) |

## 1. Context — what exists

- **One branch, one site.** Until now `main` was where work landed, and every push to it was published at once at
  <https://ricardomelo.github.io/gs1-label-studio/> (`pages.yml`). The owner's tests (the test plan) ran on that site,
  which was also the one anyone else used: there was no version that stayed still while work went on.
- **What the owner asked for** (backlog 0.4): as in the resolver's project, `main` holds the last stable version,
  published at the site's root, and `develop` the work in progress, published for the owner's tests under `/develop/`.
- **One origin.** GitHub Pages serves one artifact per repository: both sites must be built into it, and they share
  the origin `ricardomelo.github.io`. So they share the browser's storage (localStorage, IndexedDB, the Cache API), and
  the stable site's service worker, whose scope is `/gs1-label-studio/`, covers `/gs1-label-studio/develop/` too.
- **Versions.** The packages were at `0.0.0`; the header and About showed the commit and its day; `gs1ls --version`
  the commit. The CHANGELOG was one *Unreleased* list.
- **Distribution of `gs1ls`** (ADR 0009) waited for this item: it ran from a clone only.

## 2. Options

**Where develop is published**

| | Option | For | Against |
|---|---|---|---|
| **A** (recommended) | **Both in one Pages artifact**: main at the root, develop in `develop/`, both built by one workflow at each push to either branch | the backlog's own words; one repository, one workflow; the owner's link is the stable one with `/develop/` added | one origin: storage and service workers must be kept apart (decisions 3 and 4) |
| B | A second repository, or a fork, publishing develop | separate origins, nothing shared | two repositories to keep in step; the owner's tests would sit outside the project |
| C | No develop site: the owner tests from pull request previews | nothing shared | GitHub Pages has no previews; another host would be needed |

**What develop keeps on the device**

| | Option | For | Against |
|---|---|---|---|
| **A** (recommended) | **Its own names** (`gs1-label-studio-develop…` for every key and the database) | a develop that upgrades the database or changes what it keeps can never leave the stable site unable to open its own; the stable site's names stay as they always were, so nothing kept there is lost | develop starts empty: the language, printers and history chosen on the stable site are chosen again there (saved work moves as a file: Save and Open) |
| B | The same names | one history and one set of choices | an IndexedDB upgrade by develop makes the stable site's older code fail to open the database (a *VersionError*): the stable site would break for the owner because of a test |

**The first release's version**

| | Option | For | Against |
|---|---|---|---|
| **A** (recommended) | **1.0.0**, then semantic versions | phases 0 to 7 are done but for the items that need hardware; the saved work's file has a version of its own; `1.0.0` says it can be relied on | a 1.0.0 before the owner has gone through every section of the test plan |
| B | 0.9.0 until the test plan is through | says "nearly" | a stable site that calls itself unfinished; a second cut soon after |

**How `gs1ls` is distributed**

| | Option | For | Against |
|---|---|---|---|
| **A** (recommended) | **An archive on each GitHub release** (`pnpm pack`), installed with `npm install -g <archive's URL>` | needs no account or token; the release workflow makes it from the tagged commit | not found by `npm search` |
| B | npm now | `npm install -g` by name | the owner's npm account, a scope or a name, and a token as a secret: the owner's decision, which can follow at any release |

The recommended options are taken, under the owner's rule (open to change).

## 3. Decision

1. **Branches.** `main` holds the last release and moves only at a release, by a fast-forward to `develop` (or to a
   hotfix branch, decision 7). `develop` holds the work in progress; a session's work goes to `develop` by a
   fast-forward once `pnpm check` passes (CLAUDE.md). Pushed commits are never rewritten; tags are never moved.
2. **Two sites, one workflow** (`pages.yml`): at each push to `main` or `develop`, `main` is built at
   `/gs1-label-studio/` (`CHANNEL=stable`) and `develop` at `/gs1-label-studio/develop/` (`CHANNEL=develop`), into one
   artifact. Before `develop` exists, the root alone.
3. **Develop's storage apart** (`apps/web/src/channel.ts`, `stored()`): every localStorage key and the IndexedDB
   database start with `gs1-label-studio`; on develop they start with `gs1-label-studio-develop`. The stable site's
   names are unchanged.
4. **Each service worker to its own** (`apps/web/offline.ts`): caches named after the site's base path
   (`gs1-label-studio <base> <hash>`), each worker deleting only its own (and the stable one the caches of before this
   decision, `gs1-label-studio-<hash>`); a worker answers a navigation only to its own page (the application is one
   page, its places after `#`), so that the stable worker never keeps develop's page as its own; files served from the
   worker's own cache.
5. **Develop names itself**: the header shows `develop · <commit>` instead of the release and its day, the page's title
   and the installed app's name are *GS1 Label Studio (develop)* (*GS1LS develop* on a home screen), with another theme
   colour; About says it is the next version, still being tested, that what it keeps is kept apart, and links to the
   stable site, which links to develop.
6. **Versions** (`scripts/release.mjs`): `X.Y.Z`, the same in the four `package.json` files (the root's is the one the
   page and `gs1ls` show); a release cuts the CHANGELOG's *Unreleased* list into `## X.Y.Z — YYYY-MM-DD`, with a new
   empty *Unreleased* above. `gs1ls --version` says `X.Y.Z (<commit>)`. The first release is **1.0.0**.
7. **A release** (`docs/release-process.md`): when the owner says so, on `develop`: `node scripts/release.mjs X.Y.Z`,
   commit, push, CI green; `main` fast-forwarded to `develop`; the tag `vX.Y.Z` pushed on that commit. The tag starts
   `release.yml`: it checks that the tag is on `main` and the files at its version, builds and packs `gs1ls`, and makes
   the GitHub release with the CHANGELOG's section as its notes and the archive attached. A fix that cannot wait for
   `develop`'s work starts a branch `hotfix/X.Y.Z` from the release's tag, is released from it in the same way, and is
   merged into `develop` afterwards.
8. **What follows `develop`**: CI and the documents' test run on both branches; the Syntax Engine workflow starts its
   branch from `develop` and opens its pull request for `develop` once it exists.
9. **The owner's tests**: the test plan's steps for work not yet released are on `/develop/`; at a release, the stable
   site has them too.
10. **Items** (backlog 0.4 a to c): a, the two channels in the web build (version, storage, service worker, names);
    b, the release script, `pages.yml`, `release.yml` and `gs1ls`'s archive; c, the documents, the first release,
    `develop` created.

## 4. Consequences

- The site at the root stops changing at every push: it changes at a release. The owner's link for tests is
  <https://ricardomelo.github.io/gs1-label-studio/develop/>.
- A person who installed the stable app keeps it; develop installs as a separate app.
- Develop starts with nothing kept: language, printers, the assistant's first visit and the Check Studio's history are
  its own.
- npm publication of `gs1ls` is one step away when the owner wants it: remove `"private": true` from
  `packages/cli/package.json`, add the token as a secret and a `pnpm publish` step to `release.yml`.
- Tests: `apps/web/test/channel.test.ts` (names and the header's label), `apps/web/e2e/channels.spec.ts` (both sites
  built as the workflow builds them and served on one origin: develop's names, storage and worker, both offline each
  as itself), `packages/core/test/release.test.ts` (the release script and the repository at one version),
  `packages/cli/test/cli.test.ts` (`--version`).
