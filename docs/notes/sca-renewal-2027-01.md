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

In a scratch worktree outside the checkout at `9dcd174`, with the batch's two moves and the `LAND.txt` removal applied as `land.sh` does them (`git mv -f`, `git rm`):

| Step | Result |
|---|---|
| `tsc --noEmit` | pass |
| ESLint on moved `.ts`, `.mts`, `.js` or `.mjs` files | none moved |
| `node scripts/checks.ts`, the ordered fifteen | all pass, in 97 s |
| `node scripts/checks.ts task`, then `scope` | pass |
| Vitest, every test | 22 files, 351 tests, pass |
| `npm run progress` on the landed tree | no change: the new file has no requirement rows |
| `git apply --check` on all 19 scenario patches | all apply; none touches `specs/sca-exceptions.*` |
| sca with the staged file | exit 0. With every date moved to 2026-11-13, all 8 reported |
| land.sh simulation (appendix of `docs/notes/owner-queue-handoff-2026-11-11.md`) | `requires:` met, no unlisted file, no "Changed since by" warning, `candidate/land-sca-renewal-2027-01` absent |
| The owner's Mac, simulated | A `seq` first on PATH that prints `1` and `0` for `seq 0`, and Homebrew's keg-only `node@24` under `/opt/homebrew/opt/`. `doctor.sh --node-bin` found it with no Node.js on PATH, and every Vitest test passed |

Three things about this container, none caused by the batch:

- The clone was shallow, 54 commits, so the trace check failed with `missing Spec trailer` on the cut-off commit. `git fetch --unshallow` fixed it.
- `ssh-keygen` was missing; `apt-get install openssh-client` added it before the tests ran. This is the third session to hit it. The backlog row "Not filed yet" in `docs/notes/sca-mf5v.md` proposes adding it to `scripts/bootstrap/cloud-session-setup.sh`.
- `npm ci` in the worktree was refused, because the agent may not install dependencies. The worktree used the checkout's `node_modules` through a link instead. The lockfile is the same, so the installed tree is too.

## Independent review

Pending.

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
