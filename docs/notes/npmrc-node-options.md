# A committed `.npmrc` can load code into the checks and the build

Found 2026-11-07 in the Tracer 2 T2 review, and fixed the same day in a batch on a branch staged before the history rewrite of 2026-11-08, on `main` at `f6044ef` (backlog `who-gets-the-keys-utq`). Restaged on 2026-11-08 on today's `main`, in `proposals/npmrc/`, for the owner to land with `scripts/bootstrap/land.sh proposals/npmrc`.

## Restaged 2026-11-08

| Change from the first staging | Why |
|---|---|
| R207 and R208 renumbered to SPEC-001-R215 and R216 | `main` has used R207 and R208 since slice T2 (the producer's install and publish jobs). The highest ID on any branch was R210; this run's batches use R211 to R214 |
| Each staged copy rebuilt by applying the first staging's edits to today's file, not by copying it | `pipeline.yml`, `scripts/checks.ts`, `scenarios/run.ts`, the scenario list, the tests and the spec had all moved on. `pipeline.yml` is built on `proposals/role-arn-secrets/`'s copy, and the spec and `traceability.md` on `proposals/agent-rules/`'s |
| `test/task-scope.test.ts` and SPEC-001-R68 also change | T3a's checks job runs the task and scope checks "after `npm run checks`", and its test reads that line. R68 now says `node scripts/checks.ts`, so the batch carries `Spec: SPEC-001-R68` |
| B18's patch regenerated again | Its context is the checks step, which this batch changes |
| P49 keeps its ID | The practice was already P49, "The agent proposes pipeline and dependency changes; an approver signs every one", and the batch adds B81 to it |

Everything below is the first staging's evidence, from 2026-11-07, with the IDs renumbered. Its commit SHAs belong to the history before the rewrite.

## The attack

npm reads a project's `.npmrc` on every command ([npmrc, "Files"](https://docs.npmjs.com/cli/v11/configuring-npm/npmrc/#files)). Two of its settings start code:

| Setting | What npm does with it | Source |
|---|---|---|
| `node-options` | Sets `NODE_OPTIONS` for every process npm starts, so `--import=./docs/notes/x.mjs` loads that module first | [config, `node-options`](https://docs.npmjs.com/cli/v11/using-npm/config/#node-options); `@npmcli/config/lib/set-envs.js` line 102 in npm 11.21.2 |
| `script-shell` | Runs `npm run` and `npm exec` through that program instead of `/bin/sh` | [config, `script-shell`](https://docs.npmjs.com/cli/v11/using-npm/config/#script-shell); `lib/commands/exec.js` line 68 |

Before this batch, `specs/protected-paths.txt` did not list `.npmrc`. `pipeline.yml` ran `npm run checks` in the checks job and `npm run build` in the build job. So an unsigned commit pushed to `candidate/**` could add `.npmrc` and a module under `docs/`, both unprotected, and then:

- (a) force `npm run checks` to exit 0, the signatures check included, with `process.on("exit", () => { process.exitCode = 0 })`;
- (b) change `dist/function.zip` after `tsc` and before the attest job signs it.

Unlike an unsigned edit to `scripts/checks.ts`, this touches no protected path. SPEC-001-R109 (decision 0004) runs the signatures check first with `main`'s check code. It would still load the payload if it started that check through npm in the candidate tree.

## Evidence

All runs on 2026-11-07, in this session. Node.js 22.23.4 locally; CI uses Node.js 24 (`package.json` engines) and its bundled npm 11. npm 11.21.2 ran here from its published tarball.

| Command, with `.npmrc` holding the setting | npm 10.9.9 | npm 11.21.2 |
|---|---|---|
| `node-options`: `npm run checks`, where the script exits 1 | exit 0, payload loaded | exit 0, payload loaded |
| `node-options`: `npx --no-install node checks.mjs` and `npm exec` | exit 0, loaded | exit 0, loaded |
| `node-options`: `node checks.mjs` | exit 1, not loaded | n/a, no npm |
| `node-options`, `script-shell` and `ignore-scripts=false`: `npm ci --ignore-scripts` with a root `preinstall` | not loaded | not loaded |
| The same without `--ignore-scripts` | loaded | not run |
| `script-shell`: `npm run checks` | exit 0, shell ran | exit 0, shell ran |
| `node-options` in `sub/.npmrc`: `npm --prefix sub run checks` | loaded | not run |

In this repository, on `main` at `f6044ef`, with the repo's own B18 patch and the staged B81 patch applied as one unsigned commit:

| Command | Output | Exit |
|---|---|---|
| `node scripts/checks.ts signatures` | `CHECK signatures FAILED: unsigned change to .github/` | 1 |
| `npm run check:signatures` | B81's self-naming line, then the same failure line | 0 |

B81 alone on `main` passes the signatures check (exit 0), because `.npmrc` was not protected.

## Which mitigation neutralises what

| Mitigation | `node-options` | `script-shell` | Observed |
|---|---|---|---|
| `NPM_CONFIG_USERCONFIG=/dev/null` | no | no | It replaces only `~/.npmrc`. The project file is a separate source |
| `npm_config_node_options=` (empty) | no | no | `@npmcli/config/lib/index.js` line 348 skips empty `npm_config_` variables. The docs' "not given a value will be given the value of `true`" does not describe this |
| `npm_config_node_options=--no-warnings` (non-empty) | yes | no | Environment beats project config ([config, "Environment Variables"](https://docs.npmjs.com/cli/v11/using-npm/config/#environment-variables)) |
| `--node-options=` on the command line | yes | no | The flag beats project config, but the shell still runs |
| Start the script with `node`, not npm | yes | yes | npm never reads `.npmrc` |
| `npm ci --ignore-scripts` | inert | inert | It starts no process. The flag beats `ignore-scripts=false` in `.npmrc` |

Every environment or flag override is a denylist over npm's settings, and none covers both. So the fix starts repository code with `node` and keeps npm to `npm ci --ignore-scripts`.

## The fix, staged in `proposals/npmrc/`

| Change | File | Requirement |
|---|---|---|
| List `.npmrc` and `video/record/.npmrc` | `specs/protected-paths.txt` | R12, as data |
| Checks job runs `node scripts/checks.ts`. Build job runs `node_modules/.bin/tsc --noEmit false --outDir dist`, which is `package.json`'s build script | `.github/workflows/pipeline.yml` | SPEC-001-R215 |
| Workflows check fails as `npm-run` if `pipeline.yml`, outside comments, uses npm other than `npm ci --ignore-scripts`, or names `npx`, `pnpm`, `pnpx`, `yarn`, `corepack`, `bun` or `bunx` | `scripts/checks.ts` (`pipelineNpmFinding`) | SPEC-001-R215 |
| B10's build in the harness runs `tsc` the same way | `scenarios/run.ts` | SPEC-001-R215 |
| B81: unsigned `.npmrc` with `min-release-age=7` as cover and a `node-options` payload that names itself, so B81 fails if anything ever loads it | `scenarios/B81-npmrc-node-options.patch` | SPEC-001-R216 |
| B18's patch regenerated, since its context line was `run: npm run checks` | `scenarios/B18-unsigned-pipeline-change.patch` | SPEC-001-R38 |
| B81 mapped to P49, given plain words, traced | `practices.yaml`, `docs/practices.md`, `video/explanations.yaml`, `traceability.md` | SPEC-001-R13, SPEC-002-R5 |
| Tests: the rule, the launch lines, npm's behaviour on the runner's own npm, and B81's line derived from its patch and the protected-path list | `test/checks.test.ts`, `test/scenarios.test.ts` | R215, R216 |

Verified in a scratch worktree with the batch applied as one unsigned commit:

- The workflows check passes on the staged `pipeline.yml`, and prints `CHECK workflows FAILED: npm-run` with `main`'s.
- The secrets, allowlist, workflows, lint, typecheck, iac, sast, sca, trace, ratchet, slides, test and mutation checks pass. Install was not rerun there, because `node_modules` was shared with the main checkout and the lockfile is unchanged.
- Through the staged harness, 14 local scenarios pass. B2, B17, B18 and B81 stop at signatures on the unsigned simulation commit below them, as expected. B81 passed the eleven checks before signatures, and its self-naming line never printed, so the harness never loaded the payload.
- The signatures check's own functions, run on a real B81 commit on top of that simulation, give `CHECK signatures FAILED: unsigned change to .npmrc`.

B81's line is derived, not observed. Before the signed landing, the signatures check stops first at the unsigned commit that stages the list. The first `scenarios.yml` run on `main` after landing observes it.

## Other configuration files considered

| File | Read by | Starts code here? | Decision |
|---|---|---|---|
| `.npmrc` at the root | npm in the checks, build, scenarios and video jobs | yes, shown above | protected |
| `video/record/.npmrc` | `npm ci --prefix video/record` and `npx playwright` in `video.yml`. `--prefix` makes it the project file (tested with `sub/`) | yes | protected |
| `.yarnrc`, `.yarnrc.yml` | Yarn 1 (`yarn-path`) and Yarn 2+ (`yarnPath`, plugins) | only if Yarn runs. Nothing here runs it, and R215 fails `pipeline.yml` if it names `yarn` or `corepack` | not protected |
| `.pnpmfile.cjs` | pnpm's install hooks | only if pnpm runs. Same as above | not protected |
| `bunfig.toml` | Bun's `preload` | only if Bun runs. Same as above | not protected |
| `.node-version`, `.nvmrc`, `.tool-versions` | `actions/setup-node` only when `node-version-file` names one. Every `setup-node` step here names `package.json`, which is protected | no. A version file selects a version and runs nothing | not protected |
| `uv.toml` | uv in `scripts/ci/install-tools.sh`, run from the repository root | uv 0.11.32 fetched Python from a mirror named in `uv.toml`, then refused it on a SHA-256 mismatch. Packages are pinned by `--require-hashes`. Only the mirror setting was tested | not protected; fails closed as far as tested |

The Yarn, pnpm and Bun hooks are from their own documentation, not re-tested here. The decision does not rest on them: none of those tools runs in any workflow.

## What remains

| Gap | Evidence | What closes it |
|---|---|---|
| Code the commit itself holds still runs before the signatures check. The trace check's `vitest list` imports every test file. ESLint 10 loads an `eslint.config.mjs` from any directory it lints | Shown here. A test file's top-level code ran `git checkout --detach` to `main` during the trace check. The signatures check then passed on a B18 commit. A `docs/eslint.config.mjs` ran during the lint check | The same class as an unsigned edit to `scripts/checks.ts`, the accepted Phase A gap, which this batch records in SPEC-001 "Checks before `main`". SPEC-001-R109 closes it if the signatures check runs first, before any candidate file. Proposed R109 wording: "It SHALL start Node.js directly, not through a package manager, and SHALL read no package manager or tool configuration from the candidate tree." Cheap hardening, not staged: `eslint --config eslint.config.js` stopped the nested config loading in ESLint 10.13.0 |
| The build job runs `scripts/receipt.ts`, which is not protected, after the zip is written and before the upload | `pipeline.yml`, the step after "Build the Lambda artifact" | Decision 0002 T08 protects it. Until then, (b) stays open through that file, `.npmrc` or not |
| `NODE_OPTIONS` and other variables set by the runner or by `pipeline.yml` | Outside an unsigned commit's control. A step that runs the commit's code can still append to `$GITHUB_ENV` for later steps in its job. In the staged pipeline that step is `scripts/receipt.ts` in the build job, the row above | T08. Whether GitHub refuses `NODE_OPTIONS` from `$GITHUB_ENV` was not checked |
| `scenarios.yml` and `video.yml` still run `npm run` and `npx`, and `video/build.ts` runs `npm run checks` (SPEC-002-R3) | Not changed. On a push they run `main`'s tree, where an `.npmrc` now needs a signature. On a dispatch they run the dispatched ref's own scripts anyway, so an `.npmrc` adds nothing | If the owner wants R215 everywhere: amend SPEC-002-R3, and test `sudo` with an explicit `node` path for `playwright install-deps` on a hosted runner |
| A directory with its own npm project needs its own entry | `guardedBy` matches exact paths and `/` prefixes only. npm reads `.npmrc` from the directory it runs in, the root and `video/record/` here | Add an entry with any new npm project. Basename matching needs a `guardedBy` change, as decision 0002 notes for nested `CLAUDE.md` |
| Semgrep `p/default` flags any `.npmrc` without `min-release-age` (`package_managers.npm.npm-missing-minimum-release-age`) | It stops a bare `.npmrc` at the sast check under `node scripts/checks.ts`, by accident. Under `npm run checks` the payload rewrites the exit code anyway | B81 adds `min-release-age=7`, the line the rule asks for, and reaches signatures. npm 11 applies it as `before` only while resolving manifests (`build-ideal-tree.js` lines 560 and 816), which `npm ci` with a full lockfile does not do. That is inference from source: the local `npm ci` was npm 10.9.9, which ignores the setting |
| `README.md` and `CLAUDE.md` count 19 scenarios and 17 patches | B81 makes 20 and 18 | Owner decision: the talk says 19. `CLAUDE.md` is protected, so it is not changed here |
