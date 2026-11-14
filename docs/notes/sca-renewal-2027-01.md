# sca exceptions renewed to 2027-01-13, with an evidence log (backlog s7e)

Status: staged in `proposals/sca-renewal-2027-01/`, not landed. Land it before 2026-12-08: all 8 exceptions in `specs/sca-exceptions.toml` expire that day, and then the sca check (SPEC-001-R10) fails on every push.

## What the owner decided, 2026-11-14

| Question | Decision |
|---|---|
| Fix or renew? | Renew. No fix is reachable inside any dependent's declared range, and forcing versions runs the checks' tools on dependencies their authors never tested |
| How long? | 60 days from the re-check, to 2027-01-13. No reason depends on time, only on which releases exist |
| What each exception must say | What is excepted, why it is not fixed, why our use does not reach the flaw, with a log of the evidence, as part of the system |
| Early warning before an expiry | A separate batch after this one: backlog `who-gets-the-keys-w8x` |

The owner first asked why the repository ignores findings instead of fixing them. The answer in this session was that each of the 8 advisories is in a library that a tool requires at a fixed version, so the fix is not ours to install.

| Tool, and how it holds the old version | Advisories it holds |
|---|---|
| semgrep, `mcp==1.29.0` | 4 |
| semgrep, opentelemetry `~=1.37.0` | 2 |
| sandbox-runtime, zod 3 | 1 |
| Stryker and typescript-eslint, minimatch 10.x | 1 |

## What the batch changes

| File | Change |
|---|---|
| `specs/sca-exceptions.toml` | Every `ignoreUntil` moves from 2026-12-08 to 2027-01-13. Every reason is rewritten in five labelled parts: What, Why not fixed, Why not reached, Evidence, Expires. Same 8 IDs |
| `specs/sca-exceptions.md` | New. The evidence log: a summary table, how each claim was checked on 2026-11-14, one section per advisory with its log, and the probe code |

The evidence log sits under `specs/` so the approver signs the evidence with the exceptions, and an agent cannot change it afterwards. OSV-Scanner 2.7.0 refuses any key in the TOML other than `id`, `ignoreUntil` and `reason` (exit 127, "unknown keys in config file"), so the evidence cannot live in extra keys there.

## What was found that the old reasons did not say

| Finding | Effect |
|---|---|
| `semgrep scan` hands over to `pysemgrep` in the same process, which imports mcp and opentelemetry at startup | The old reasons said semgrep "never starts an MCP server". That is true, but the packages do load. The probe now shows which functions run: no mcp function after import |
| minimatch's vulnerable function runs only at `optimizationLevel` 2 or more, and no installed package sets the option | Not reachable by any pattern, not just by our patterns |
| eslint 10.15.0 and @eslint/config-array 0.23.6, released 2026-11-13, moved to minimatch 11 | Partial progress. Stryker and typescript-eslint still hold 10.2.6 |
| The OSV-Scanner configuration page, read 2026-11-14, names the expiry key `effectiveUntil` | OSV-Scanner 2.7.0 refuses that key and honours `ignoreUntil`. An OSV-Scanner upgrade must re-test that the exceptions still expire. Recorded as an open question in w8x |

## Preflight, 2026-11-14

In a scratch worktree outside the checkout, with the batch's two moves and the `LAND.txt` removal applied as `land.sh` does them (`git mv -f`, `git rm`). First at `9dcd174`, then again at `6b30f26`, after the review's fixes. The results below are the second run's; the first matched them:

| Step | Result |
|---|---|
| `tsc --noEmit` | pass |
| ESLint on moved `.ts`, `.mts`, `.js` or `.mjs` files | none moved |
| `node scripts/checks.ts`, the ordered fifteen | all pass, in 60 s |
| `node scripts/checks.ts task`, then `scope` | pass |
| Vitest, every test | 22 files, 351 tests, pass |
| `npm run progress` on the landed tree | no change: the new file has no requirement rows |
| `git apply --check` on all 19 scenario patches | all apply; none touches `specs/sca-exceptions.*` |
| sca with the staged file | exit 0. With every date moved to 2026-11-13, all 8 reported |
| The evidence log's own probe code and commands, extracted from it and run as written | 0 mcp calls after import and no `extract` or `from_header`; 439 matchers in lint and a full mutation run, all at level 1, no `firstPhasePreProcess`; the B9 settings 3 elements, 0 issues |
| land.sh simulation (appendix of `docs/notes/owner-queue-handoff-2026-11-11.md`) | `requires:` met, no unlisted file, no "Changed since by" warning, `candidate/land-sca-renewal-2027-01` absent |
| The owner's Mac, simulated | A `seq` first on PATH that prints `1` and `0` for `seq 0`, and Homebrew's keg-only `node@24` under `/opt/homebrew/opt/`. `doctor.sh --node-bin` found it with no Node.js on PATH, and every Vitest test passed |

Things about this container and the harness, none caused by the batch:

- The clone was shallow, 54 commits, so the trace check failed with `missing Spec trailer` on the cut-off commit. `git fetch --unshallow` fixed it.
- `ssh-keygen` was missing; `apt-get install openssh-client` added it before the tests ran. This is the third session to hit it. The backlog row "Not filed yet" in `docs/notes/sca-mf5v.md` proposes adding it to `scripts/bootstrap/cloud-session-setup.sh`.
- `npm ci` typed directly in the worktree was refused, because the agent may not install dependencies. The first preflight linked the checkout's `node_modules` into the worktree instead. That was a mistake: the install check inside `node scripts/checks.ts` runs `npm ci`, which emptied the checkout's `node_modules` through the link and installed a real copy in the worktree. The independent review noticed the empty directory. The installed copy, from the same lockfile, was moved back, and lint and `tsc` passed in the checkout again. The second preflight used a hard-linked copy instead, which `npm ci` can replace without touching the checkout. Lesson: never link `node_modules` into a worktree that runs the checks.
- The second preflight first failed the trace check and one test, because `GIT_LITERAL_PATHSPECS=1`, exported for the `git mv` steps, was still set when the checks ran: git then reads the checks' glob pathspecs, such as `specs/*.md`, as literal names. Run without it, everything passed. `land.sh` exports the variable too, but its preflight starts each step from an empty environment (SPEC-001-R213), so it is not affected.

## Independent review, 2026-11-14

A subagent got the staged files, SPEC-001-R10, the owner's instruction and the conventions, not this note. It re-ran the probes, OSV-Scanner and the registry reads itself, and built `node_modules` from the lockfile's tarballs to run Stryker without the incremental cache. It found nothing critical or high, three medium findings and seven low. All ten are fixed in `6b30f26`.

| Severity | Finding | Fix |
|---|---|---|
| Medium | The evidence log's history cited `b396be7`, which touches neither file. That draft read history from a shallow clone. The first listings were `8c31332` (2026-10-23, until 2026-11-22) and `d6f9b92` (2026-10-31, until 2026-11-30) | Each log now cites the first listing, the 2026-11-02 rewording where there was one (`0cd57a7`, two entries) and the 2026-11-08 renewal |
| Medium | Two TOML reasons said no function of mcp's server code ran, but `get_logger`, in mcp's server package, ran during import | Every mcp reason now says "after import", and names the logger lookup |
| Medium | The evidence log said Dependabot keeps alerting on all eight, as a safety net between renewals. Nothing checked that; the last record was 6 moderate alerts, and `who-gets-the-keys-0v4` is open. This session also told the owner the same thing on 2026-11-14 | Replaced with what was observed: 7 moderate alerts on 2026-11-14, not compared with these eight. The renewal's registry check is the only check for a reachable fix |
| Low | The GHSA-mf5v-w3w3-f6cg log said it was published after `79f0f06`'s candidate run | GitHub published it at 16:43; OSV had it by 17:00, after the run passed sca at about 16:53 |
| Low | The zod reason said the artifact holds only `src/*.js`; it also holds a one-line `package.json` | Added |
| Low | The exact matcher count varies with the files in the tree: 412 to 422 across runs | Dropped from the TOML; the log gives the range |
| Low | The minimatch probe wrote only at process exit, which Stryker's child processes and worker threads never reach, and the local mutation run reused Stryker's cache | The probe now logs each call as it happens, with the process ID. A full run with the cache moved aside: 7 processes and their worker threads loaded it, Stryker's main process made 422 matchers, all at level 1, and none ran `firstPhasePreProcess` |
| Low | The Python probe logged each function only on its first run, so a function first run during import and again later would not show as a later call | It now logs each function once during import and once otherwise. Still no mcp function after import |
| Low | Only the zod entry said why the fixed version is not forced | The evidence log now has one paragraph for all eight |
| Low | The g3hv reason credited the pairwise comparison to `firstPhasePreProcess`; two commands ran past 120 characters and used `$PROBES` without setting it | Fixed: `secondPhasePreProcess`, split lines, `export ... PROBES=` |

The reviewer also confirmed, against primary sources, every OSV record and CVSS score, every PyPI and npm row, the zod and minimatch code paths, semgrep's `--trace`-only call to `extract`, the checks job's permissions, the artifact's contents, `LAND.txt` against `land.sh`'s parser, and that the new file defines no requirement rows.

## Owner steps, in order

1. `land.sh --to-main` for the candidate branch that holds this batch, so `main` has it. Docs and proposals only, so main's deploy is skipped (SPEC-001-R232).
2. `land.sh proposals/sca-renewal-2027-01`, which signs one commit, `spec: renew the sca exceptions to 2027-01-13 with an evidence log for each (backlog s7e)`. `specs/` is not a deployable path, so main's deploy is skipped again.

Neither step ends at a deploy approval.

## Not done, and why

| Item | Why |
|---|---|
| The early warning and a check that each exception keeps its five parts and its evidence section | The owner chose a separate batch: `who-gets-the-keys-w8x` |
| Turning the probes into a committed script | Renewals now recur every 60 days, so it is worth doing; an open question in w8x |
| Upstream issues asking semgrep to relax its pins, and Stryker and typescript-eslint to move to minimatch 11 | Not checked whether they exist. This session's GitHub access reaches only this repository |
