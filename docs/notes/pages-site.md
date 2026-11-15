# The practices poster beside the factory video, from one Pages workflow (backlog p6s)

Status: staged in `proposals/pages-site/`, not landed.

## Why

On 2026-11-15 the owner asked for the posters the repository builds to be embedded in the README, as the factory video is, and kept current, starting with the practices poster's front and back. The `practices-carousel` workflow (decision 0009) already renders both sides, `out/poster.png` and `out/poster-back.png`, but only into a workflow artifact behind a sign-in.

A repository has one GitHub Pages site, and each `actions/deploy-pages` call replaces all of it. So the poster cannot be published the way the video was, by its own workflow: each kit's deploy would remove the other's files. The owner chose, on 2026-11-15, to have this session change both kit workflows in one batch, though the other session owns the carousel kit.

## What the batch changes

| File | Change |
|---|---|
| `specs/SPEC-001-delivery-pipeline.md` | SPEC-001-R235 amended; SPEC-001-R236 added |
| `.github/workflows/pages.yml` | New, `workflow_call` only. The assemble job (`actions: read`, no checkout) downloads the newest unexpired `factory-video-*` and `practices-carousel-*` artifacts from runs on `main` with `gh run download`, lays out the site and uploads it. The deploy job runs only `actions/deploy-pages` |
| `.github/workflows/factory-video.yml` | The claims job decides a rebuild against the newest video artifact built on `main` (`actions: read`), not the newest deployment. The page steps and the deploy job are gone; a `pages` job calls `pages.yml` on every run on `main` whose build passed or was not needed. Artifacts kept 90 days. The prune job deletes only its own branch's artifacts |
| `.github/workflows/practices-carousel.yml` | A `pages` job calls `pages.yml` after the build on `main`. Artifacts kept 90 days. The prune job deletes only its own branch's artifacts |
| `test/site-pages.test.ts` | New, R236: the two workflows' shapes, the assemble scripts run against a stand-in `gh`, the prune scripts, retention and the README |
| `test/factory-pages.test.ts` | R235's decision against artifacts; the page and deploy tests moved to R236 |
| `test/helpers/artifacts-gh.ts` | New: the stand-in `gh`. It applies each script's own `--jq` filter to a fixture with `jq`, so the filters are tested too |
| `test/producer.test.ts` | SPEC-001-R86's test walked every job's steps in every workflow; a job that calls a reusable workflow has none |
| `README.md` | Both sides of the poster, side by side, under the video at the top; the keys table names `pages.yml`'s deploy job |
| `factory-video/README.md`, `practices-carousel/README.md` | Where each kit's output is published now |
| `traceability.md`, `.tasks/backlog.jsonl` | R236's row; backlog `who-gets-the-keys-p6s`, filed and closed |
| `docs/progress.json`, `docs/progress.svg` | The landed tree's record: 113 approved, 164 drafted, 13 backlog items closed |

No deployable path changes, so main's `sandbox` deploy is skipped (SPEC-001-R232).

## Choices, and why

| Choice | Why |
|---|---|
| One reusable workflow, called by both kits, in one concurrency group with `cancel-in-progress: true` | The newest call wins, and every call takes the newest build of both kits, so no order of runs can leave one kit's files off the site. A workflow triggered by `workflow_run` would do the same, but zizmor reports that trigger as dangerous, and the workflows check fails on any zizmor finding |
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
| `gh run download` extracts each artifact | https://cli.github.com/manual/gh_run_download. It does not say whether a single artifact lands in `--dir` itself or in a folder named for it, so the script accepts either |

Not verified until a run shows it: that the `github-pages` environment's `main` rule passes a deploy job inside a called workflow. The `github` context there is the caller's, so the job's ref is `refs/heads/main`.

## Owner steps

1. `land.sh --to-main` for the candidate branch that holds this batch.
2. `land.sh proposals/pages-site`, signed. The push runs both kit workflows. The carousel's, about 2 minutes, publishes the poster with the current video. The factory video's rebuilds the video, because R236 moves the end card's approved count to 113, and publishes again about 12 minutes later.
3. Open the README and the page, and check both sides of the poster and the video.

## Preflight, 2026-11-15

The first run, at `5360763`, failed three steps, each fixed in `52a455c`: the workflows check, on zizmor's `self-repository` audit of the `./` call; ESLint, on an `expect` inside a condition in the new test; and Vitest, on SPEC-001-R86's test, which read `steps` of every job. The second run's results follow.

SECOND_RUN

## Independent review

Not run yet.
