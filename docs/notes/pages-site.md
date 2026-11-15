# The practices poster beside the factory video, from one Pages workflow (backlog p6s)

Status: staged in `proposals/pages-site/`, not landed.

## Why

On 2026-11-15 the owner asked for the posters the repository builds to be embedded in the README, as the factory video is, and kept current, starting with the practices poster's front and back. The `practices-carousel` workflow (decision 0009) already renders both sides, `out/poster.png` and `out/poster-back.png`, but only into a workflow artifact behind a sign-in.

A repository has one GitHub Pages site, and each `actions/deploy-pages` call replaces all of it. So the poster cannot be published the way the video was, by its own workflow: each kit's deploy would remove the other's files. The owner chose, on 2026-11-15, to have this session change both kit workflows in one batch, though the other session owns the carousel kit.

## What the batch changes

| File | Change |
|---|---|
| `specs/SPEC-001-delivery-pipeline.md` | SPEC-001-R235 amended; SPEC-001-R236 added |
| `.github/workflows/pages.yml` | New, `workflow_call` only. The assemble job (`actions: read`, `contents: read`, no checkout) chooses each kit's newest build on `main`: newest run first, a name of the kit's own form, a run of the kit's own workflow started by a push or by hand on `main` in this repository, at a commit `main`'s tip holds. It downloads both with `gh run download`, lays out the site and uploads it. The deploy job runs only `actions/deploy-pages` |
| `.github/workflows/factory-video.yml` | The claims job decides a rebuild against the newest video this workflow built on `main` (`actions: read`), chosen as `pages.yml` chooses it, not the newest deployment. The page steps and the deploy job are gone; a `pages` job calls `pages.yml` on every run on `main` whose build passed or was not needed. Artifacts kept 90 days. The prune job deletes only its own branch's artifacts |
| `.github/workflows/practices-carousel.yml` | A `pages` job calls `pages.yml` after the build on `main`. Artifacts kept 90 days. The prune job deletes only its own branch's artifacts |
| `test/site-pages.test.ts` | New, R236: the two workflows' shapes, the assemble scripts run against a stand-in `gh`, the prune scripts, retention and the README |
| `test/factory-pages.test.ts` | R235's decision against artifacts; the page and deploy tests moved to R236 |
| `test/helpers/artifacts-gh.ts` | New: the stand-in `gh`. It applies each script's own `--jq` filter to a fixture with `jq`, so the filters are tested too |
| `test/producer.test.ts` | SPEC-001-R86's test walked every job's steps in every workflow; a job that calls a reusable workflow has none |
| `README.md` | Both sides of the poster, side by side, under the video at the top; the keys table names `pages.yml`'s deploy job |
| `docs/decisions/0008-factory-video-kit.md`, `docs/decisions/0009-practices-carousel.md` | Dated amendments: 90 days, and a prune per branch |
| `scripts/bootstrap/github.sh` | A comment: `github-pages` publishes the poster too |
| `factory-video/README.md`, `practices-carousel/README.md` | Where each kit's output is published now |
| `traceability.md`, `.tasks/backlog.jsonl` | R236's row; backlog `who-gets-the-keys-p6s`, filed and closed |
| `docs/progress.json`, `docs/progress.svg` | The landed tree's record: 113 approved, 164 drafted, 13 backlog items closed |

No deployable path changes, so main's `sandbox` deploy is skipped (SPEC-001-R232).

## Choices, and why

| Choice | Why |
|---|---|
| One reusable workflow, called by both kits, in one concurrency group with `cancel-in-progress: true` | The newest call wins, and every call takes the newest build of both kits, so no order of runs can leave one kit's files off the site. A workflow triggered by `workflow_run` would do the same, but zizmor reports that trigger as dangerous, and the workflows check fails on any zizmor finding |
| A build counts only if its run is the kit's own workflow, started by a push or by hand on `main` in this repository, and `main`'s tip holds its commit | An artifact's `workflow_run.head_branch` names a branch, not a ref: a pull request from a branch named `main`, or a tag named `main`, reports `main` too, and any job can upload an artifact of any name. Found by the review (H1). The compare is against `main`'s tip, not the calling run's commit, so a call from an older commit still takes a newer kit's build |
| Newest means the newest workflow run, then the newest upload | A re-run keeps its run ID, so re-running an old run cannot replace a newer build (review, L1) |
| The artifact list is read only through a `jq` filter that prints fields of a fixed form, with names of the kit's own pattern | Artifact names may hold spaces, which shifted the fields the scripts split on (review, M1) |
| Every script sets `pipefail` itself | A step with no `shell:` runs as `bash -e`, without it; the tests run the scripts the same way (review, L2) |
| Download from artifacts, not from the live site | Pages serves through a CDN that may hold a file for minutes after a deploy, so a copy taken from the site can be older than the build |
| Decide a video rebuild against the newest video artifact, not the newest deployment (R235 amended) | Once the poster shares the site, a deployment made for a poster change holds an older video, so the deployment's commit no longer says which video is published |
| `factory-video` publishes on every run on `main`, even when the build was not needed | A deploy that failed is tried again by the next run of either kit. It costs about a minute |
| Artifacts kept 90 days | The most a public repository allows. The publisher needs the newest build of both kits; if one is not rebuilt for 90 days, the publisher fails and the live site stays as it was. A monthly build would remove that; not added |
| Prune only the run's own branch | Before this, a run on another branch deleted `main`'s newest artifact, which the publisher now reads. The review of `factory-pages` noted the old behaviour |
| Call it as `$/.github/workflows/pages.yml` | GitHub's "recommended syntax for referencing a reusable workflow in the same repository", at the caller's commit, resolved against the repository rather than the runner's workspace. zizmor's `self-repository` audit fails the workflows check on the `./` form |
| The poster's files under `practices/` | The video's `poster.png` stays at the root, where the README's links already point |
| Fail the assemble step when an artifact is missing or incomplete, naming the workflow to run | Nothing is deployed, so the live site keeps both kits' previous files |

## Platform behaviour this relies on

Read on 2026-11-15 from GitHub's documentation:

| Fact | Source |
|---|---|
| A job that calls a reusable workflow may use `concurrency`, `permissions`, `needs`, `if` and `cache-mode`, among others, and not `environment` | https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations, "Supported keywords for jobs that call a reusable workflow" |
| "The `GITHUB_TOKEN` permissions passed from the caller workflow can be only downgraded (not elevated) by the called workflow." The `github` context is the caller's, and a same-repository reusable workflow runs from the caller's commit | Same page; https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows |
| Concurrency group names are shared across workflows; `cancel-in-progress: true` also cancels a running job | https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs |
| Public repositories keep artifacts 1 to 90 days; `retention-days` cannot exceed that | https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository; https://docs.github.com/en/actions/tutorials/store-and-share-data |
| The artifact list has `expired` and `workflow_run.head_sha`; "Anyone with read access to the repository can use this endpoint" | https://docs.github.com/en/rest/actions/artifacts |
| `gh run download` extracts each artifact: "If only a single artifact is specified, it will be extracted into the current directory" | https://cli.github.com/manual/gh_run_download. The page names the current directory, not `--dir`, so the script accepts the files in `--dir` or in a folder named for the artifact. (Corrected 2026-11-15: the first version of these notes said the page does not say.) |
| A run's `event`, `path`, `head_branch` and `head_repository.full_name`; `compare/<base>...<head>` reports `ahead` when head is ahead of base; `branches/main` gives the tip | Read from this repository's public API on 2026-11-15: run 43736505973 is `push .github/workflows/practices-carousel.yml main PaulDuvall/who-gets-the-keys`, and `compare/d62a911...9670152` is `ahead` |

Not verified until a run shows it: that the `github-pages` environment's `main` rule passes a deploy job inside a called workflow. The `github` context there is the caller's, so the job's ref is `refs/heads/main`.

## Owner steps

1. `land.sh --to-main` for the candidate branch that holds this batch.
2. `land.sh proposals/pages-site`, signed. The push runs both kit workflows. The carousel's, about 2 minutes, publishes the poster with the current video. The factory video's rebuilds the video, because R236 moves the end card's approved count to 113, and publishes again about 12 minutes later.
3. Open the README and the page, and check both sides of the poster and the video.

## Preflight, 2026-11-15

The first run, at `5360763`, failed three steps, each fixed in `52a455c`: the workflows check, on zizmor's `self-repository` audit of the `./` call; ESLint, on an `expect` inside a condition in the new test; and Vitest, on SPEC-001-R86's test, which read `steps` of every job. The second run's results follow.

In a scratch worktree outside the checkout at `52a455c`, every move and the `LAND.txt` removal applied as `land.sh` does them, a hard-linked `node_modules`, `GIT_LITERAL_PATHSPECS` unset:

| Step | Result |
|---|---|
| `tsc --noEmit` | pass |
| ESLint on the three changed or new test files and the helper | pass |
| `node scripts/checks.ts`, the ordered fifteen, zizmor among them | all pass |
| `node scripts/checks.ts task`, then `scope` | pass |
| Vitest, every test | 25 files, 410 tests, pass |
| `node scripts/progress.ts` on the landed tree | equals the staged copies: 113 approved, 164 drafted, 13 backlog items closed |
| `git apply --check` on all 19 scenario patches | all apply |
| The owner's Mac, simulated: a BSD-style `seq` first on PATH and Homebrew's keg-only `node@24` with its `npm` | 25 files, 410 tests, pass |

## Independent review, 2026-11-15

A subagent got the staged files, SPEC-001-R235 and R236 and the rows they must not break, the owner's request, the two kit workflows on `main` and GitHub's documentation, not these notes' conclusions. It built the landed tree, ran the checks and every test, probed the scripts with crafted artifact lists, read `gh`'s source, and mutated the workflows by hand. It found one high finding, one medium and five low. All are fixed in `6c4b35d`, except where the table says otherwise.

| Severity | Finding | Done |
|---|---|---|
| High | The publisher, and R235's decision, trusted `workflow_run.head_branch == "main"`. A pull request from a branch named `main`, or a tag named `main`, reports that too, and any job may upload an artifact of any name, so content no run on `main` built could reach the public page, and a pull request run could make the claims job skip a rebuild | A candidate counts only if its run is the kit's own workflow, `event` `push` or `workflow_dispatch`, `head_branch` `main`, in this repository; the publisher also requires `main`'s tip to hold its commit, through the compare API, which needs `contents: read`. R236 amended. The review also suggested a tag ruleset for `refs/tags/main`: not added, because a tag's commit not on `main` fails the compare, and a tag on a `main` commit builds `main`'s own files |
| Medium | Names with spaces shifted the fields three scripts split on: a crafted name made the claims job skip a rebuild, and a prune delete `main`'s newest build | Each list is read through a `jq` filter that prints only fixed-form fields; the publisher and the claims job accept only names of the kit's own form. Test decoys hold such names |
| Low | "Newest" was the newest upload, so re-running an old run would publish its older build | Newest workflow run first, then newest upload, in the publisher, the claims job and both prunes |
| Low | Steps with no `shell:` run as `bash -e`, without `pipefail`, but the tests ran them with it | Every new script starts `set -o pipefail`; the tests run scripts as `bash -e` and check that first line |
| Low | Mutants the tests missed: no `--paginate`, the run ID and time form checks, a loose branch or name match, the `BRANCH` mapping, the carousel's `if`, the prune's expired filter | The stand-in `gh` serves pages of two and only the first without `--paginate`; decoys for each; exact `if` and `env` assertions; a check of which runs are looked up. 24 hand mutations, all caught |
| Low | One failure message did not name the workflow to run | Format errors are now filtered out before any lookup; every failure that a kit causes names its workflow |
| Low | Stale statements: 30 days in the kit README, `github.sh`'s comment, the download command's "newest", decisions 0008 and 0009, and these notes on `gh run download` | Each corrected; the decisions and these notes say so with a date |
| Info | If one kit is not rebuilt for 90 days, every publish fails until it is | Kept, as recorded in backlog p6s |
| Info | `candidate/sandbox-gate` (g4e) stages the same SPEC-001, README, backlog and `github.sh` | It must be rebuilt on whichever lands first |

The reviewer could not run anything only GitHub can show: a pull request or tag run's `head_branch`, a name with spaces at upload, the environment rule for a deploy job inside a called workflow, or cancellation across workflows.
