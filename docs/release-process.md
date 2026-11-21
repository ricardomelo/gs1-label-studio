# Release process

How GS1 Label Studio is released ([ADR 0010](adr/0010-releases-and-two-sites.md), backlog 0.4). For maintainers.

## The two branches and the two sites

| Branch | What it holds | Published at |
|---|---|---|
| `main` | the last release; it moves only at a release | <https://ricardomelo.github.io/gs1-label-studio/> |
| `develop` | the work in progress, for the owner's tests | <https://ricardomelo.github.io/gs1-label-studio/develop/> |

- Work lands on `develop` (a session's branch is pushed to `develop` by a fast-forward once `pnpm check` passes).
- `.github/workflows/pages.yml` builds both branches at each push to either, into one publication.
- Develop names itself in the header (`develop · <commit>`), in the page's title and as an installed app
  (*GS1LS develop*), and keeps what it keeps on the device apart from the stable site.
- Tags `vX.Y.Z` are releases; they are never moved or deleted once published.

## Making a release

When the owner says the work on `develop` is ready. Replace `1.1.0` with the release's version: a fix alone raises the
last number (1.0.1), new features the middle one (1.1.0), a change that breaks what users or integrators rely on (a
saved work file that no longer opens, a `gs1ls` option removed) the first (2.0.0).

1. **Bring `develop` up to date**, in a clone:

   ```sh
   git fetch origin
   git checkout develop
   git merge --ff-only origin/develop
   ```

   Expected: `Already up to date.` or a list of files changed.

2. **Write the version and cut the CHANGELOG**:

   ```sh
   node scripts/release.mjs 1.1.0
   ```

   Expected: `1.1.0 of 2026-12-01: package.json, packages/core/package.json, packages/cli/package.json,
   apps/web/package.json and CHANGELOG.md written.` The script refuses a version that does not follow the current
   one, and a CHANGELOG with nothing under *Unreleased*. Read the new `## 1.1.0` section of `CHANGELOG.md`: it becomes
   the GitHub release's notes.

3. **Check, commit and push to `develop`**:

   ```sh
   pnpm check
   git commit -am "release: 1.1.0"
   git push origin develop
   ```

   Wait for CI on that commit to be green (Actions tab, or `gh run list --branch develop`).

4. **Move `main` to the release** (a fast-forward: `main` never has commits of its own):

   ```sh
   git push origin develop:main
   ```

   Expected: `<old>..<new>  develop -> main`. A refusal (`non-fast-forward`) means `main` has a commit `develop` lacks:
   stop and merge it into `develop` first.

5. **Tag the release and push the tag**:

   ```sh
   git tag -a v1.1.0 -m "GS1 Label Studio 1.1.0"
   git push origin v1.1.0
   ```

   The tag starts `.github/workflows/release.yml`, which checks that the tag is on `main` and the files are at
   1.1.0 (`node scripts/release.mjs --check 1.1.0`), builds and packs `gs1ls`, and makes the GitHub release
   *GS1 Label Studio 1.1.0* with the CHANGELOG's section and `gs1-label-studio-cli-1.1.0.tgz` attached.

6. **Check** the release page (<https://github.com/ricardomelo/gs1-label-studio/releases>) and the stable site: its
   header shows `1.1.0 · <date>`, and About links the version to the release.

## A fix that cannot wait

When `develop` holds work that is not ready and the stable site needs a fix:

```sh
git fetch origin --tags
git checkout -b hotfix/1.0.1 v1.0.0
# the fix, its test and its CHANGELOG line under Unreleased; then
node scripts/release.mjs 1.0.1
pnpm check
git commit -am "release: 1.0.1"
git push origin hotfix/1.0.1
```

Once CI is green: `git push origin hotfix/1.0.1:main`, then tag and push `v1.0.1` as in step 5, and bring the fix into
`develop` (`git checkout develop && git merge hotfix/1.0.1`, resolving the CHANGELOG and the versions in favour of the
release), push `develop`, and delete the hotfix branch.

## gs1ls

Each release carries `gs1-label-studio-cli-X.Y.Z.tgz`. It installs with Node 22 or later:

```sh
npm install -g https://github.com/ricardomelo/gs1-label-studio/releases/download/v1.1.0/gs1-label-studio-cli-1.1.0.tgz
gs1ls --version
```

Expected: `gs1ls 1.1.0 (<commit>)`. Publishing on npm by name is left for when the owner wants it (ADR 0010,
consequences): remove `"private": true` from `packages/cli/package.json`, add an npm token as the secret `NPM_TOKEN`
and a `pnpm publish --access public` step to `release.yml`.
