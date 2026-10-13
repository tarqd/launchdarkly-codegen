---
name: release-me
description: Get the next @launchtarqly/codegen release PR open, at the right version, and ready to merge.
disable-model-invocation: true
---

Releases run on release-please (`README.md` → Releasing holds the bump rules; `release-please-config.json` and `.github/workflows/release-please.yml` are the source of truth). release-please opens the **release PR** on its own whenever `main` holds a releasable commit; this skill makes sure that PR exists, carries the version the commits call for, and passes the checks CI skips on it. You never merge it: the human does, and approves the staged npm version.

GitHub access: `gh api` REST calls, per `docs/agents/issue-tracker.md`, or the GitHub MCP tools where `gh` is missing. The release PR carries the label `autorelease: pending`.

## 1. Read what `main` holds

`git fetch origin main --tags`. The last release is the newest `v*` tag; with none, it is `bootstrap-sha` in `release-please-config.json`. List every commit on `origin/main` since then (`git log --format='%H %s%n%b' <last>..origin/main`).

Classify each commit as release-please will: `fix:` patch, `feat:` minor, `!` or a `BREAKING CHANGE:` footer major (minor while 0.x), a `Release-As: x.y.z` footer forces the version, every other type releases nothing. Flag each **stray**: a commit that is no Conventional Commit yet changes `packages/`, since release-please drops it silently.

Done when every commit since the last release is classified, the strays are listed, and you hold the **expected version**.

## 2. Ask the human

Show the commits by type, the strays, and the expected version. Ask whether that version is right, and how each stray should read (`fix:`, `feat:`, or nothing).

Done when the human has named the version to release.

## 3. Correct the version

Take only the branches that apply:

- **A stray from a squash-merged PR needs a type.** Find its PR (`gh api repos/{owner}/{repo}/commits/<sha>/pulls`) and append to that PR's body:

  ```
  BEGIN_COMMIT_OVERRIDE
  fix: <what it fixed>
  END_COMMIT_OVERRIDE
  ```

  release-please reads this in place of the squash commit, one line per change.
- **A stray from a plain-merged PR needs a type.** A merge commit (two parents) hides which commits the override would replace, so release-please ignores overrides there. Force the version instead (next branch), and tell the human those changes stay out of the changelog.
- **The version needs forcing.** Open a PR titled `chore: release <x.y.z>` from a fresh branch off `origin/main`, holding one empty commit (`git commit --allow-empty -m "chore: release <x.y.z>" -m "Release-As: <x.y.z>"`), with `Release-As: <x.y.z>` as the last line of the PR body too. The footer must reach `main`: tell the human to merge with rebase-merge, or with a squash message that keeps the footer. Wait for it to land.
- **Nothing releasable and no forced version.** Report that there is nothing to release and stop.

Then refresh: push to `main` refreshes on its own; for an override alone, dispatch the workflow (`gh workflow run release-please.yml -f task=release-pr`, or `POST repos/{owner}/{repo}/actions/workflows/release-please.yml/dispatches` with `{"ref":"main","inputs":{"task":"release-pr"}}`) and wait for its run to finish.

## 4. Check the release PR

Find the open PR labelled `autorelease: pending`. Done when its title's version equals the version the human named and its `CHANGELOG.md` lists every non-stray `fix:`/`feat:`/breaking commit from step 1 plus each override. A mismatch sends you back to step 1 with the PR's changelog in hand: find the commit release-please read differently.

## 5. Run the checks CI skips

release-please opens the PR with `GITHUB_TOKEN`, so CI never runs on it. Check out its head and run what the publish job runs: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm test:smoke`. Done when all four pass on the PR's head commit. A failure is a bug on `main`: report it with the output, and stop.

## 6. Report

Give the human: the release PR link, its version, the changelog, and the check results. Then their remaining steps: merge the release PR; the publish job stages the version on npm; `npm stage list @launchtarqly/codegen`, then `npm stage approve <stage-id>` with 2FA makes it live.
