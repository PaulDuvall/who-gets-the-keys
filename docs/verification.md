# Verification log

<!-- PAUL: one-line description of what this log is for -->

All rows verified 2026-10-20 unless the Date column says otherwise. "Session" means the Part B cloud session container.

## Session toolchain

| Item | Finding | Source | Date |
|---|---|---|---|
| node | v22.22.0 present; repo pins Node 24 via `engines` (see Node.js) | `node --version` in session; https://nodejs.org/en/about/previous-releases | 2026-10-20 |
| npm | 10.9.4 present | `npm --version`; https://docs.npmjs.com/cli/v10/commands/npm-ci | 2026-10-20 |
| ffmpeg, ffprobe | 6.1.1-3ubuntu5 present | `ffmpeg -version`; https://ffmpeg.org/ffmpeg-filters.html | 2026-10-20 |
| Xvfb | present at `/usr/bin/Xvfb` | `command -v Xvfb`; https://www.x.org/releases/X11R7.7/doc/man/man1/Xvfb.1.xhtml | 2026-10-20 |
| uv | 0.11.32 present | `uv --version`; https://docs.astral.sh/uv/pip/compile/ | 2026-10-20 |
| terraform | missing; installed 1.16.6 from releases.hashicorp.com, SHA256SUMS verified | https://releases.hashicorp.com/terraform/1.16.6/ | 2026-10-20 |
| gitleaks | missing; installed v8.30.1 `gitleaks_8.30.1_linux_x64.tar.gz`, checksums.txt verified | https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1 | 2026-10-20 |
| osv-scanner | missing; installed v2.7.0 `osv-scanner_linux_amd64`, SHA256SUMS verified | https://github.com/google/osv-scanner/releases/tag/v2.7.0 | 2026-10-20 |
| tflint | missing; installed v0.64.0 `tflint_linux_amd64.zip`, checksums.txt verified | https://github.com/terraform-linters/tflint/releases/tag/v0.64.0 | 2026-10-20 |
| semgrep | missing; installed 1.181.0 with `uv tool install semgrep==1.181.0` | https://pypi.org/project/semgrep/1.181.0/ | 2026-10-20 |
| zizmor | missing; installed 1.31.1 with `uv tool install zizmor==1.31.1`; release tarball has no checksum file at the names tried | https://pypi.org/project/zizmor/1.31.1/ | 2026-10-20 |
| Network: npm registry | 200 | https://registry.npmjs.org/typescript | 2026-10-20 |
| Network: PyPI | 200 | https://pypi.org/simple/piper-tts/ | 2026-10-20 |
| Network: GitHub release assets | 302 → 200 on `release-assets.githubusercontent.com`; HTML release pages return 403 | https://github.com/gitleaks/gitleaks/releases/download/v8.28.0/gitleaks_8.28.0_linux_x64.tar.gz | 2026-10-20 |
| Network: huggingface.co | 200; LFS redirects to `us.aws.cdn.hf.co` succeed | https://huggingface.co/rhasspy/piper-voices | 2026-10-20 |
| Network: Playwright browser CDN | 200 on `playwright.download.prss.microsoft.com` | https://playwright.download.prss.microsoft.com/dbazure/download/playwright/builds/chromium/1194/chromium-linux.zip | 2026-10-20 |
| GitHub REST from session | Works only for repos attached to the session; third-party repos return 403. Tags resolved with `git ls-remote` instead | `gh api repos/gitleaks/gitleaks/releases/latest` → 403; https://docs.github.com/en/rest/releases/releases | 2026-10-20 |

## Claude Code

| Item | Finding | Source | Date |
|---|---|---|---|
| `permissions` rule syntax | `Tool(specifier)`; `Bash(npm run *)` prefix wildcard, `:*` equivalent; `~/` home-relative, `/` settings-root-relative, `//` absolute | https://code.claude.com/docs/en/permissions | 2026-10-20 |
| Path deny rules | Only `Edit(...)` and `Read(...)` path rules are enforced; `Write(...)` path rules are accepted but never consulted. Deny rules do not cover files written by arbitrary subprocesses | https://code.claude.com/docs/en/permissions | 2026-10-20 |
| `hooks`, `env` keys | Top-level keys in `settings.json`; hooks shape `{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"..."}]}]}` | https://code.claude.com/docs/en/settings | 2026-10-20 |
| Sandbox network | `sandbox.enabled`, `sandbox.network.allowedDomains`, `failIfUnavailable`, `allowUnsandboxedCommands`; covers Bash only, not WebFetch; Linux needs bubblewrap and socat; fails open unless `failIfUnavailable: true` | https://code.claude.com/docs/en/sandboxing | 2026-10-20 |
| Cloud multi-repo sessions | Only `enabledPlugins` and `extraKnownMarketplaces` are read from each repo's `.claude/settings.json`; permissions, hooks and env are skipped | https://code.claude.com/docs/en/settings | 2026-10-20 |
| Hook input JSON | Common: `session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`; PreToolUse adds `tool_name`, `tool_input`, `tool_use_id`; PostToolUse adds `tool_response` | https://code.claude.com/docs/en/hooks | 2026-10-20 |
| Hook exit codes | 0 success; 2 blocks with stderr as reason; other codes non-blocking | https://code.claude.com/docs/en/hooks | 2026-10-20 |
| Hook on permission denial | `PermissionDenied` fires only for auto-mode classifier denials; not for deny-rule matches or declined prompts. Security-event hook uses PreToolUse | https://code.claude.com/docs/en/hooks#permissiondenied | 2026-10-20 |
| `$CLAUDE_PROJECT_DIR` | Project root, available to hook commands | https://code.claude.com/docs/en/hooks#reference-scripts-by-path | 2026-10-20 |
| Subagent format | `.claude/agents/*.md`; frontmatter `name`, `description` required; `tools`, `model` (`sonnet`, `opus`, `haiku`, `fable`, full ID, `inherit`) | https://code.claude.com/docs/en/sub-agents | 2026-10-20 |
| Subagent model order | Per-invocation `model` parameter, then frontmatter `model`, then `CLAUDE_CODE_SUBAGENT_MODEL`, then the main conversation's model. Before v2.1.251 the variable came first. A value blocked by `availableModels` is replaced, with a warning in interactive sessions | https://code.claude.com/docs/en/sub-agents#choose-a-model | 2026-11-01 |
| Model ID pinning | "Every Claude model ID is a pinned snapshot, including the dateless IDs used from the 4.6 generation on." No current Sonnet or Haiku has a dated ID: `claude-sonnet-5-5`, `claude-haiku-5-5` | https://platform.claude.com/docs/en/about-claude/models/overview | 2026-11-01 |
| Claude Code model aliases | "Aliases point to the recommended version for your provider and update over time. To pin to a specific version, use the full model name." Anthropic API today: `sonnet` is Sonnet 5.5, `haiku` is Haiku 5.5; on Bedrock, Sonnet 4.5 and Haiku 4.5 | https://code.claude.com/docs/en/model-config | 2026-11-01 |
| CLAUDE.md imports | `@path` relative to the importing file; max depth 4; not inside code spans | https://code.claude.com/docs/en/memory | 2026-10-20 |
| Skills format | `.claude/skills/<name>/SKILL.md`; frontmatter `name`, `description`, optional `allowed-tools`, `model` and others | https://code.claude.com/docs/en/skills | 2026-10-20 |
| `GIT_CONFIG_COUNT` | git adds `GIT_CONFIG_KEY_<n>`/`GIT_CONFIG_VALUE_<n>` pairs, overriding config files; tested: global `commit.gpgsign=true` reads `false` with the env pair | https://git-scm.com/docs/git-config | 2026-10-20 |

## Runtimes and packages

| Item | Finding | Source | Date |
|---|---|---|---|
| Node.js LTS | Latest LTS v24.22.0 (Krypton, 2026-10-14). v24 enters Maintenance 2026-10-20; v26 becomes Active LTS 2026-10-28 | https://nodejs.org/dist/index.json, https://raw.githubusercontent.com/nodejs/Release/main/schedule.json | 2026-10-20 |
| Lambda runtime | `nodejs24.x` GA; `nodejs26.x` public preview, not covered by SLA | https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html | 2026-10-20 |
| typescript | latest 7.0.2; pinned 6.0.3 (typescript-eslint peer `>=4.8.4 <6.1.0`) | https://registry.npmjs.org/typescript | 2026-10-20 |
| vitest | latest 5.0.5 (2026-09-03 for 5.0.0); pinned 4.1.12 (2026-10-15) for Stryker compatibility, see D10 | https://registry.npmjs.org/vitest | 2026-10-20 |
| @stryker-mutator/core, vitest-runner | 10.0.0; runner peer `vitest >=2.0.0` | https://registry.npmjs.org/@stryker-mutator/core | 2026-10-20 |
| fast-check | 4.10.2 | https://registry.npmjs.org/fast-check | 2026-10-20 |
| eslint | 10.13.0 | https://registry.npmjs.org/eslint | 2026-10-20 |
| typescript-eslint | 8.72.0; peer `eslint ^8.57 \|\| ^9 \|\| ^10` | https://registry.npmjs.org/typescript-eslint | 2026-10-20 |
| Vitest ESLint plugin | Maintained package is `@vitest/eslint-plugin` 1.6.27; `eslint-plugin-vitest` last published 2024-04-23 | https://registry.npmjs.org/@vitest/eslint-plugin | 2026-10-20 |
| @anthropic-ai/sandbox-runtime | 0.0.81 published 2026-10-20; pinned 0.0.79 (2026-10-07); engines `>=22.12.0`; bin `srt` | https://registry.npmjs.org/@anthropic-ai/sandbox-runtime | 2026-10-20 |
| lodash (B13 only) | 4.17.20 affected by GHSA-35jh-r3h4-6jhm (CVE-2021-23337), fixed 4.17.21. The sca gate reports the most severe advisory, GHSA-r5fr-rjxr-66jc (D17) | https://api.osv.dev/v1/vulns/GHSA-35jh-r3h4-6jhm | 2026-10-20 |
| yaml | 2.9.1, latest | https://registry.npmjs.org/yaml | 2026-10-23 |
| qs (override) | 6.16.1, latest; overrides the copy under `@stryker-mutator/core` → `typed-rest-client` for GHSA-4mjr-xmp4-gh2g, GHSA-q8mj-m7cp-5q26, GHSA-x5fp-wj9c-mxmx | https://registry.npmjs.org/qs | 2026-10-23 |
| zod (SCA exception) | 3.25.76 under `@anthropic-ai/sandbox-runtime`, GHSA-mrhx-c7xc-m3w5, fixed only in 4.6.6; sandbox-runtime requires `^3.25.0` through 0.0.81 | https://api.osv.dev/v1/vulns/GHSA-mrhx-c7xc-m3w5, https://registry.npmjs.org/@anthropic-ai/sandbox-runtime | 2026-10-23 |

## Terraform and AWS

| Item | Finding | Source | Date |
|---|---|---|---|
| Terraform CLI | 1.16.6 | https://checkpoint-api.hashicorp.com/v1/check/terraform | 2026-10-20 |
| hashicorp/aws | 6.69.1 (major 6, 2026-10-15) | https://registry.terraform.io/v1/providers/hashicorp/aws | 2026-10-20 |
| S3 backend `use_lockfile` | GA since 1.11; defaults false; `dynamodb_table` deprecated | https://developer.hashicorp.com/terraform/language/backend/s3 | 2026-10-20 |
| `deletion_protection_enabled` | `aws_dynamodb_table` argument, defaults false | https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table | 2026-10-20 |
| tflint, ruleset-aws | v0.64.0, v0.49.0 | `git ls-remote`: v0.64.0 at `15c65a33…`, v0.49.0 at `66c89bea…`; https://github.com/terraform-linters/tflint/releases/tag/v0.64.0, https://github.com/terraform-linters/tflint-ruleset-aws/releases/tag/v0.49.0 | 2026-10-23 |
| SCP explicit deny text | `... is not authorized to perform: <action> with an explicit deny in a service control policy[: <policy ARN>]`; match the substring without the ARN | https://docs.aws.amazon.com/IAM/latest/UserGuide/troubleshoot_access-denied.html | 2026-10-20 |
| SCP principal exception | `ArnNotLike` on `aws:PrincipalArn`; SCPs do not affect service-linked roles | https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html | 2026-10-20 |
| Bedrock first-time use | `aws bedrock put-use-case-for-model-access --form-data fileb://form.json` | https://docs.aws.amazon.com/bedrock/latest/APIReference/API_PutUseCaseForModelAccess.html | 2026-10-20 |
| Bedrock endpoint | `bedrock-runtime.us-east-1.amazonaws.com` | https://docs.aws.amazon.com/general/latest/gr/bedrock.html | 2026-10-20 |
| STS for OIDC | audience `sts.amazonaws.com`; configure-aws-credentials uses regional `sts.us-east-1.amazonaws.com` | https://github.com/aws-actions/configure-aws-credentials | 2026-10-20 |

## GitHub

| Item | Finding | Source | Date |
|---|---|---|---|
| OIDC `sub`, environment | `repo:OWNER/REPO:environment:NAME` | https://docs.github.com/en/actions/reference/security/oidc | 2026-10-20 |
| OIDC `sub`, no environment | `repo:OWNER/REPO:ref:refs/heads/main` for push and `workflow_dispatch` | https://docs.github.com/en/actions/reference/security/oidc | 2026-10-20 |
| OIDC immutable subject | Repos created after 2026-07-15 use `repo:OWNER@OWNER_ID/REPO@REPO_ID:...`. This repo: created 2026-10-20T15:19:12Z, owner ID 1619259, repo ID 1427202012 | https://docs.github.com/en/actions/reference/security/oidc; `gh api repos/PaulDuvall/who-gets-the-keys` | 2026-10-20 |
| OIDC workflow pinning | AWS STS accepts `token.actions.githubusercontent.com:job_workflow_ref` as a condition key; GitHub documents the claim for reusable workflows. Presence in direct jobs to be confirmed from a real token in Phase 5 | https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_iam-condition-keys.html | 2026-10-20 |
| Plan: owner account | GitHub Pro (stated by owner) | owner answer in session; https://docs.github.com/en/get-started/learning-about-github/githubs-plans | 2026-10-20 |
| Artifact attestations, private | Free, Pro, Team: public repos only; private needs Enterprise Cloud | https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations | 2026-10-20 |
| Environments, private | Pro: environments, secrets, deployment branch rules; required reviewers and wait timers public only | https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments | 2026-10-20 |
| SHA pinning policy | `PUT /repos/{o}/{r}/actions/permissions` with `sha_pinning_required: true`; no plan restriction stated | https://docs.github.com/en/rest/actions/permissions | 2026-10-20 |
| Default workflow token | `PUT /repos/{o}/{r}/actions/permissions/workflow` `{"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}` | https://docs.github.com/en/rest/actions/permissions | 2026-10-20 |
| Create environment | `PUT /repos/{o}/{r}/environments/{name}` | https://docs.github.com/en/rest/deployments/environments | 2026-10-20 |
| Rulesets, private | Public repos on Free; public and private repos on Pro, Team and Enterprise Cloud. Owner plan is Pro, so `protect main` applies while private | https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets | 2026-11-01 |
| Create ruleset | `POST /repos/{o}/{r}/rulesets` with `target: branch`, `enforcement: active`, `conditions.ref_name.include: ["~DEFAULT_BRANCH"]`, rules `deletion` and `non_fast_forward`; `GET /repos/{o}/{r}/rules/branches/{branch}` lists the active rules on a branch | https://docs.github.com/en/rest/repos/rules | 2026-11-01 |
| Linear history rule | Ruleset rule `required_linear_history`: "Prevent merge commits from being pushed to matching refs" | https://docs.github.com/en/rest/repos/rules | 2026-11-02 |
| Environment reviewers | `PUT /repos/{o}/{r}/environments/{name}` takes `reviewers: [{type: User or Team, id}]` and `prevent_self_review`. On Free, Pro and Team, wait timers and required reviewers are public repos only | https://docs.github.com/en/rest/deployments/environments | 2026-11-02 |
| Secret scanning settings | `PATCH /repos/{o}/{r}` with `security_and_analysis.secret_scanning.status` and `secret_scanning_push_protection.status` set to `enabled`; private vulnerability reporting is `PUT /repos/{o}/{r}/private-vulnerability-reporting`, and `GET` returns `{"enabled": true}` | https://docs.github.com/en/rest/repos/repos | 2026-11-02 |
| claude-code-action | v1.0.254, commit `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c` (annotated tag object `c335fd6d…`) | `git ls-remote`; https://github.com/anthropics/claude-code-action/releases/tag/v1.0.254 | 2026-10-23 |
| claude-code-action without GitHub App | `github_token` input accepted; comments post as github-actions | https://github.com/anthropics/claude-code-action/blob/v1.0.254/docs/faq.md | 2026-10-20 |
| claude-code-action Bedrock | `use_bedrock: "true"` after configure-aws-credentials `role-to-assume`; OIDC only | https://github.com/anthropics/claude-code-action/blob/v1.0.254/docs/cloud-providers.md | 2026-10-20 |
| claude-code-action settings | `settings` input takes JSON or a path, including `sandbox.network.allowedDomains` | https://github.com/anthropics/claude-code-action/blob/v1.0.254/docs/configuration.md | 2026-10-20 |
| Egress: harden-runner | Block mode for private repos needs StepSecurity Enterprise; rejected | https://github.com/step-security/harden-runner | 2026-10-20 |
| Egress: GitHub first-party | Private networking is org-level, Team plan or higher; unavailable | https://docs.github.com/en/actions/concepts/runners/private-networking | 2026-10-20 |
| Egress: chosen | Anthropic `sandbox-runtime` (`srt`), same engine as Claude Code's sandbox; network namespace removed, traffic only through its proxy. One allowlist file generates both the srt settings and the action's `sandbox` settings | https://github.com/anthropics/sandbox-runtime | 2026-10-20 |

## Action SHAs

All tags below are lightweight except claude-code-action; SHAs are peeled commits. Each tag was re-resolved with `git ls-remote` on 2026-10-23 and matches the pin in `.github/workflows/`.

| Action | Tag | Commit | Source | Date |
|---|---|---|---|---|
| actions/checkout | v7.0.1 | 3d3c42e5aac5ba805825da76410c181273ba90b1 | https://github.com/actions/checkout/releases/tag/v7.0.1 | 2026-10-23 |
| actions/setup-node | v7.1.0 | 949feb2413d6458794dcd2491c4babbbce0c15c1 | https://github.com/actions/setup-node/releases/tag/v7.1.0 | 2026-10-23 |
| actions/upload-artifact | v7.0.2 | cf430e030ddbb5b0abf93d22962f4752f3646cd9 | https://github.com/actions/upload-artifact/releases/tag/v7.0.2 | 2026-10-23 |
| actions/download-artifact | v8.0.2 | 9000827ccba6bdab643e8b6fd33ac0654aef8333 | https://github.com/actions/download-artifact/releases/tag/v8.0.2 | 2026-10-23 |
| actions/attest-build-provenance | v4.2.2 | 4d101475d8b20a2381f78447822ac1eab6504dd8 | https://github.com/actions/attest-build-provenance/releases/tag/v4.2.2 | 2026-10-23 |
| actions/attest | v4.2.2 | 1e69f48acb82d1966a394da916b4c1698aa569d6 | https://github.com/actions/attest/releases/tag/v4.2.2 | 2026-10-23 |
| aws-actions/configure-aws-credentials | v6.3.0 | e1253824e5c10ff9df46874f81ed3ec929e19cfd | https://github.com/aws-actions/configure-aws-credentials/releases/tag/v6.3.0 | 2026-10-23 |
| hashicorp/setup-terraform | v4.0.1 | dfe3c3f87815947d99a8997f908cb6525fc44e9e | https://github.com/hashicorp/setup-terraform/releases/tag/v4.0.1 | 2026-10-23 |
| astral-sh/setup-uv | v10.3.0 | 1c37ad07a6a961277cf70c0d37d6f313000f5884 | https://github.com/astral-sh/setup-uv/releases/tag/v10.3.0 | 2026-10-23 |
| anthropics/claude-code-action | v1.0.254 | db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c | https://github.com/anthropics/claude-code-action/releases/tag/v1.0.254 | 2026-10-23 |

Source: `git ls-remote --tags https://github.com/<owner>/<repo>`, 2026-10-20.

## Gate CLIs

| Item | Finding | Source | Date |
|---|---|---|---|
| gitleaks dir scan | `gitleaks dir -v <path>`; staged: `gitleaks git --staged`; exit 1 on leaks; verbose prints `RuleID:` | https://raw.githubusercontent.com/gitleaks/gitleaks/master/README.md | 2026-10-20 |
| gitleaks rule for B5 | Candidates without GitHub push protection: `flickr-access-token`, `telegram-bot-api-token`, `datadog-access-token`, `generic-api-key`. Chosen: `telegram-bot-api-token`, the B5 line in every scenario run | https://docs.github.com/en/code-security/secret-scanning/introduction/supported-secret-scanning-patterns | 2026-10-20 |
| semgrep flags | `semgrep scan --config p/default --error --metrics=off`; `--error` exits 1 on findings; p/default needs no login | https://semgrep.dev/docs/cli-reference | 2026-10-20 |
| semgrep rule for B12 | `javascript.lang.security.detect-child-process.detect-child-process`, the B12 line in every scenario run; it matches only a namespace import of `child_process` | https://github.com/semgrep/semgrep-rules/blob/develop/javascript/lang/security/detect-child-process.yaml | 2026-10-20 |
| semgrep Python pins (SCA exceptions) | semgrep 1.181.0 and 1.182.1 pin `mcp==1.29.0` (GHSA-84m7-p3x7-pcfv, fixed 1.30.0) and `opentelemetry-api~=1.37.0` (GHSA-xcq7-p3pf-p88h, fixed 1.45.1); the sca gate scans `scripts/ci/requirements.txt` | https://pypi.org/pypi/semgrep/1.182.1/json, https://api.osv.dev/v1/vulns/GHSA-84m7-p3x7-pcfv, https://api.osv.dev/v1/vulns/GHSA-xcq7-p3pf-p88h | 2026-10-23 |
| osv-scanner | `osv-scanner scan source -L <lockfile>`; exit 1 on vulnerabilities, 128 no packages | https://github.com/google/osv-scanner/blob/main/docs/scan-source.md | 2026-10-20 |
| zizmor audits | `cache-poisoning` targets release-like workflows; `unpinned-uses` requires SHA pins by default since 1.20.0; exit 11 to 14 on findings; `--offline` disables online audits | https://github.com/zizmorcore/zizmor/blob/v1.31.1/docs/audits.md | 2026-10-20 |

## Slide export

| Item | Finding | Source | Date |
|---|---|---|---|
| Export method | Google Drive `files.export` with `mimeType=text/plain` includes speaker notes after each slide's text | Drive export of file `REDACTED-PRIVATE-DECK`; https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export | 2026-10-20 |
| Snapshot | `proposals/source-of-record/slides.txt`, body 20,574 bytes, SHA-256 `822f5dc12f656c5af76896043175e7cda896c202f24e71d6573ac77c7b2aaac0`; header hash matches body | `sed '1,/^---$/d' … \| sha256sum`; https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export | 2026-10-20 |
| Refresh export auth | `gcloud auth login --enable-gdrive-access` grants the Drive scope `refresh-slides.sh` uses with `gcloud auth print-access-token` against `drive/v3/files/{id}/export?mimeType=text/plain` | https://cloud.google.com/sdk/gcloud/reference/auth/login | 2026-10-21 |
| Deck re-export | Drive `modifiedTime` 2026-10-21T16:43:48.186Z; body 20,997 bytes, SHA-256 `a78cd1d6062babd6a3fd20158d9e08b8fb174adc99fc6d24ec0700ff85ac0ab9`; slides 1 to 13 and Q1 to Q3 unchanged; written to `proposals/source-of-record/slides.txt` | Drive export of file `REDACTED-PRIVATE-DECK`; https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export | 2026-10-21 |
| Slide numbering | Numbered slides 1 to 13 are the increasing run of standalone integer lines starting at 1; title, closing and three Q&A slides are unnumbered (cited Q1 to Q3) | snapshot parse of https://docs.google.com/presentation/d/REDACTED-PRIVATE-DECK/ export (deck needs sign-in) | 2026-10-20 |

## Video toolchain

| Item | Finding | Source | Date |
|---|---|---|---|
| Reference commit | an earlier private repository `469f0fda93535e0b4a40fe61d22d6e122064d309` (2026-10-17) | `git cat-file -t`; an earlier private repository | 2026-10-20 |
| Reference pins | Piper by version and hash (`requirements.txt`), voice files by URL and SHA-256, Playwright by version in lockfile | explainer/README.md in an earlier private repository | 2026-10-20 |
| Reference leaves unpinned | ffmpeg, ffprobe, Xvfb, Node.js, npm, uv, browser build, page fonts; versions recorded in report (its ADR-0018 decision 3) | explainer/README.md in an earlier private repository, REQ-DEMO-003 | 2026-10-20 |
| piper-tts | 1.8.0, GPL-3.0-or-later, requires Python >=3.9, uploaded 2026-09-04 | https://pypi.org/pypi/piper-tts/1.8.0/json | 2026-10-20 |
| Voice | `en_US-ljspeech-medium` at piper-voices tag v1.0.0 (commit 375a0fe641dea077c2a47b4e9a056d6da521eed3) | https://huggingface.co/rhasspy/piper-voices/tree/v1.0.0/en/en_US/ljspeech/medium | 2026-10-20 |
| Voice `.onnx` | 63,531,379 bytes, SHA-256 `6f52a751e2349abe7a76735eb09dc1875298c77ea2342ffd2fef79ff81b87f22`, equals the LFS oid | https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx | 2026-10-20 |
| Voice `.onnx.json` | 4,972 bytes, SHA-256 `141d612cc0a95ed7efc1ca936b845c2364967f2e9217c5dbfcf69fc4d6c65860` | https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx.json | 2026-10-20 |
| Voice licence | Model card: LJ Speech dataset public domain; trained from scratch, no fine-tune lineage. Repo licence tag `mit` | https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ljspeech/medium/MODEL_CARD | 2026-10-20 |
| Playwright | latest 1.64.1 (Chromium revision 1248, 156.0.8078.4). Session image ships revision 1194 (141.0.7390.37) = Playwright 1.56.1. Pinned 1.64.1; the build installs revision 1248 into `build/browsers` (D16) | https://raw.githubusercontent.com/microsoft/playwright/v1.64.1/packages/playwright-core/browsers.json | 2026-10-20 |
