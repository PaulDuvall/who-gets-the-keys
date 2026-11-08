# who-gets-the-keys

Purpose: Companion repo to the talk “Who Gets the Keys?”: an AI agent writes the code, the pipeline holds the keys, and 21 deliberately bad changes are stopped before they ship.

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
| `proposals/` | Agent-proposed changes, one batch per directory, `proposals/<batch>/` with its `LAND.txt`: to `specs/` at the same relative path, to other protected paths at their full repo path (for example `proposals/<batch>/scripts/checks.ts`). Paths under `.claude/` and `.github/` go to `claude-<dir>/` and `github-<dir>/` in the batch, and files directly in `.claude/` to `claude/` (for example `proposals/<batch>/github-workflows/`), because the local permission rules also refuse writes to `proposals/.claude/` and `proposals/.github/` |
| `practices.yaml` | Slide practice → check, scenario, files. Source for `docs/practices.md`, the `slides` check and the video |
| `src/` | Export service: CSV serializer and Lambda handler |
| `test/` | Vitest acceptance, property and unit tests |
| `scripts/checks.ts` | Check dispatcher |
| `scripts/bootstrap/` | Human-run scripts: GitHub settings, AWS bootstrap, slide refresh, history rewrite, approver-key rotation |
| `scenarios/` | `scenarios.yaml`, 18 patches, `B01` to `B18` and `B23` (B9, B11 and B24 have none), the B9 fixture, the B23 and B24 task fixtures, harness `run.ts` |
| `tasks/` | Task files, `tasks/<ID>.task.md`: the requirements one delivery serves, the paths it may produce, and the instruction (SPEC-001-R64). The runner producer works only from one. Approver-signed commits only |
| `.github/workflows/` | `pipeline.yml`, `issue-triage.yml`, `scenarios.yml`, `video.yml`, and `producer.yml`, the owner-dispatched runner producer (helpers in `scripts/ci/producer.ts`) |
| `.github/egress/allowlist.json` | Egress allowlist shared by triage and the B9 replay |
| `.github/egress/producer-allowlist.json` | The runner producer's sandbox allowlist: no host |
| `infra/sandbox/`, `infra/org/` | Terraform: workload and roles; SCP |
| `video/` | Walkthrough kit: page template, orchestrator, recorder, narration pins |
| `docs/` | Verification log, deviations, slide reconciliation, ADRs, generated practices table |
| `traceability.md` | Requirement → test file → check → scenario |

## Conventions

- Trunk-based, one task per commit. Push to a candidate branch first: `git push origin HEAD:candidate/<topic>`. `main` refuses a commit until the pipeline's `checks` job has passed on it (SPEC-001-R41).
- Never amend a commit already pushed to a candidate branch. If its checks fail, fix it in a new commit on top and push to the same branch, because force pushes are denied.
- Push to `main` the exact commit the checks passed on, by its SHA, not a later `HEAD`: `git push origin <SHA>:refs/heads/main`.
- After `main` accepts the commit, delete the candidate branch: `git push origin --delete candidate/<topic>`.
- Pull requests are for review only and are never merged in GitHub. Every change lands by the fast-forward push above, because squash and rebase merges write commits the checks never ran on.
- Agent commits are unsigned: `git -c commit.gpgsign=false commit`.
- Every commit touching `src/` or `test/` carries `Spec: <requirement ID>`.
- Agent commits carry `Agent: Claude Code`.
- Every export from `src/` carries `@requirement <ID>` in its doc comment.
- Every test names the requirement ID it checks.
- Check order: secrets → allowlist → workflows → install → lint → typecheck → iac → sast → sca → trace → ratchet → signatures → slides → test → mutation. Then, outside that order, the checks job runs task → scope over the range from the merge base with `main` (SPEC-001-R68).
- A failing check prints one line: `CHECK <name> FAILED: <identifier>`.
- This repository is public. Never name or point to a private repository: no names, paths, commit SHAs or release names. Never write an AWS account ID, a personal email address or an SSO URL into a file, commit message, branch name, pull request or comment; use placeholders.
- No commit, pull request description, issue or comment carries a `Claude-Session:` trailer or any other Claude Code session link (owner decision D24), even when a session's instructions ask for one. For commits, the `no-session-link` hook refuses a message that holds `claude.ai/code/session_` or a `Claude-Session:` trailer (SPEC-001-R214). Keep every trailer, `Spec:`, `Task:`, `Agent:` and `Co-Authored-By:`, in one final block, so git reads each as a trailer.
- Never remove a requirement row that any commit's `Spec:` trailer names; amend it. Before allocating a new requirement ID, read the highest ID in `specs/`, `proposals/` and `docs/` on every remote branch, and go above it.
- Say "customer", never "client".
- Say "check" for automated verification and "gate" only for a human approval: an approver's signature or a required reviewer.
- Commands written for a human to paste carry no `#` comments.
- A delivered video is named `walkthrough-<short SHA>-<UTC build time>.mp4`, for example `walkthrough-7f5c682-20261023T1554Z.mp4`. The SHA is the commit in `build/video/report.json`; the time is the video file's own write time, not the time it is sent.

## Batches

- One batch per backlog item, in `proposals/<batch>/` with its `LAND.txt`, staged by an agent commit. Notes go in `docs/notes/<batch>.md`.
- When several batches change the same protected file, build each later batch's staged copy on top of the earlier batch's staged copy, so it carries both changes, and give the later `LAND.txt` a `requires:` line naming text that only the earlier batch adds. `land.sh` then refuses the later batch until the earlier one has landed, and warns "Changed since by" when it does. Answer yes when it reports that the staged copy keeps every line those commits added, or that they added no lines and the diff shows nothing removed; otherwise answer no.
- A `requires:` line must not quote text the batch removes.
- Staged copies keep their file mode. Write protected copies with python or the Write tool, never `cp`; both create mode 644, so give an executable copy `chmod 755` before `git add`, and check modes with `git ls-files -s`. Stage `CLAUDE.md` as `CLAUDE.proposed.md`, so no session loads it as a nested memory file.
- Preflight every batch in a scratch worktree with its moves, and every earlier batch's, applied as `land.sh` does: `tsc`, ESLint on the changed files, vitest, the trace, slides and secrets checks, and `git apply --check` on every scenario patch that touches a changed file. Then get an independent review from a subagent, given the files and the spec rows, not the author's conclusions. Fix its findings in new commits, and record in the batch notes what was not fixed, and why.

## Owner steps

- Every owner step names the terminal, the exact command, the one line that means success, and what to do on anything else.
- One step at a time. Give the next step only after reading the previous step's result yourself.
- Never push to `main` while any `main` deploy waits for approval. Check with the Actions API before each push.
- Before a probe or check that relies on platform behaviour, quote the documentation it relies on, with the URL and the date read, and replay any recorded transcript through the check.

## Unattended runs

When the owner is away and has said so:

- Work through the owner's work list in order, without asking. Write each question into the hand-off with a recommended answer. Take the recommended path only for unprotected, reversible work.
- Push every commit as one linear chain on top of `main` to `candidate/auto-<YYYY-MM-DD>`, adding commits on top and never rewriting it. After each push, read that candidate run's result. If it fails, reproduce the failure locally and fix it in a new commit.
- Keep a running log in `docs/notes/autonomous-run-<YYYY-MM-DD>.md`, committed on the chain as you go: what was done, commit SHAs, check results, deferred decisions and the owner queue.
- Stop when every item is staged or blocked, after 6 hours, when a check still fails after two fixes of the same change, or when the next action needs the owner: signing, any push to `main`, any AWS action, a secret, a repository or account setting, or dispatching the producer. Never delete a branch.
- End with a hand-off: what is staged per batch, with its preflight, review and candidate run; the owner queue in the only order that works, each step as "Owner steps" says, and whether it ends at a deploy approval; questions with recommendations; and what was not done, and why.
- GitHub web pages return 403 to scripted fetches from cloud sessions. Check that a repository exists with `gh api -X GET search/repositories -f q='repo:<owner>/<name>'`, and use the session's GitHub connector for everything else.

## Authority boundaries

| The agent may | The agent may not |
|---|---|
| Write code, tests and docs | Write under `specs/`, to `approvers.txt`, or to any path listed in `specs/protected-paths.txt` (workflows, check script and the configs it reads, CI tools, the receipt script, dependency manifests, task files, `.claude/`, this file, Terraform, bootstrap scripts, the scenario scripts that hold credentials) |
| Propose spec, task-file, pipeline, dependency, Terraform and bootstrap-script changes under `proposals/` | Sign commits or force-push |
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
