# who-gets-the-keys

Purpose: <!-- PAUL: one-line purpose of the repo -->

## Commands

| Command | What it does |
|---|---|
| `npm run gates` | All gates, fail-fast, in the order below |
| `npm run gate:<name>` | One gate |
| `npm run scenarios` | Applies every local bad-scenario patch to `main` in a temporary worktree and asserts its gate and line |
| `npm run scenario -- <ID>` | One scenario |
| `npm run video` | Builds `build/video/`: page, video, captions, report |
| `npm run video -- --page-only` | The page alone, no browser |

## File map

| Path | Holds |
|---|---|
| `specs/` | Approved requirements and the slide snapshot. Approver-signed commits only |
| `proposals/` | Agent-proposed changes to `specs/`, same relative paths |
| `practices.yaml` | Slide practice → gate, scenario, files. Source for `docs/practices.md`, the `slides` gate and the video |
| `src/` | Export service: CSV serializer and Lambda handler |
| `test/` | Vitest acceptance, property and unit tests |
| `scripts/gates.ts` | Gate dispatcher |
| `scripts/bootstrap/` | Human-run scripts: GitHub settings, AWS bootstrap, slide refresh |
| `scenarios/` | `scenarios.yaml`, patches `B01` to `B17`, harness `run.ts` |
| `.github/workflows/` | `pipeline.yml`, `issue-triage.yml`, `scenarios.yml`, `video.yml` |
| `.github/egress/allowlist.json` | Egress allowlist shared by triage and the B9 replay |
| `infra/sandbox/`, `infra/org/` | Terraform: workload and roles; SCP |
| `video/` | Walkthrough kit: page template, orchestrator, recorder, narration pins |
| `docs/` | Verification log, deviations, reconciliation, ADRs, generated practices table |
| `traceability.md` | Requirement → test file → gate → scenario |

## Conventions

- Trunk-based. Commit to `main`, one task per commit, push with `git push origin HEAD:main`. No branches, no pull requests.
- Agent commits are unsigned: `git -c commit.gpgsign=false commit`.
- Every commit touching `src/` or `test/` carries `Spec: <requirement ID>`.
- Agent commits carry `Agent: Claude Code`.
- Every export from `src/` carries `@requirement <ID>` in its doc comment.
- Every test names the requirement ID it checks.
- Gate order: secrets → allowlist → workflows → install → lint → typecheck → iac → sast → sca → trace → signatures → slides → ratchet → test → mutation.
- A failing gate prints one line: `GATE <name> FAILED: <identifier>`.
- Say "customer", never "client".
- Commands written for a human to paste carry no `#` comments.

## Authority boundaries

| The agent may | The agent may not |
|---|---|
| Write code, tests, docs, workflows, Terraform | Write under `specs/` or to `approvers.txt` |
| Propose spec changes under `proposals/` | Sign commits or force-push |
| Run gates, scenarios, the video build | Run `terraform apply` or `destroy`, or any `aws` command |
| Write human-run scripts under `scripts/bootstrap/` | Read `~/.ssh`, `~/.aws`, `~/.config/gh` |
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
