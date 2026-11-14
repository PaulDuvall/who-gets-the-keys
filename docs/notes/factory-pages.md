# The factory video follows main and is published to GitHub Pages (backlog v5p, f6c)

Status: staged in `proposals/factory-pages/`, not landed.

## Why

The README could not link the factory video. The `factory-video` workflow uploaded it only as an Actions artifact: a zip, behind a sign-in, kept 30 days. It also rebuilt the video only when `factory-video/` or the workflow changed, so the end card's counts fell behind `main`. The newest video, built at `8dce7fe` on 2026-11-12 (run 27), counts 103 approved requirements; `main` at `fa38bed` has 111. Every factory-video run on `main` since run 27, runs 28 to 42, checked the claims and rebuilt nothing.

On 2026-11-12 the owner asked for one README link that plays the video built from the latest `main`, and chose GitHub Pages (`who-gets-the-keys-v5p`). On 2026-11-14 this session filed `who-gets-the-keys-f6c` for the rebuild without searching the backlog first. The owner pointed out that v5p already asked for it. This batch does both and closes f6c as a duplicate, with that correction in its description.

## What the batch changes

| File | Change |
|---|---|
| `specs/SPEC-001-delivery-pipeline.md` | SPEC-001-R235, after R229 |
| `.github/workflows/factory-video.yml` | Also runs on a push to `main` that changes `docs/progress.json`. The claims job, now with `deployments: read`, rebuilds the video unless the newest `github-pages` deployment succeeded and nothing the video shows changed since. On `main`, the build job lays out the page and uploads it with `actions/upload-pages-artifact`. A new `deploy` job publishes it with `actions/deploy-pages` |
| `scripts/bootstrap/github.sh` | Environment `github-pages` deployable from branch `main` only, with no reviewer. On a public repository, the Pages site built by GitHub Actions: created when its read answers 404, switched when its build type differs. Any other failure is reported, the ruleset still applies, and the script exits 1 |
| `test/factory-pages.test.ts` | New: 20 tests of R235. 14 run the claims job's decide step in a temporary git repository with a stand-in `gh`; one runs the page layout step |
| `test/checks-before-main.test.ts` | The `github.sh` stand-in answers the Pages read as `gh` does, body on standard output; 8 new tests; the exact write lists gain the `github-pages` environment and the Pages write |
| `README.md`, `factory-video/README.md` | Link the page. The artifact route stays, for the other files. The README's keys table gains the deploy job |
| `traceability.md` | Row for R235 |
| `.tasks/backlog.jsonl` | v5p and f6c closed |
| `docs/progress.json`, `docs/progress.svg` | The record for the landed tree |

`src/`, `infra/sandbox`, `package*.json`, `tsconfig.json` and `pipeline.yml` do not change, so main's `sandbox` deploy is skipped (SPEC-001-R232).

## Choices, and why

| Choice | Why |
|---|---|
| Decide against the last page published, not the previous push | Diffing against the push before missed a build that failed, a claims job cancelled by a newer push, and a deploy that failed: nothing retried them. The decision now reads the newest `github-pages` deployment, as SPEC-001-R232 reads `sandbox`'s, and any doubt rebuilds. Found by the review (M3) |
| Rebuild on the end card's counts, the `requirements` and `claims` of `docs/progress.json`, not on the whole file | The end card captions only those (SPEC-001-R229). The whole file also counts practices, scenarios and the backlog, so a backlog-only push, such as `892c366`, would rebuild an identical video in about 13 minutes. A claim's status comes from `factory-video/claims.json` alone, which is under `factory-video/`, so any status change rebuilds anyway. The first version of these notes said the file held exactly the end card's counts; the review found it does not (L2) |
| The page is laid out in the build job; the deploy job has one step, `actions/deploy-pages` | The deploy job holds `id-token: write` and `pages: write`. It checks out nothing and runs no repository code, so nothing the commit holds runs with them |
| No required reviewer on `github-pages` | The page holds only a video built from `main`, by a job that can only read the repository. v5p's recommendation |
| `github.sh` restricts `github-pages` to branch `main` | GitHub creates the environment when a workflow first uses it, and its documentation recommends, but does not say it adds, a rule that only the default branch may deploy. Without it, a workflow on a candidate branch could request the same two permissions and replace the public page. `producer` already has the same rule (SPEC-001-R85) |
| `github.sh` sets the Pages source only on a public repository | `github.sh` already skips the public-only settings on a private repository. Inference: Pages on a private repository depends on the plan |
| No AWS role can use this workflow's OIDC token | Each role's trust in `infra/sandbox/iam.tf` requires an exact `job_workflow_ref` of another workflow |
| A re-run of an older run is not refused | Re-running an older run would publish its older video over a newer one, until the next push that changes what the video shows. Only someone with write access can re-run, and nothing is lost. A tip check would need repository code or a second token in the deploy job. Recorded, not fixed |

## Platform behaviour this relies on

Read on 2026-11-14 from GitHub's documentation:

| Fact | Source |
|---|---|
| "Published GitHub Pages sites may be no larger than 1 GB." Deployments time out after 10 minutes. Soft bandwidth limit 100 GB a month | https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits |
| The deploy job needs at least `pages: write` and `id-token: write`; the default environment is `github-pages`, created automatically if absent; the uploaded tar must be under 10 GB | https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages |
| Settings → "Code, planning, and automation" → Pages → "Build and deployment" → Source → GitHub Actions. "We recommend that you add a deployment protection rule so that only the default branch can deploy to this environment." | https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site |
| `POST /repos/{owner}/{repo}/pages` creates a site, with `build_type` `workflow`; `PUT` updates it, 204; `GET` answers 404 or 200, and its body has `build_type` | https://docs.github.com/en/rest/pages/pages |
| A deployment branch rule "is matched against the `GITHUB_REF` of the workflow run" | https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments |
| "If your Pages site is using GitHub Actions as the source, while not required we highly recommend you also protect your environment (we will configure it by default for you)." The OIDC token "is passed to the pages deployment API as part of the request payload, where it's decoded internally to validate the claims and verify if that workflow is allowed to deploy to pages." | `actions/deploy-pages` README at the pinned SHA `368f825`, "Security Considerations" and "OIDC" |

Not found in the documentation: what a job sees when it runs from a branch the environment's rule excludes, and what "we will configure it by default" sets, or whether it does so for a site created through the API. So after owner step 1 the agent reads `github-pages`'s branch policies, and restricts the environment before anything lands if they do not name `main` alone.

Size: the newest build's whole artifact, eight files zipped, is 68.5 MB (artifact `factory-video-8dce7fe-20261112T1953Z`), so the page's three files are well under 1 GB. The page's own size is printed by the layout step's `du -sh` on the first run.

The action pins were checked with `git ls-remote` on 2026-11-14: `actions/upload-pages-artifact` `v5.0.0` and `v5` are `fc324d3547104276b827a68afc52ff2a11cc49c9`; `actions/deploy-pages` `v5.0.1` and `v5` are `368f82528645a54fb793d4d04e342629a3f51346`.

## Owner steps, in order

1. Turn on Pages, built by GitHub Actions, before the batch lands, so the first deploy finds a site. One `gh api` command, the same write `github.sh` makes. Then read `github-pages`'s branch policies; if they do not name `main` alone, restrict it with the two writes `github.sh` makes, before step 3.
2. `land.sh --to-main` for the candidate branch that holds this batch. Docs and proposals only.
3. `land.sh proposals/factory-pages`, which signs one commit. The push changes `factory-video.yml`, so the factory-video workflow rebuilds the video, about 15 minutes, then deploys it.
4. `scripts/bootstrap/github.sh`, which restricts `github-pages` to `main` and finds Pages already built by Actions.
5. Open https://paulduvall.github.io/who-gets-the-keys/ and play the video. Its caption names the commit; the end card should count what `docs/progress.json` counts at that commit.

None of these ends at a `sandbox` deploy approval.

## Preflight, 2026-11-14

First at `7341713`, then again at `c6e3970` after the review's fixes; the table gives the second run. In a scratch worktree outside the checkout, with every move and the `LAND.txt` removal applied as `land.sh` does them, a hard-linked `node_modules`, and `GIT_LITERAL_PATHSPECS` unset:

| Step | Result |
|---|---|
| `tsc --noEmit` | pass |
| ESLint on the two changed test files | pass |
| `node scripts/checks.ts`, the ordered fifteen, zizmor among them | all pass |
| `node scripts/checks.ts task`, then `scope` | pass |
| Vitest, every test | 24 files, 389 tests, pass. 28 are new: 20 in `test/factory-pages.test.ts`, 8 in `test/checks-before-main.test.ts` |
| `node scripts/progress.ts` on the landed tree | equals the staged copies: 112 approved, 164 drafted, backlog 24 open and 12 closed |
| `git apply --check` on all 19 scenario patches | all apply; none touches a changed file |
| 16 hand mutations of the new workflow and `github.sh` code, each against the two test files | all 16 caught, among them the four the review found surviving and the 404 read |
| The owner's Mac, simulated: a BSD-style `seq` first on PATH and Homebrew's keg-only `node@24` with its `npm` | 24 files, 389 tests, pass |
| land.sh simulation | every `requires:` met, checked with `grep -F` on `git show`; no unlisted file; no "Changed since by" warning; `candidate/land-factory-pages` absent |

The first run passed every step. Its first Mac simulation failed one test, SPEC-001-R215's `.npmrc` probe, because the simulated `node@24` keg held only `node`, not `npm`; a real Homebrew keg holds both. With `npm` added, every test passed. macOS's `/bin/bash` 3.2 could not be simulated here, so the layout step takes the short SHA as `${GITHUB_SHA:0:7}`, a form bash 3.2 reads.

## Independent review, 2026-11-14

A subagent got the staged files, SPEC-001-R235 and the rows it must not break, the two backlog items, GitHub's documentation URLs and the conventions, not these notes' conclusions. It built the landed tree, ran the checks and every test, read `gh`'s source and the actions at their pins, and mutated the workflow and `github.sh` by hand. It found one high finding, three medium and nine low. All are fixed except where the table says otherwise.

| Severity | Finding | Done |
|---|---|---|
| High | `github.sh` could never create a missing Pages site: on an HTTP error `gh` prints the response body on standard output, so `\|\| echo absent` never yielded `absent`, and a 404 sent a PUT. Under `set -e` a failed PUT then stopped the script before the merge methods and the ruleset. The test's stand-in printed nothing on a 404, which hid it | `github.sh` tells a 404 from other failures by `gh`'s standard error. The stand-in now answers as `gh` does, and tests cover each path |
| Medium | A Pages failure stopped `github.sh` before the R41 ruleset | Recorded as `pages_failed`; the ruleset still applies; the script says why and exits 1, as for the merge methods |
| Medium | The main-only rule for `github-pages` was untested: the stand-in always answered that a policy existed | A stand-in mode with no policies; a test asserts the POST for each environment |
| Medium | The rebuild decision diffed against the previous push, so a failed build, a cancelled claims job or a failed deploy was never retried | Decided against the newest successful `github-pages` deployment, as SPEC-001-R232 does; R235 rewritten |
| Low | GitHub may or may not restrict `github-pages` when Pages is created through the API, which leaves a window before `github.sh` runs | Owner step 1 reads the policy and restricts it before anything lands; the deploy-pages README is quoted above |
| Low | The notes said `docs/progress.json` holds exactly the end card's counts | Corrected; the decision compares only `requirements` and `claims` |
| Low | R235 said no job reads a secret, though two read `GITHUB_TOKEN`; the test missed `secrets['X']` | R235 says no job references `secrets`; the test matches the word |
| Low | Four workflow mutations survived the tests: no `workflow_dispatch`, `branches: ['**']`, a setup-node cache, no deploy concurrency | The first two are tested now. The cache is refused by `cache-mode: none`, which the test checks. Concurrency is not required by R235: not tested |
| Low | A `requires:` line, `gh attestation verify --limit 100`, also matched `--limit 1000`; its comment named the wrong commit for f6c | It now quotes `runs 218 and 219`, which only the R50 amendment adds; the comment names `892c366` |
| Low | The kit README's Pages bullet sat under revision 20, dated 2026-11-08 | Removed |
| Low | v5p closed with its open questions unanswered, one of them stating a 100 MB Pages file limit | Answered in its closure, with the size corrected |
| Low | The deploy job's 10-minute timeout equals deploy-pages' own | 15 minutes |
| Low | The new test inherited the machine's git configuration | `GIT_CONFIG_GLOBAL=/dev/null` and `GIT_CONFIG_NOSYSTEM=1` |
| Info | zizmor's auditor persona: undocumented permissions on the deploy job | Each permission has a comment; the claims job's new one too |
| Info | `candidate/sandbox-gate` (g4e) changes `github.sh`, the README, this test file, SPEC-001 and the backlog | It must be rebuilt on top once this lands, as the hand-off already plans |
| Info | The README's keys table could list the Pages publisher | Added |

The reviewer could not check macOS's bash 3.2, which this session's permissions refused to build, or the live Pages API, which the session's proxy blocks.
