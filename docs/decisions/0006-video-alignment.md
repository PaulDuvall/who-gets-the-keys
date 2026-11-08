# 0006. Aligning the factory with its video

- Status: Proposed
- Date: 2026-11-06
- Requirements: proposed SPEC-001-R144 to SPEC-001-R189 and SPEC-001-R191 to SPEC-001-R206. None is in the signed spec yet. They follow SPEC-001-R143, the highest ID used in `specs/`, `proposals/` and `docs/` when 0006 started (decision 0005). SPEC-001-R190 is not 0006's. The deploy-tip batch uses it, staged in `proposals/deploy-tip/` and `proposals/phase-1/` by `689bb30`. On 2026-11-06, `git grep` over the tree and `git log --all -G` over every ref found no use of R191 to R206 or of B72 to B80. They found R144 to R189 and B49 to B71 only in 0006's own drafts, including the snapshot commit `99d997d`. R144 to R153 add the validator, an AI check that can only fail, and R191 to R194 complete it. R154 to R159 add the security account, the drift monitor and the deploy freeze, and R195 to R197 complete them. R160 and R161 record issue-prompted work. R162 and R163 add issue fields. R164 adds the in-session allowlist hook. R165 ties a release signature to a staging deploy. R166 adds harness modes. R167 to R189 are scenarios B49 to B71, and R198 to R206 are scenarios B72 to B80
- Builds on: decision 0002 (proposed): the receipt (Phase 1, staged in `proposals/phase-1/`) and the signer repository (Phase 3). Decision 0004 (proposed): task files (R64), checks outside the ordered fifteen (R68) and the pre-check from `main` (R109). Decision 0005 (proposed): approval tiers (R111 to R117), ORIGIN (R119), the release check (R120 to R122) and the alarm-to-spec mapping (R125)
- Supersedes in part: decision 0005: R119's rule that every run no alarm started holds `internal` alone. A run whose task names `prompted_by` also shows the issue that prompted it (R161, G4). R121's pass rule, which becomes "the first tag that meets R120 to R122 and R165". The "Release signatures by tier" row "What the human does", and the "Receipt" example lines (see What changes). Decision 0004: R64's list of front matter keys, which gains `prompted_by` (R160). Decision 0002: slice 1's R45 and R55, staged in `proposals/phase-1/`. The predicate gains a validator record and the receipt a VALIDATOR line (R149, R153)
- Amends, once approved: signed SPEC-001-R8, only under owner decision 16 (a) (the iac check also covers `infra/security`). Signed SPEC-001-R41 keeps its text. R151 widens it, because the ruleset also requires `validator`
- Source: the owner's brief of 2026-11-06, derived from the factory video, revision 18. The video was then built outside this repository; since 2026-11-08 it is built in `factory-video/` (decision 0008). It is compared with this repository's `main` at `c7b91a5`, and line numbers below are at that commit. It was re-read on 2026-11-06 at `e54cdc0`, `6aa9297` and `689bb30`, which is `origin/main`. `6aa9297` lands D25's OIDC change in `infra/` and removes its staged copies from `proposals/`. `689bb30` stages the deploy-tip batch

## Context

The talk's factory video follows one change from a customer's intent to production. The owner's brief describes it as 19 claims, V01 to V19. This decision makes the repository's decisions describe every claim, or names the place where the video should change.

Decisions 0002 to 0005 already cover or propose most claims. Seven gaps remain, which the brief names G1 to G7.

| Gap | Claims | Slide rows and practices | What is missing | Section |
|---|---|---|---|---|
| G1 | V07, V08 | R23; P22 | An AI check that can fail a change, never pass one | G1 |
| G2 | V18 | R34, R35, R36, R38; P31 to P35, P39 | A security account and a drift monitor the pipeline cannot reach | G2 |
| G3 | V07 | R08; P09 | DAST | G3 |
| G4 | V16, V17 | none | ORIGIN for work an issue prompted | G4 |
| G5 | V13 | none | A schema and quarantined notes for public issues | G5 |
| G6 | V05 | P18 | A dependency allowlist inside the session | G6 |
| G7 | V10 | none | A staging environment the release signer checks | G7 |

Where the repository and the video disagree, "Video corrections" lists the change to the video. Each correction is also an owner decision (decision 24).

The video shows the factory model, not this repository's deploy target. Here the only deploy target is `sandbox`. "The production tier is a pattern for adopters" (0004, "Deploy tiers"). The video's Production stands for that tier.

The owner has decided none of 0006's questions. It rests on earlier owner decisions: cloud sessions now and a runner later (0004), and risk-based approval tiers and release signatures by tier (0005).

Facts this decision rests on:

| Fact | Evidence | Effect here |
|---|---|---|
| The validator subagent is advisory. Its tools are Read, Grep and Glob, and its model is `claude-sonnet-5-5`. Nothing under `.github/` or `scripts/` runs it | `.claude/agents/validator.md` lines 3 to 5; `git grep` | G1 adds a pipeline validator. The subagent's future is owner decision 25 |
| A failing check's identifier must be "the same on every run against the same tree" | Signed SPEC-001-R1 | A model verdict cannot join the ordered fifteen. It sits outside them, as 0004's `task` and `scope` do (R68) |
| In API version `2026-10-21`, a request samples at the default `temperature` of 1.0. "No other setting replaces it." Claude 4.7 and later models accept only the defaults | Anthropic, API migration 2026-10-21 | Inference: the validator's verdict on one change can differ between runs |
| Structured outputs give "guaranteed schema compliance" | Anthropic, Increase output consistency | They fix the record's shape, not its verdict (inference) |
| `git patch-id --stable` ignores line numbers, file order and "All whitespace within the patch". Its result can be "used as a key to index some meta-information about the change between the two trees" | git, git-patch-id | The change key for a sticky fail (R148) |
| In a scratch repository (git 2.43.0, 2026-11-06), one changed line on three bases gave two keys with the default diff and one with `-U0`. The base that moved a context line changed the default key. Trailing spaces on the changed line kept the key. A reindented or added line elsewhere changed it under both | A test run for this decision | The change key uses `-U0` (owner decision 7). Only whitespace inside changed lines keeps a key |
| The checks job holds only `contents: read`. Permissions are set at workflow and job level | `.github/workflows/pipeline.yml` lines 9 and 20 to 21 | A model call in the checks job would give `id-token: write` to every step, including `npm run checks` on the candidate's code (inference) |
| The only model role trusts `issue-triage.yml` on `main` and allows invoking `anthropic.*` models | `infra/sandbox/iam.tf` lines 19 and 199 to 220 | The validator needs its own role (owner decision 2) |
| The egress allowlist holds `api.github.com` and `bedrock-runtime.us-east-1.amazonaws.com` | `.github/egress/allowlist.json` | A Bedrock model endpoint is already allowed for jobs that read untrusted input |
| GitHub deletes checks, workflow runs, commit statuses, artifacts and logs after 90 days by default. For checks, runs and statuses this applies from 2026-10-01. Until then they were kept "400+ days" | GitHub, retention period for checks, workflow runs, commit statuses, artifacts and logs; 0004, "Receipt" | A sticky fail cannot live in an artifact |
| Slice 1 requires the predicate's model to be `not recorded` and fails any other value | `proposals/phase-1/SPEC-001-delivery-pipeline.md`, R45 and R55; deviation D05 | The validator's model goes in its own record, not in MODEL |
| No security account exists. `infra/org` has one variable, `sandbox_account_id`, and keeps its state in the management account. `infra/sandbox` keeps its state in a bucket in the workload account, which the deploy role writes | `infra/org/main.tf` lines 11 and 24 to 27; `infra/sandbox/main.tf` lines 4 and 9; `infra/sandbox/iam.tf` lines 70 to 73 | G2 needs a new account (owner decision 10) |
| "SCPs don't affect users or roles in the management account". They "do not affect any service-linked role" | AWS Organizations, SCPs | The security account and the pipeline roles must sit in member accounts (inference) |
| "Use an SCP when you need to limit permissions of IAM principals within your organization's member accounts" | AWS Organizations, RCPs | R154 uses an SCP on the workload account |
| `aws:ResourceAccount` compares a resource's owning account, and is present "for most service actions" | AWS IAM, global condition keys | R154's condition. Its exceptions are in Not yet verified |
| A Config aggregator gives "a read-only view" and does "not provide mutating access". Config records changes "on a best effort basis" | AWS Config | A Config-based detector cannot change production, but its delay is not bounded |
| `GetFunction` returns `CodeSha256`, "The SHA256 hash of the function's deployment package" | AWS Lambda API | R156 compares it with the attested digest |
| The Lambda's `source_code_hash` is `var.artifact_sha256`, the base64 SHA-256 of the zip that `pipeline.yml` passes in | `infra/sandbox/main.tf` line 107; `infra/sandbox/variables.tf` lines 25 to 29 | The same |
| The deploy role may call `lambda:UpdateFunctionConfiguration` on the function, and the SCP's Lambda write deny exempts the deploy and break-glass roles. Terraform sets no layers and no environment variables on it | `infra/sandbox/iam.tf` lines 102 to 109; `infra/org/main.tf` lines 51 to 67; `infra/sandbox/main.tf` lines 101 to 120 | A handler, layer or environment change can run new code under the same `CodeSha256` (R196) |
| The break-glass rule and its SNS topic sit in the workload account. A person with the break-glass role applies them, and the deploy role only reads them | `infra/sandbox/main.tf` lines 122 to 157; `infra/sandbox/iam.tf` lines 54 to 56 and 85 to 86 | Slide row R38's "applied by the pipeline" is inaccurate |
| No CloudTrail trail, AWS Config recorder or GuardDuty detector is defined | `git grep` under `infra/` | Any detector is new |
| The deploy role denies `lambda:AddPermission`, `lambda:CreateFunctionUrlConfig` and `lambda:UpdateFunctionUrlConfig`. No function URL, API Gateway or load balancer exists | `infra/sandbox/iam.tf` lines 185 to 190; `git grep` | Nothing serves HTTP for a DAST scan |
| Lambda offers "two ways to invoke your function through an HTTP endpoint: function URLs and Amazon API Gateway" | AWS Lambda, function URLs | The same |
| R64 rejects a front matter key it does not list. R119 writes `internal` for every run no alarm started. The `sources` table already lists `public issue` at tier 2 | 0004 R64; 0005 R119 and "Alarm-started runs" | G4 option (a) amends both |
| Triage runs only on `opened`, and only for OWNER, MEMBER or COLLABORATOR authors. Its one output is a label | `.github/workflows/issue-triage.yml` lines 8, 16 to 17 and 61 | An outsider's issue reaches no agent today |
| No `.github/ISSUE_TEMPLATE` exists | `ls .github` | G5 option (b) adds one |
| A submitted issue form becomes Markdown in the body, and "Contributors can edit their issues". The REST API creates an issue from any `body` | GitHub, issue forms syntax; GitHub REST API, issues | Forms do not bind the API, so validation happens after the issue exists (inference) |
| The session denies installs and `Edit` on `package.json`, `package-lock.json` and `allowed-deps.txt`. The `security-event` hook only logs an install attempt. No hook reads `allowed-deps.txt` | `.claude/settings.json` lines 5 to 7 and 17 to 18; `.claude/hooks/hook.mjs` lines 56 to 63 | "Dep allowlist" in the session is deny rules today, not a check |
| The allowlist check reads only tracked `package.json` files, through `git ls-files` | `scripts/checks.ts` lines 40 and 343 to 346 | R164 applies the check's name test to its own list of files |
| The session's settings deny neither `WebFetch` nor `gh`. Only the Phase D runner disallows `WebFetch` (0004 R88). A session's `gh api` calls go out with the owner's credentials (0004, "Cloud sessions as the producer") | `.claude/settings.json` lines 4 to 20 | A task session can read any public issue, including the one `prompted_by` names (G4) |
| A `PostToolUse` hook matching `Edit\|Write` does not run "when a `Bash` command or a process outside Claude Code rewrites the same file". `PreToolUse` exit 2 blocks the call | Claude Code, Hooks | An edit-time hook misses the writes that deny rules miss |
| Read and Edit deny rules do not cover "a Python or Node script that opens files itself" | Claude Code, Permissions, as quoted in 0004 "Consequences" | The same |
| GitHub environments are `sandbox` and `probe` only, each deployable from `main` only. While the repository is public, each requires the owner as reviewer, with self-review allowed. While it is private, `github.sh` sets no reviewer, and deploys stop at the attestation check | `scripts/bootstrap/github.sh` lines 62 to 69, 76 to 92 and 159 | No environment is named staging. 0005 calls `sandbox` staging |
| "Only one of the required reviewers needs to approve the job." Prevent self-review stops only "users who initiate a deployment" | GitHub, Deployments and environments | An environment reviewer cannot enforce "an engineer who did not write the spec". 0005 R122 does |
| "A default status check of success() is applied unless you include one of these functions": `success()`, `always()`, `cancelled()` and `failure()` | GitHub, Evaluate expressions | `if: success() \|\| true` runs after a failed need. R149 forbids every status function in the build job's `if:` |
| Creating a deployment through the REST API needs the "Deployments" repository permission (write) | GitHub REST API, deployments | Inference: any workflow that grants `deployments: write`, which SPEC-001-R41 allows, can record a deployment. R156 and R165 read the deploy job's conclusion instead |
| Slide 11 gives prod drift the response "redeploy + notify", and break-glass "alarm + notify". P34 reads "Break-glass is separate and alarmed; nothing redeploys over it" | `specs/source-of-record/slides.txt` lines 166 to 169 and 178 to 179; `practices.yaml` lines 243 to 250 | A break-glass change is also a production change with no attested run. G2 resolves the two (owner decision 26) |

### Terms

| Term | Meaning |
|---|---|
| AI check | A check whose verdict comes from a model. It can fail a change, never pass one |
| validator | The AI check of G1. It compares the cited requirements with the range's diff, spec to code and code to spec |
| cited requirement | A requirement that the task's `requirements` or a `Spec:` trailer in the range names, and `specs/` defines at the merge base with `main` |
| validator record | The model's reply as R146 accepts it: `verdict`, `reason` and `requirement` |
| change key | The output of `git patch-id --stable` for `git diff -U0` from the merge base with `main` to the range's tip, on a `candidate/**` push. On `main`, the candidate's stored record carries it (R191) |
| fail store | An add-only store. It holds the change keys whose validator record was a fail, and a key's presence means fail. It also holds each candidate run's validator record under its commit SHA (R147) |
| override commit | An approver-signed commit with the failed tip as its one parent, the same tree, and a `Validator-Override: <change key>` trailer |
| workload account | The account that holds the sandbox workload, `var.sandbox_account_id` |
| security account | A member account that holds the drift monitor. No workload principal can act on its resources |
| drift monitor | A scheduled job in the security account. It compares production and `main`'s history with what the pipeline attested and approvers signed |
| drift-read role | `who-gets-the-keys-drift-read`, a read-only role in the workload account that only the monitor assumes |
| finding | One drift the monitor recorded. A code finding is production code with no attested run. A history finding is a commit on `main` that fails the signatures check. Its ID is its kind, a hyphen, and the first 12 hex digits of its line's SHA-256 |
| drift report | The monitor's latest list of open findings, with its time, signed by a key in the security account |
| freeze | The state in which the freeze check refuses a deploy |
| cleared finding | A code finding whose ID the policy's `drift.cleared` lists at `main`'s tip. Only then may a deploy of `main`'s tip pass over it (R159) |
| `prompted_by` | An optional task key that names, by number only, the public issue that prompted the work |
| issue fields | The dropdown answers of the issue form that the field check keeps. Everything else in an issue is notes |
| staging environment | The environment a release signer checks before signing. Here `sandbox` |

## What changes

| Element | Today | Under 0006 |
|---|---|---|
| AI in the pipeline | None. The validator subagent is advisory, and nothing runs it | A `validator` job after `checks`. Its fail fails the delivery and sticks to the change key. Its pass changes nothing (R144 to R153, R191 to R194) |
| Required status checks on `main` | `checks` (SPEC-001-R41) | `checks` and `validator` (R151) |
| Receipt | Slice 1's seven lines. 0004 and 0005 add FACTORY, INTENT, TASK, AUTHOR, DEPLOY, ORIGIN and TRIGGER | Adds VALIDATOR. ORIGIN names the issue that prompted the work (R153, R161) |
| Accounts | Management and one workload account | Adds a security account the pipeline cannot touch (R154, R197) |
| Drift detection | The break-glass alarm only, in the workload account | A drift monitor in the security account compares production code, the function's configuration and `main`'s history (R156, R157, R196). A failed read publishes no report (R195) |
| Response to drift | None | A notice through the security account's topic. Where the policy sets `drift.freeze`, deploys stop (R158, R159). A deploy of `main`'s tip passes over a code finding only once an approver clears it (owner decision 26). The pipeline, never the monitor, redeploys |
| DAST | None; slide R08 not covered | Recommended: recorded as not applicable, and the video drops its DAST chip (G3) |
| Issue-prompted tasks | ORIGIN `internal` (0005 R119) | Recommended: ORIGIN `internal`, then `prompted by public issue #<n>` and its tier (R160, R161) |
| Public issues | Free text. Triage labels only members' issues | Recommended: an issue form whose dropdown answers become labels through a check that calls no model. The rest is notes, which the Phase D producer never receives (R162, R163) |
| Dependency allowlist in the session | Deny rules on installs and on editing manifests | Recommended: also a PreToolUse hook that applies the allowlist check's name test before a commit or push (R164) |
| Release signature | 0005 R120 to R122: the tag, the receipt and the principal | Also a successful deploy of the same commit to the staging environment first (R165) |

What changes in decision 0005:

| 0005 item | Change |
|---|---|
| R119: "For any other run, it SHALL hold `internal`" | Where the task holds `prompted_by`, the origin record adds `prompted by public issue #<n>` and that source's tier (R161). The tier still comes from `sources`, never from the issue |
| "Release signatures by tier", row "What the human does": "Reviews in staging (`sandbox`)" | The release check confirms that staging received the commit first (R165). It cannot confirm that the signer looked |
| R121: "THE release check SHALL pass on the first tag that meets R120 to R122" | It passes on the first tag that meets R120 to R122 and R165 |
| "Receipt" example lines | Add a VALIDATOR line and the `prompted by` form of ORIGIN |
| R125's `signals` entries | Unchanged. A drift redeploy entry is an option for later (owner decision 14) |

What changes in decision 0004: R64 gains the optional key `prompted_by` (R160). Its principle on untrusted text names "Issues, comments, docs and URLs". The video adds customers and agents. Neither starts a run under R83, R84 and R125 (inference), so 0006 proposes adding both words and no requirement.

What changes in decision 0002: slice 1's R45 predicate gains a validator record, which the build job copies from the validator job (R149). R55's receipt gains a VALIDATOR line (R153). Its MODEL line stays `not recorded`, because that line names the coding agent's model (D05).

What changes in the signed spec, once approvers sign it:

| Requirement | Change |
|---|---|
| SPEC-001-R41 | Unchanged. R151 widens it: the ruleset also requires `validator`, and no workflow other than `pipeline.yml` may define a job named `validator` |
| SPEC-001-R8 | Only under owner decision 16 (a): the iac check also covers `infra/security`. Its failure line is unchanged |
| SPEC-001-R1 | Unchanged. `validator`, `drift` and `freeze` sit outside the ordered fifteen |

What changes in `docs/`:

| File | Change |
|---|---|
| `docs/deviations.md`, D27 | It says "No human reads or strips an issue first". The video shows an engineer who reads the issue against the specs before writing a spec change. Proposed wording: "No human strips an issue for an agent. An engineer may read it to decide on a signed spec change" |
| `docs/slide-reconciliation.md` | Rows R08, R23, R34, R35, R36 and R38 point to 0006. R38's "applied by the pipeline" becomes "applied by a person with the break-glass role" |
| `docs/video-reconciliation.md` | New: one row per claim, V01 to V19 |

## G1. AI checks that can only fail (V07, V08; slide R23)

The independent validator comes first. A later AI check would reuse these requirements under its own name, as an owner decision when one is proposed.

| Element | Proposed | Requirement |
|---|---|---|
| Where it runs | A `validator` job in `pipeline.yml` that needs `checks`, so it starts after the deterministic checks. Owner decision 1 weighs a step in the checks job instead | R144 |
| What runs | A deterministic script that makes one model call with no tools. It is not Claude Code, and it has none of the coding agent's session, token or tools | R144 |
| Token and network | `contents: read` to check out, and `id-token: write` for the model role only. The model call runs under `srt` with only the model endpoint | R144 |
| Inputs | The prompt file, each cited requirement's row at the merge base, and the range's diff. No commit message, task body or builder reasoning | R145 |
| Output | One JSON record: `verdict` (`pass` or `fail`), a `reason` from a fixed list, and the cited `requirement`. Any other complete reply is a fail with reason `invalid-output` | R146 |
| A fail | Fails the job with one line and adds the change key to the fail store. Each record, pass or fail, is stored under its commit SHA with its task and run ref | R147 |
| A rerun, or the agent's next attempt with the same change | The change key is looked up before any model call. A stored fail fails again, with the same line | R148 |
| A pass | Changes nothing. The build job needs the validator, but no job reads its pass to accept or skip anything. The deterministic checks alone decide acceptance | R149 |
| No complete reply | Where the policy sets `on_error` to `fail`, a timeout, an error status or a cut-off reply fails the check and stores nothing | R150 |
| The fail store cannot be read or written | Fails whatever `on_error` says, and makes no model call after a failed read | R192 |
| Deleting a fail | Only break-glass may delete items, set a TTL or delete the table (owner decision 8 (a)) | R193 |
| Repeated fails on one task | Once a task file has `validator.max_fails_per_task` fails, no model call until an approver changes it (owner decision 9) | R194 |
| `main` | The ruleset requires `validator` beside `checks` | R151 |
| A push to `main` | No model call. The job carries forward the record the candidate run stored for that commit (owner decision 27) | R191 |
| Override | Only an approver-signed override commit at the tier the policy sets | R152 |
| Receipt | A VALIDATOR line: verdict, reason, model identifier, prompt digest and change key, and the override if any | R153 |

### A model's verdict is not deterministic

A model's verdict is not deterministic. A request samples at the default `temperature` of 1.0, and "No other setting replaces it" (Anthropic, API migration 2026-10-21). So a failing change may pass on a rerun (inference). If a rerun could clear a fail, the change could be retried until the model passed it. The validator would then no longer only fail.

The sticky failure is what keeps "can fail, never pass" true under retries. It binds the same change. The first fail for a change key fails every later run with that key, without a model call. Any other edit, even a comment, makes a new key and re-samples. So R194 caps fails per task file (owner decision 9). Only an approver signature clears a fail, and the receipt records who.

| Case | Outcome | Why |
|---|---|---|
| The same change, rerun | Fails with the same line, and no model call | R148 |
| The same change on a new base that leaves its changed lines alone | Fails | `-U0` leaves out context lines, and `--stable` ignores line numbers |
| The same change with whitespace edits inside its changed lines | Fails | `--stable` ignores whitespace within each line |
| Any other edit, such as a comment, or a reindented or blank line elsewhere | A fresh verdict, until R194's cap | It adds lines to the diff, so it is a different change |
| A different change for the same task | A fresh verdict, until R194's cap | Stickiness binds content. R194 counts fails per task file |
| A key or record that a candidate's own workflow writes to the store | That content fails, a human's fix included | The role can add keys, never delete them (R193). R148 prints only a stored reason and requirement that validate. A forged key never passes a change, but it can block anyone's (inference) |
| A pass | Nothing changes | The deterministic checks still decide |
| An override | Passes, and VALIDATOR names the approver and the commit | R152, R153 |
| A push to `main` | Carries forward the candidate's record, with no model call | R191 |

### Why it sits outside the ordered fifteen

SPEC-001-R1 requires an identifier "the same on every run against the same tree". A model's first verdict on a tree is not. 0004's R68 already places `task` and `scope` outside the fifteen. The validator joins them, and R1 stays unchanged.

### Writes and network

The brief asks for no network beyond the model endpoint and no write access. The drafts apply that to the model call, which runs under `srt` with one endpoint. The steps around it reach STS and the fail store, and they add a key and a record. Inference: a failure that outlives the run needs one write outside the run. Whether the validator job makes that write, or a later job that runs no repository code makes it, is owner decision 28. The drafts follow its recommendation, (a).

### Trust before the signer moves out of reach

Until 0002 Phase 3, the candidate commit defines its own `pipeline.yml`. It could replace the `validator` job with one that passes, as it could today with `checks` (SPEC-001, "Checks before `main`"). R151's test sits in the same tree. So the validator becomes a check of record only when 0004 R109 runs it from `main`'s code in the signer repository. Until then it is a check in the same sense as every other check here.

## G2. A security account and a drift monitor (V18; slide R34, R35, R36, R38; P34, P39)

| Element | Proposed | Requirement |
|---|---|---|
| Accounts | A security account beside the management and workload accounts (owner decision 10) | none |
| Isolation | The SCP on the workload account denies every principal there, other than service-linked roles, any action on a security-account resource | R154 |
| Trust into the security account | No OIDC or SAML provider there, and no trust or resource policy for an outside principal, other than public reads of the drift report | R197 |
| Reading the workload | The drift-read role. Only the monitor's role may assume it, it may only read the export function, and the SCP denies it every write | R155 |
| Production code | `CodeSha256` against the digest that `pipeline.yml@refs/heads/main` attested for the newest commit on `main` whose `deploy` job succeeded. The Actions API gives that commit, not deployment records, which any workflow with `deployments: write` can create | R156 |
| Function configuration | `Handler`, `Runtime`, role name, `Layers` and `Environment` against `infra/sandbox/function.json` at that commit | R196 |
| A failed read | No report for that run, so the freeze fails closed once the last report is stale | R195 |
| Pipeline and spec files | The signatures check over `main`'s history, with check code the monitor pins rather than `main`'s | R157 |
| Notify | Each finding's line goes to an SNS topic in the security account | R156, R157 |
| Freeze | Where `drift.freeze` is on, the deploy workflow needs a current signed drift report with no open finding, other than code findings an approver has cleared | R158, R159 |

| Account | Holds | Who can write there |
|---|---|---|
| Management | The organization, SCPs and the `infra/org` state | The owner |
| Workload | The export Lambda, `export_jobs`, the `infra/sandbox` state bucket, and the deploy, triage, probe and break-glass roles. Proposed here: the validator role, the fail store and the drift-read role | The deploy role for the workload and its state; break-glass for identities |
| Security (new) | The monitor and its role, the SNS topic, the KMS signing key and the drift report | The owner. No workload principal (R154), and no outside principal by trust (R197) |

### The monitor never changes production, and nothing redeploys over break-glass (P34, P39 and slide R34)

Slide R34 says a production change with no attested run "is redeployed". P39 says the monitor "never changes prod itself, or it becomes a second principal". P34 says break-glass is alarmed and "nothing redeploys over it", and slide 11 gives break-glass "alarm + notify", not a redeploy. A break-glass change is also a production change with no attested run, so R34 and P34 conflict for it.

0006 keeps all three under owner decision 26 (a). The monitor holds read access only (R155). Every code finding freezes deploys, `main`'s tip included. An approver clears one by listing its ID in the policy's `drift.cleared`. Then the pipeline redeploys `main`'s tip, which restores the attested artifact (R159). So nothing redeploys over a break-glass change until a person decides.

Who starts that deploy is owner decision 14. (a) The owner does: under decision 26 (a), the clearance commit's own push deploys `main`'s tip. (b) Later, a `signals` entry that two approvers signed (0005 R125) maps the drift alarm to a redeploy. 0006 recommends (a) now, with (b) drafted alongside 0005 Phase IV.

### How findings clear

| Finding | Clears when | Why |
|---|---|---|
| Code | `CodeSha256` and the configuration again equal what was attested | The redeploy restores them, once an approver has cleared the finding (R159) |
| History | Never, while `main`'s history holds the unsigned commit | The signatures check reads all history, as slide row R36 and P33 already note. Only a history rewrite clears it |

### Scenarios the brief asks for

B61 is a production change with no attested run, and B79 a configuration change under the attested code. B62 is a pipeline file changed outside the signed history. B59, B60, B63, B64, B78 and B80 cover isolation, the read-only role, the freeze, a failed read and trust into the security account.

## G3. DAST (V07; slide R08)

| Option | What it needs | Effect |
|---|---|---|
| (a) A `dast` check against a deployed non-production endpoint | A function URL with `AuthType` `AWS_IAM` in a new environment, and the deploy role's `NoPublicLambda` deny loosened for it. An OpenAPI definition for ZAP's API scan, which "runs an Active Scan against the URLs found". A ZAP image pinned by digest, the first container image here (slide R31). Requests signed with SigV4 | Failure line `CHECK dast FAILED: <ZAP rule ID>`, from a rule file that sets listed rules to FAIL. ZAP exits 1 on "At least 1 FAIL" |
| (b) Record that DAST does not apply | Nothing in code | Slide R08 stays not covered, with the reason. The video drops its DAST chip |

0006 recommends (b). The export service has no HTTP surface. Its handler takes `body` and `isBase64Encoded` (`src/handler.ts` lines 5 to 8), and only the Lambda Invoke API reaches it. Inference: that is AWS's API, not the application's. Option (a) builds an HTTP surface only so that a scanner can test it, and loosens an explicit deny to do so. The in-process tests already send malformed bodies (SPEC-014-R5). That is not DAST, so slide R08 stays not covered.

If the owner picks (a), a later decision drafts its requirement, scenario and infrastructure proposal. 0006 reserves no IDs for it.

## G4. The origin of work an issue prompted (V16)

Under 0005 R119, the video's T-0043 receipt would read `internal`, and the issue's number would be lost.

| Option | ORIGIN for T-0043 | Needs |
|---|---|---|
| (a) An optional `prompted_by` key in the task file | `internal  tier 0  prompted by public issue #4821  tier 2` | R160 and R161. `tasks/` protected, so the engineer's key is signed with the task (0004 owner decision, recommended there) |
| (b) Keep R119 | `internal  tier 0` | A Video correction: T-0043's receipt reads `internal` |

0006 recommends (a). The notes' fourth containment control asks for "Provenance on the receipt: records that the change originated from untrusted input". The `sources` table already defines `public issue` at tier 2, which R119 never emits. Under (a) it does.

The issue's text never enters the task. R160 accepts only `public issue #<n>`, so no title or quote fits. The engineer writes the task body. 0005 recommends reserving tier 1 for customer text pasted verbatim, an open owner decision there. The driver passes no issue text to the Phase D producer (0004 R92, 0005 R127). A cloud task session differs. Its settings deny neither `WebFetch` nor `gh`, so it can read the issue that `prompted_by` names. Deny rules would be a tripwire only (Not yet verified).

```text
ORIGIN  internal  tier 0  prompted by public issue #4821  tier 2
TRIGGER task session on candidate/TASK-0043, as reported
```

## G5. A schema for public issues (V13)

| Option | What it is |
|---|---|
| (a) No schema | The whole issue is notes for people. Video correction: the issue card's "notes: quarantined" changes |
| (b) An issue form and a field check | Dropdown answers that validate become labels. The rest is notes, which the Phase D producer never receives. Triage stays as 0004 R93 freezes it |
| (c) (b), and the driver passes a named issue's kept fields to the producer as data | As 0005 R127 does for telemetry. Needs `prompted_by` (G4) |
| (d) (b), and the triage agent reads only the kept fields | The agent then adds nothing a fixed map cannot. B9 loses its subject |

0006 recommends (b).

| Element | Under (b) |
|---|---|
| The form | `.github/ISSUE_TEMPLATE/issue.yml`, with dropdowns for fields and one textarea for notes. Its fields are owner decision 20 |
| Why validate after submit | Issue forms do not bind the API. A form becomes Markdown in the body, and its author can edit it. Users with write access still see a blank issue option |
| Who validates | A field job in a new `issue-fields.yml`, on `opened` and `edited`, for every author. It calls no model, so issue text cannot instruct it (inference) |
| What it keeps | A heading that is a dropdown label, with a value from that dropdown's options. Anything else is notes (R162) |
| What it writes | Labels `<dropdown id>:<value>` only. It stores, echoes and forwards no notes (R162) |
| Its permissions | `contents: read` and `issues: write`, with no secret and no `id-token` (R163) |
| Triage | Unchanged and label-only (0004 R93). It still reads members' whole issues, as the quarantined reader that 0005 defines for telemetry |
| Notes | The rest of the body. The Phase D producer gets no issue text (0004 R92, 0005 R127). A cloud task session can still fetch the issue (G4), so notes are kept from the agent only where the runner produces |

## G6. A dependency allowlist inside the session (V05)

Deny rules alone enforce "Dep allowlist" in the session today. They refuse `npm`, `pnpm` and `yarn` installs, and `Edit` on `package.json`, `package-lock.json` and `allowed-deps.txt`. The `security-event` hook logs an install attempt and returns 0. No hook reads `allowed-deps.txt`. No hook runs the allowlist check. It runs in the pipeline and wherever `npm run checks` runs, over tracked manifests only (SPEC-001-R3, B6). A Node script can still write `package.json`, since deny rules do not cover a script that opens files itself.

| Option | Catches | Misses |
|---|---|---|
| (a) An edit-time `PostToolUse` hook on `Edit\|Write` | Nothing for `package.json`, because `Edit` there is already denied | Writes by Bash and by scripts, which `Edit\|Write` hooks never see |
| (b) A commit-time `PreToolUse` hook on Bash that reads what a commit could include, as `gitleaks-staged` does | Each `package.json` in the working tree, tracked or not, and each staged `package.json` blob. It runs before a command that mentions `commit`, or runs `git am`, `merge`, `cherry-pick`, `revert`, `rebase` or `push` | A script that commits by itself, and content a merge or cherry-pick brings in |
| (c) Relabel the video's chip | Nothing new | Everything the deny rules miss |

0006 recommends (b), R164. It is a tripwire, like SPEC-001-R39: the pipeline's allowlist check stays the control. Hooks apply only in single-repository sessions outside project threads (0004, "Cloud sessions as the producer"). 0004 task F08 requires task sessions to run that way. A failed in-session check shows its line to the agent, which fixes the change, as the `expect-expect` hook already does.

## G7. A staging environment for the release signer (V10)

No environment is named staging. GitHub environments are `sandbox` and `probe`, each deployable from `main` only. While the repository is public, each `sandbox` deploy waits for the owner's approval as required reviewer, a gate. While it is private, deploys stop at the attestation check (`github.sh` line 159). 0005 already calls `sandbox` staging: "Reviews in staging (`sandbox`)". No production environment exists either.

| Option | What it is |
|---|---|
| (a) `sandbox` is the staging environment | The release check confirms a successful `sandbox` deploy of the same commit before the tag was signed (R165). `production` stays a tier for adopters |
| (b) A new `staging` environment | A second environment, and perhaps a second workload account, each with its own deploy role, trust and SCP. An infrastructure proposal under `proposals/infra/` |
| (c) A Video correction only | "checks staging" becomes "checks the change in sandbox" |

0006 recommends (a). While the repository is public, every `main` push reaches `sandbox` once the reviewer approves. So the signer can review the tip there (0005, "Consequences"). While it is private, deploys stop at attestation, and R165 cannot pass (inference). R165 makes the deploy checkable, not the review. Whether the signer looked stays a human act, which the signature attests: a gate.

R165 reads the deploy job's conclusion from the Actions API, as R156 does. It also refuses a tier whose staging environment is its own target. Otherwise a tier on `sandbox` with `release_signers` could never deploy, because R123 limits it to tag pushes.

## Plan

Five stages, each after the phases of 0002, 0004 and 0005 that it needs. Each stage lands as one batch whose last commit is approver-signed and carries a `Spec:` trailer. No stage removes a human approval.

| Stage | Delivers | Needs |
|---|---|---|
| 1. In-session and issue checks | R162 to R164 and R166; scenario rows R185 to R187 and R189; B67 to B69 and B71 | Nothing beyond today |
| 2. Validator | R144 to R153 and R191 to R194; scenario rows R167 to R176 and R198 to R203; B49 to B58 and B72 to B77 | 0002 Phase 1 (slice 1's predicate and receipt). 0004 Phase A (task files and R68). The owner's decisions 1 to 9, 27 and 28, and the fail store applied. A check of record only from 0004 R109 |
| 3. Issue provenance | R160 and R161; scenario rows R183 and R184; B65 and B66 | 0004 Phase A, with `tasks/` protected. 0005 Phase I (ORIGIN) |
| 4. Security account and drift | R154 to R159 and R195 to R197; scenario rows R177 to R182 and R204 to R206; B59 to B64 and B78 to B80 | The owner's decisions 10 to 16 and 26, a new account the owner creates, and 0002 Phase 1's policy file for the `drift` block |
| 5. Release staging | R165; scenario row R188; B70 | 0005 Phase III |

### Staged spec text

The review copy goes in `proposals/video-alignment/`, laid out as `proposals/phase-1/` is: `LAND.txt`, a full `SPEC-001-delivery-pipeline.md` and `traceability.md`. The copy builds on phase-1's copy, not on `specs/`, because R149 and R153 extend slice 1's R45 and R55. Its intro names the 0004 and 0005 IDs it cites as drafts, as phase-1's Receipt intro does for 0002. It also carries SPEC-001-R190's row, which phase-1's copy holds for the deploy-tip batch since `689bb30`, so that landing it after phase-1 keeps R190.

The review copy does not land as one batch. SPEC-001's trace check needs a test whose title names each requirement ID in `specs/` (SPEC-001-R11 (b)). So the spec text lands with its implementation. Each stage's rows land in their own batch, `proposals/video-alignment-<stage>/`, beside that stage's tests and code. If phase-1's copy changes first, `land.sh`'s staleness check flags the copy, and it is rebuilt.

### Tasks

Task IDs use the prefix W, unused in `docs/` and `proposals/`. Protected files are staged in each batch at their repository path. A `specs/` file sits at the batch root, and `.github/` and `.claude/` paths become `github-<dir>/` and `claude-<dir>/`, as `CLAUDE.md` says.

| ID | Stage | Task | Files | Protected | Verified by |
|---|---|---|---|---|---|
| W01 | docs | Video reconciliation: one row per claim, V01 to V19 | `docs/video-reconciliation.md` | no | 19 rows, each with a status and evidence |
| W02 | docs | Review copy of the spec text | `proposals/video-alignment/` | staged | a `diff` against phase-1's copy shows only 0006's rows and amendments |
| W03 | docs | Slide rows R08, R23, R34, R35, R36 and R38 point to 0006 | `docs/slide-reconciliation.md` | no | read |
| W04 | docs | D27 reworded. 0005's header gains "Superseded in part by 0006" for R119, R121's pass rule, the "Release signatures by tier" row and the "Receipt" example lines | `docs/deviations.md`, `docs/decisions/0005-signatures-and-triggers.md` | no | read |
| W05 | 1 | Spec rows R162 to R164 and R166, and scenario rows R185 to R187 and R189 | `proposals/video-alignment-1/` | yes | trace passes once W06 to W09 name each ID in a test title |
| W06 | 1 | Issue form with dropdowns and one notes textarea | `.github/ISSUE_TEMPLATE/issue.yml` | yes | GitHub renders it on a test issue |
| W07 | 1 | Field check, `issue-fields.yml`, and the workflows rule `issue-fields-label-only` | `scripts/ci/issue-fields.ts`, `.github/workflows/issue-fields.yml`, `scripts/checks.ts`, `test/issue-fields.test.ts` | yes, except the test | one test per R162 case; `npm run check:workflows` |
| W08 | 1 | Hook `allowlist-staged` and its settings entry | `.claude/hooks/hook.mjs`, `.claude/settings.json`, `test/hook.test.ts` | yes, except the test | a hook test with a `package.json` a script wrote |
| W09 | 1 | Harness modes `hook-verify` and `single-check`; the mode check in `test/scenarios.test.ts`; B67 to B69 and B71 | `scenarios/run.ts`, `scenarios/scenarios.yaml`, patches and fixtures, `test/scenarios.test.ts` | `run.ts` only | `npm run scenarios -- B67` and the same for B68, B69 and B71 |
| W10 | 1 | Map B67 and B68 to P15, B69 to P18 and B71 to P01; traceability rows | `practices.yaml`, `video/explanations.yaml`, `docs/practices.md`, `traceability.md` | no | slides and test checks |
| W11 | 1 | Approver lands Stage 1 | W05 to W10 | yes | `npm run checks` and `npm run scenarios` pass on `main` |
| W12 | 2 | Owner decisions 1 to 9, 27 and 28 | this decision | owner only | recorded in a "Decided by the owner" section |
| W13 | 2 | Spec rows R144 to R153 and R191 to R194, and scenario rows R167 to R176 and R198 to R203. R151 widens R41, whose text is unchanged. Slice 1's R45 and R55 amended | `proposals/video-alignment-2/` | yes | trace passes once W15 to W19 name each ID |
| W14 | 2 | Validator role and fail store; SCP statements that deny item deletes, TTL changes and table deletion on the store (R193) | `proposals/infra/sandbox/iam.tf`, `proposals/infra/sandbox/main.tf`, `proposals/infra/org/main.tf`, built on `main`'s `infra/` files from `6aa9297`, which landed D25's staged copies | yes; the owner applies | `npm run check:iac`; `test/validator.test.ts` reads the Terraform |
| W15 | 2 | Validator script, prompt file, and the policy's `validator` block | `scripts/ci/validator.ts`, `scripts/ci/validator-prompt.md`, `specs/receipt-policy.json`, `test/validator.test.ts` | yes, except the test | one test per identifier in R145 to R148, R150, R152 and R191 to R194 |
| W16 | 2 | The `validator` job; the build job needs it and copies its record; workflows rules `validator-isolation` and `validator-wiring`, with R149's status-function rule | `.github/workflows/pipeline.yml`, `scripts/checks.ts`, `test/checks.test.ts` | yes, except the test | `npm run check:workflows` |
| W17 | 2 | The ruleset requires `validator` | `scripts/bootstrap/github.sh`, `test/checks-before-main.test.ts` | yes, except the test | a stub-`gh` test of the ruleset body |
| W18 | 2 | The VALIDATOR receipt line | `scripts/receipt.ts`, `test/receipt.test.ts` | yes, except the test | a snapshot of the rendered line |
| W19 | 2 | Harness mode `validator-verify`, the `receipt-verify` predicate fixture, and B49 to B58 and B72 to B77 | `scenarios/run.ts`, `scenarios/`, `test/scenarios.test.ts` | `run.ts` only | `npm run scenarios -- B49` to `-- B58`, and `-- B72` to `-- B77` |
| W20 | 2 | Map B49 to B51, B55, B56 and B74 to P22; B52 to B54, B72, B73 and B75 to B77 to P45; B57 to P48; B58 to P21 | `practices.yaml`, `video/explanations.yaml`, `docs/practices.md`, `traceability.md` | no | slides and test checks |
| W21 | 2 | Approver lands Stage 2; the owner applies W14 | W13 to W20 | yes | real failing runs confirm B51 to B53's lines |
| W22 | 3 | Spec rows R160 and R161, and scenario rows R183 and R184; R64 and R119 amended | `proposals/video-alignment-3/` | yes | trace passes once W23 names each ID |
| W23 | 3 | The task check accepts `prompted_by`; ORIGIN shows it | `scripts/checks.ts`, `scripts/receipt.ts`, `test/checks.test.ts`, `test/receipt.test.ts` | yes, except the tests | one test per identifier in R160 and R161 |
| W24 | 3 | B65 in `task-verify` and B66 in `receipt-verify`; map B65 to P15 and B66 to P21 | `scenarios/`, `practices.yaml`, `traceability.md` | no | `npm run scenarios -- B65` and `-- B66` |
| W25 | 3 | Approver lands Stage 3 | W22 to W24 | yes | checks and scenarios pass on `main` |
| W26 | 4 | Owner decisions 10 to 16 and 26 | this decision | owner only | recorded |
| W27 | 4 | The owner creates the security account | AWS Organizations | owner only | its ID in the owner's Terraform variables |
| W28 | 4 | Terraform: the security root (monitor, role, topic, signing key, report), the drift-read role, `infra/sandbox/function.json` read by `main.tf`, and the SCP's isolation statement | `proposals/infra/security/`, `proposals/infra/sandbox/iam.tf`, `proposals/infra/sandbox/main.tf`, `proposals/infra/sandbox/function.json`, `proposals/infra/org/main.tf`, built on `main`'s `infra/` files from `6aa9297` | yes; the owner applies | `npm run check:iac`; `test/drift.test.ts` |
| W29 | 4 | Monitor code for the code and history comparisons | `infra/security/monitor/`, `test/drift.test.ts` | yes, except the test | one test per identifier in R156, R157 and R195 to R197 |
| W30 | 4 | The freeze check in the deploy workflow; the policy's `drift` block | `scripts/checks.ts`, `.github/workflows/pipeline.yml`, `specs/receipt-policy.json`, `test/checks.test.ts` | yes, except the test | one test per identifier in R158 and R159, with and without `drift.cleared` |
| W31 | 4 | Harness mode `drift-verify`; B59 to B64 and B78 to B80. Map B59 and B80 to P35, B60 to P39, B61, B78 and B79 to P31, B62 and B63 to P32, B64 to P33 | `scenarios/`, `practices.yaml`, `traceability.md` | `run.ts` only | `npm run scenarios -- B59` to `-- B64`, and `-- B78` to `-- B80` |
| W32 | 4 | Approvers land Stage 4; the owner applies W28 | W28 to W31 | yes | the owner makes one change with break-glass in `sandbox`. It raises a code finding, and the freeze then acts as owner decision 26 chose |
| W33 | 5 | Spec row R165 and scenario row R188; the release check's staging test; B70 in `release-verify`, mapped to P45 | `proposals/video-alignment-5/`, `scripts/checks.ts`, `test/release.test.ts`, `scenarios/` | yes, except the test | `npm run scenarios -- B70` |
| W34 | 5 | Approvers land Stage 5 with 0005 Phase III | W33 | yes | a release tag on a commit whose `sandbox` deploy failed fails the release check |

The agent cannot sign, so it cannot run these scenarios against a protected batch before it lands. Each stage's last task runs them on `main`, as in 0004 and 0005.

## Draft requirements

Each row holds one behaviour and exactly one failure line. Scenario rows R167 to R189 and R198 to R206 are written out in full. `validator`, `drift` and `freeze` print the same prefix as every check. Each also needs a `check:<name>` script where it runs locally, as 0004's F05 adds for `task` and `scope`.

The drafts follow each owner decision's recommendation. Under another option, the drafts this table names change, and the decision's row says how where it can.

| Decision | Drafts that follow its recommendation |
|---|---|
| 1. Where the validator runs | R144, R149, R151 |
| 2. Model and endpoint | R144's `validator.endpoint`; W14's role |
| 3. A failed model call | R150 |
| 4. Reason codes | R146; B52 and B53's lines |
| 5. Override | R152, R153 |
| 6. Budget | R150's `validator.max_seconds` |
| 7. The change key | R148, R191; the term change key |
| 8. The fail store | R147, R148, R192, R193 |
| 9. Repeated fails on one task | R194 |
| 10 to 12. Account, detector and channel | R154 to R157, R195 to R197 |
| 13. Freeze and transport | R158, R159 |
| 15. What else the monitor compares | R196 |
| 16. Where the monitor lives | SPEC-001-R8's amendment; R197's `infra/security/` |
| 18. Origin of issue-prompted work | R160, R161 |
| 19 to 21. Issue schema, fields and authors | R162, R163 |
| 22. Allowlist in the session | R164 |
| 23. Staging | R165 |
| 26. Break-glass and redeploys | R159's `drift.cleared` |
| 27. The validator on `main` | R147's record by commit SHA, R191 |
| 28. Who writes the fail store | R144's permissions, R147 |

| ID | Requirement |
|---|---|
| SPEC-001-R144 | WHEN the workflows check reads `pipeline.yml`, THE workflows check SHALL require a job named `validator` that needs `checks` and has no `if:`. Its job permissions SHALL be exactly `contents: read` and `id-token: write`. It SHALL name no environment, read no `secrets` context, check out with `persist-credentials: false` and use no cache. No step SHALL run `claude` or use `anthropics/claude-code-action`. The step that calls the model SHALL run under `srt`, with an egress allowlist holding only the policy's `validator.endpoint`. IF any of these fails, THEN THE workflows check SHALL print `CHECK workflows FAILED: validator-isolation`. |
| SPEC-001-R145 | WHEN the validator check builds its model request, THE validator check SHALL put in it only the text of `scripts/ci/validator-prompt.md`, the cited requirements' rows and the range's diff. Each row SHALL be as its spec file holds it at the merge base with `main`. The diff SHALL run from that merge base to the range's tip. IF the request holds other text, such as a commit message, the task body or an `Agent:` trailer, THEN THE test check SHALL print `CHECK test FAILED: test/validator.test.ts`. |
| SPEC-001-R146 | WHEN the model call returns a complete reply (R150), THE validator check SHALL accept it only IF it is one JSON object with exactly the keys `verdict`, `reason` and `requirement`. For a `fail`, `reason` SHALL be in the policy's `validator.reasons` and `requirement` SHALL be a cited requirement. For a `pass`, both SHALL be `none`. IF a complete reply is anything else, THEN THE validator check SHALL treat it as the fail record `invalid-output none` under R147, and so print `CHECK validator FAILED: invalid-output none`. |
| SPEC-001-R147 | WHEN the validator check holds a record on a `candidate/**` ref, THE validator check SHALL store it in the fail store under the tip's commit SHA. It SHALL store with it the change key, the task ID or `none`, the task file's SHA-256 and the run's ref. For a fail, it SHALL also add the change key with the reason, the requirement, the task ID and that SHA-256. Once the store holds a fail, it SHALL print `CHECK validator FAILED: <reason> <requirement>`. |
| SPEC-001-R148 | WHEN the validator check starts on a `candidate/**` ref, THE validator check SHALL compute the change key and look it up in the fail store before any model call. IF the store holds the key and the range's tip names no override for it (R152), THEN it SHALL make no model call. It SHALL print `CHECK validator FAILED: <stored reason> <stored requirement>`. A stored reason not in `validator.reasons`, or a stored requirement that is not a requirement ID, SHALL print as `invalid-output none`. |
| SPEC-001-R149 | WHEN the workflows check reads `pipeline.yml`, THE workflows check SHALL require the build job to need the validator job. The build job's `if:`, where it has one, SHALL call none of the status check functions `success()`, `always()`, `failure()` and `cancelled()`. The build job SHALL copy the validator record into the SPEC-001-R45 predicate. No other job SHALL read the validator job's outputs or result. IF any of these fails, THEN THE workflows check SHALL print `CHECK workflows FAILED: validator-wiring`. |
| SPEC-001-R150 | WHERE `validator.on_error` is `fail`, IF the model call ends with no complete reply, THEN THE validator check SHALL store nothing and print `CHECK validator FAILED: no verdict`. No complete reply means a transport error, an error status or no reply within `validator.max_seconds`. It also means a stop reason other than the end of the model's turn, such as the token limit. |
| SPEC-001-R151 | THE `protect main` ruleset that `scripts/bootstrap/github.sh` applies SHALL require the status checks `checks` and `validator` from the GitHub Actions app. No workflow other than `pipeline.yml` SHALL define a job named `validator`. IF either fails, THEN THE test check SHALL print `CHECK test FAILED: test/checks-before-main.test.ts`. |
| SPEC-001-R152 | WHERE the fail store holds the change key, THE validator check SHALL pass only IF the range's tip is an override commit for that key, or its co-sign (R115). An override commit SHALL have one parent and that parent's tree. Its message SHALL end with exactly one `Validator-Override: <change key>` trailer. Its signature SHALL pass SPEC-001-R12's verification and flags, with `approvers.txt` and `REQUIRED_SIGNATURE_FLAGS` as of its parent. It SHALL meet the tier that `validator.override_signers` sets (R115, R116). IF the tip names the key but fails any of these, THEN it SHALL print `CHECK validator FAILED: override not approved for <change key>`. |
| SPEC-001-R153 | WHEN the receipt check renders a receipt, THE receipt SHALL show one VALIDATOR line from the verified predicate's validator record. It SHALL show the verdict, the reason and requirement, the policy's `validator.model`, the prompt file's SHA-256 and the change key. WHERE an override commit passed the check, it SHALL add `overridden by <principal> <commit>`. IF the predicate holds no validator record with these fields, THEN THE receipt check SHALL print `CHECK receipt FAILED: missing validator record`. |
| SPEC-001-R154 | THE SCP in `infra/org/main.tf` that attaches to the workload account SHALL deny every principal there, other than service-linked roles, every action on a resource whose `aws:ResourceAccount` is the security account. IF it does not, THEN THE test check SHALL print `CHECK test FAILED: test/drift.test.ts`. |
| SPEC-001-R155 | THE workload account SHALL hold one role for the drift monitor, `who-gets-the-keys-drift-read`. Its trust policy SHALL name only the monitor's role in the security account. It SHALL allow only `lambda:GetFunction` and `lambda:GetFunctionConfiguration` on the export function. The SCP SHALL deny it every action whose name does not begin with `Get`, `List` or `Describe`. IF any of these fails, THEN THE test check SHALL print `CHECK test FAILED: test/drift.test.ts`. |
| SPEC-001-R156 | WHEN the drift monitor runs, THE drift check SHALL read the export function's `CodeSha256` through `who-gets-the-keys-drift-read`. It SHALL find the newest commit on `main` whose `pipeline.yml` push run on `refs/heads/main` has a `deploy` job that concluded `success`, as the Actions API reports it. It SHALL NOT take that commit from deployment records. It SHALL then find the artifact digest that `pipeline.yml@refs/heads/main` attested for that commit. IF the two digests differ, or no such attestation verifies, THEN it SHALL record a code finding and publish its line to the drift topic. The line SHALL be `CHECK drift FAILED: <function name> runs sha256:<first 12 hex digits> with no attested run`. |
| SPEC-001-R157 | WHEN the drift monitor runs, THE drift check SHALL run the signatures check (SPEC-001-R12) over every commit reachable from `main`. It SHALL use `scripts/checks.ts` from the commit the monitor's configuration pins, not from `main`. IF the signatures check fails, THEN the drift check SHALL record a history finding and publish its line to the drift topic. The line SHALL be `CHECK drift FAILED: <signatures identifier> at <first 12 characters of the failing commit's SHA>`. |
| SPEC-001-R158 | WHERE the policy sets `drift.freeze` to `true`, WHEN the deploy workflow has passed `attestation` and `receipt`, THE freeze check SHALL fetch the monitor's latest drift report before any AWS call. It SHALL verify the report's signature with `drift.public_key` from the policy at `main`'s tip. IF the report is missing, fails verification or is older than `drift.max_age_hours`, THEN THE freeze check SHALL print `CHECK freeze FAILED: no current drift report`. |
| SPEC-001-R159 | WHEN the freeze check holds a current drift report that lists an open finding, THE freeze check SHALL refuse the deploy. WHILE every open finding is a code finding that the policy's `drift.cleared` lists at `main`'s tip, it SHALL still allow a deploy of `main`'s tip. That deploy restores the attested artifact. IF it refuses, THEN it SHALL print `CHECK freeze FAILED: deploys frozen by <finding ID>`, naming the report's first open finding that is not a listed code finding. |
| SPEC-001-R160 | WHERE a task's front matter holds `prompted_by`, THE task check SHALL accept the key only IF its value matches `^public issue #[1-9][0-9]{0,9}$`. R64 SHALL list `prompted_by` as an optional key, beside `needs`. IF the value does not match, THEN THE task check SHALL print `CHECK task FAILED: <ID> invalid prompted_by`. |
| SPEC-001-R161 | WHERE a delivery's task holds `prompted_by`, THE build job SHALL write its origin record (R119) as `internal`, with the tier that `sources` gives `internal`. It SHALL then add `prompted by <prompted_by>`, with the tier that `sources` gives `public issue`. THE receipt's ORIGIN line SHALL show both. For an alarm-started run, R119's origin SHALL stand. IF such a delivery's origin record lacks `prompted by` with the task's value, THEN THE receipt check SHALL print `CHECK receipt FAILED: origin without prompted_by <task ID>`. |
| SPEC-001-R162 | WHEN the field check reads an issue, THE field check SHALL parse its body as the issue form renders it. It SHALL keep a field only IF its heading is a dropdown label in `.github/ISSUE_TEMPLATE/issue.yml` and its value is one of that dropdown's `options`. It SHALL set the issue's field labels to one `<dropdown id>:<value>` label per kept field, and no others. It SHALL treat all other text as notes, and SHALL NOT store, echo or pass on notes. IF it keeps another field or value, or writes anything but those labels, THEN THE test check SHALL print `CHECK test FAILED: test/issue-fields.test.ts`. |
| SPEC-001-R163 | THE field job in `.github/workflows/issue-fields.yml` SHALL run on `issues` events of types `opened` and `edited`, for any author. Its workflow-level `permissions` SHALL be empty, and its job permissions exactly `contents: read` and `issues: write`. It SHALL read no `secrets` context, call no model, and run only `node scripts/ci/issue-fields.ts` after a SHA-pinned checkout with `persist-credentials: false`. IF any of these fails, THEN THE workflows check SHALL print `CHECK workflows FAILED: issue-fields-label-only`. |
| SPEC-001-R164 | WHEN a local Claude Code session runs a Bash command that could write or push a commit, THE `allowlist-staged` PreToolUse hook SHALL apply the allowlist check's name test (SPEC-001-R3). That test is `dependencyNames` and `allowedNames` in `scripts/checks.ts`. Such a command mentions `commit`, or runs `git` with `am`, `merge`, `cherry-pick`, `revert`, `rebase` or `push`. The hook SHALL read every `package.json` in the working tree outside `node_modules/`, tracked or not, and each staged `package.json` blob. IF a dependency name is absent from `allowed-deps.txt`, THEN the hook SHALL exit with status 2 and print `CHECK allowlist FAILED: <name>`. |
| SPEC-001-R165 | WHERE the target environment's tier sets `release_signers`, THE release check SHALL also find a `pipeline.yml` push run on `refs/heads/main` for the deployed commit. Its job that deploys to the tier's staging environment SHALL have concluded `success` before the tag's signed tagger date, as the Actions API reports it, not deployment records. The staging environment SHALL be `sandbox` unless the tier names another, and SHALL differ from the target environment. THE release check SHALL pass only a tag that meets R120 to R122 and this requirement. IF there is no such deploy, or the staging environment is the target environment, THEN THE release check SHALL print `CHECK release FAILED: <tag> not deployed to <staging environment>`. |
| SPEC-001-R166 | WHEN the harness runs a scenario, THE harness SHALL run it in the mode its `run` field names, as the requirement that defines that mode says. The harness modes table in "Scenarios" names that requirement for each mode, and defines the new modes. IF `scenarios/scenarios.yaml` names a `run` mode that `scenarios/run.ts` does not define, THEN THE test check SHALL print `CHECK test FAILED: test/scenarios.test.ts`. |
| SPEC-001-R167 | WHEN the harness runs B49 with a full `npm run checks`, THE first failing check SHALL be `workflows`. Its output SHALL contain `CHECK workflows FAILED: validator-isolation`. |
| SPEC-001-R168 | WHEN the harness runs B50 in `single-check` mode, THE first failing check SHALL be `test`. Its output SHALL contain `CHECK test FAILED: test/validator.test.ts`. |
| SPEC-001-R169 | WHEN the harness runs B51 in `validator-verify` mode, THE first failing check SHALL be `validator`. Its output SHALL contain `CHECK validator FAILED: invalid-output none`. |
| SPEC-001-R170 | WHEN the harness runs B52 in `validator-verify` mode, THE first failing check SHALL be `validator`. Its output SHALL contain `CHECK validator FAILED: untested-requirement SPEC-014-R2`. |
| SPEC-001-R171 | WHEN the harness runs B53 in `validator-verify` mode, THE first failing check SHALL be `validator`. Its output SHALL contain `CHECK validator FAILED: untested-requirement SPEC-014-R2`. |
| SPEC-001-R172 | WHEN the harness runs B54 with a full `npm run checks`, THE first failing check SHALL be `workflows`. Its output SHALL contain `CHECK workflows FAILED: validator-wiring`. |
| SPEC-001-R173 | WHEN the harness runs B55 in `validator-verify` mode, THE first failing check SHALL be `validator`. Its output SHALL contain `CHECK validator FAILED: no verdict`. |
| SPEC-001-R174 | WHEN the harness runs B56 in `single-check` mode, THE first failing check SHALL be `test`. Its output SHALL contain `CHECK test FAILED: test/checks-before-main.test.ts`. |
| SPEC-001-R175 | WHEN the harness runs B57 in `validator-verify` mode, THE first failing check SHALL be `validator`. Its output SHALL contain `CHECK validator FAILED: override not approved for <change key>`. |
| SPEC-001-R176 | WHEN the harness runs B58 in `receipt-verify` mode, THE first failing check SHALL be `receipt`. Its output SHALL contain `CHECK receipt FAILED: missing validator record`. |
| SPEC-001-R177 | WHEN the harness runs B59 in `single-check` mode, THE first failing check SHALL be `test`. Its output SHALL contain `CHECK test FAILED: test/drift.test.ts`. |
| SPEC-001-R178 | WHEN the harness runs B60 in `single-check` mode, THE first failing check SHALL be `test`. Its output SHALL contain `CHECK test FAILED: test/drift.test.ts`. |
| SPEC-001-R179 | WHEN the harness runs B61 in `drift-verify` mode, THE first failing check SHALL be `drift`. Its output SHALL contain `CHECK drift FAILED: who-gets-the-keys-export runs sha256:<first 12 hex digits> with no attested run`. |
| SPEC-001-R180 | WHEN the harness runs B62 in `drift-verify` mode, THE first failing check SHALL be `drift`. Its output SHALL contain `CHECK drift FAILED: unsigned change to .github/ at <first 12 characters of the commit SHA>`. |
| SPEC-001-R181 | WHEN the harness runs B63 in `drift-verify` mode, THE first failing check SHALL be `freeze`. Its output SHALL contain `CHECK freeze FAILED: no current drift report`. |
| SPEC-001-R182 | WHEN the harness runs B64 in `drift-verify` mode, THE first failing check SHALL be `freeze`. Its output SHALL contain `CHECK freeze FAILED: deploys frozen by history-<first 12 hex digits>`. |
| SPEC-001-R183 | WHEN the harness runs B65 in `task-verify` mode, THE first failing check SHALL be `task`. Its output SHALL contain `CHECK task FAILED: TASK-B65 invalid prompted_by`. |
| SPEC-001-R184 | WHEN the harness runs B66 in `receipt-verify` mode, THE first failing check SHALL be `receipt`. Its output SHALL contain `CHECK receipt FAILED: origin without prompted_by TASK-B66`. |
| SPEC-001-R185 | WHEN the harness runs B67 in `single-check` mode, THE first failing check SHALL be `test`. Its output SHALL contain `CHECK test FAILED: test/issue-fields.test.ts`. |
| SPEC-001-R186 | WHEN the harness runs B68 with a full `npm run checks`, THE first failing check SHALL be `workflows`. Its output SHALL contain `CHECK workflows FAILED: issue-fields-label-only`. |
| SPEC-001-R187 | WHEN the harness runs B69 in `hook-verify` mode, THE hook SHALL exit with status 2. Its output SHALL contain `CHECK allowlist FAILED: csv-export-turbo`. |
| SPEC-001-R188 | WHEN the harness runs B70 in `release-verify` mode, THE first failing check SHALL be `release`. Its output SHALL contain `CHECK release FAILED: release/production/3 not deployed to sandbox`. |
| SPEC-001-R189 | WHEN the harness runs B71 with a full `npm run checks`, THE first failing check SHALL be `test`. Its output SHALL contain `CHECK test FAILED: test/scenarios.test.ts`. |
| SPEC-001-R191 | WHEN the validator job runs for `refs/heads/main`, THE validator check SHALL make no model call. It SHALL read the record that R147 stored under the pushed commit's SHA, and take the change key from it. IF the store holds no such record whose verdict is `pass` or whose fail an override cleared (R152), THEN it SHALL print `CHECK validator FAILED: no candidate pass for <first 12 characters of the commit SHA>`. |
| SPEC-001-R192 | IF the validator check cannot read the fail store before the model call, or cannot write a record after it, THEN THE validator check SHALL fail, whatever `validator.on_error` sets. After a failed read, it SHALL make no model call. It SHALL print `CHECK validator FAILED: fail store unavailable`. |
| SPEC-001-R193 | WHERE the fail store is a DynamoDB table, THE Terraform that defines it SHALL give the validator role only `dynamodb:GetItem` and `dynamodb:PutItem` on it. THE SCP SHALL deny every principal but the break-glass role `dynamodb:DeleteItem`, `dynamodb:BatchWriteItem`, `dynamodb:PartiQLDelete`, `dynamodb:UpdateTimeToLive` and `dynamodb:DeleteTable` on the table. IF either fails, THEN THE test check SHALL print `CHECK test FAILED: test/validator.test.ts`. |
| SPEC-001-R194 | WHERE the policy sets `validator.max_fails_per_task`, THE validator check SHALL count the stored fails for the range's task ID and task file SHA-256. It SHALL count them on a `candidate/**` ref, once R148 finds no stored fail for the change key. IF the count has reached that value, THEN it SHALL make no model call and print `CHECK validator FAILED: <task ID> reached <n> fails`. An approver-signed change to the task file gives it a new SHA-256 and a new count. |
| SPEC-001-R195 | IF a read that the drift check needs fails, THEN THE drift check SHALL publish no drift report for that run. Such reads are assuming `who-gets-the-keys-drift-read`, `GetFunction`, `GetFunctionConfiguration`, and each GitHub API or attestation read. It SHALL publish `CHECK drift FAILED: <function name> unreadable` to the drift topic. R158 then fails closed once the last report is older than `drift.max_age_hours`. |
| SPEC-001-R196 | WHEN the drift monitor runs, THE drift check SHALL read the export function's `Handler`, `Runtime`, role name, `Layers` and `Environment` variables through `who-gets-the-keys-drift-read`. It SHALL compare them with `infra/sandbox/function.json` at the commit R156 found, which `infra/sandbox/main.tf` reads for the same values. IF any differs, THEN it SHALL record a code finding and publish `CHECK drift FAILED: <function name> configuration differs in <first differing field>` to the drift topic. |
| SPEC-001-R197 | THE Terraform under `infra/security/` SHALL define no IAM OIDC or SAML identity provider. No role trust policy there SHALL name a principal outside the security account. No resource policy there SHALL grant a principal outside the security account any action, other than `s3:GetObject` on the drift report object. IF any of these fails, THEN THE test check SHALL print `CHECK test FAILED: test/drift.test.ts`. |
| SPEC-001-R198 | WHEN the harness runs B72 in `validator-verify` mode, THE first failing check SHALL be `validator`. Its output SHALL contain `CHECK validator FAILED: no candidate pass for <first 12 characters of the commit SHA>`. |
| SPEC-001-R199 | WHEN the harness runs B73 in `validator-verify` mode, THE first failing check SHALL be `validator`. Its output SHALL contain `CHECK validator FAILED: fail store unavailable`. |
| SPEC-001-R200 | WHEN the harness runs B74 in `validator-verify` mode, THE first failing check SHALL be `validator`. Its output SHALL contain `CHECK validator FAILED: no verdict`. |
| SPEC-001-R201 | WHEN the harness runs B75 in `single-check` mode, THE first failing check SHALL be `test`. Its output SHALL contain `CHECK test FAILED: test/validator.test.ts`. |
| SPEC-001-R202 | WHEN the harness runs B76 in `validator-verify` mode, THE first failing check SHALL be `validator`. Its output SHALL contain `CHECK validator FAILED: TASK-B76 reached 3 fails`. |
| SPEC-001-R203 | WHEN the harness runs B77 with a full `npm run checks`, THE first failing check SHALL be `workflows`. Its output SHALL contain `CHECK workflows FAILED: validator-wiring`. |
| SPEC-001-R204 | WHEN the harness runs B78 in `drift-verify` mode, THE first failing check SHALL be `drift`. Its output SHALL contain `CHECK drift FAILED: who-gets-the-keys-export unreadable`. |
| SPEC-001-R205 | WHEN the harness runs B79 in `drift-verify` mode, THE first failing check SHALL be `drift`. Its output SHALL contain `CHECK drift FAILED: who-gets-the-keys-export configuration differs in Layers`. |
| SPEC-001-R206 | WHEN the harness runs B80 in `single-check` mode, THE first failing check SHALL be `test`. Its output SHALL contain `CHECK test FAILED: test/drift.test.ts`. |

## Scenarios

Each expected line is a draft until a real failing run confirms it, as `scenarios/scenarios.yaml` requires. B49 to B80 have never been used in any file or commit, other than 0006's own drafts. A `<...>` placeholder is recorded from a verified failing run, as SPEC-001's Scenarios section says. Reason codes in B52 and B53 follow owner decision 4's recommendation. The principals `alice@example.com` to `dave@example.com` are 0005's fixtures, with stand-in keys made at run time.

| ID | Scenario | Stage | Check | Expected line | How it runs | Practice | Proves |
|---|---|---|---|---|---|---|---|
| B49 | A `validator` job that runs `anthropics/claude-code-action` with the coding agent's tools | 2 | workflows | `CHECK workflows FAILED: validator-isolation` | Local harness, full `npm run checks`; workflows runs before signatures | P22 | R144 |
| B50 | A request builder that also adds the range's commit messages | 2 | test | `CHECK test FAILED: test/validator.test.ts` | `run: single-check`, because `scripts/ci/` is protected | P22 | R145 |
| B51 | The stub model replies in prose: "Looks fine, pass" | 2 | validator | `CHECK validator FAILED: invalid-output none` | `run: validator-verify`. The harness also asserts the store now holds the key | P22 | R146 |
| B52 | A serializer change for SPEC-014-R2 whose test exercises only R1. The stub replies `fail`, `untested-requirement`, `SPEC-014-R2` | 2 | validator | `CHECK validator FAILED: untested-requirement SPEC-014-R2` | `run: validator-verify`. The harness asserts the store holds the key | P45 | R147 |
| B53 | B52's change again, on a new base that changes a line next to it, with trailing spaces added to a line it already changes. The store holds B52's key, and the stub now replies `pass` | 2 | validator | `CHECK validator FAILED: untested-requirement SPEC-014-R2` | `run: validator-verify`. The harness asserts the stub received no call | P45 | R148 |
| B54 | A build job with `if: always()`, so it builds after a failed validator | 2 | workflows | `CHECK workflows FAILED: validator-wiring` | Local harness, full `npm run checks` | P45 | R149 |
| B55 | A stub endpoint that never replies within `validator.max_seconds` | 2 | validator | `CHECK validator FAILED: no verdict` | `run: validator-verify`. The harness asserts the store holds no key | P22 | R150 |
| B56 | A ruleset body in `github.sh` that requires only `checks` | 2 | test | `CHECK test FAILED: test/checks-before-main.test.ts` | `run: single-check` | P22 | R151 |
| B57 | A stored fail, and an override commit signed by a stand-in key that no `approvers.txt` line holds | 2 | validator | `CHECK validator FAILED: override not approved for <change key>` | `run: validator-verify`, with stand-in keys made at run time | P48 | R152 |
| B58 | A predicate fixture with no validator record | 2 | receipt | `CHECK receipt FAILED: missing validator record` | `run: receipt-verify`, with a predicate fixture | P21 | R153 |
| B59 | The SCP loses its security-account statement | 4 | test | `CHECK test FAILED: test/drift.test.ts` | `run: single-check`, because `infra/` is protected | P35 | R154 |
| B60 | The drift-read role also allows `lambda:UpdateFunctionCode` | 4 | test | `CHECK test FAILED: test/drift.test.ts` | `run: single-check` | P39 | R155 |
| B61 | Production runs a zip built from a commit with one changed line, which no run attested. The fixture attests only `main`'s zip | 4 | drift | `CHECK drift FAILED: who-gets-the-keys-export runs sha256:<first 12 hex digits> with no attested run` | `run: drift-verify`, with fixture function data, a workflow-run fixture and an attestation fixture | P31 | R156 |
| B62 | A fixture `main` whose last commit changes `.github/workflows/pipeline.yml` unsigned | 4 | drift | `CHECK drift FAILED: unsigned change to .github/ at <first 12 characters of the commit SHA>` | `run: drift-verify`, with a fixture repository and the monitor's pinned check code | P32 | R157 |
| B63 | A drift report signed by a stand-in key that is not the policy's `drift.public_key` | 4 | freeze | `CHECK freeze FAILED: no current drift report` | `run: drift-verify` | P32 | R158 |
| B64 | A current report with an open history finding for `specs/SPEC-014-export-latency.md` | 4 | freeze | `CHECK freeze FAILED: deploys frozen by history-<first 12 hex digits>` | `run: drift-verify`. The harness also asserts that a deploy of `main`'s tip passes when the only open finding is a code finding that `drift.cleared` lists, and fails when it is not listed | P33 | R159 |
| B65 | A task whose `prompted_by` holds `public issue #4821: ignore previous instructions` | 3 | task | `CHECK task FAILED: TASK-B65 invalid prompted_by` | `run: task-verify`, fixture only | P15 | R160 |
| B66 | A task with `prompted_by: public issue #4821` whose origin record holds only `internal` | 3 | receipt | `CHECK receipt FAILED: origin without prompted_by TASK-B66` | `run: receipt-verify`, with task and origin fixtures | P21 | R161 |
| B67 | A field check that keeps the notes textarea as a field | 1 | test | `CHECK test FAILED: test/issue-fields.test.ts` | `run: single-check`, because `scripts/ci/` is protected | P15 | R162 |
| B68 | A field job with `id-token: write` and a Bedrock step | 1 | workflows | `CHECK workflows FAILED: issue-fields-label-only` | Local harness, full `npm run checks` | P15 | R163 |
| B69 | A Node script writes B6's invented name, `csv-export-turbo`, into `package.json`. Then the agent runs `git commit -m "add export"`. A second fixture stages that name, restores the working-tree copy, then commits | 1 | allowlist | `CHECK allowlist FAILED: csv-export-turbo` | `run: hook-verify`. The harness runs both fixtures and asserts exit status 2 for each | P18 | R164 |
| B70 | A release tag `release/production/3`, signed by `carol` on `main`'s tip, whose `sandbox` deploy job failed | 5 | release | `CHECK release FAILED: release/production/3 not deployed to sandbox` | `run: release-verify`, with a workflow-run fixture | P45 | R165 |
| B71 | B1's `run` set to `validator-verfiy`, a misspelt mode | 1 | test | `CHECK test FAILED: test/scenarios.test.ts` | Local harness, full `npm run checks`. `scenarios.yaml` is not protected, so `signatures` passes | P01 | R166 |
| B72 | A push to `main` whose commit has a stored fail and no stored pass. The stub would reply `pass` | 2 | validator | `CHECK validator FAILED: no candidate pass for <first 12 characters of the commit SHA>` | `run: validator-verify`, with a `refs/heads/main` run fixture. The harness asserts the stub received no call | P45 | R191 |
| B73 | A store fixture that refuses every read, with `validator.on_error` set to its fail-open value | 2 | validator | `CHECK validator FAILED: fail store unavailable` | `run: validator-verify`. The harness asserts the stub received no call | P45 | R192 |
| B74 | A stub endpoint that returns HTTP 529 with an error body | 2 | validator | `CHECK validator FAILED: no verdict` | `run: validator-verify`. The harness asserts the store holds no key | P22 | R150 |
| B75 | The SCP loses its statement that denies item deletes on the fail store | 2 | test | `CHECK test FAILED: test/validator.test.ts` | `run: single-check`, because `infra/` is protected | P45 | R193 |
| B76 | A store fixture with three fails for `TASK-B76` and its task file's SHA-256, and a new change key. The policy fixture sets `validator.max_fails_per_task` to 3 | 2 | validator | `CHECK validator FAILED: TASK-B76 reached 3 fails` | `run: validator-verify`. The stub would reply `pass`, and the harness asserts it received no call | P45 | R194 |
| B77 | A build job with `if: success() \|\| true`, so it builds after a failed validator | 2 | workflows | `CHECK workflows FAILED: validator-wiring` | Local harness, full `npm run checks` | P45 | R149 |
| B78 | The fixture role returns AccessDenied to `GetFunction` | 4 | drift | `CHECK drift FAILED: who-gets-the-keys-export unreadable` | `run: drift-verify`. The harness asserts no drift report was written | P31 | R195 |
| B79 | A fixture function with an extra layer and the attested `CodeSha256` | 4 | drift | `CHECK drift FAILED: who-gets-the-keys-export configuration differs in Layers` | `run: drift-verify`, with fixture function data and `function.json` | P31 | R196 |
| B80 | `infra/security/` gains an OIDC provider for `token.actions.githubusercontent.com` and a role that trusts it | 4 | test | `CHECK test FAILED: test/drift.test.ts` | `run: single-check`, because `infra/` is protected | P35 | R197 |

Harness modes (R166). R166 defines the first four. Each other mode keeps the meaning its own requirement gives it.

| Mode | What the harness does | Defined by | Used by |
|---|---|---|---|
| `validator-verify` | Runs only the validator check, against a stub model endpoint that returns the scenario's fixture reply or error. The fail store lives in the harness's temporary directory, or is a fixture that refuses reads. A run fixture sets the ref. The harness records each call the stub receives | R166 | B51 to B53, B55, B57, B72 to B74, B76 |
| `drift-verify` | Runs only the drift or freeze check the scenario names. It uses fixture function data, a fixture repository, a workflow-run fixture and drift reports signed with a stand-in key made at run time | R166 | B61 to B64, B78, B79 |
| `hook-verify` | Passes each of the scenario's fixture tool inputs to the named hook, in a temporary worktree that holds the fixture files and index | R166 | B69 |
| `single-check` | Applies the patch, commits it unsigned and runs only the named check. It serves a patch to a protected path, where a full run would stop first at `signatures` | R166 | B50, B56, B59, B60, B67, B75, B80 |
| `receipt-verify` | Evaluates the receipt check's rules on the patched tree. 0006 also renders the receipt from the scenario's predicate fixture | 0002 R57 | B58, B66 |
| `task-verify`, `scope-verify` | Runs only the task check, or the task and scope checks over the range | 0004 R107 | B24 and B65; B23 |
| `cosign-verify`, `release-verify`, `signal-verify` | Runs only the signatures, release or signal check, on fixtures with stand-in keys made at run time | 0005 R140 | B36 to B40; B41 to B43, B46 to B48 and B70; B44 and B45 |
| `deploy-verify` | Builds the zip and runs only the attestation check | `scenarios/run.ts` lines 61 to 67, for B10 (SPEC-001-R29) | B10 |
| full `npm run checks` | As B1 to B18 run | SPEC-001-R1 | B49, B54, B68, B71, B77 |

A negative control runs each new mode on the unpatched tree, or with a passing fixture, and expects a pass. B72's negative control stores a pass record under the commit's SHA. B53 is the scenario the brief's sticky failure rests on: a rerun that the model would pass still fails.

## Video corrections

Each row is a place where this repository proposes that the video change. "Or change the repository" names the alternative the owner may prefer (owner decision 24). Rows marked conditional apply only under the named option.

| # | Where | On screen or spoken today | Change to | Why | Or change the repository | Applies |
|---|---|---|---|---|---|---|
| VC01 | Rule line; narration line 15 | "One engineer signs a spec, two the factory, one a release by tier."; "two sign the factory" | "One engineer signs a spec, up to two the factory by risk, one a release by tier."; "up to two sign each factory change, by its risk" | Under 0005's tiers, policy and anything unclassified need two signers, a listed low-risk kind one, and a proven tightening none (R111 to R113). Until `approval.two_person` is true, R114 judges every tier 2 commit as tier 1, so one signer suffices (0005, Phase II) | 0005's option (b): two signers for every factory change | always |
| VC02 | "FACTORY v1 · two signers"; the receipt's factory row | "v1 · two signers" | "v1 · sha256:<fingerprint>" | The FACTORY line shows the version and fingerprint (0004 R98). No draft requirement puts signers on it, and two-person approval starts only in 0005 Phase II | A FACTORY field naming the signers of the version's approval, not drafted | always |
| VC03 | Agent card on T-0042; author row of change #4822 | "RETRY 1/3"; "cloud session · attempt 2" | "hook flagged · fixed"; "cloud session · environment not recorded" | A session's AUTHOR line holds no attempt (0004 R71). Attempts exist only for the Phase D runner (R90) | Show the runner instead: "producer run · attempt 2" | always |
| VC04 | Task IDs on cards and receipts | "T-0042", "T-0043", "T-0044" | "TASK-0042", "TASK-0043", "TASK-0044" | R64 requires `^TASK-[A-Z0-9-]{1,32}$` | Amend R64's pattern | always |
| VC05 | Intent rows of changes #4822 and #4821 fix; the issue panel | "SPEC-118 · key, touch"; "SPEC-118 rev 2" | "SPEC-118-R1 · touch"; "SPEC-118-R4 · touch", a new row approved in its own commit | INTENT shows a requirement ID, the spec's digest, the approving commit and its flags (0004 R69). Specs carry no revision number | Revision numbers for specs, not drafted | always |
| VC06 | Intent row of change #4823 (T-0044) | "SPEC-118 · key, touch" | The requirement the alarm's mapping entry lists, marked as from the entry, such as "SPEC-118-R6 · from alarm entry" | Under 0005 R125 only the entry chooses the spec. SPEC-118 is right only if the entry cites it | none | always |
| VC07 | Receipt checks row | "16/16" | "15/15 · task · scope · validator" | 15 ordered checks (`scripts/checks.ts` lines 9 to 12), plus `task` and `scope` (0004 R68) and the validator (R144). No count of 16 exists | none | always |
| VC08 | Receipt checks row | "mutation 91%" | A score of at least 95%, such as "mutation 96%" | `thresholds.break` is 95 (SPEC-001-R16; `stryker.config.json` line 24). A 91% run fails the mutation check | none | always |
| VC09 | Receipt deploy row | "prod · no sign-off, policy v3" | "prod · release: not required (policy v3)" | 0005 R124's wording | none | always |
| VC10 | Receipt footer | "VERIFIED: key turns" | "VERIFIED 2/2 predicate types" | Slice 1's receipt line (0002, "Phase 1 owner steps") | none | always |
| VC11 | Receipt task rows | ORIGIN folded into the task row, and no TRIGGER row | Separate rows. #4822: task "TASK-0042", origin "internal · tier 0", trigger "task session on candidate/TASK-0042". #4823: origin "untrusted telemetry · tier 2", trigger "alarm export-latency · two signers" | ORIGIN and TRIGGER are separate lines (0005 R118, R119) | Fold ORIGIN into TASK, not drafted | always |
| VC12 | Task row of change #4821 fix; narration line 10 | "T-0043 · untrusted issue"; "began as an untrusted issue" | Origin row "internal · prompted by public issue #4821 · tier 2"; the narration can stay | R161 | none | if G4 (a) |
| VC13 | The same | The same | Origin row "internal · tier 0"; narration "Its receipt traces it through the spec to the deploy." | R119 unchanged | none | if G4 (b) |
| VC14 | PIPELINE chips | "DAST" | Drop the chip | No HTTP surface to scan (G3) | G3 option (a) | if G3 (b) |
| VC15 | Issue card | "notes: quarantined" | "issue text: for people only" | No schema, so no notes field | G5 option (b) | if G5 (a) |
| VC16 | In-run checks | "Dep allowlist" | "Installs denied" | Deny rules only | G6 option (b) | if G6 (c) |
| VC17 | Narration line 4 | "checks staging" | "checks the change in sandbox" | No staging environment by that name | G7 option (a) or (b) | if G7 (c) |
| VC18 | Narration line 13 | "Only an alarm named in the signed policy can start an approved task." | "Of telemetry, only an alarm named in the signed policy can start a run." | The owner's dispatch and task sessions also start tasks (0005 R118) | none | always |

## Decisions for the owner

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | Where the validator runs | (a) Its own `validator` job after `checks`, required by the ruleset (R144, R149, R151). (b) A step in the `checks` job, as the brief puts it. Every step then holds `id-token: write`, including `npm run checks` on the candidate's code | (a). The model role's token stays out of the job that runs candidate code (inference). Under (b), R144 and R149 change and R151 drops |
| 2 | Model and endpoint | (a) Bedrock through OIDC: a new invoke-only role, `who-gets-the-keys-validator-bedrock`, on one inference profile, trusting `pipeline.yml` on `candidate/**` and `main`. (b) Anthropic's API through Workload Identity Federation, 0004's option (b). Either way, the model is the one `validator.md` names, `claude-sonnet-5-5`, or another, pinned by full ID in the policy | (a), with the model `validator.md` names. It follows the triage pattern, and its host is already allowlisted. Inference: a candidate's own workflow can call the model too, which costs money but passes nothing. From 0002 Phase 3, the role trusts only the signer repository's workflow |
| 3 | Whether a failed model call fails the check | (a) Fail closed and store nothing: `no verdict` (R150). (b) Fail open: the receipt shows `VALIDATOR not run`, and the delivery proceeds | (a). Under (b), an outage lets changes through unjudged. That passes nothing, but it hides that no judgment was made (inference). Under either option, a fail-store outage fails closed (R192) |
| 4 | Reason codes in `validator.reasons` | (a) Three codes: `spec-not-met` (spec to code), `code-beyond-spec` (code to spec) and `untested-requirement`. (b) The two direction codes only. (c) One code, `fail`, with the requirement ID alone | (a). `untested-requirement` names the gap B52 shows. `invalid-output` stays reserved for R146 |
| 5 | Who may override a failure, and at which tier | (a) One approver, tier 1. (b) Tier 2: a signature and, once `two_person` is on, a co-sign (0005 R114, R115). (c) No override: the change must differ. (d) (b), and the override's principal differs from each principal that signed a cited requirement's row, as 0005 R122 requires of a release signer. With one approver, (d) allows no override until a second exists | (b) now, then (d) once `two_person` is on. An override waives a check of record for one change, like an entry in `specs/sca-exceptions.toml`, which 0005 holds at two. Under (b), an approver can override a fail on a change they asked for. Under (c), R152 and B57 drop. Under (d), R152 gains a distinct-principal clause |
| 6 | Time and cost budget per run | (a) One model call per run, `validator.max_seconds` 300 and the job's `timeout-minutes` 10. (b) (a), plus a reply token limit in the policy. (c) No limit beyond the job's `timeout-minutes` | (a). A diff the model cannot take ends as `no verdict`, so task scope (0004 R67) keeps diffs small (inference) |
| 7 | The change key | (a) `git patch-id --stable` of the range's default diff. (b) `git patch-id --stable` of `git diff -U0` over the range. (c) The tip's tree SHA. (d) The SHA-256 of the diff text | (b). In the scratch test it kept one key across three bases, where (a) gave two. Whitespace inside changed lines keeps the key under (a) and (b). Any other edit makes a new key and a fresh verdict, up to R194's cap. A collision can only add a fail (inference) |
| 8 | Where the fail store lives | (a) A DynamoDB table in the workload account. The validator role may only get and put items. An SCP denies item deletes to all but break-glass, and SPEC-001-R18 guards the table. (b) An S3 bucket with Object Lock in compliance mode. (c) Actions artifacts, which expire after 90 days. (d) The security account, which R154 closes to the pipeline | (a), with R193's protections. The stack already uses DynamoDB and the SCP pattern. A key's presence means fail, so an overwrite cannot clear it |
| 9 | Repeated fails on one task | (a) No limit. The store records each fail's task ID, so fails per task can be counted (R147). (b) After `validator.max_fails_per_task` fails for a task file, no model call until an approver changes the task file (R194). (c) A cap per cited requirement instead | (b). Without a cap, any edit, even a comment, re-samples a fail. `docs/factory-log.md` cannot hold the count: 0004 F12 plans it but it does not exist, and the agent can edit `docs/`. Under (a), R194 and B76 drop |
| 10 | The security account | (a) A new member account, its name and ID the owner's choice. (b) An audit account the organization already has. (c) The management account | (a), or (b) if one exists. Not (c): SCPs do not apply to the management account |
| 11 | The detector | (a) A scheduled comparison in the security account, reading through the drift-read role and the public repository. (b) AWS Config rules with an aggregator in the security account. (c) CloudTrail events that EventBridge forwards to the security account's bus | (a) for R156 and R157, then (c) for prompt notice of out-of-band writes. Config records "on a best effort basis", and no trail exists in Terraform today |
| 12 | Notification channel | (a) SNS email to the owner. (b) SNS to a chat webhook. (c) A GitHub issue, which needs a GitHub write token in the security account | (a). (c) adds a key holder |
| 13 | Whether drift freezes deploys, and how the report reaches the pipeline | Freeze: (a) yes, R158 and R159, failing closed on a stale report. (b) Notify only, and a person turns deploys off. Transport: (a) a public-read object in the security account, signed by an asymmetric KMS key whose public key sits in the policy. (b) The deploy role reads it across accounts, which breaks R154. (c) The monitor writes to GitHub, which adds a key holder | Freeze (a) with transport (a). `drift.max_age_hours` at twice the monitor's interval. Inference: the report holds digests and paths that the public repository already shows |
| 14 | Who redeploys after a code finding | (a) The owner: under decision 26 (a), the clearance commit's push deploys `main`'s tip. Otherwise the owner re-runs the deploy job of `main`'s latest push run. (b) A `signals` entry two approvers signed, with a redeploy action (0005 R125) | (a) now. (b) drafted with 0005 Phase IV |
| 15 | What else the monitor compares | (a) Code, the function's configuration (R196) and `main`'s history. (b) Also IAM trust policies against Terraform at `main`. (c) Also GitHub rulesets and environments, which needs a read token | (a) first, then (b). Slide 11's pipeline drift names "trust policy" |
| 16 | Where the monitor's code and Terraform live | (a) Here, under `infra/security/`, protected, applied by the owner. The iac check then covers that directory (SPEC-001-R8). (b) The signer repository of 0002 Phase 3 | (a) now, so its scenarios run here. Move it with the signer |
| 17 | DAST (G3) | (a) A `dast` check against a non-production function URL with `AuthType` `AWS_IAM` and ZAP's API scan. (b) Record that DAST does not apply, and drop the video's DAST chip | (b). No HTTP surface exists to test, and (a) would loosen the explicit `NoPublicLambda` deny to make one |
| 18 | The origin of issue-prompted work (G4) | (a) `prompted_by` (R160, R161). (b) Keep R119, and T-0043 reads `internal` | (a). It needs `tasks/` protected, 0004's open owner decision |
| 19 | A schema for public issues (G5) | (a) None. (b) An issue form and a field check (R162, R163). (c) (b), and kept fields go to the producer as data. (d) (b), and triage reads only kept fields | (b). Triage stays label-only (0004 R93) |
| 20 | The issue form's fields | (a) One dropdown, `kind`, with `bug`, `question` and `security`, the triage labels. (b) `kind` and further dropdowns the owner names, each with its options. (c) No dropdowns, so every answer is notes | (a). Add dropdowns one at a time, each with its options in the form |
| 21 | Whether every author's issue runs the field check | (a) Every author, on `opened` and `edited`. (b) Only the authors triage serves | (a). The field check calls no model, so issue text cannot instruct it (inference) |
| 22 | A dependency allowlist in the session (G6) | (a) An edit-time hook. (b) A commit-time hook (R164). (c) Relabel the chip | (b). An edit-time hook never fires for `package.json`, whose `Edit` is denied |
| 23 | Staging for the release signer (G7) | (a) `sandbox` as staging, with R165. (b) A new staging environment. (c) A Video correction only | (a). While the repository is public, every `main` push reaches `sandbox` after the reviewer approves. While it is private, deploys stop at attestation, so R165 cannot pass |
| 24 | The video corrections | (a) Accept every row that applies. (b) Decide row by row, changing the repository where a row offers it | (a). Each row cites the requirement it follows |
| 25 | The validator subagent | (a) Keep it advisory for local sessions, reading the pipeline's prompt file. (b) Retire it once the pipeline validator lands | (a). It still helps before a push, and P22 names its file |
| 26 | Break-glass and redeploys (P34 and slide R34) | (a) Every code finding freezes deploys, `main`'s tip included, until an approver lists its ID in the policy's `drift.cleared` (R159). (b) A deploy of `main`'s tip passes over any code finding, and P34 is recorded as corrected in `docs/slide-reconciliation.md`. (c) (a) only for findings raised after a break-glass assumption, which needs the monitor to read CloudTrail (decision 11 (c)) | (a). It keeps P34 and slide R34 both true without detecting break-glass. Its cost is a signed policy change before each drift redeploy, with two signers once `two_person` is on. Under (b), R159 drops `drift.cleared` |
| 27 | The validator on a push to `main` | (a) No model call: the job carries forward the record the candidate run stored under the commit's SHA (R147, R191). (b) The job verifies the candidate run's attested predicate and copies its record. It needs the zip's digest before `main`'s build runs. (c) A fresh model call on `main` over the candidate's range. (d) No validator job on `main` pushes, which needs a status function in the build job's `if:` that R149 forbids | (a). Under (c), a re-sample could fail a commit `main` already accepted and stop its deploy (inference). Under (b), R147 stores fails only and R191 changes |
| 28 | Who writes the fail store | (a) The validator job, whose role may get and put items (R144, R147). (b) A later job that checks out nothing and runs no repository code writes the validator job's record, as 0004 R91 publishes the producer record. The validator job then has no write access, as the brief asks. (c) No writes, so no fail outlives its run | (a) until 0002 Phase 3. Until then the candidate defines `pipeline.yml`, so (b)'s separate job adds little (inference). Under (b), R144 and R147 change, and the workflows check gains a rule for the writer job. (c) breaks "can fail, never pass" under retries |

## Options considered

| Option | Verdict |
|---|---|
| A. The validator inside the ordered fifteen | Rejected. SPEC-001-R1 needs the same identifier on every run against the same tree |
| B. A validator pass that can accept a change the deterministic checks reject | Rejected. "Can fail, never pass" |
| C. Fail verdicts kept only in Actions artifacts | Rejected. They expire after 90 days by default, and the run itself writes them |
| D. The fail store in the security account | Rejected. R154 closes that account to every workload principal |
| E. A drift monitor that redeploys production itself | Rejected. P39: it would become a second principal |
| F. The deploy role reads the drift report across accounts | Not chosen. It breaks R154's isolation |
| G. DAST through a function URL with `AuthType` `NONE` | Rejected. It opens the function to anyone |
| H. An edit-time allowlist hook | Not chosen. It never fires for `package.json`, and it misses Bash and script writes |
| I. The triage agent reads only issue fields | Not chosen. The agent adds nothing a fixed map cannot, and B9 loses its subject |
| J. A second workload account for staging | Not chosen for now. `sandbox` already receives every `main` push |
| K. The drift and release checks take the deployed commit from deployment records | Rejected. Any workflow with `deployments: write` can create one (inference) |

## Consequences

| Consequence | Mitigation |
|---|---|
| Each candidate push makes one model call, and a `main` push none (R191) | One call per run, a time budget, and the role's single inference profile (owner decision 6) |
| A model outage blocks every delivery | `no verdict` stores nothing, so a rerun after the outage judges afresh (R150) |
| A false fail sticks to its change | An approver-signed override, named on the receipt (R152, R153). 0004 F12 plans `docs/factory-log.md` for such rows |
| Any edit to a failed change, even a comment, gets a fresh verdict | R194 caps fails per task file (owner decision 9) |
| Until 0002 Phase 3, the candidate defines its own `validator` job | The same gap as `checks` today. 0004 R109 runs it from `main`'s code |
| The validator role trusts candidate refs, so a candidate's workflow can call the model, add fail keys and overwrite records | It cannot delete keys (R193), and R148 prints a stored record only if it validates. A forged key passes nothing, but it can block anyone's change with that key, a human's fix included, until an override. Each record names the run ref that wrote it (R147). Model calls cost money but pass nothing (inference) |
| A stale drift report freezes deploys | Fail closed by design. The owner sets `drift.max_age_hours`, a policy change with two signers once `two_person` is on |
| A failed drift read publishes no report, so deploys freeze once the last report is stale | Fail closed by design (R195). The notice names the function that could not be read |
| Every code finding freezes deploys until an approver clears it (owner decision 26 (a)) | One signed policy change clears it, and its own push redeploys `main`'s tip |
| A history finding never clears without a history rewrite | As today for the pipeline's own signatures check (P33) |
| The drift report is public | It holds digests, paths and commit SHAs the public repository already shows (inference) |
| An issue form does not bind the API | The field check validates every body, and anything that fails is notes |
| `prompted_by` is only as trustworthy as the task's signature | It needs `tasks/` protected (owner decision 18) |
| A task session can read the issue that `prompted_by` names, through `WebFetch` or `gh api` | Only the Phase D runner keeps issue text from the producer (0004 R88, R92). Deny rules in a session would be a tripwire only (Not yet verified) |
| The allowlist hook is a tripwire | A script that commits by itself skips it, and so does content a merge brings in. The pipeline's allowlist check stays the control |
| DAST stays not covered | Slide R08 records the reason. The video drops the chip |
| R165 proves a staging deploy, not a review | The release signature is the review, a gate |

## Not yet verified

| Item | How to settle it |
|---|---|
| The video's text here comes from the brief's description of revision 18, not from the video | Compare with the video itself before W01 |
| Whether Bedrock serves the model `validator.md` names, and its inference profile ID | W15: one call in the owner's account |
| Whether structured outputs work on the chosen endpoint | W15 |
| Whether `-U0` keys stay stable for renames, mode changes and binary files, which the scratch test did not cover | W15: a test per case |
| The stop reasons the chosen endpoint returns, and which of them mean an incomplete reply (R150) | W15 |
| Whether IAM can require `attribute_not_exists` on the validator role's `PutItem`. If not, an overwrite stays possible, and R148's validation keeps it from passing anything | W14 |
| Whether every DynamoDB path that removes an item, such as `TransactWriteItems` and PartiQL transactions, is authorized as one of R193's actions | W14 |
| Whether the candidate run's attested predicate could carry the record to `main` instead (owner decision 27 (b)) | Only if the owner picks 27 (b) |
| Whether a role's trust can name `pipeline.yml` on `candidate/**` exactly, through `job_workflow_ref` | W14 |
| Whether a required status check whose job a condition skips reports success. R144 gives the validator job no `if:` for this reason | Read GitHub's required status checks page before W16 |
| The encoding of `CodeSha256`, and whether it equals the attested zip's SHA-256 byte for byte | W29: one deploy, compared |
| Whether the monitor can read this repository's attestations and workflow run jobs without a token | W29 |
| Whether Terraform reading `infra/sandbox/function.json` leaves the existing function's plan unchanged | W28: a plan in the owner's account |
| Whether the security account holds roles outside Terraform, such as one AWS Organizations created, that trust another account. R197 reads only `infra/security/` | The owner checks the account after W27 |
| Whether R154's deny on `aws:ResourceAccount` blocks every action, given the actions AWS lists as exceptions | W28: a test in the owner's organization |
| Whether the security account's S3 Block Public Access allows one public-read object, and a GitHub-hosted runner can fetch it | W28 |
| Whether the workload account has a CloudTrail trail. None is in Terraform, and the break-glass rule matches CloudTrail events | The owner checks the account |
| Whether the signatures check runs without `node_modules`. `scripts/checks.ts` imports only Node built-ins at its top | W29 |
| Whether the Actions API names the environment each job deployed to, or R156 and R165 must find the job by its name | W29, W33 |
| Whether an issue form's labels show that an issue came through the form | W06 |
| Whether the `edited` event fires for every body edit | W07 |
| The Claude Code permissions page's wording on scripts that write files. 0004 quotes it, but the 2026-11-06 fetch was partly garbled | Read the page again before W08 |
| Whether a task session's deny rules can keep issue text out: `WebFetch`, and `gh issue` or `gh api` reads | Read the permissions page before W08. Any rule is a tripwire only |
| Whether ZAP can sign requests with SigV4 for an `AWS_IAM` function URL | Only if the owner picks G3 (a) |

## Sources

| Source | Read |
|---|---|
| The owner's brief, "align who-gets-the-keys with the factory video", revision 18 | 2026-11-06 |
| https://platform.claude.com/docs/en/api/migration-2026-10-21 | 2026-11-06 |
| https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/increase-consistency | 2026-11-06 |
| https://git-scm.com/docs/git-patch-id | 2026-11-06 |
| https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html | 2026-11-06 |
| https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_rcps.html | 2026-11-06 |
| https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html | 2026-11-06 |
| https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_common-scenarios_aws-accounts.html | 2026-11-06 |
| https://docs.aws.amazon.com/config/latest/developerguide/WhatIsConfig.html | 2026-11-06 |
| https://docs.aws.amazon.com/config/latest/developerguide/evaluate-config.html | 2026-11-06 |
| https://docs.aws.amazon.com/config/latest/developerguide/aggregate-data.html | 2026-11-06 |
| https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-service-event-cloudtrail.html | 2026-11-06 |
| https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-cross-account.html | 2026-11-06 |
| https://docs.aws.amazon.com/lambda/latest/api/API_GetFunction.html | 2026-11-06 |
| https://docs.aws.amazon.com/lambda/latest/api/API_FunctionConfiguration.html | 2026-11-06 |
| https://docs.aws.amazon.com/lambda/latest/api/API_Invoke.html | 2026-11-06 |
| https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html | 2026-11-06 |
| https://www.zaproxy.org/docs/docker/baseline-scan/ | 2026-11-06 |
| https://www.zaproxy.org/docs/docker/api-scan/ | 2026-11-06 |
| https://code.claude.com/docs/en/hooks | 2026-11-06 |
| https://code.claude.com/docs/en/permissions | 2026-11-06 |
| https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms | 2026-11-06 |
| https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-githubs-form-schema | 2026-11-06 |
| https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository | 2026-11-06 |
| https://docs.github.com/en/rest/issues/issues | 2026-11-06 |
| https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments | 2026-11-06 |
| https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax | 2026-11-06 |
| https://docs.github.com/en/actions/reference/workflows-and-actions/expressions | 2026-11-06 |
| https://docs.github.com/en/rest/deployments/deployments | 2026-11-06 |
| https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization | 2026-11-06 |
| A scratch-repository test of `git patch-id --stable`, default diff and `-U0`, with git 2.43.0 | 2026-11-06 |
| `.claude/agents/validator.md`, `.claude/settings.json`, `.claude/hooks/hook.mjs`, `.github/workflows/pipeline.yml`, `.github/workflows/issue-triage.yml`, `.github/egress/allowlist.json`, `infra/org/main.tf`, `infra/sandbox/main.tf`, `infra/sandbox/iam.tf`, `infra/sandbox/variables.tf`, `scripts/bootstrap/github.sh`, `scripts/checks.ts`, `scenarios/run.ts`, `scenarios/scenarios.yaml`, `practices.yaml`, `specs/source-of-record/slides.txt`, `src/handler.ts` and `stryker.config.json`, at `c7b91a5`, re-read at `e54cdc0`, `6aa9297` and `689bb30` | 2026-11-06 |
| Decisions 0002 to 0005, `docs/deviations.md`, `docs/slide-reconciliation.md`, `docs/notes/spec-to-production-factory.md` and `proposals/phase-1/`, at `c7b91a5` | 2026-11-06 |
