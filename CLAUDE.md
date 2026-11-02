# who-gets-the-keys

Purpose: <!-- PAUL: one-line purpose of the repo -->

## Commands

| Command | What it does |
|---|---|
| `npm run checks` | All checks, fail-fast, in the order below |
| `npm run check:<name>` | One check |
| `npm run scenarios` | Applies every local bad-scenario patch to `main` in a temporary worktree and asserts its check and line |
| `npm run scenario -- <ID>` | One scenario |
| `npm run video` | Builds `build/video/`: page, video, captions, report |
| `npm run video -- --page-only` | The page alone, no browser |
| `npm run practices` | Regenerates `docs/practices.md` from `practices.yaml` |

## File map

| Path | Holds |
|---|---|
| `specs/` | Approved requirements, the protected-path list, SCA exceptions and the slide snapshot. Approver-signed commits only |
| `proposals/` | Agent-proposed changes: to `specs/` at the same relative path, to other protected paths at their full repo path (for example `proposals/scripts/checks.ts`). Paths under `.claude/` and `.github/` go to `proposals/claude-<dir>/` and `proposals/github-<dir>/` (for example `proposals/github-workflows/`), because the local permission rules also refuse writes to `proposals/.claude/` and `proposals/.github/` |
| `practices.yaml` | Slide practice → check, scenario, files. Source for `docs/practices.md`, the `slides` check and the video |
| `src/` | Export service: CSV serializer and Lambda handler |
| `test/` | Vitest acceptance, property and unit tests |
| `scripts/checks.ts` | Check dispatcher |
| `scripts/bootstrap/` | Human-run scripts: GitHub settings, AWS bootstrap, slide refresh |
| `scenarios/` | `scenarios.yaml`, 17 patches `B01` to `B18` (B9 and B11 have none), the B9 fixture, harness `run.ts` |
| `.github/workflows/` | `pipeline.yml`, `issue-triage.yml`, `scenarios.yml`, `video.yml` |
| `.github/egress/allowlist.json` | Egress allowlist shared by triage and the B9 replay |
| `infra/sandbox/`, `infra/org/` | Terraform: workload and roles; SCP |
| `video/` | Walkthrough kit: page template, orchestrator, recorder, narration pins |
| `docs/` | Verification log, deviations, reconciliation, slide audit, ADRs, generated practices table |
| `traceability.md` | Requirement → test file → check → scenario |

## Conventions

- Trunk-based. Commit to `main`, one task per commit, push with `git push origin HEAD:main`. No branches, no pull requests.
- Agent commits are unsigned: `git -c commit.gpgsign=false commit`.
- Every commit touching `src/` or `test/` carries `Spec: <requirement ID>`.
- Agent commits carry `Agent: Claude Code`.
- Every export from `src/` carries `@requirement <ID>` in its doc comment.
- Every test names the requirement ID it checks.
- Check order: secrets → allowlist → workflows → install → lint → typecheck → iac → sast → sca → trace → ratchet → signatures → slides → test → mutation.
- A failing check prints one line: `CHECK <name> FAILED: <identifier>`.
- Say "customer", never "client".
- Say "check" for automated verification and "gate" only for a human approval: an approver's signature or a required reviewer.
- Commands written for a human to paste carry no `#` comments.
- A delivered video is named `walkthrough-<short SHA>-<UTC build time>.mp4`, for example `walkthrough-b2ae2c5-20261023T1554Z.mp4`. The SHA is the commit in `build/video/report.json`; the time is the video file's own write time, not the time it is sent.

## Authority boundaries

| The agent may | The agent may not |
|---|---|
| Write code, tests and docs | Write under `specs/`, to `approvers.txt`, or to any path listed in `specs/protected-paths.txt` (workflows, check script and the configs it reads, CI tools, dependency manifests, `.claude/`, this file, Terraform, bootstrap scripts, the scenario scripts that hold credentials) |
| Propose spec, pipeline, dependency, Terraform and bootstrap-script changes under `proposals/` | Sign commits or force-push |
| Run checks, scenarios, the video build | Run `terraform apply` or `destroy`, or any `aws` command |
| | Read `~/.ssh`, `~/.aws`, `~/.config/gh` |
| | Add or install dependencies; lower `thresholds.break` |
| | Create secrets, change repo or account settings, install GitHub Apps |

## Source of record

The deck snapshot at `specs/source-of-record/slides.txt` is the source of record for every practice. Never read the live deck. A refresh goes through `scripts/bootstrap/refresh-slides.sh` and an approver-signed commit.

## MCP

No MCP servers are used, so there is no `.mcp.json`.

## Specs

@specs/SPEC-001-delivery-pipeline.md
@specs/SPEC-002-walkthrough-video.md
@specs/SPEC-014-export-latency.md
