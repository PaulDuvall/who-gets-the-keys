# The factory video follows main and is published to GitHub Pages (backlog v5p, f6c)

Status: staged in `proposals/factory-pages/`, not landed.

## Why

The README could not link the factory video. The `factory-video` workflow uploaded it only as an Actions artifact: a zip, behind a sign-in, kept 30 days. It also rebuilt the video only when `factory-video/` or the workflow changed, so the end card's counts fell behind `main`. The newest video, built at `8dce7fe` on 2026-11-12 (run 27), counts 103 approved requirements; `main` at `fa38bed` has 111. Every factory-video run on `main` since run 27, runs 28 to 42, checked the claims and rebuilt nothing.

On 2026-11-12 the owner asked for one README link that plays the video built from the latest `main`, and chose GitHub Pages (`who-gets-the-keys-v5p`). On 2026-11-14 this session filed `who-gets-the-keys-f6c` for the rebuild without searching the backlog first. The owner pointed out that v5p already asked for it. This batch does both and closes f6c as a duplicate, with that correction in its description.

## What the batch changes

| File | Change |
|---|---|
| `specs/SPEC-001-delivery-pipeline.md` | SPEC-001-R235, after R229 |
| `.github/workflows/factory-video.yml` | Runs, and rebuilds the video, when a push to `main` changes `docs/progress.json`. On `main`, the build job lays out the page and uploads it with `actions/upload-pages-artifact`. A new `deploy` job publishes it with `actions/deploy-pages` |
| `scripts/bootstrap/github.sh` | Environment `github-pages` deployable from branch `main` only, with no reviewer. On a public repository, the Pages site built by GitHub Actions, created if absent |
| `test/factory-pages.test.ts` | New: 7 tests of R235. Two run the workflow's own step scripts: the rebuild decision in a temporary git repository, and the page layout |
| `test/checks-before-main.test.ts` | The `github.sh` stand-in answers the Pages read; 4 new tests; the exact write lists gain the `github-pages` environment and the Pages write |
| `README.md`, `factory-video/README.md` | Link the page. The artifact route stays, for the other files |
| `traceability.md` | Row for R235 |
| `.tasks/backlog.jsonl` | v5p and f6c closed |
| `docs/progress.json`, `docs/progress.svg` | The record for the landed tree |

`src/`, `infra/sandbox`, `package*.json`, `tsconfig.json` and `pipeline.yml` do not change, so main's `sandbox` deploy is skipped (SPEC-001-R232).

## Choices, and why

| Choice | Why |
|---|---|
| Rebuild when `docs/progress.json` changed, not when each of its inputs did | It holds exactly the counts the end card captions, and every commit that changes one of them commits it (SPEC-001-R227). A push that rewords a spec without moving a count rebuilds nothing. Limit: the end card also outlines each claim by status, and two claims that swap statuses in one commit leave every count unchanged. A change to `factory-video/claims.json` itself rebuilds anyway, because it is under `factory-video/` |
| The page is laid out in the build job; the deploy job has one step, `actions/deploy-pages` | The deploy job holds `id-token: write` and `pages: write`. It checks out nothing and runs no repository code, so nothing the commit holds runs with them |
| No required reviewer on `github-pages` | The page holds only a video built from `main`, by a job that can only read the repository. v5p's recommendation |
| `github.sh` restricts `github-pages` to branch `main` | GitHub creates the environment when a workflow first uses it, and its documentation recommends, but does not say it adds, a rule that only the default branch may deploy. Without it, a workflow on a candidate branch could request the same two permissions and replace the public page. `producer` already has the same rule (SPEC-001-R85) |
| `github.sh` sets the Pages source only on a public repository | `github.sh` already skips the public-only settings on a private repository. Inference: Pages on a private repository depends on the plan |
| No AWS role can use this workflow's OIDC token | Each role's trust in `infra/sandbox/iam.tf` requires an exact `job_workflow_ref` of another workflow |

## Platform behaviour this relies on

Read on 2026-11-14 from GitHub's documentation:

| Fact | Source |
|---|---|
| "Published GitHub Pages sites may be no larger than 1 GB." Deployments time out after 10 minutes. Soft bandwidth limit 100 GB a month | https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits |
| The deploy job needs at least `pages: write` and `id-token: write`; the default environment is `github-pages`, created automatically if absent; the uploaded tar must be under 10 GB | https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages |
| Settings → "Code, planning, and automation" → Pages → "Build and deployment" → Source → GitHub Actions. "We recommend that you add a deployment protection rule so that only the default branch can deploy to this environment." | https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site |
| `POST /repos/{owner}/{repo}/pages` creates a site, with `build_type` `workflow`; `PUT` updates it, 204; `GET` answers 404 or 200, and its body has `build_type` | https://docs.github.com/en/rest/pages/pages |
| A deployment branch rule "is matched against the `GITHUB_REF` of the workflow run" | https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments |

Not found in the documentation: what a job sees when it runs from a branch the environment's rule excludes. The rule is the documented control; its effect on a candidate branch is unverified until a run shows it.

Size: the newest build's whole artifact, eight files zipped, is 68.5 MB (artifact `factory-video-8dce7fe-20261112T1953Z`), so the page's three files are well under 1 GB. The page's own size is printed by the layout step's `du -sh` on the first run.

The action pins were checked with `git ls-remote` on 2026-11-14: `actions/upload-pages-artifact` `v5.0.0` and `v5` are `fc324d3547104276b827a68afc52ff2a11cc49c9`; `actions/deploy-pages` `v5.0.1` and `v5` are `368f82528645a54fb793d4d04e342629a3f51346`.

## Owner steps, in order

1. Turn on Pages, built by GitHub Actions, before the batch lands, so the first deploy finds a site. One `gh api` command, the same write `github.sh` makes.
2. `land.sh --to-main` for the candidate branch that holds this batch. Docs and proposals only.
3. `land.sh proposals/factory-pages`, which signs one commit. The push changes `factory-video.yml`, so the factory-video workflow rebuilds the video, about 15 minutes, then deploys it.
4. `scripts/bootstrap/github.sh`, which restricts `github-pages` to `main` and finds Pages already built by Actions.
5. Open https://paulduvall.github.io/who-gets-the-keys/ and play the video. Its caption names the commit; the end card should count what `docs/progress.json` counts at that commit.

None of these ends at a `sandbox` deploy approval.

## Preflight

Not run yet.

## Independent review

Not run yet.
