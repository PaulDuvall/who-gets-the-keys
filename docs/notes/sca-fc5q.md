# sca exception for GHSA-fc5q-39xc-vjpf, 2026-11-17

## What happened

The owner signed batch q7m as `24f44d0`, on `main` at `a75aca8`. Its candidate run 44122897590 failed at 16:12 UTC with `CHECK sca FAILED: GHSA-fc5q-39xc-vjpf`. Nothing in the batch caused it. The run before, main's 43972041021 on `a75aca8` on 2026-11-16, had passed sca.

| Fact | Source |
|---|---|
| picomatch through 4.0.7 has a ReDoS: `analyzeRepeatedExtglob` in `lib/parse.js` skips single-branch repeated extglobs such as `+(*)` or `+(*a)`, which backtrack exponentially against short crafted strings | OSV record `https://api.osv.dev/v1/vulns/GHSA-fc5q-39xc-vjpf`, read 2026-11-17: published 2026-10-19, last modified 2026-11-17T16:00:03Z, `last_affected` 4.0.7 |
| 4.0.7, published 2026-08-24, is npm's `latest` | `https://registry.npmjs.org/picomatch`, read 2026-11-17 |
| `package-lock.json` holds picomatch 4.0.7, as a dev dependency of `fdir`, `tinyglobby`, `vite` and `vitest`. No other lockfile holds it | `main`'s lockfiles, read 2026-11-17 |

This is lesson L32 again, as for GHSA-mf5v-w3w3-f6cg on 2026-11-13 (`docs/notes/sca-mf5v.md`). `land.sh --lockfile picomatch` has nothing to update to, so the fix is an exception.

## Why our use does not reach the flaw

The flaw needs an attacker-chosen glob. The root `package.json` has no `dependencies`, and the Lambda artifact holds only the compiled `src/*.js` and a one-line `package.json`. picomatch runs inside vitest, for the test and mutation checks, on globs from `vitest.config.ts`, `vitest.stryker.config.ts` and vite's defaults, matched against the repository's own paths.

A full test run on `main` at `a75aca8`, with picomatch wrapped by the probe in `specs/sca-exceptions.md`, recorded 11 distinct globs: `**/.env`, `**/.env.*`, `**/*.{crt,pem,key,p12,pfx,cer,der}`, `**/.npmrc`, `**/.yarnrc.yml`, `**/.git/**`, `**/node_modules/**`, `test/**/*.test.ts`, `test`, `**` and `*.test.ts`. None holds a repeated extglob, `+(` or `*(`, and no configuration file in the repository holds one.

## Why the owner made the commit by hand

As on 2026-11-13: every candidate run fails the sca check until the exception lands, so a staged batch cannot reach `main`, and `land.sh` has no mode for this. The agent put copies of both files, `main`'s with one entry and its section added, on its session branch at `proposals/sca-fc5q/`. The owner copied them onto `candidate/land-q7m` with `git show`, committed them on top of `24f44d0` with a signature, and pushed.

The owner's step gave no cue on the command line. Git captures the signing program's output, so the owner saw only the key blinking, and asked for the cue to be printed. `docs/notes/sca-mf5v.md` had recorded the same gap on 2026-11-13, and its suggested `land.sh` mode was never filed. Backlog `who-gets-the-keys-j5j` files it now. Until it lands, any hand-signed command the agent gives prints `==> TOUCH YOUR SECURITY KEY NOW` itself, before git signs.

## Outcome

`348e91c` landed on `main` with `24f44d0` below it, through `land.sh --to-main`. The candidate run 44135656626 passed, the sca check included, and main's run 44180697779 passed and skipped the deploy.

## Verification, on `main` at `a75aca8` with the two copies in place

| Step | Result |
|---|---|
| `node scripts/checks.ts sca`, OSV-Scanner 2.7.0, with `main`'s exceptions | `CHECK sca FAILED: GHSA-fc5q-39xc-vjpf`, as in CI |
| The same, with the copies | Pass |
| `node scripts/checks.ts secrets` | Pass |
| `node scripts/progress.ts` | No change |
| `vitest run test/progress.test.ts test/checks.test.ts` | 45 passed |

The exception expires on 2027-01-13 with the other eight, so one renewal re-checks all nine.
