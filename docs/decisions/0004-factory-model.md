# 0004. The spec-to-receipt software factory

- Status: Proposed
- Status: Superseded in part by [0005](0005-signatures-and-triggers.md), once approved. Approval by tier: "What a human does" row 2, the principle "Judgment once, upstream", decision 14 and the "Where tiers live" row (0005 R111 to R117). Release signatures by tier: row 3, R77, R79, the owner decision "Reviewer tiers by environment" and the owner question "Who reviews production" (R120 to R124). Alarm-started runs: the principle "Trusted signals start runs", R83, R92 and the owner question on trusted signals (R125 to R129). New ORIGIN and TRIGGER receipt lines: decision 11 and "Receipt" (R118, R119)
- Date: 2026-11-05; owner decisions and additions recorded 2026-11-05
- Requirements: proposed SPEC-001-R64 to SPEC-001-R110. None is in the signed spec yet. They follow SPEC-001-R63, the highest ID used in `specs/`, `proposals/` and `docs/` (decision 0002). R97 to R106 add factory versions and proven tightenings (owner additions); R107 to R110 close review findings
- Builds on: decision 0002 (proposed), whose Phases 0, 1, 2 and 3 it needs, and decision 0003 (proposed), whose signature flags the receipt's INTENT line shows
- Supersedes in part: decision 0002: decisions 3, 6 and 13, owner decision D4 of 2026-11-05, Phase 0 task M04 and Phase 3. Also R42, R45, R53, R55 and R63, and the owner question "Ruleset bypass" (see What changes)
- Amends, once approved: signed SPEC-001-R12 (proven tightenings) and SPEC-001-R16 ("of at least 95")
- Modeled on: Daniel Meppiel, [Agent Contracts and Receipts, format draft 0.1](https://github.com/danielmeppiel/agent-contracts), commit `d6c80b2` of 2026-11-04, unchanged on 2026-11-05. This repo adds one thing the draft lacks: an approver-signed spec, so intent is approved too

## Context

The approach is the spec-to-receipt software factory. Signed spec in, signed receipt out.

The owner wants fewer human touchpoints. The model is one bounded agent run per task, checks that run without the agent, and an approver who approves the factory rather than each change.

Target state under decisions 0002 to 0004 (owner-approved, 2026-11-05):

> The agent writes the code; the pipeline holds the keys. People make their judgments once, upstream. They sign the specs that state intent, and they approve the factory: the pipeline, checks, policy and agent inputs. Where policy says so, they also approve production or irreversible deploys. The agent works in an isolated cloud session with no keys and no authority, so it cannot change specs, the factory or what reaches `main`. Checks it cannot touch test each change against the signed spec. A signed receipt records intent, inputs, results and the artifact, and that receipt, not a reviewer, decides what ships. Untrusted text never starts work. Every failure is fixed with a new check or a tighter spec, never another reviewer.

That paragraph is the target state, not today. The Plan says which phase makes each sentence true. Until Phase B a cloud session can still push to `main`. Some of a session's GitHub requests go out with the owner's credentials (Claude Code, Cloud environments, "GitHub proxy"). Phase D adds a headless producer on a GitHub-hosted runner. It holds model access only, through an invoke-only role, and returns only a patch. One factory change needs no signature: a proven tightening, which can only make checks stricter (decision 14).

### Terms

| Term | Meaning |
|---|---|
| task | `tasks/<ID>.task.md`: the requirement IDs, paths, budget and checks for one bounded run, plus the instruction |
| task session | A single-repository cloud session, not a project thread, started for one task from `main` at one SHA. It pushes only `candidate/<task ID>`. The pipeline tells it apart only by the `Task:` trailer and the scope check |
| interactive session | Any other session. Under the recommended owner decision, it drafts under `docs/` and `proposals/` only, which R66 enforces |
| producer run | One run of `producer.yml`'s producer job for one task (Phase D) |
| factory | The pipeline, the checks and the configs they read, the receipt policy and the agent inputs (R97). Specs and tasks are not factory files |
| factory version | An integer in `specs/receipt-policy.json` with an approved fingerprint |
| proven tightening | An unsigned commit whose every change the tightening classifier proves stricter (R100) |
| checks of record | The results that decide promotion: the candidate run's `checks` and `receipt`, or in Phase D the check job's |

### What a human does (owner decision, 2026-11-05)

| # | What a human does | When | How |
|---|---|---|---|
| 1 | Define and sign specs, and the task that cites them where `tasks/` is protected | Before code exists | Approver-signed commits to `specs/`, and to `tasks/` if the owner protects it. Starting a run, by `workflow_dispatch` or by opening a task session, is a trigger under this row, not a fourth approval |
| 2 | Approve the factory: the pipeline, checks, receipt policy and agent inputs | Rarely, upstream | Factory changes are proposed under `proposals/` and applied by the approver's signed commit. This is the one place a human still signs code. A proven tightening needs no signature (owner decision, R101) |
| 3 | Optionally approve production deploys and irreversible changes | By tier, set in policy | A listed reviewer where the approver-signed policy sets a tier, and an approver signature on irreversible changes (SPEC-001-R18). This is the declared exception after code exists |

### Principles

| Principle | Meaning | Enforced by |
|---|---|---|
| Judgment once, upstream | An approver signs two things: the spec (intent) and the factory (pipeline, checks, policy, agent inputs) | `signatures` (SPEC-001-R12, R101); `task` (R64, R65); factory version (R99) |
| No human per change | Checks against the signed spec accept or reject each change. A human touch after code exists is a defect to analyze. Exception: risk tiers decided upfront, such as irreversible changes | promote (R74); `tier` (R77); `irreversible` (R18, R80) |
| Authorship is not authority | The agent runs headless with model access only. It returns a patch. It cannot push, sign, or edit `specs/`, `.claude/` or any protected path | `scope` (R66, R67); producer job (R85, R88, R89); the promote-only ruleset (R74); the pre-check from `main` (R109) |
| Bounded, recorded inputs | Each run starts from `main` at one commit, with fixed flags | R64, R68, R88, R90; the TASK line (R70) |
| Evidence decides | Checks of record run without the agent. A signer the agent cannot reach signs the receipt. The receipt decides promotion and deploy | check job (R91); R109; 0002 Phase 3; R74; R77; R99 |
| Trusted signals start runs, untrusted text never does | Issues, comments, docs and URLs become work only through an approver-signed spec change | R83, R84, R92, R93 |
| Fix the factory, not the change | A rejected run or an escaped defect adds a check or tightens a spec. It never adds a reviewer | Decision 16 |

### Cloud sessions as the producer (owner decision, 2026-11-05: cloud sessions now, runner later)

Agent code generation stays in Claude Code cloud sessions, the owner's current practice. A session's output reaches the pipeline only as a push to a `candidate/**` branch (0002 Phase 0). The headless runner producer is specified in full below and arrives in Phase D.

| Fact | Evidence | Effect here |
|---|---|---|
| Cloud sessions "don't honor `defaultMode: "bypassPermissions"` or `"dontAsk"` from your settings files". Their mode dropdown offers Accept edits, Plan and Auto, and file edits are pre-approved in every mode | Claude Code, Permission modes; Claude Code on the web | `--permission-mode dontAsk` applies only to the runner producer. Whether a `--permission-mode` flag reaches a cloud session is not documented (Not yet verified) |
| A cloud session with one repository reads its `.claude/settings.json` only "outside a project's threads". "In a cloud thread in a project, none of a repository's `.claude/settings.json` permission rules, hooks, or `env` apply". User and local settings files are not read | Claude Code, Settings ("Settings in cloud sessions"); Claude Code, Projects ("What threads pick up from your repositories") | The repo's deny rules and hooks apply only when a task session runs as a single-repository session outside a project. F08 requires that task sessions never run as project threads or with several repositories |
| The GitHub proxy "doesn't limit which branches a push can update. To do that, use branch protection rules or rulesets on GitHub" | Claude Code, Cloud environments ("GitHub proxy") | Today a session can push to `main`. Commit `9113f5b` on `main` was pushed from one (owner observation; it is unsigned and authored `Claude <noreply@anthropic.com>`). "Cannot push" holds for sessions only from Phase B |
| A cloud environment's network access, environment variables and setup script are saved in claude.ai and edited from the environment selector | Claude Code, Cloud environments | Inference: they live outside the repository, so the receipt cannot record them by digest. The AUTHOR line says "environment not recorded" |
| In Anthropic-hosted environments, "git credentials and signing keys stay outside the sandbox". Requests "from the built-in GitHub tools, and from `gh` under the `proxy-injected` placeholder, go out with your real credentials substituted"; GraphQL requests are refused | Claude Code on the web ("Security and isolation"); Cloud environments ("GitHub proxy") | Sessions cannot sign. "`gh api` calls for attached repositories work without a token of your own" (Cloud environments). Inference: those calls act as the owner. Which admin calls work is settled by F23 |

## What changes

| Element | Today | Under 0004 |
|---|---|---|
| Intent | Approver-signed specs; code commits carry `Spec:` trailers the agent writes | The same, plus a task file that may cite only approved requirement IDs, and one receipt INTENT line per cited ID with its approving commit and signature flags |
| Unit of work | A session prompt, unrecorded | `tasks/<ID>.task.md`: requirements, needs, produces, budget, verify, and an instruction body. Recorded by digest as a run input |
| What starts a run | The owner opens a session. `issue-triage.yml` runs on opened issues and only labels | The owner's dispatch or a task session. From Phase D, optionally a trusted signal tied to an approved task. Never an issue, comment or pull request event |
| What needs a task | Nothing | Every commit that is neither approver-signed nor a proven tightening, unless it touches only `docs/` and `proposals/` (R66). The `Agent:` trailer is not trusted |
| Producer | Cloud and local sessions, which can push to `main` | Phase A: a task session pushes `candidate/<task ID>`. Phase D: a headless `claude -p` job on a GitHub-hosted runner returns `changes.diff`, with no commit and no push |
| Model access | The triage job assumes `who-gets-the-keys-triage-bedrock` (Bedrock, OIDC) | The runner producer assumes a separate invoke-only role, `who-gets-the-keys-producer-bedrock`, with a one-hour session (owner decision on model access) |
| Checks of record | `pipeline.yml`'s `checks` job; from 0002 Phase 0 also on `candidate/**` | The same, plus `task` and `scope`. From Phase B, `signatures`, `task` and `scope` run first with `main`'s check code (R109). From Phase D, a check job with no model credentials applies the patch to the producer's base SHA |
| Factory approval | 0002 decision 3: the fingerprint covers the agent inputs only. Every protected change needs an approver signature | The FACTORY line names a version and a fingerprint over the whole factory (R97, R98). Admission rejects an unapproved version (R99). A proven tightening needs no signature (R100 to R102) |
| Who moves `main` | Anyone with write access. Under 0002 decision 13, "The author then pushes it to `main`" | Phase A: the owner pushes each agent delivery. Phase B on: only the promote GitHub App, through a ruleset that restricts updates |
| Deploy | The `sandbox` required reviewer approves every deploy | Phase C: a listed reviewer only where the signed policy's tier requires one. Irreversible changes keep the approver signature |
| Receipt | 0002: FACTORY, AGENT, FILES, one PASS per check, SKILL, SIGNED, INTENT | Adds TASK, AUTHOR and DEPLOY lines. FACTORY shows tightenings and who reported the version. INTENT shows the approving commit and gains its signature flags |
| Response to a defect | A reviewer reads the change | A new check or a tighter spec, logged in `docs/factory-log.md` from Phase A |
| Issue triage | Label only | Unchanged, now a requirement (R93). No issue-, comment- or pull-request-triggered workflow may hold a write-scoped `GITHUB_TOKEN`, a secret or an App token (R84) |

What changes in decision 0002:

| 0002 item | Change |
|---|---|
| Decision 3 and owner decision D4 of 2026-11-05 (the "Factory" row of "Decided by the owner": "The agent's inputs only") | Superseded from 0004 Phase B. The fingerprint covers the pipeline, the checks and the configs they read, the receipt policy and the agent inputs. Requirement files stay out; the INTENT line records them (R97) |
| R42: the fingerprint, "excluding" the policy file | The policy enters as canonical JSON without its approved-version entries. `CLAUDE.md` may import requirement files outside the patterns (R97) |
| R45: the predicate holds the fingerprint and the policy's factory version | It also holds each proven tightening since that version's entry, so the signed record carries what the FACTORY line shows (R98) |
| R53: an unapproved fingerprint fails, compared with "the latest approved entry" | At R53's place in R56's order, an unapproved version fails first with `factory version <n> not approved` (R99). R53 then compares with that version's entry, not the latest. A proven tightening chain from that entry passes (R102). B19 to B22 keep their lines |
| Decision 6: the `sandbox` reviewer reads the receipt before the deploy job's first step | From Phase C, `sandbox` has no reviewer. A listed reviewer stays only where the policy tier requires one, and approves the receipt |
| Decision 13: "The author then pushes it to `main`" | Phase A: the owner pushes agent deliveries. Phase B on: only the promote App moves `main`, for agent and approver commits alike |
| Phase 0, M04: `CLAUDE.md`, `refresh-slides.sh` and `rotate-approver-key.sh` land each commit with `git push origin <SHA>:refs/heads/main` | From Phase B, `main` refuses that push. The landing pushes the commit to `candidate/<topic>` and waits for `checks` and `receipt`. Promote then fast-forwards `main` to that SHA, on its schedule or the owner's dispatch. No printed command pushes to `refs/heads/main` (F18) |
| Phase 3: signer out of reach | The signer repository also holds promote and its GitHub App key. Its required check first runs `signatures`, `task` and `scope` with `main`'s check code (R109). Its reusable deploy workflow runs `tier` (R78) |
| R55 and R63: the rendered receipt and its intent records | Gain TASK, AUTHOR and DEPLOY lines, tightenings on FACTORY, and the INTENT commit and signature flags (R69 to R71, R79, R98) |
| Owner question "Ruleset bypass" (recommended: none) | `protect main` keeps none. A second ruleset restricts updates to `main` and lists only the promote App (R74) |
| Decision 15 | Stands. No workflow in this repository pushes to `main` |

What changes in the signed spec, once an approver signs it:

| Requirement | Change |
|---|---|
| SPEC-001-R12 | The signatures check also accepts an unsigned commit whose every change is a proven tightening (R101) |
| SPEC-001-R16 | "`thresholds.break` of **95**" becomes "of at least 95", so a raised threshold matches the spec. `test/checks.test.ts:193` asserts exactly 95 today and changes with it (F19) |
| SPEC-001-R66 | Signed in Phase A (F01), then amended in Phase B (F14) to exempt proven tightenings |

### Task file

Agent Contracts front matter where it fits, plus `requirements`. The body is the instruction. The file name is the task ID, which matches `^TASK-[A-Z0-9-]{1,32}$` (R64).

```markdown
---
requirements: [SPEC-014-R2]
produces: [src/export.ts, test/export.property.test.ts]
budget: {max_attempts: 3, max_seconds: 1800}
verify:
  lint: npm run check:lint
  typecheck: npm run check:typecheck
  test: npm run check:test
---
Make the serializer quote fields that mix double quotes and line feeds, per SPEC-014-R2. Add a property test whose title names SPEC-014-R2.
```

| Field | Rule here | Draft 0.1 |
|---|---|---|
| `requirements` | 1 to 16 IDs defined in `specs/` at the base commit (R65) | No such key. Its schema sets `additionalProperties: false`, so this file is not 0.1-valid |
| `needs` | Optional repo paths the instruction refers to | Same key; up to 16 paths |
| `produces` | 1 to 16 paths the delivery may add, change or delete; a path ending in `/` covers everything under it, as in `specs/protected-paths.txt`. No entry may be under `specs/` or `tasks/`, be `approvers.txt`, or be a protected path | Lists deliverables that must exist, with no globs. Scope is a separate check in its demo |
| `budget` | `max_attempts` 1 to 16; `max_seconds` above 0 and at most 3300. The producer's Bedrock credentials last one hour, as for every role in `infra/sandbox/iam.tf`. 300 s of that hour is left for setup (AWS STS, AssumeRoleWithWebIdentity; Claude Code, Amazon Bedrock, "Credential caching"). The 6-hour job limit is looser | Same keys; `max_seconds` up to 86400 |
| `verify` | 1 to 8 check names, each mapped to `npm run check:<name>` only. They are the driver's feedback; the checks of record run every check | A map of check name to any command, capped at 8 |

### Runner producer (Phase D)

| Element | Setting | Evidence |
|---|---|---|
| Trigger | The owner's `workflow_dispatch` with a `task` input of type `string`, or a trusted signal named in the signed policy (R83, R92). Never `issues`, `issue_comment` or `pull_request`. The job runs only on `refs/heads/main`, and a dispatch only when `github.actor_id` is the owner's | "Once a workflow has run at least once, you can dispatch it against any branch or tag" (GitHub, Events that trigger workflows). "Each workflow run will use the version of the workflow that is present in the associated commit SHA or Git ref of the event" (GitHub, Workflows). `github.actor_id` is "The account ID of the person or app that triggered the initial workflow run" (GitHub, Contexts) |
| Task input | The first step checks it against `^TASK-[A-Z0-9-]{1,32}$` before any other step uses it | R64, R83 |
| Runner and checkout | A fresh GitHub-hosted runner; `main` at `github.sha`, `persist-credentials: false` | Repo convention |
| Token | `contents: read` and `id-token: write`. The brief lists `contents: read` only; GitHub issues no OIDC token without `id-token: write`, which "does not grant write access to other resources" | GitHub, OIDC reference |
| Environment `producer` | Deployable from `main` only, no reviewers. A dispatch on `main` would otherwise give the producer the triage job's `sub` claim | Inference from the trust map in `infra/sandbox/iam.tf:17-21` and GitHub's default `sub` formats (GitHub, OIDC reference) |
| AWS role | `who-gets-the-keys-producer-bedrock`, separate from triage, with `max_session_duration` 3600. Trust pins `aud`, `sub` `<prefix>:environment:producer` and `job_workflow_ref` `.../producer.yml@refs/heads/main`. Actions `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` only | AWS, Service Authorization Reference for Bedrock; AWS, IAM condition keys |
| Session length | One hour. STS credentials default to 3600 s and cannot exceed the role's maximum. Claude Code "keeps the resolved credentials in memory", and refreshes only through `awsAuthRefresh` or `awsCredentialExport` | AWS STS, AssumeRoleWithWebIdentity; `aws-actions/configure-aws-credentials` README; Claude Code, Amazon Bedrock |
| Invoke scope | One `us.` inference profile ARN, plus its foundation model in the source and every destination Region, conditioned on `bedrock:InferenceProfileArn` | AWS, Geographic cross-Region inference; Inference profile prerequisites |
| Model | `ANTHROPIC_MODEL` set to that full profile ID. With it set, "background tasks use that model". Claude Code's documented policy adds `ListInferenceProfiles`, `GetInferenceProfile` and Marketplace actions; without discovery it "applies the prefix without checking availability" | Claude Code, Amazon Bedrock. Inference: an invoke-only role works with a pinned profile (Not yet verified) |
| Egress | `.github/egress/allowlist.json`, which already lists `bedrock-runtime.us-east-1.amazonaws.com`. Its sandbox settings are generated with `jq` from the allowlist into `$RUNNER_TEMP/claude-settings.json`, outside the checkout, and passed with `--settings`. Triage's action input writes `~/.claude/settings.json`, which `--setting-sources project` does not load | `.github/egress/allowlist.json:3-6`; Claude Code, CLI reference; Settings ("Settings precedence"); `claude-code-action` source, `base-action/src/setup-claude-code-settings.ts` at `db77d4d` |
| Hooks | The same file sets `disableAllHooks: true`. "The sandbox covers shell commands only. Claude's file tools, MCP servers, and hooks run outside it", so the project's ESLint hook would run agent-editable code with open egress | Claude Code, Sandboxing; Hooks: pass `--settings '{"disableAllHooks": true}'`, "which takes precedence over project and local settings" |
| Environment variables | `CLAUDE_CODE_USE_BEDROCK=1`, `AWS_REGION=us-east-1`, `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. No `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or `CLAUDE_CODE_OAUTH_TOKEN`. The driver starts Claude Code without `ACTIONS_ID_TOKEN_REQUEST_URL` or `ACTIONS_ID_TOKEN_REQUEST_TOKEN` | Claude Code, Amazon Bedrock; Environment variables; Authentication |
| Command | `claude -p --setting-sources project --strict-mcp-config --mcp-config .github/producer/mcp.json --settings "$RUNNER_TEMP/claude-settings.json" --permission-mode dontAsk --allowedTools "Edit(src/export.ts)" ... "Bash(npm run check:lint)" ... --disallowedTools "WebFetch" "WebSearch" --max-turns <n> --max-budget-usd <x> --output-format json` | Claude Code, CLI reference; Permission modes; Permissions |
| Outputs | The driver writes `changes.diff` to `$RUNNER_TEMP`, outside the checkout, and sets `verdict`. It is uploaded only when `verdict` is `pass`; `transcript.json` always. No commit, no push | `upload-artifact` reports each artifact's SHA-256 digest |
| Driver | `scripts/ci/producer.ts` loops attempts within the task budget and feeds back the failing `CHECK` line | Draft 0.1: exit 1 is a rejection retried while budget remains; any other exit stops the run |

Flag notes:

| Note | Detail |
|---|---|
| `Bash(npm run check:*)` | It does not approve `npm run check:lint`. "The `:*` suffix is an equivalent way to write a trailing wildcard, so `Bash(ls:*)` matches the same commands as `Bash(ls *)`", and the space is required (Claude Code, Permissions). Inference: the brief's rule matches only `npm run check`, so dontAsk would deny every check script. 0004 passes one exact rule per `verify` check |
| `Edit` and `Write` | 0004 passes one `Edit(<path>)` per `produces` entry, `Edit(<dir>/**)` for a directory, and no bare `Edit` or `Write`. "`Edit` rules apply to all built-in tools that edit files", and "`Write(path)` ... rules never match"; a bare `path` is relative to the current directory (Claude Code, Permissions) |
| `--settings` | Through `--settings`, `allowUnsandboxedCommands: false` makes the sandbox admin-required, so "settings in a repository's files that loosen the sandbox" are ignored (Claude Code, Sandboxing). A file passed to `--settings` is a protected file, so dontAsk denies the agent writes to it (Claude Code, Permission modes, "Protected paths") |
| `--disallowedTools "WebFetch" "WebSearch"` | Added because built-in documentation domains run WebFetch without a prompt (Claude Code, Tools reference; inference for dontAsk) |
| The sandbox block is not written into the checkout | It would land in `changes.diff` and trip `scope`, and a project-level sandbox is not admin-required (Claude Code, Sandboxing) |

### Check job (Phase D)

A fresh runner with `contents: read` only, no environment, no secrets and no model or AWS credentials. It runs only when the producer's `verdict` output is `pass` (R91). Its results and tree SHA are the checks of record for that patch. It is not named `checks`, which SPEC-001-R41 reserves for `pipeline.yml`.

| Step | What the check job does |
|---|---|
| 1 | Check out the producer's base SHA, and add a second worktree of it under `$RUNNER_TEMP/base`, outside the patched tree |
| 2 | Download `changes.diff` and compare its SHA-256 with the producer's upload record |
| 3 | Apply the patch, commit it locally with promote's message and trailers, and write the tree SHA and patch digest as job outputs |
| 4 | Run `task` and `scope` from the base worktree over `base..HEAD`. Scope fails closed on an empty range or a missing `Task:` trailer |
| 5 | Run `npm run checks` on the patched tree. Scope refused every protected path, so the patched tree's check code is the base commit's |
| 6 | A later job, which checks out nothing and runs no repository code, publishes the record from the job outputs |

### Promote (Phase B)

Promote is a GitHub App, run by a workflow in the signer repository (0002 Phase 3). Its private key is held only there. Decision 15 of 0002 stands: no workflow in this repository pushes to `main`. The App is installed on this repository only, with Contents write and Actions read. Listing check runs needs Checks read only if the repository becomes private (GitHub, REST check runs).

| Step | What promote does | Why |
|---|---|---|
| 1 | For a producer patch: download `changes.diff`, compare its SHA-256 with the check job's record, then create one commit through the API on `candidate/<task ID>-<run ID>`. It carries `Spec:`, `Agent: Claude Code` and `Task: <ID>` trailers and no custom author | Download needs "'Actions' repository permissions (read)" (GitHub, REST artifacts). GitHub signs an App's API commit only when it "contains no custom author information, custom committer information, and no custom signature information" (GitHub, Commit signature verification). A GitHub signature is not an approver signature |
| 2 | Wait for `checks` and `receipt` to pass on that commit, or on a session's or approver's candidate commit. `checks` begins with the R109 pre-check; `receipt` admits the factory version (R99) | Required status checks attach to a commit SHA and also hold direct pushes (GitHub, Troubleshooting required status checks) |
| 3 | Fast-forward `main` to that exact SHA, and only when `main`'s tip is its ancestor | The same SHA keeps an approver's signature; a fast-forward keeps the draft's freshness rule |
| 4 | A ruleset with "Restrict updates" lists only the promote App as bypass actor; `protect main` keeps no bypass actors | "Restrict updates": "only users with bypass permissions can push to branches or tags whose name matches the pattern you specify" (GitHub, Available rules for rulesets). Rules from rulesets on the same branch "are aggregated", and "the most restrictive version of the rule applies" (GitHub, About rulesets). Inference: bypass in one ruleset leaves the other's required checks in force |

### Factory versions and proven tightenings (Phase B, owner additions 2026-11-05)

The receipt's FACTORY line names a factory version and a fingerprint over the whole factory. This supersedes 0002 decision 3 and its owner decision D4 ("The agent's inputs only"). Specs leave the fingerprint, so a spec approval does not bump the factory version.

| In the fingerprint (R97) | Out of it |
|---|---|
| `.github/`, `scripts/checks.ts`, `scripts/ci/`, `scripts/receipt.ts`, and every file on the SPEC-001-R44 list | Requirement files `specs/SPEC-*.md`. The INTENT line records each one with its approving commit and signature flags (R63, R69) |
| `package.json`, `package-lock.json`, `allowed-deps.txt`, `specs/protected-paths.txt`, `specs/sca-exceptions.toml` | Task files: per-run inputs, recorded by digest on the TASK line (R70) |
| `specs/receipt-policy.json`, as canonical JSON with its approved-version entries removed, since those entries hold fingerprints | The change itself: `src/`, `test/` and docs, recorded on the FILES line |
| 0002's agent inputs: `CLAUDE.md` and nested `CLAUDE.md`, `.claude/**` and `.mcp.json` | `specs/source-of-record/` and the data the checks read that deliveries change: `practices.yaml`, `scenarios/scenarios.yaml` and `traceability.md`. Inference: if the R44 list named them, every delivery that maps a practice would change the fingerprint. R97 keeps them off it |

Admission, at promote and in the deploy job, reads the approved versions from the policy at the admitted commit, after R49 has checked its signature. An unapproved version fails with `CHECK receipt FAILED: factory version <n> not approved` (R99). Until 0002 Phase 3, the receipt labels the version "reported by a signer the agent can edit". A candidate run executes that commit's own `pipeline.yml`, which could compute any fingerprint. Before Phase 3 the version is therefore a claim, not evidence, and no human step is removed on its strength. Phase B, which brings admission and tightenings, needs Phase 3.

A proven tightening needs no signature (owner decision: no signature, proof only). A deterministic classifier decides, with a direction table held in the policy (R100). It compares the raw blobs at the parent and at the commit, never `git diff` output, so `.gitattributes` and diff drivers cannot change what it sees.

| File | Tighter | Measure on the FACTORY line |
|---|---|---|
| `stryker.config.json` | The blobs differ only in the digits of `thresholds.break`'s value. Both parse as JSON with no duplicate key. The new value is an integer above the old and at most 100 | The threshold, such as `95 to 96` |
| `allowed-deps.txt` | The new blob is the old one with whole name lines removed. Comment and blank lines stay | Name count |
| `specs/sca-exceptions.toml` | The new blob is the old one with whole `[[IgnoredVulns]]` entries removed, each from its header line to the next header or the end. Removing one line, such as `ignoreUntil`, could make an exception permanent, so it is unclassifiable | Entry count |
| `specs/protected-paths.txt` | The new blob is the old one with whole path lines appended at the end, none blank or a comment. Appending keeps the first match `guardedBy` reports for every existing path, so recorded failure lines stay the same. Removed, changed or inserted lines are unclassifiable | Path count |

The classifier fails closed. These are unclassifiable: any other change to a listed file, and any file the table does not list. So are an added, deleted, renamed or copied file, a mode change, and a symlink or gitlink. So are a binary, non-UTF-8 or unparsable blob, and a commit with more than one parent. One commit may tighten several listed files, but every file must classify. A hunk that tightens one value and loosens another fails, because the blob rule then does not hold. These all need full approval: a new check, any code change such as `scripts/checks.ts`, `eslint.config.js` or a workflow, and any loosening. So do an added exclusion, a removal the table does not mark tighter, and anything unclassifiable. The table lists neither `scripts/checks.ts`, which holds the classifier, nor the policy, which holds the table. So a change to either always needs an approver signature. The table is read as of each commit's parent. Inside `signatures` and `scope`, R109 runs the classifier from `main`'s tip.

A tightening must pass the checks of record under its own rules, which bounds abuse: `thresholds.break` at 100 fails the mutation check on that commit. The check on `thresholds.break` (SPEC-001-R14) already fails a lowered value even on a signed commit, so a raise cannot be undone later. Admission accepts an approved version, or a proven tightening chain from one (R102). The receipt then shows `FACTORY v<n> + tightening (<file>: <old> to <new>)`. Scope still refuses every protected path in a task delivery (R67). A tightening is its own commit, exempt from the task rule (R66).

### Deploy tiers (Phase C, owner decision 2026-11-05)

| Element | Under 0004 |
|---|---|
| Where tiers live | `specs/receipt-policy.json` (0002 decision 8), so `signatures` requires an approver signature on any tier change |
| Where the deploy runs | From 0002 Phase 3, in the signer repository's reusable workflow, which `pipeline.yml` calls by a SHA the policy names (T24). `tier` and the rejection job go there (R78, R81) |
| `sandbox` | No required reviewer from Phase C. The deploy workflow runs `attestation`, `receipt` and `tier` before any AWS call |
| `production` | A required reviewer from the tier's `reviewers` list of GitHub user IDs, with "prevent self-reviews" on. GitHub says "users who initiate a deployment cannot approve the deployment job" (GitHub, Deployments and environments). Inference: from Phase B the promote App initiates every deploy, so self-review prevention never blocks the owner. R77 checks the list instead. This repo deploys only to `sandbox`, and names `probe` for the on-demand scenarios. The production tier is a pattern for adopters |
| `probe` | Unchanged: keeps its reviewer, and is used only by `scenarios.yml`'s on-demand job |
| Admin bypass | Turned off on every environment. "By default, administrators can bypass the protection rules and force deployments" (GitHub, Deployments and environments) |
| What the reviewer approves | The receipt, not the diff. The run summary holds the receipt before the review request appears (0002 decision 6) |
| A rejection | A gate outcome, not a check: `GATE <environment> REJECTED: after checks passed` (R81). Each one gets a row in `docs/factory-log.md` and a new check or spec change. The rows are the owner's evidence to relax a tier later, through a signed policy change |
| Irreversible changes | Keep the approver signature (SPEC-001-R18, R80), whatever the tier |

### Receipt

Extends 0002's receipt (R55, R63). Example lines, with placeholders:

```text
FACTORY v7 + tightening (stryker.config.json: 95 to 96)  sha256:<fingerprint>
INTENT  SPEC-014-R2  specs/SPEC-014-export-latency.md sha256:<digest>  approved <commit>  touch
TASK    TASK-001  tasks/TASK-001.task.md sha256:<digest>  base <commit>  producer run <run ID>
AUTHOR  producer run <run ID> attempt 2
DEPLOY  sandbox  receipt verified  reviewer: not required (policy v3)
```

| Line | Holds | Source |
|---|---|---|
| FACTORY | Factory version, fingerprint, and each proven tightening since that version's entry. While the signer is `pipeline.yml` in this repository, the line ends `reported by a signer the agent can edit`. Tightenings are accepted only from Phase B, after 0002 Phase 3, so the example shows no label | R42, R45, R55, extended by R97, R98 and R102 |
| INTENT | Requirement ID, spec file path and SHA-256, the approving commit R63 already records, and its signature flags: `touch`, or `touch PIN` when it asserts a PIN. Decision 0003 requires a touch only for now, per the owner decision of 2026-11-05 | R63, extended by R69 |
| TASK | Task ID, task file path and SHA-256 at the base commit, base SHA, producer run ID or `cloud session` | R70 |
| AUTHOR | The producer run and attempt for runner deliveries; `cloud session on <branch>, environment not recorded` for session deliveries; the committer, as reported, otherwise | R71 |
| DEPLOY | Environment, receipt verified, and `reviewer: not required (policy v<n>)` or the reviewer's login | R79 |

Task files are per-run inputs recorded by digest, as draft 0.1 treats its assignment. They are not factory files, so they stay out of the fingerprint (R70, R97). GitHub deletes runs, checks and artifacts after 90 days by default (GitHub, Actions settings). The receipt therefore embeds digests and lines, not links.

## Decisions (proposed)

| # | Decision |
|---|---|
| 1 | One bounded run per task. A task session or producer run starts from `main` at one SHA, works on one task, and delivers one candidate branch or one patch |
| 2 | The task file reuses draft 0.1's `needs`, `produces`, `budget` and `verify`, and adds `requirements`. It is recorded by digest as a run input. Whether `tasks/` is protected is an owner decision |
| 3 | `task` and `scope` are checks outside the ordered fifteen, like `attestation`, `irreversible` and `receipt`. Each prints one `CHECK <name> FAILED: <identifier>` line |
| 4 | The task rule keys on the signature, not on a self-declared trailer. A commit that is neither approver-signed nor a proven tightening needs one `Task:` trailer and passes scope, unless it touches only `docs/` and `proposals/` (R66, R67) |
| 5 | In Phase A the candidate run's checks come from the candidate commit's own files, 0002's known gap until its Phase 3. A session could skip the owner's push in Phase A, so that cover is a convention. From Phase B, the signer's required check first runs `signatures`, `task` and `scope` with `main`'s check code (R109). Phases B and C need it; until it exists, the owner's push and the `sandbox` reviewer stay |
| 6 | The runner producer follows the brief's job, with the corrections in "Runner producer". They are `id-token: write`, exact `Bash` rules, `Edit` per `produces` path, and a `--settings` file with the sandbox and no hooks. They also add a pinned model, `--disallowedTools` and a `producer` environment |
| 7 | The producer role is invoke-only, with a one-hour session. A model's first use in the account is a one-time bootstrap by a principal that can subscribe through AWS Marketplace. Its permissions "are only required the first time a model is being used in an account" (AWS, Model access) |
| 8 | The driver runs each feedback check under `srt` with the allowlist and with no `AWS_` variables. `npm run check:<name>` runs agent-written code, so these limits, not the Bash rules, contain it |
| 9 | Promote is a GitHub App run from the signer repository. It fast-forwards `main` only to a SHA on which `checks` and `receipt` passed. 0002 decision 15 stands |
| 10 | Remove the `sandbox` reviewer only once 0004 Phase B, R109 and 0002's receipt check in the deploy job (R56, T16) are in place. F23 must also show every B29 action held. Turn off admin bypass at the same time |
| 11 | The receipt gains TASK, AUTHOR and DEPLOY lines. FACTORY shows tightenings and its signer label. INTENT shows the approving commit and gains its flags |
| 12 | The fingerprint covers the whole factory (R97). This supersedes 0002 decision 3 and owner decision D4 of 2026-11-05. The policy enters without its approved-version entries, which hold fingerprints |
| 13 | Admission at promote and deploy rejects an unapproved factory version (R99), reading the policy at the admitted commit after R49 |
| 14 | A proven tightening needs no signature (R100 to R102). The table is read as of each commit's parent, and the classifier runs from `main`'s tip (R109). A change to either always needs an approver signature |
| 15 | `issue-triage.yml` stays label-only (R93). The workflows check forbids any untrusted-triggered workflow from granting `actions: write`, `contents: write` or `pull-requests: write`, from reading any secret other than `GITHUB_TOKEN`, and from minting a GitHub App token (R84). The dispatch API accepts App tokens and fine-grained personal access tokens with Actions write, not only `GITHUB_TOKEN` (GitHub, REST workflows). GitHub's recursion guard is not relied on: "`workflow_dispatch` and `repository_dispatch` events always create workflow runs" (GitHub, GITHUB_TOKEN) |
| 16 | Fix the factory, not the change. From Phase A, each rejected run, production rejection or escaped defect gets a row in `docs/factory-log.md` naming the check or spec change that answers it. A row with no answer is an open defect |
| 17 | A human reviewer's rejection is a gate outcome. It prints `GATE <environment> REJECTED: after checks passed`, not a `CHECK` line |

## Plan

Four phases. No phase removes a human step before its replacement exists. Each phase lands as one push whose last commit is approver-signed and carries a `Spec:` trailer, as in 0002.

| Phase | Delivers | Human step still in place | Needs from 0002 |
|---|---|---|---|
| A. Tasks and scope; cloud sessions produce | Task files, the `task` and `scope` checks in candidate runs, `docs/factory-log.md`, scenarios B23 and B24, and the INTENT, TASK and AUTHOR lines | The owner pushes each passing agent delivery to `main`. The `sandbox` reviewer approves each deploy. Every factory change needs an approver signature | Phase 0 (candidate branches, required `checks`). The receipt lines need Phase 1 |
| B. Promote and factory admission, out of the agent's reach | The promote App and workflow, the pre-check from `main` (R109), the promote-only ruleset, landing through promote, factory versions and proven tightenings, and scenarios B29 and B31 to B34 | None at merge. The `sandbox` reviewer still approves each deploy | Phases 2 and 3: the receipt check, the signer repository, and Phase 3's required check running R109 first. F23 must show every B29 action held |
| C. Deploy by tier | Tiers with reviewer lists in the signed policy, the `tier` check, the DEPLOY line, admin bypass off, the `sandbox` reviewer removed, and scenarios B30 and B35 | None at a `sandbox` deploy. A listed reviewer where the tier says, such as production. An approver signature on irreversible changes | Phase 2's receipt check in the deploy job (R56, T16), Phase 3's reusable deploy workflow, and 0004 Phase B |
| D. Runner producer and trusted signals | `producer.yml` with the producer, check and publish jobs, the producer role, the driver, and scenarios B26 to B28 | The owner dispatches each run, unless the owner approves trusted signals | Phase 3, 0004 Phase B so promote can take patches, and the Actions policy or R83's actor check (F41) |

The brief's Phase A delivered the producer and check jobs. Under the owner's "cloud sessions now, runner later" they move to Phase D. Phase A's producer is the task session, and its checks of record are the candidate run.

### Tasks

| ID | Phase | Task | Files | Protected | Verified by |
|---|---|---|---|---|---|
| F01 | A | Spec amendment: a "Factory model" section with R64 to R73 and R107 | `proposals/SPEC-001-delivery-pipeline.md` | yes | trace passes once F03, F07, F09 and F10 name each in a test title |
| F02 | A | The first task file and a `tasks/README.md` with the format | `proposals/tasks/` if `tasks/` is protected, else `tasks/` | per owner decision | `npm run check:task -- TASK-001` passes |
| F03 | A | `checks.ts`: `task` and `scope`, reusing `protectedPaths`, `guardedBy`, `requirementIds` and the signers lookup. The policy gains the `drafting` list | `proposals/scripts/checks.ts`, `proposals/receipt-policy.json`, `test/factory.test.ts` | yes, except the test | one test per identifier in R64 to R68 |
| F04 | A | Add `tasks/` to the protected list, if the owner agrees | `proposals/protected-paths.txt` | yes | `guardedBy` test |
| F05 | A | `check:task` and `check:scope` scripts | `proposals/package.proposed.json` | yes | `npm run check:scope` runs |
| F06 | A | `pipeline.yml`: candidate runs run `task` and `scope` after `npm run checks`, in the `checks` job | `proposals/github-workflows/pipeline.yml` | yes | `npm run check:workflows`; a candidate push with a stray path fails |
| F07 | A | `receipt.ts`: INTENT flags, TASK and AUTHOR lines; task files never in the fingerprint | `proposals/scripts/receipt.ts`, `test/receipt.test.ts` | yes, except the test | snapshot test of the rendered lines |
| F08 | A | `CLAUDE.md`: task sessions run as single-repository cloud sessions, not as project threads, and push only to `candidate/<task ID>`. Interactive sessions draft specs, proposals and docs | `proposals/CLAUDE.proposed.md` | yes | approver review |
| F09 | A | Harness modes `task-verify` and `scope-verify`, and a `task:` field the harness commits as `tasks/<ID>.task.md` in its worktree (R107). Scenarios B23 and B24 | `proposals/scenarios/run.ts`, `scenarios/scenarios.yaml`, `scenarios/B23-change-outside-task-scope.patch`, `scenarios/fixtures/tasks/` | `run.ts` only | `npm run scenarios -- B23` and `-- B24` print their lines; an R107 test |
| F10 | A | Scenario table rows R72 and R73; `task` and `scope` treated as local checks, needing no GitHub Actions or sandbox account | `test/scenarios.test.ts` | no | trace and test checks |
| F11 | A | Map B23 to P24 and B24 to P02; plain words; traceability rows | `practices.yaml`, `video/explanations.yaml`, `docs/practices.md`, `traceability.md` | no | slides and test checks |
| F12 | A | `docs/factory-log.md` with its columns, before the first rejected candidate run | `docs/factory-log.md` | no | review |
| F13 | A | Approver lands Phase A; one task session delivers TASK-001 through `candidate/TASK-001` | F01 to F12 | yes | the candidate run passes; the owner pushes it to `main` |
| F14 | B | Spec amendment: R74 to R76, R97 to R106, R108 and R109; R12, R16 and R66 amended | `proposals/SPEC-001-delivery-pipeline.md` | yes | trace passes once F17 and F19 to F21 name each in a test title |
| F15 | B | Owner creates the promote GitHub App, installed on this repository only, with Contents write and Actions read. Actions read is for downloading `changes.diff` (R75). Checks read is needed only if the repository becomes private. Its key is a secret in the signer repository | new App, signer repository | owner only | the App lists one installation |
| F16 | B | Signer repository: the required check's pre-check (R109), and the promote workflow, steps 1 to 4 under "Promote" | signer repository | owner only | a candidate whose `checks.ts` skips `signatures` fails the pre-check; a test candidate is fast-forwarded; a non-fast-forward prints `CHECK promote FAILED: not a fast-forward` |
| F17 | B | `github.sh`: the promote-only ruleset with "Restrict updates"; `protect main` unchanged | `proposals/scripts/bootstrap/github.sh`, `test/checks-before-main.test.ts` | yes, except the test | the R41 stub-`gh` tests, extended to parse the second ruleset |
| F18 | B | Landing through promote. The `CLAUDE.md` conventions and `print_landing` in both bootstrap scripts push to `candidate/<topic>` and wait for `checks` and `receipt`. They then wait for or dispatch promote, and confirm `main` is that SHA | `proposals/CLAUDE.proposed.md`, `proposals/scripts/bootstrap/refresh-slides.sh`, `proposals/scripts/bootstrap/rotate-approver-key.sh` | yes | `bash -n` on both scripts; neither prints a push to `refs/heads/main`; approver review |
| F19 | B | Factory versions and tightenings: factory patterns and the direction table in the policy; the classifier and R101 in `checks.ts`; FACTORY line, admission and chain in `receipt.ts`. The R16 test accepts a raised threshold | `proposals/receipt-policy.json`, `proposals/scripts/checks.ts`, `proposals/scripts/receipt.ts`, `test/factory.test.ts`, `test/receipt.test.ts`, `test/checks.test.ts` | yes, except the tests | one test per identifier and table row in R97 to R102 |
| F20 | B | Scenarios B29 (`requires: cloud-session`) and B31 to B34, with `tightening-verify` mode for B31. Protect `scenarios/session-push.sh`. The harness and video kit learn `cloud-session` (R108), with a SPEC-002-R6 amendment | `proposals/scenarios/run.ts`, `proposals/scenarios/session-push.sh`, `proposals/protected-paths.txt`, `proposals/SPEC-002-walkthrough-video.md`, `video/kit.ts`, `scenarios/scenarios.yaml`, the B32 to B34 patches | yes, except `video/kit.ts`, `scenarios.yaml` and the patches | `npm run scenarios -- B31` to `-- B34` print their lines; `test/video.test.ts` covers the `cloud-session` text |
| F21 | B | Scenario table rows R76 and R103 to R106 | `test/scenarios.test.ts` | no | trace and test checks |
| F22 | B | Map B29 to P24 and B31 to B34 to P25; plain words; traceability rows | `practices.yaml`, `video/explanations.yaml`, `docs/practices.md`, `traceability.md` | no | slides and test checks |
| F23 | B | Session-API spike: from a cloud session, run B29's three actions against this repository, each sending the current body unchanged | `docs/verification.md` | no | each prints `BOUNDARY HELD`. If one does not, sessions move to a non-admin GitHub identity before F24 |
| F24 | B | Approver lands Phase B | F14 to F23 | yes | a session's push to `main` is refused; promote moves `main`; an approver commit landed with F18's printed command reaches `main` through promote |
| F25 | C | Spec amendment R77 to R82 and R110 | `proposals/SPEC-001-delivery-pipeline.md` | yes | trace passes once F27 and F31 name each in a test title |
| F26 | C | Policy: `tiers` for `sandbox`, `probe` and an example `production`, with reviewer user IDs and the signer workflow SHA | `proposals/receipt-policy.json` | yes | R77 tests |
| F27 | C | `checks.ts`: the `tier` check and the `deploy-without-receipt` workflows rule; `receipt.ts`: the DEPLOY line | `proposals/scripts/checks.ts`, `proposals/scripts/receipt.ts`, `test/factory.test.ts` | yes, except the test | one test per identifier in R77 to R79 |
| F28 | C | Signer repository's reusable deploy workflow: `tier` after `receipt`, and a job after deploy that reports rejections. `pipeline.yml` calls it at the policy's SHA | signer repository, `proposals/github-workflows/pipeline.yml` | owner only; yes | `npm run check:workflows`; one signer workflow run |
| F29 | C | `github.sh`: reviewers per tier, prevent self-review where a reviewer is required, admin bypass off. Its `--vars` guard, which today refuses until `sandbox` has a reviewer, follows the tier | `proposals/scripts/bootstrap/github.sh`, `test/checks-before-main.test.ts` | yes, except the test | stub-`gh` tests on the environment bodies |
| F30 | C | Scenarios B30 and B35 in `tier-verify` mode | `proposals/scenarios/run.ts`, `scenarios/` | `run.ts` only | `npm run scenarios -- B30` and `-- B35` |
| F31 | C | Scenario table rows R82 and R110; `tier` treated as a local check | `test/scenarios.test.ts` | no | trace and test checks |
| F32 | C | Map B30 and B35 to P45. P45's coverage becomes `partial`, with the reason "Risk tiers shown; no AI diff reviewer". Update `docs/slide-reconciliation.md` R28 | `practices.yaml`, `video/explanations.yaml`, `docs/practices.md`, `docs/slide-reconciliation.md`, `traceability.md` | no | slides and test checks |
| F33 | C | Approver lands Phase C and runs `github.sh`, once F23 held | F25 to F32 | yes | a `sandbox` deploy shows `reviewer: not required (policy v<n>)` |
| F34 | D | Spec amendment R83 to R96 | `proposals/SPEC-001-delivery-pipeline.md` | yes | trace passes once F37 to F40 name each in a test title |
| F35 | D | Owner decides model access; Terraform for the producer role, its SCP and deploy-deny entries, an output and a repo variable | `proposals/infra/sandbox/iam.tf`, `proposals/infra/org/main.tf`, `proposals/infra/sandbox/main.tf`, `proposals/scripts/bootstrap/github.sh` | yes | iac check; owner applies with the break-glass role |
| F36 | D | `producer.yml`: the producer job, the check job and the publish job | `proposals/github-workflows/producer.yml` | yes | `npm run check:workflows` |
| F37 | D | The driver, and an MCP config with no servers | `proposals/scripts/ci/producer.ts`, `proposals/github-producer/mcp.json`, `test/producer.test.ts` | yes, except the test | argv and environment tests for R87 and R88; a stub `claude` on `PATH` for R89 and R90 |
| F38 | D | Workflows rules `producer-trigger`, `untrusted-dispatch`, `producer-permissions`, `producer-env`, `producer-timeout`, `producer-egress`, `producer-verdict`, `triage-label-only` | `proposals/scripts/checks.ts`, `test/factory.test.ts` | yes, except the test | one test per identifier |
| F39 | D | Scenarios B26 to B28; `budget-verify` mode; map B26 to P15, B27 to P25 and B28 to P24 | `scenarios/`, `proposals/scenarios/run.ts`, `practices.yaml`, `video/explanations.yaml`, `docs/practices.md` | `run.ts` only | `npm run scenarios -- B26`, `-- B27`, `-- B28` |
| F40 | D | Scenario table rows R94 to R96; `budget` treated as a local check | `test/scenarios.test.ts` | no | trace and test checks |
| F41 | D | An Actions policy on `producer.yml` allowing only the owner's user ID, or a recorded finding that only R83's actor check holds | repository settings | owner only | `GET /repos/{owner}/{repo}/actions/policies` |
| F42 | D | Spike: the owner dispatches one task end to end on Bedrock | `docs/verification.md` | no | records exit codes, JSON fields, budget behavior, the invoke-only role and expired credentials (Not yet verified) |
| F43 | D | Approver lands Phase D | F34 to F42 | yes | `npm run checks` and `npm run scenarios` pass on `main` |

Agent notes:

| Note | Detail |
|---|---|
| Proposal paths | `.github/workflows/producer.yml` goes to `proposals/github-workflows/producer.yml` and `.github/producer/mcp.json` to `proposals/github-producer/mcp.json`, per `CLAUDE.md`. From 0002 T08, `scripts/receipt.ts` is protected and goes to `proposals/scripts/receipt.ts`, as in 0002 T13 |
| Package scripts | `proposals/package.json` is blocked by `Edit(**/package.json)`, so new scripts go to `proposals/package.proposed.json`, as in 0002 |
| Running scenarios | The agent cannot sign, so it cannot run new scenarios against a protected batch before it lands. Each phase's last task verifies them on `main` |

## Draft requirements

Scenario rows read: WHEN the harness runs scenario `<ID>` in the mode its `run` field names, THE first failing check SHALL be the named check. Its output SHALL contain the expected line. Rows that differ say so.

| ID | Requirement |
|---|---|
| SPEC-001-R64 | WHEN the task check runs for a task ID, THE task check SHALL require the ID to match `^TASK-[A-Z0-9-]{1,32}$`. IF it does not, THEN the task check SHALL print `CHECK task FAILED: invalid task id`. THE task check SHALL read the file only with `git show <base>:tasks/<ID>.task.md`. IF the file is missing, THEN it SHALL print `CHECK task FAILED: <ID> not found`. THE front matter SHALL hold `requirements`, `produces`, `budget` and `verify` as in "Task file", and optionally `needs`. IF a field breaks its rule, THEN the identifier SHALL be `<ID> invalid <field>`. IF the front matter holds another key, THEN it SHALL be `<ID> unknown key`. IF the body is empty, THEN it SHALL be `<ID> empty body`. |
| SPEC-001-R65 | IF a task's `requirements` entry is not defined in a file under `specs/` at the base commit, THEN THE task check SHALL print `CHECK task FAILED: <ID> cites unapproved <requirement ID>`. It SHALL name the first such entry in file order. |
| SPEC-001-R66 | WHEN the scope check runs over a range of commits, THE scope check SHALL exempt each commit signed by a key in `approvers.txt` as of its parent. It SHALL exempt each proven tightening (R100; added in Phase B). It SHALL exempt each commit that touches only paths under the policy's `drafting` list, which holds `docs/` and `proposals/`. Every other commit SHALL carry exactly one `Task:` trailer, the same throughout the range. IF one carries none, THEN THE scope check SHALL print `CHECK scope FAILED: missing Task trailer`. IF two differ, THEN it SHALL print `CHECK scope FAILED: mixed Task trailers`. IF a `Spec:` trailer names an ID outside the task's `requirements`, THEN it SHALL print `CHECK scope FAILED: Spec <requirement ID> not in <task ID>`. |
| SPEC-001-R67 | WHEN the range holds a commit that R66 does not exempt, THE scope check SHALL list every path those commits add, change, delete or rename. It SHALL split renames and sort the paths in byte order. A path SHALL fail if it is under `specs/` or `tasks/`, is `approvers.txt`, is guarded by `specs/protected-paths.txt` at the base commit, or is outside the task's `produces`. THE scope check SHALL print `CHECK scope FAILED: <path>` for the first failing path. IF an entry has mode `120000` or `160000`, THEN it SHALL print `CHECK scope FAILED: <path> mode <mode>`. IF the range is empty, THEN it SHALL print `CHECK scope FAILED: empty range`. |
| SPEC-001-R68 | WHEN a commit is pushed to `candidate/**`, THE checks job SHALL run the task check and then the scope check after `npm run checks` passes. Both SHALL cover the range from the commit's merge base with `refs/heads/main`. THE task check SHALL check the task the range's `Task:` trailer names, and SHALL pass when R66 exempts every commit. Both checks SHALL sit outside the ordered fifteen. |
| SPEC-001-R69 | WHEN the build job writes the SPEC-001-R63 intent records, THE build job SHALL add to each the signature flags of the commit R63 records. THE receipt's INTENT line SHALL show the requirement ID, the spec file's SHA-256, that commit and its flags. |
| SPEC-001-R70 | WHEN a recorded commit carries a `Task:` trailer, THE build job SHALL add a task record. It SHALL hold the task ID, the task file's path and SHA-256 at the base commit, the base SHA and the producer. THE receipt SHALL show one TASK line per record. IF a task file matches a factory pattern in `specs/receipt-policy.json`, THEN THE build job SHALL print `CHECK receipt FAILED: task file in factory <path>`. |
| SPEC-001-R71 | THE receipt SHALL show one AUTHOR line per recorded commit. WHERE promote made the commit from a producer patch, THE line SHALL read `producer run <run ID> attempt <n>`. WHERE the commit carries `Agent:` and `Task:` trailers, THE line SHALL read `cloud session on <branch>, environment not recorded`. Otherwise THE line SHALL show the committer, labelled as reported. |
| SPEC-001-R72 | B23 change outside the task's scope, in `scope-verify` mode: `CHECK scope FAILED: src/handler.ts` |
| SPEC-001-R73 | B24 task citing an unapproved requirement, in `task-verify` mode: `CHECK task FAILED: TASK-B24 cites unapproved SPEC-014-R99` |
| SPEC-001-R74 | THE `scripts/bootstrap/github.sh` SHALL apply a ruleset on `refs/heads/main` with "Restrict updates" and only the promote GitHub App as bypass actor, and SHALL leave `protect main` with no bypass actors. IF it does not, THEN THE test check SHALL print `CHECK test FAILED: test/checks-before-main.test.ts`. WHEN promote runs, it SHALL move `main` only by fast-forward to a commit on which `checks` and `receipt` passed. IF not, THEN promote SHALL push nothing and print `CHECK promote FAILED: <identifier>`. The identifier SHALL be `not a fast-forward`, `missing checks` or `missing receipt`. |
| SPEC-001-R75 | WHEN promote takes a producer patch, it SHALL download `changes.diff` and compare its SHA-256 with the check job's record. IF they differ, THEN it SHALL print `CHECK promote FAILED: artifact digest`. It SHALL then create one commit on `candidate/<task ID>-<run ID>` through the API, with no custom author or committer. The message SHALL carry one `Spec:` trailer per task requirement, `Agent: Claude Code` and `Task: <ID>`. IF the commit's tree differs from the tree the check job tested, THEN it SHALL print `CHECK promote FAILED: tree mismatch`. |
| SPEC-001-R76 | B29, run from a cloud session after Phase B (`requires: cloud-session`). Each action SHALL be refused: `BOUNDARY HELD: push to main from a cloud session`, `BOUNDARY HELD: edit a ruleset from a cloud session`, and `BOUNDARY HELD: edit environment protection from a cloud session` |
| SPEC-001-R77 | WHEN the deploy workflow has passed `attestation` and `receipt`, THE tier check SHALL read the target environment's tier from `specs/receipt-policy.json` before any AWS call. IF the policy has no tier for it, THEN it SHALL print `CHECK tier FAILED: <environment> has no tier`. WHERE the tier requires a reviewer, IF the run's review history holds no `approved` entry for that environment, THEN it SHALL print `CHECK tier FAILED: <environment> needs a reviewer`. IF the approving entry's `user.id` is not in the tier's `reviewers`, THEN it SHALL print `CHECK tier FAILED: <environment> approved by unlisted <login>`. |
| SPEC-001-R78 | THE signer repository's reusable deploy workflow SHALL run `attestation`, `receipt` and `tier` before its first AWS step, for every environment, whether or not its tier requires a reviewer. IF `pipeline.yml`'s deploy job calls another workflow, or that one at a SHA the policy does not name, THEN THE workflows check SHALL print `CHECK workflows FAILED: deploy-without-receipt`. THE `scripts/bootstrap/github.sh` SHALL set each environment's reviewers from its tier, prevent self-review where a reviewer is required, and turn off admin bypass. IF it does not, THEN THE test check SHALL print `CHECK test FAILED: test/checks-before-main.test.ts`. |
| SPEC-001-R79 | WHEN the deploy workflow has applied `plan.out`, THE deploy workflow SHALL add a DEPLOY line to the receipt in the run summary. It SHALL show the environment and `receipt verified`. It SHALL then show `reviewer: not required (policy v<n>)` or `reviewer: <login>`. |
| SPEC-001-R80 | THE irreversible check (SPEC-001-R18) SHALL keep requiring an approver signature on HEAD for a destructive change, whatever the environment's tier. A GitHub signature on a promote commit SHALL NOT count as one, so such a change lands only as an approver-signed commit that promote fast-forwards. The failure line stays `CHECK irreversible FAILED: <resource address>`. |
| SPEC-001-R81 | WHEN a required reviewer rejects a deployment whose receipt verified, THE reusable deploy workflow SHALL, in a job after the deploy job, print `GATE <environment> REJECTED: after checks passed`. THE run summary SHALL show the reviewer's login and comment. |
| SPEC-001-R82 | B30 deploy to a tier that requires a reviewer, with no approval. In `tier-verify` mode the harness runs the tier check on a policy fixture and a review-history fixture: `CHECK tier FAILED: production needs a reviewer` |
| SPEC-001-R83 | THE `.github/workflows/producer.yml` SHALL be triggered only by `workflow_dispatch`, with one required `task` input of type `string`. WHERE the policy lists a trusted signal, it SHALL also be triggered by `workflow_run` with the R92 guard. Its first step SHALL check the input against `^TASK-[A-Z0-9-]{1,32}$` before any other step uses it. Its producer job SHALL run only when `github.ref` is `refs/heads/main`. For `workflow_dispatch`, it SHALL also need `github.actor_id` to equal the owner ID in the signed policy. IF any of these is missing, THEN THE workflows check SHALL print `CHECK workflows FAILED: producer-trigger`. It SHALL print the same line IF a `workflow_run` trigger's `workflows:` list differs from the policy, or its job lacks the R92 guard. |
| SPEC-001-R84 | THE workflows check SHALL treat `issues`, `issue_comment`, `discussion`, `discussion_comment`, `gollum`, `pull_request`, `pull_request_target`, `pull_request_review`, `pull_request_review_comment` and `workflow_run` as untrusted triggers. It SHALL exempt `workflow_run` only in `producer.yml` with the R92 guard. IF a workflow with an untrusted trigger lacks workflow-level `permissions`, THEN it SHALL print `CHECK workflows FAILED: untrusted-dispatch`. IF any level grants `actions: write`, `contents: write`, `pull-requests: write` or `write-all`, THEN it SHALL print the same line. IF such a workflow references the `secrets` context other than `secrets.GITHUB_TOKEN`, passes `secrets: inherit`, or uses `actions/create-github-app-token`, THEN it SHALL print the same line. |
| SPEC-001-R85 | THE producer job SHALL run on a GitHub-hosted runner in environment `producer`, with job permissions exactly `contents: read` and `id-token: write`. IF they differ, THEN THE workflows check SHALL print `CHECK workflows FAILED: producer-permissions`. Its environment SHALL set `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` to `1`, and SHALL name no secret, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or `CLAUDE_CODE_OAUTH_TOKEN`. IF not, THEN it SHALL print `CHECK workflows FAILED: producer-env`. Its `timeout-minutes` SHALL be at most 60, within the role's session. IF not, THEN it SHALL print `CHECK workflows FAILED: producer-timeout`. |
| SPEC-001-R86 | THE Terraform SHALL define role `who-gets-the-keys-producer-bedrock` with `max_session_duration` 3600, trusting only `aud` `sts.amazonaws.com`, `sub` `<prefix>:environment:producer` and `job_workflow_ref` `<repo>/.github/workflows/producer.yml@refs/heads/main`. It SHALL allow only `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on one inference profile and its foundation models, conditioned on `bedrock:InferenceProfileArn`. The SCP's identity-write deny and the deploy role's `NoIdentityWrites` deny SHALL list it. IF not, THEN THE test check SHALL print `CHECK test FAILED: test/factory.test.ts`. |
| SPEC-001-R87 | THE producer job SHALL set `EGRESS_ALLOWLIST: .github/egress/allowlist.json`. It SHALL generate `$RUNNER_TEMP/claude-settings.json` with `jq`, holding `disableAllHooks: true` and a `sandbox` block: `enabled: true`, `failIfUnavailable: true`, `allowUnsandboxedCommands: false`, and `network.allowedDomains` from the allowlist. IF the job does not generate it or hand its path to the driver, THEN THE workflows check SHALL print `CHECK workflows FAILED: producer-egress`. THE driver SHALL run each check under `srt` with the same allowlist and no `AWS_` variables. It SHALL start Claude Code without `ACTIONS_ID_TOKEN_REQUEST_URL` or `ACTIONS_ID_TOKEN_REQUEST_TOKEN`. IF not, THEN THE test check SHALL print `CHECK test FAILED: test/producer.test.ts`. |
| SPEC-001-R88 | THE driver SHALL start Claude Code with exactly these flags: `-p`, `--setting-sources project`, `--strict-mcp-config`, `--mcp-config .github/producer/mcp.json`, `--settings <the R87 file>` and `--permission-mode dontAsk`. It SHALL add `--allowedTools` with one `Edit(<path>)` per `produces` entry and one `Bash(npm run check:<name>)` per `verify` entry, and `--disallowedTools` with `WebFetch` and `WebSearch`. It SHALL pass `--max-turns`, `--max-budget-usd` and `--output-format json`, with limits from the signed policy. `ANTHROPIC_MODEL` SHALL name one inference profile. IF the list differs, THEN THE test check SHALL print `CHECK test FAILED: test/producer.test.ts`. |
| SPEC-001-R89 | WHEN an attempt's checks pass, THE driver SHALL write `changes.diff` to `$RUNNER_TEMP` and SHALL set its `verdict` output to `pass`. The file SHALL be the binary diff of the working tree against the base commit. THE producer job SHALL upload `changes.diff` only in a step conditioned on that output, and SHALL upload `transcript.json`, each attempt's JSON result, always. It SHALL make no commit, push, tag or release. IF HEAD differs from the base commit, THEN THE driver SHALL print `CHECK producer FAILED: commit made`. |
| SPEC-001-R90 | THE driver SHALL run at most `max_attempts` attempts within `max_seconds`, shared by attempts and checks. WHEN a check prints `CHECK <name> FAILED: <identifier>`, THE driver SHALL start the next attempt with that line added. IF a check fails without that line, THEN THE driver SHALL print `CHECK producer FAILED: operational <step>`. IF a limit runs out, THEN it SHALL print `CHECK budget FAILED: <limit>`. The limit SHALL be `max_attempts`, `max_seconds`, `max_turns` (result subtype `error_max_turns`) or `max_budget_usd` (subtype `error_max_budget_usd`). It SHALL then write no `changes.diff` and set `verdict` to `rejected`. |
| SPEC-001-R91 | THE check job SHALL run only when the producer's `verdict` output is `pass`. IF its `if:` does not require that, THEN THE workflows check SHALL print `CHECK workflows FAILED: producer-verdict`. It SHALL use a fresh GitHub-hosted runner with job permissions exactly `contents: read`, and no environment, secret, model or AWS credential. It SHALL check out the base commit, keep a worktree of it outside the patched tree, and verify the artifact's SHA-256. IF the digest differs, THEN it SHALL print `CHECK scope FAILED: changes.diff digest`. It SHALL apply and commit the patch locally and output the tree SHA and patch digest. It SHALL then run the task and scope checks from the base worktree over the range, and then `npm run checks`. A later job that runs no repository code SHALL publish the record. The check job SHALL NOT be named `checks`. |
| SPEC-001-R92 | WHERE `specs/receipt-policy.json` lists a trusted signal as a workflow file and a task ID, WHEN a `workflow_run` event arrives, THE producer job SHALL check five fields. It SHALL start that task only IF `github.event.workflow_run.conclusion` is `failure`, `github.event.workflow_run.event` is `schedule`, and `github.event.workflow_run.head_branch` is `main`. It SHALL also need `github.event.workflow_run.head_repository.full_name` to equal `github.repository`, and `github.event.workflow_run.path` to name the listed file. It SHALL take no text from the triggering run or its event as instruction. IF the driver does, THEN THE test check SHALL print `CHECK test FAILED: test/producer.test.ts`. IF the task is missing at `main`, THEN it SHALL print `CHECK task FAILED: <ID> not found`. |
| SPEC-001-R93 | THE `issue-triage.yml` triage job SHALL keep permissions `contents: read`, `issues: read` and `id-token: write`. Its settings SHALL deny `Bash`, `WebFetch`, `WebSearch`, `Edit` and `Write`, and its only output SHALL be one label from the fixed set. Its label job SHALL hold only `issues: write`. IF any of these changes, THEN THE workflows check SHALL print `CHECK workflows FAILED: triage-label-only`. |
| SPEC-001-R94 | B26 issue-comment workflow that dispatches the producer: `CHECK workflows FAILED: untrusted-dispatch` |
| SPEC-001-R95 | B27 producer job with `contents: write`: `CHECK workflows FAILED: producer-permissions` |
| SPEC-001-R96 | B28 task that exceeds its budget, in `budget-verify` mode: the driver runs with a stub `claude` that also writes `changes.diff` into the checkout. Expected `CHECK budget FAILED: max_attempts`, with `verdict` `rejected` and no `changes.diff` under `$RUNNER_TEMP` |
| SPEC-001-R97 | WHEN the build job computes the factory fingerprint (SPEC-001-R42), THE factory patterns in the policy SHALL cover `.github/`, `scripts/checks.ts`, `scripts/ci/`, `scripts/receipt.ts` and every file on the SPEC-001-R44 list. They SHALL also cover `package.json`, `package-lock.json`, `allowed-deps.txt`, `specs/protected-paths.txt`, `specs/sca-exceptions.toml`, the policy and 0002's agent inputs. THE policy SHALL enter as canonical JSON without its approved-version entries. Requirement files `specs/SPEC-*.md` SHALL stay out, and R42's import rule SHALL accept them. `specs/source-of-record/`, `practices.yaml`, `scenarios/scenarios.yaml` and `traceability.md` SHALL stay out, and the R44 list SHALL NOT name them. IF a file on the R44 list matches no pattern, THEN THE build job SHALL print `CHECK receipt FAILED: check input outside factory <path>`. |
| SPEC-001-R98 | THE R45 predicate SHALL hold each tightening that R102 accepts, with its file, old measure and new measure. THE receipt's FACTORY line SHALL show the policy's factory version and the fingerprint. WHERE R102 accepts a tightening chain, THE line SHALL add `+ tightening (<file>: <old> to <new>)` for each tightening. WHILE the signer is `pipeline.yml` in this repository, THE line SHALL label the version `reported by a signer the agent can edit`. |
| SPEC-001-R99 | WHEN promote or the deploy workflow admits a commit, THE receipt check SHALL read the approved versions from the policy at that commit. It SHALL make this check at R53's place in the R56 order, after R50 has verified the predicate that holds the version. IF the receipt's factory version has no approved entry, THEN it SHALL print `CHECK receipt FAILED: factory version <n> not approved`. R53 SHALL then compare the fingerprint with that version's entry, not the latest. IF they differ and R102 finds no tightening chain, THEN the R53 identifier SHALL apply. |
| SPEC-001-R100 | WHEN the tightening classifier judges a commit, THE classifier SHALL read the direction table in `specs/receipt-policy.json` as of the commit's parent. It SHALL compare the raw blobs at the parent and the commit, not `git diff` output. It SHALL prove the commit a tightening only IF every changed file is listed and its blobs meet that file's rule, as "Factory versions and proven tightenings" lists. It SHALL treat as unclassifiable any other change, an unlisted file, and an added, deleted, renamed or copied file. It SHALL do the same for a mode change, a symlink or gitlink, and a binary, non-UTF-8 or unparsable blob. It SHALL do the same for a duplicate JSON key and a commit with more than one parent. An unclassifiable change SHALL NOT be a tightening. IF a table row's rule differs from that list, THEN THE test check SHALL print `CHECK test FAILED: test/factory.test.ts`. |
| SPEC-001-R101 | THE signatures check SHALL accept an unsigned commit that touches `specs/`, `approvers.txt` or a protected path only IF the classifier proves it a tightening. IF not, THEN it SHALL print the SPEC-001-R12 failure line, such as `CHECK signatures FAILED: unsigned change to <path>`. |
| SPEC-001-R102 | WHEN a fingerprint differs from its version's approved entry, THE receipt check SHALL find the last commit reachable from HEAD whose fingerprint matched that entry. It SHALL list each later commit that changed a factory file. It SHALL accept the fingerprint only IF the classifier proves each such commit a tightening. IF no commit matched the entry, or one listed commit is not a tightening, THEN the R53 identifier SHALL apply. |
| SPEC-001-R103 | B31 unsigned raise of `thresholds.break` from 95 to 96, in `tightening-verify` mode: the harness commits the patch unsigned and runs the signatures check and the receipt renderer. The signatures check SHALL pass, and the FACTORY line SHALL read `FACTORY v<n> + tightening (stryker.config.json: 95 to 96)`, with `<n>` the policy's version |
| SPEC-001-R104 | B32 unsigned new check, an ESLint rule added as an error that the tree passes: `CHECK signatures FAILED: unsigned change to eslint.config.js` |
| SPEC-001-R105 | B33 unsigned removal of a line from `specs/protected-paths.txt`: `CHECK signatures FAILED: unsigned change to specs/` |
| SPEC-001-R106 | B34 unsigned `scripts/checks.ts` code edit whose message calls it a tightening: `CHECK signatures FAILED: unsigned change to scripts/checks.ts` |
| SPEC-001-R107 | WHERE a scenario has a `task:` field, THE harness SHALL commit that fixture as `tasks/<ID>.task.md` in its temporary worktree before it applies the patch. WHEN a scenario has `run: task-verify`, THE harness SHALL run only the task check for that task. WHEN a scenario has `run: scope-verify`, THE harness SHALL commit the patch with a `Task: <ID>` trailer and run the task and scope checks over the range. IF the mode's check passes, THEN THE harness SHALL fail the scenario. |
| SPEC-001-R108 | WHERE a scenario has `requires: cloud-session`, THE harness SHALL skip it and name `scenarios/session-push.sh` from a cloud session. THE walkthrough page SHALL show its lines from the log passed with `--on-demand-log`, or SHALL state that it needs a cloud session and was not recorded. This amends SPEC-002-R6. |
| SPEC-001-R109 | WHEN the required check runs on a candidate commit, THE signer repository's workflow SHALL first run the signatures, task and scope checks over the range from the merge base. It SHALL run them with `scripts/checks.ts`, its configs and `node_modules` from `main`'s tip. It SHALL run no file from the candidate tree before they pass. IF one fails, THEN it SHALL print that check's failure line and stop. |
| SPEC-001-R110 | B35 deploy to `production` approved by a login outside the tier's `reviewers`, in `tier-verify` mode: `CHECK tier FAILED: production approved by unlisted mallory` |

`task`, `scope`, `tier`, `promote`, `producer` and `budget` print the same prefix as every check. Each new check name also needs a `check:<name>` script where it runs locally (F05).

## Scenarios

Each expected line is a draft until a real failing run confirms it, as `scenarios/scenarios.yaml` requires. B23 and B24 have never been used in any file or commit. B25 stays reserved (0002); B19 to B22 belong to 0002.

| ID | Scenario | Phase | Check | Expected line | How it runs | Practice |
|---|---|---|---|---|---|---|
| B23 | Patch outside the task's scope: the fixture task produces `src/export.ts` and its property test; the patch also changes `src/handler.ts` | A | scope | `CHECK scope FAILED: src/handler.ts` | Local harness, `run: scope-verify`, with `task: scenarios/fixtures/tasks/TASK-B23.task.md` | P24 |
| B24 | Task citing an unapproved requirement, `SPEC-014-R99`, which no spec or scenario patch defines. B15's patch defines a SPEC-014 ID of its own | A | task | `CHECK task FAILED: TASK-B24 cites unapproved SPEC-014-R99` | Local harness, `run: task-verify`, fixture only | P02 |
| B26 | An `issue_comment` workflow with `actions: write` that dispatches `producer.yml` | D | workflows | `CHECK workflows FAILED: untrusted-dispatch` | Local harness, full `npm run checks`; workflows runs before signatures | P15 |
| B27 | Producer job with `contents: write` | D | workflows | `CHECK workflows FAILED: producer-permissions` | Local harness, full `npm run checks` | P25 |
| B28 | Task that exceeds its budget: `max_attempts: 2`, and every attempt fails lint. The stub `claude` also writes `changes.diff` into the checkout | D | budget | `CHECK budget FAILED: max_attempts` | Local harness, `run: budget-verify`: the driver with a stub `claude` on `PATH`. The harness asserts `verdict` `rejected` and no `changes.diff` under `$RUNNER_TEMP`. The `producer-verdict` rule keeps the check job and receipt from running. An on-demand Actions run repeats it on Bedrock | P24 |
| B29 | From a cloud session after Phase B: push a checked candidate commit to `main`, update the promote-only ruleset, and update the `sandbox` environment's protection. Each update sends the current body unchanged | B | boundary | `BOUNDARY HELD: <action>` per action | On demand, from a cloud session (`requires: cloud-session`, R108). Before Phase B the push lands, so run it only after | P24 |
| B30 | Deploy to the `production` tier, which requires a reviewer, with an empty review history | C | tier | `CHECK tier FAILED: production needs a reviewer` | Local harness, `run: tier-verify`, with a policy fixture and a review-history fixture | P45 |
| B31 | Unsigned raise of `thresholds.break` from 95 to 96 | B | signatures (passes) | `FACTORY v<n> + tightening (stryker.config.json: 95 to 96)` | Local harness, `run: tightening-verify`: unsigned commit, then the signatures check and the receipt renderer | P25 |
| B32 | Unsigned new check: an ESLint rule added as an error, chosen so the tree passes lint | B | signatures | `CHECK signatures FAILED: unsigned change to eslint.config.js` | Local harness, full `npm run checks` | P25 |
| B33 | Unsigned removal of `scenarios/on-demand.sh` from `specs/protected-paths.txt` | B | signatures | `CHECK signatures FAILED: unsigned change to specs/` | Local harness, full `npm run checks` | P25 |
| B34 | Unsigned edit to a numeric literal in `scripts/checks.ts`, whose message calls it a tightening | B | signatures | `CHECK signatures FAILED: unsigned change to scripts/checks.ts` | Local harness, full `npm run checks` | P25 |
| B35 | Deploy to `production` approved by `mallory`, who is not in the tier's `reviewers` | C | tier | `CHECK tier FAILED: production approved by unlisted mallory` | Local harness, `run: tier-verify`, with a review-history fixture | P45 |

B9 already shows the triage token cannot dispatch a workflow (`scenarios/b9-replay.sh:25`). B26 adds the static rule, so a workflow that could dispatch the producer never lands. B33 and B34 run the patched tree's own check code, as every scenario does. Signatures judges each commit by `specs/protected-paths.txt` as of its parent, so B33's removal cannot exempt itself.

## Decided by the owner, 2026-11-05

| Topic | Decision | Effect here |
|---|---|---|
| Name | "The spec-to-receipt software factory", with the tagline "Signed spec in, signed receipt out." | Title and Context. The file name stays `0004-factory-model.md` |
| Summary | The paragraph quoted in Context, as the target state under decisions 0002 to 0004 | Context |
| What a human does | Exactly three things: sign specs, approve the factory, and approve production or irreversible deploys where policy says so. Starting a run is a trigger, not an approval | "What a human does"; decision 1 |
| Producer | Cloud sessions now, runner later | Phases A to C use task sessions. The runner producer arrives in Phase D |
| Reviewer tiers by environment | A reviewer on production only. `sandbox` loses its reviewer in Phase C, as a tier set upfront in the signed policy, not per change | R77 to R79, R81, the DEPLOY line, B30 and B35. Confirmed present: the decision, its requirement, the DEPLOY line and its scenario |
| Factory version | The receipt carries a FACTORY line with the factory version and a fingerprint. The fingerprint covers the pipeline, the checks and the configs they read, the receipt policy and the agent inputs. Specs are recorded on INTENT | Supersedes 0002 decision 3 and its owner decision D4 ("agent inputs only"). R97 to R99 |
| Asymmetric approval | No signature, proof only. A deterministic classifier with a per-file direction table decides, and fails closed | R100 to R102, B31 to B34. Decision 14 |

## Decisions for the owner

| Decision | Options | Recommendation |
|---|---|---|
| Model access for the runner producer | (a) Bedrock via OIDC: a new invoke-only role, reusing the account's GitHub OIDC provider and the allowlisted endpoint. STS credentials last one hour by default and at most the role's `max_session_duration`. Claude Code keeps them in memory and refreshes only through `awsAuthRefresh` or `awsCredentialExport`, so a longer run loses model access. (b) Anthropic Workload Identity Federation: a GitHub OIDC token is exchanged for a short-lived Anthropic token through a Console service account and federation rule. It needs an Anthropic admin or owner, `id-token: write` and egress to `api.anthropic.com`. GitHub tokens expire about 5 minutes after issue and are single-use, so runs over about 10 minutes must refresh the token file. (c) `claude setup-token`, a spike only: a one-year token tied to whoever ran it, on a Pro, Max, Ultra, Team or Enterprise plan. It is a standing key, and an `ANTHROPIC_API_KEY` outranks it | (a). It needs no standing key and follows the triage pattern. (b) is the fallback if Bedrock cannot serve the model. Use (c) only in a scratch repository, never on `main` |
| Longer producer runs | Cap `max_seconds` at 3300. Or raise the role's `max_session_duration` and the job's `role-duration-seconds` to match, at most 21600; a leaked credential then lives longer. Or add an `awsCredentialExport` or `awsAuthRefresh` helper that mints a fresh OIDC token and assumes the role again | The 3300 cap |
| Whether `tasks/` is protected | Protected: every task change needs an approver signature. Unprotected: the agent may draft tasks, recorded by digest only | Protected. The task is how intent becomes work, and the owner's framing has the human sign the task that cites the specs. It stays a run input, outside the fingerprint |
| Whether interactive sessions may still deliver code | Yes; no; drafting only | Drafting only, under `docs/` and `proposals/`. R66 enforces it: any other unsigned commit needs a `Task:` trailer and passes scope |
| Whether irreversible changes keep an approver signature | Keep SPEC-001-R18 as is; or let the receipt alone decide | Keep it (R80). Slide 8: "Irreversible actions require human approval. The pipeline enforces it" |
| Whether a trusted signal may start a run without the owner | (a) The owner dispatches every run. (b) A named scheduled check that fails starts one named task, through `workflow_run`. `workflow_run` matches by workflow name and fires for every run of it, whatever started the run (GitHub, Events that trigger workflows). So R92 also checks the run's event, branch, repository and workflow path. (c) Also an outside alarm through `repository_dispatch`, which needs a token with Contents write held outside GitHub | (a) until Phase D's scenarios pass, then (b) for pairs listed in the signed policy. Not (c): a new key holder. Scheduled runs can be delayed or dropped, and public repositories disable them after 60 days without activity |
| Who reviews production | The owner; another person | Another person, listed by user ID in the tier's `reviewers`, whose GitHub credentials no cloud session uses. A session acts with the owner's credentials (inference), and promote, not the owner, initiates the deploy |
| GitHub identity for cloud sessions | The owner's account; a non-admin account | Decide after F23. If any B29 action is not held, move sessions to a non-admin identity before Phase B lands |
| Promote actor and trigger | (a) A signer-repository workflow holding the App key, run on a schedule and by the owner's dispatch. (b) A hosted GitHub App reacting to webhooks. (c) A custom deployment protection rule, which approves deploys but cannot move `main` | (a). It keeps the key outside this repository with no new hosting. Schedules run at most every 5 minutes |
| Promote App and workflow files | Add Workflows write if F24 shows a fast-forward over `.github/workflows/` changes needs it; or land workflow changes another way | Add it only if F24 shows the need, and record that it widens the key's power to workflow files |
| Feedback checks that need the network | Feed back only offline checks; or add the Semgrep and OSV hosts to the producer's allowlist | Offline only. The check job of record runs all of them, with open egress and no credentials |
| A repository Actions policy on `producer.yml` | Add one allowing only the owner's user ID and only `workflow_dispatch` (and `workflow_run` if signals are approved); or rely on R83's actor check | A Phase D precondition (F41): the policy if this repository can use it, else R83's actor check, with its residual risk recorded |

## Options considered

| Option | Verdict |
|---|---|
| A. Keep a human per change: 0002 as proposed, with the `sandbox` reviewer on every deploy | Superseded in part: the brief moves judgment upstream |
| B. The brief's order: the runner producer in Phase A | Deferred by owner decision 2026-11-05: cloud sessions now, runner later |
| C. Cloud sessions in Phases A to C, the runner producer in Phase D | **Chosen** |
| D. `claude-code-action` with `use_bedrock`, as its Bedrock example shows | Rejected for the producer. The documented example runs on `issue_comment` and `issues` with `contents: write`, so untrusted text starts runs and the agent job holds a write token |
| E. apmx's `run.yml` | Rejected. apmx runs only Copilot CLI or OpenCode, and its merge check runs on `pull_request_target` |
| F. A promote job in this repository's pipeline after green | Rejected: 0002 decision 15. The job would hold a write token inside a workflow the agent can edit |
| G. A custom deployment protection rule that verifies the receipt, in place of the `sandbox` reviewer | Not now. It is in public preview and needs hosting. It stays an option for Phase C |
| H. `--allowedTools "Bash(npm run check:*)"` as written | Rejected: under the documented rule syntax it does not match `npm run check:lint` (inference) |
| I. An `ANTHROPIC_API_KEY` secret for the producer | Rejected: a standing key. With `CLAUDE_CODE_USE_BEDROCK` set, Bedrock credentials rank first anyway |
| J. Sandbox settings in `/etc/claude-code/managed-settings.json` instead of `--settings` | Not chosen. Managed settings "are read regardless" of `--setting-sources` (Claude Code, Managed settings; Agent SDK, Claude Code features), but the runner needs a sudo write to a system path |
| K. The sandbox block written into the checkout's `.claude/settings.json` | Rejected. It lands in `changes.diff` and trips `scope`, and a project-level sandbox is not admin-required |
| L. `--disallowedTools` rules for each config file the hooks or checks run | Not chosen. `Edit` per `produces` path and `disableAllHooks` cover the same paths with less to keep current |
| M. An approver signature on every factory change, as in 0002 decision 3 | Superseded by owner decision: a proven tightening needs proof only |
| N. Every check of record run with `main`'s check code | Not chosen. A tightening must pass under its own rules. R109 runs only `signatures`, `task` and `scope` from `main`, which leaves the candidate's check code approver-signed or unchanged |

## Relation to Agent Contracts draft 0.1

| Draft 0.1 | 0004 | Fit |
|---|---|---|
| Contract file `<name>.contract.md`, a factory file pinned by the fingerprint | `tasks/<ID>.task.md`, a run input recorded by digest | Shape of a contract, role of an assignment. "Assignment ... Recorded by digest as a run input; not part of the contract's identity" |
| Front matter: `needs`, `produces`, `budget`, `verify`, `imports`; unknown keys rejected | The same four, plus `requirements` | Not 0.1-valid: the schema sets `additionalProperties: false`. The proposed `x-` extension keys are also refused by APMX today |
| `produces`: deliverables that must exist; scope by a separate `change-scope` check | `produces`: the allowed path set the `scope` check reads | Departs; recorded here |
| `verify` capped at 8; any command | Up to 8 check names, each `npm run check:<name>`; the checks of record run all | Fits the cap; commands stay in the factory |
| `max_seconds` up to 86400 | Up to 3300, the producer role's one-hour session | Tighter |
| Exit 1 retries while budget remains; other exits stop | The driver retries on a `CHECK` line; anything else stops (R90) | Fits |
| No receipt for a rejected or halted run | B28: no patch and no receipt | Fits |
| Produce, check, attest as separate jobs; the check job writes the receipt of record | Producer, check job, publish job, then 0002's attest and signer | Fits |
| A trusted signer outside the agent's reach | 0002 Phase 3, which also holds promote | Fits from Phase B |
| Merge check on `pull_request` or `pull_request_target` | No pull requests. The receipt decides at promote and deploy | Departs |
| `spec/gate.md` item 1: the check definition comes from the target, never the change | From Phase B, `signatures`, `task` and `scope` run with `main`'s check code before any candidate file (R109). Then the candidate's check code is approver-signed or unchanged. In Phase D the check job runs them from the base worktree | Fits from Phase B (inference). In Phase A the candidate's own files run, 0002's known gap |
| `spec/gate.md` item 8: a stale base reruns the factory | Promote fast-forwards only when `main`'s tip is an ancestor | Fits |
| No approved intent; intent is the per-run assignment | Approver-signed specs; tasks cite approved IDs only | The addition this repo makes |
| Triggers and untrusted input are out of scope | R83, R84, R92, R93 | Added |
| Front matter must not name a harness or model | Flags and the model pin live in the driver and the signed policy | Fits |

The draft is a reference, not a dependency, as in 0002. Its main branch was still `d6c80b2` on 2026-11-05, and the files read that day matched the 2026-11-04 copy byte for byte.

## Consequences

| Consequence | Mitigation |
|---|---|
| Fewer human steps put the weight on the factory: a missing check now ships | Decision 16: each escaped defect becomes a check or a tighter spec |
| Until Phase B a cloud session can push to `main`; 0002 Phase 0 holds only unchecked commits. In Phase A a session can also edit `scripts/checks.ts`, which no deny rule covers | The owner pushes deliveries in Phase A; `CLAUDE.md` says sessions push only to `candidate/`; Phase B's ruleset and R109 end both |
| Nothing stops the owner opening a task session as a project thread, where the repo's deny rules and hooks do not apply | Recorded. F08 says task sessions are single-repository sessions, and the candidate run's checks of record still decide |
| A non-approver human's code change also needs a task, because the pipeline cannot tell who wrote an unsigned commit | Accept. In this repository the only human author is the approver, whose commits are exempt |
| An agent session can author a proven tightening, since an unsigned commit's author is not known | Accept. A tightening can only make checks stricter, and it must pass the checks of record under its own rules |
| Proven tightenings land with no human. A classifier bug could accept a loosening | The classifier fails closed, its code and table always need a signature, and each tightening appears on the FACTORY line |
| An unsigned tightening can block deliveries with no human. SPEC-001-R14 fails any later lowering of `thresholds.break`, even signed, so a raise near the current score is permanent. A protected-paths line such as `src/` makes scope refuse every source change | Each tightening shows on the FACTORY line and gets a row in `docs/factory-log.md`. Undoing a raise needs a signed change to R14 and `scripts/checks.ts`; undoing a path line needs a signed commit |
| A tightening can break a scenario, which the checks of record do not run. Removing `lodash` from `allowed-deps.txt` passes them but breaks B13, whose patch adds it to `package.json` | `scenarios.yml` runs on every push to `main` and fails. Restoring the name is a loosening, so it needs a signed commit |
| Specs that `CLAUDE.md` imports but no `Spec:` trailer cites are agent inputs that leave the fingerprint, and no INTENT line records them | Accept. Every requirement file needs an approver signature, and the receipt's commit SHA fixes their content (inference) |
| A factory change now bumps the version for configs too, not only agent inputs | A proven tightening rides on a chain from the approved version, so only signed changes need a new version |
| `docs/` and `proposals/` commits need no task. Inference from `vitest.config.ts:4`, which includes only `test/**/*.test.ts`: nothing under them runs in the checks | Recorded. A new check that runs code from those paths must narrow the `drafting` list |
| In Phases A to C nothing enforces a task's budget inside a cloud session | Recorded; the runner producer enforces it in Phase D |
| The receipt cannot record a cloud environment's network policy or setup script (inference) | The AUTHOR line says "environment not recorded" |
| A cloud session reaches GitHub's API with the owner's credentials (inference). It might dispatch a workflow, approve a deployment, or edit a ruleset as the owner | F23 and B29 before Phase B lands; a production reviewer whose credentials no session uses; R83's actor check and the Actions policy on `producer.yml`. Residual: a session dispatching with the owner's own credentials passes R83 |
| `npm run check:<name>` runs agent-written code on the producer runner. Inference: an allow rule approves the command text, not the code the script then runs. Read and Edit deny rules do not cover "a Python or Node script that opens files itself" (Claude Code, Permissions) | Invoke-only role, `contents: read`, no secrets, `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`, and checks under `srt` with no `AWS_` variables |
| Hooks run outside the sandbox "with your full access" (Claude Code, Sandboxing). Agent-written test code may write files in the working directory, such as `eslint.config.js`, which the project's ESLint hook would run | The producer's `--settings` file sets `disableAllHooks: true`, and the driver strips the OIDC request variables |
| The check job of record runs agent-written tests and source, unsandboxed, in the job whose output is the record. That code can write `$GITHUB_ENV` and `$GITHUB_OUTPUT` | The tree SHA and patch digest are output before `npm run checks`; a later job that runs no repository code publishes the record |
| `--max-budget-usd` is a soft cap checked against Claude Code's own estimate, which "can differ from your bill"; no page says it works on Bedrock | Job `timeout-minutes`, `max_seconds`, and AWS-side budget alarms |
| `--bare` "will become the default for -p in a future release", and skips hooks and `CLAUDE.md` | Pin the Claude Code version in the producer job; F42 checks `CLAUDE.md` loads |
| Phase C removes the `sandbox` reviewer, part of `docs/slide-reconciliation.md` R28's evidence | The irreversible check keeps slide 8 true; F32 updates R28 |
| Slide 12: "No circuit breakers yet that tighten approval when reverts move." 0004 removes per-change approval without one | `docs/factory-log.md` gives the evidence; a breaker is a later check |
| The promote App can write `main`. It is not a deploy identity, so slide 10's "One deploy identity" holds | Its key lives only in the signer repository; it fast-forwards to checked SHAs only |
| The owner, as repository admin, can still edit rulesets and environments | A factory change outside the receipt; `github.sh` reads both back |
| Decision 0003's owner steps replace `README.md` with `proposals/README.proposed.md` (`git mv -f`), whose Docs table ends at the 0003 row. A 0004 row added only to `README.md` is lost when 0003 lands | Add the same 0004 Docs row to `proposals/README.proposed.md` before 0003's `git mv` runs, as commit 973a307 did for the 0002 row |
| GitHub deletes runs, checks and artifacts after 90 days by default | The receipt embeds digests and lines, not links |
| A runner delivery runs the checks three times: check job, candidate run, `main` run | Accept: only the `main` run deploys |

## Not yet verified

| Item | How to settle it |
|---|---|
| Whether a cloud session ignores a `--permission-mode` flag. The docs cover only the dropdown and settings `defaultMode` | Start one with `claude --cloud` and the flag; read the session's mode |
| Which GitHub REST calls a cloud session's proxy forwards with the owner's credentials, such as a ruleset update, an environment update, a workflow dispatch or a deployment approval | F23: B29's actions from a session, before F24 and F33 |
| Whether the immutable `sub` and `job_workflow_ref` appear in a direct job's token (`docs/verification.md`, "OIDC workflow pinning") | Phase D: decode a real producer token |
| `github.actor_id` on a run dispatched by another workflow's `GITHUB_TOKEN`; no page states it. R83's actor check helps only if it is not the pusher's ID | F42 |
| A token minted from the triage job's `id-token: write` through an OIDC-to-GitHub token broker is not covered by R84 | The egress allowlist limits it; check that no broker host is allowlisted |
| Whether repository Actions policies are available on this user-owned public repository | F41: Settings, Actions, Policies; or `GET /repos/{owner}/{repo}/actions/policies` |
| `claude -p`'s exit code when it stops at `--max-turns` or `--max-budget-usd` | F42 |
| What `claude -p` prints and exits with when its Bedrock credentials expire mid-run | F42 |
| That `--output-format json` prints the Agent SDK result object, with `subtype` and `permission_denials` | F42 |
| Whether `--max-budget-usd` works on Bedrock, where an unmatched model ID gives `costBasis` `unknown` | F42 |
| Whether an invoke-only role works with `ANTHROPIC_MODEL` pinned to a full profile ID, without profile discovery | F42 |
| The destination Regions of the chosen model's `us.` profile | AWS's per-model profile table, before F35 |
| The Semgrep and OSV hostnames the network checks reach | Only if the owner widens the producer allowlist |
| Whether zizmor's offline audits report on the B26 and B27 patches before the repo rules do | The first failing run sets each `expect` |
| Whether Stryker accepts `thresholds.break` above `thresholds.low` (95 today), and whether the mutation score clears 96. B31 runs the signatures check and the receipt renderer, not mutation | F19 |
| Whether lint, typecheck and the earlier checks pass on the B32 and B34 patches, so `signatures` fails first | The first failing run sets each `expect` |
| The review history (`GET .../actions/runs/{run_id}/approvals`) returns `user.login`, `state` and `comment` but no approval time. The DEPLOY line shows no time until a source is found | F27: try the deployment statuses |
| Whether the deploy workflow's `GITHUB_TOKEN` with `actions: read` can read its own run's review history, and `user.id` in it | F27 |
| Whether a job after a rejected deploy job still runs with `if: always()` and sees the rejection | F28 |
| What the review history holds for a deployment an administrator forces through bypass. R77 fails it unless that administrator is a listed reviewer, but no page states the entry | F29, before admin bypass is turned off |
| Whether bypass in the promote-only ruleset leaves `protect main`'s required checks in force. Rules across rulesets "are aggregated" and "the most restrictive version of the rule applies" (GitHub, About rulesets). How bypass interacts with them is not documented | F24: promote an unchecked SHA; it should be refused |
| Whether promote also needs Workflows write to fast-forward `main` to an approver commit that changes `.github/workflows/`. Inference: the git refs REST page lists Contents write plus Workflows write as a second permission set | F24: promote an approver-signed commit that changes a workflow file |
| The REST field for "Allow administrators to bypass configured protection rules" | F29, before `github.sh` sends it |
| Whether a signer-repository workflow can read this repository's check runs with the App token | F16 |
| Whether B23 and B24 were skipped in 0002 on purpose. Nothing records a reservation | Ask the owner before F09 |

## Sources

| Source | Checked |
|---|---|
| https://code.claude.com/docs/en/cli-reference | 2026-11-05 |
| https://code.claude.com/docs/en/headless | 2026-11-05 |
| https://code.claude.com/docs/en/permission-modes | 2026-11-05 |
| https://code.claude.com/docs/en/permissions | 2026-11-05 |
| https://code.claude.com/docs/en/authentication | 2026-11-05 |
| https://code.claude.com/docs/en/amazon-bedrock | 2026-11-05 |
| https://code.claude.com/docs/en/settings | 2026-11-05 |
| https://code.claude.com/docs/en/sandboxing | 2026-11-05 |
| https://code.claude.com/docs/en/managed-settings | 2026-11-05 |
| https://code.claude.com/docs/en/claude-code-on-the-web | 2026-11-05 |
| https://code.claude.com/docs/en/cloud-environments | 2026-11-05 |
| https://code.claude.com/docs/en/claude-projects | 2026-11-05 |
| https://code.claude.com/docs/en/hooks | 2026-11-05 |
| https://code.claude.com/docs/en/env-vars | 2026-11-05 |
| https://code.claude.com/docs/en/mcp | 2026-11-05 |
| https://code.claude.com/docs/en/tools-reference | 2026-11-05 |
| https://code.claude.com/docs/en/costs | 2026-11-05 |
| https://code.claude.com/docs/en/github-actions | 2026-11-05 |
| https://code.claude.com/docs/en/github-actions-cloud-providers | 2026-11-05 |
| https://code.claude.com/docs/en/agent-sdk/claude-code-features | 2026-11-05 |
| https://code.claude.com/docs/en/agent-sdk/agent-loop | 2026-11-05 |
| https://code.claude.com/docs/en/agent-sdk/typescript | 2026-11-05 |
| https://code.claude.com/docs/en/agent-sdk/cost-tracking | 2026-11-05 |
| https://platform.claude.com/docs/en/manage-claude/workload-identity-federation | 2026-11-05 |
| https://platform.claude.com/docs/en/manage-claude/wif-providers/github-actions | 2026-11-05 |
| https://github.com/anthropics/claude-code-action/blob/db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c/base-action/src/setup-claude-code-settings.ts | 2026-11-05 |
| https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows | 2026-11-05 |
| https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows | 2026-11-05 |
| https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax | 2026-11-05 |
| https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow | 2026-11-05 |
| https://docs.github.com/en/actions/concepts/security/github_token | 2026-11-05 |
| https://docs.github.com/en/actions/reference/workflows-and-actions/contexts | 2026-11-05 |
| https://docs.github.com/en/rest/actions/workflows | 2026-11-05 |
| https://docs.github.com/en/rest/repos/repos | 2026-11-05 |
| https://docs.github.com/en/rest/actions/workflow-runs | 2026-11-05 |
| https://docs.github.com/en/rest/actions/artifacts | 2026-11-05 |
| https://docs.github.com/en/rest/checks/runs | 2026-11-05 |
| https://docs.github.com/en/rest/git/refs | 2026-11-05 |
| https://docs.github.com/en/actions/reference/security/oidc | 2026-11-05 |
| https://docs.github.com/en/rest/actions/oidc | 2026-11-05 |
| https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws | 2026-11-05 |
| https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments | 2026-11-05 |
| https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/create-custom-protection-rules | 2026-11-05 |
| https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets | 2026-11-05 |
| https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets | 2026-11-05 |
| https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks | 2026-11-05 |
| https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification | 2026-11-05 |
| https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow | 2026-11-05 |
| https://docs.github.com/en/actions/concepts/about-actions-policies | 2026-11-05 |
| https://docs.github.com/en/rest/actions/policies | 2026-11-05 |
| https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository | 2026-11-05 |
| https://raw.githubusercontent.com/actions/upload-artifact/main/README.md | 2026-11-05 |
| https://raw.githubusercontent.com/actions/download-artifact/main/README.md | 2026-11-05 |
| https://github.com/aws-actions/configure-aws-credentials | 2026-11-05 |
| https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRoleWithWebIdentity.html | 2026-11-05 |
| https://docs.aws.amazon.com/service-authorization/latest/reference/list_bedrock.html | 2026-11-05 |
| https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-prereq.html | 2026-11-05 |
| https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html | 2026-11-05 |
| https://docs.aws.amazon.com/bedrock/latest/userguide/geographic-cross-region-inference.html | 2026-11-05 |
| https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html | 2026-11-05 |
| https://docs.aws.amazon.com/general/latest/gr/bedrock.html | 2026-11-05 |
| https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_iam-condition-keys.html | 2026-11-05 |
| https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html | 2026-11-05 |
| https://github.com/danielmeppiel/agent-contracts (commit `d6c80b2`) | 2026-11-05 |
| https://raw.githubusercontent.com/danielmeppiel/agent-contracts/main/spec/README.md | 2026-11-05 |
| https://raw.githubusercontent.com/danielmeppiel/agent-contracts/main/spec/contract.md | 2026-11-05 |
| https://raw.githubusercontent.com/danielmeppiel/agent-contracts/main/spec/receipt.md | 2026-11-05 |
| https://raw.githubusercontent.com/danielmeppiel/agent-contracts/main/spec/gate.md | 2026-11-05 |
| https://raw.githubusercontent.com/danielmeppiel/agent-contracts/main/spec/schemas/agent-contract.schema.json | 2026-11-05 |
| https://raw.githubusercontent.com/danielmeppiel/agent-contracts/main/spec/examples/build.contract.md | 2026-11-05 |
| https://raw.githubusercontent.com/danielmeppiel/apmx/v0.8.0/.github/workflows/run.yml | 2026-11-05 |
| `specs/source-of-record/slides.txt`, body SHA-256 `f78bb192…`, slides 8, 10, 11 and 12 | 2026-11-05 |
