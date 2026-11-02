# Slide reconciliation

Which practices the talk's audience slides state, and what in this repo demonstrates each one.

Snapshot: `specs/source-of-record/slides.txt`, body SHA-256 `f78bb192ae51591962c75009192243bbcdcaa44da78a86287c90f02f35885aa1`, exported 2026-11-02 from the audience deck (13 numbered slides, no speaker notes, no Q&A slides). One row per practice the slide text states, then the controls this repo has that the slides do not name. Checked by hand against the repo on 2026-11-02; it replaces the reconciliation and the claim-by-claim audit written against the earlier speaker deck.

| # | Slide | Practice | Demonstrated by | Status |
|---|---|---|---|---|
| R01 | 1 | Human review after the code exists was never the control | `pipeline.yml` has no review step; `main` deploys on green checks | covered |
| R02 | 2, 5 | Judgment belongs upstream: intent and architecture before code exists | specs are approver-signed before code; the ADR is agent-written and unsigned | partial |
| R03 | 2, 3 | Enforcement belongs in the deployment pipeline: what can't be manual at agent speed is codified into it | every control is a check in `scripts/checks.ts`, run the same way by `npm run checks` locally, in hooks and in `pipeline.yml` | covered |
| R04 | 3 | The human captures intent; the agent implements it | `specs/` change only through `proposals/` and an approver-signed commit; B4. Each spec now states its intent, but the agent drafted those lines and the owner signed them (3706ed5); no customer wrote or confirmed SPEC-014's (see R22) | partial |
| R05 | 3 | Verify intent (was it captured correctly?) and verify behavior (does it match the intent?) separately | check `trace` (B3, B15, B16) ties code and tests to requirements; check `test` for behavior; no customer confirmation of intent | partial |
| R06 | 4 | Backbone from local to telemetry: seconds before commit, minutes in the pipeline, hours in production | hooks (seconds); pipeline checks (minutes); a Lambda log group only (hours) | partial |
| R07 | 4 | SAST | check `sast`, B12 | covered |
| R08 | 4 | DAST | none; the export Lambda has no public URL to test | not covered |
| R09 | 4 | SCA | check `sca` on every committed lockfile, B13 | covered |
| R10 | 4 | Secrets scanning, seconds before commit and minutes in the pipeline | check `secrets`, B5; PreToolUse gitleaks hook | covered |
| R11 | 4 | Feedback from telemetry is part of the design | none | not covered |
| R12 | 5 | AI reads every diff; risk routes to humans | none; only spec, protected-path and irreversible changes need a human | not covered |
| R13 | 5, 12 | Agents write tests and trust is earned: a hook flags an assertion-free test in seconds | check `lint` `vitest/expect-expect`, B1; PostToolUse hook | covered |
| R14 | 6 | T: limit what the agent can do against prompt injection | triage job: read-only contents token, egress allowlist, no shell, `--max-turns 5`; B9 | covered |
| R15 | 6 | K: provenance and integrity checks on inputs against data poisoning | signed, hashed slide snapshot; checks `slides` and `signatures`; B17 | covered |
| R16 | 6 | A: issues, docs and URLs are untrusted, read-only and never executed as instruction | B9 replays issue 4821 under the triage token and egress: every injected action denied | covered |
| R17 | 6, 8 | O: the agent reads telemetry redacted, read-only and untrusted, with no standing prod credentials | OIDC roles only, no standing keys; no redacted telemetry path for the agent | partial |
| R18 | 6, 12 | Slopsquatting: a hallucinated package name is rejected | check `allowlist`, B6 | covered |
| R19 | 7, 13 | Mutation score, not coverage | check `mutation` at break 95, B2; coverage is not reported | covered |
| R20 | 7, 13 | Attestations signed by the pipeline, never the agent; no evidence, no deploy | attest job; check `attestation` in the deploy job, B10 (fails closed while private, D06) | covered |
| R21 | 7 | Provenance: commit, spec ID, agent, model version | custom predicate; agent commits record no model version (D05) | partial |
| R22 | 7 | Intent verification: the customer confirms the spec | none | not covered |
| R23 | 7 | Independent validator: spec to code, code to spec; can fail, never pass | check `trace` verifies both directions; the validator subagent is advisory and nothing runs it | partial |
| R24 | 8, 10 | The agent can write anything and ship nothing; nothing else can change prod | deploy role trusted only by `pipeline.yml` environment `sandbox`; `infra/org` SCP; B11 | covered |
| R25 | 8 | The agent proposes spec and pipeline changes but cannot apply them | `specs/` and every path in `specs/protected-paths.txt` change only through `proposals/` and an approver-signed commit; check `signatures`, B4, B18 | covered |
| R26 | 8 | The agent cannot loosen its own guardrails | check `ratchet`, B7; check `signatures` on protected pipeline paths, B18 | covered |
| R27 | 8 | No standing cloud API keys and no inherited laptop credentials | OIDC roles only; reads of `~/.aws`, `~/.ssh`, `~/.config/gh` denied | covered |
| R28 | 8 | Irreversible actions require human approval; the pipeline enforces it | check `irreversible` requires an approver-signed commit, B14; required reviewers on `sandbox` and `probe` once the repo is public (`github.sh`) | covered |
| R29 | 9 | Untrusted input never sits next to long-lived credentials | triage token `contents: read`, `issues: write`, no secrets; deploy credentials only through OIDC; B9 | covered |
| R30 | 9, 10 | No cache shared with an untrusted job | check `workflows` `deploy-cache`, `cache-mode: none`; B8a | covered |
| R31 | 10 | Pinned inputs | actions by full commit SHA, check `workflows`, B8b; lockfiles with integrity hashes, `npm ci`, pip `--require-hashes`; no container images are used | covered |
| R32 | 10 | One deploy identity | deploy role trust policy, short-lived OIDC credentials | covered |
| R33 | 10 | The pipeline is the most protected thing in the system | workflows, check script and CI tools are protected paths, check `signatures`, B18; zizmor in check `workflows`; ruleset blocks force pushes and deletion | covered |
| R34 | 11 | Prod drift: a prod change with no attested pipeline run or spec trace is redeployed and someone notified | none; no drift monitor exists | not covered |
| R35 | 11 | Pipeline drift freezes deploys | check `workflows` runs on every push; nothing freezes later deploys | partial |
| R36 | 11 | Spec drift freezes deploys | check `signatures` fails every run after an unsigned spec change, B4; a signed fix-forward does not lift it, because the check reads all history | partial |
| R37 | 11 | Break-glass is a separate, alarmed path | break-glass role and EventBridge alarm in `infra/` | covered |
| R38 | 11 | Detection runs in a security account the pipeline can't touch | none; the only detector is in the workload account, applied by the pipeline | not covered |
| R39 | 12 | The human's fix runs the same pipeline as the agent's | `pipeline.yml` has one path for every commit | covered |
| R40 | 12 | Telemetry closes the loop, in hours | none | not covered |
| R41 | 12 | Risk tiers, set in the room, route every change | none | not covered |
| R42 | 12 | Treat every review after the code exists as a defect: root-cause, codify what we can | none | not covered |
| R43 | 12 | Circuit breakers that tighten approval when reverts move | none; the slide itself says there are none yet | not covered |
| R44 | 13 | Make controls machine-checkable; stop treating downstream review as a control | every check prints `CHECK <name> FAILED: <id>` | covered |
| R45 | 13 | Trace every change back to the intent | check `trace` requires `Spec:` only on commits touching `src/` or `test/` | partial |

## Counts

| Status | Count |
|---|---|
| covered | 25 |
| partial | 10 |
| not covered | 10 |

## Practices the audience slides do not state

These rows of `practices.yaml` came from the earlier speaker deck. The owner kept them on 2026-11-02; each cites the nearest audience slide.

| Practice | Cites | Demonstrated by |
|---|---|---|
| P13 Property tests hold invariants across generated inputs | 5 | `test/export.property.test.ts`, check `test` |
| P14 Mutate incrementally to stay in minutes | 4, 7 | Stryker `incremental` mode, check `mutation` |
| P37 Automated reasoning proves agent IAM and pipeline changes grant no new access | 10 | not shown: no policy-analysis check runs on IAM diffs |
| P39 The drift monitor never changes prod itself | 11 | not shown: no drift monitor exists |
| P43 The pipeline has an andon cord | 12 | not shown: nothing can stop the line automatically |
| P46 Agent-written text leaves only through a schema or the pipeline | 9, 12 | triage returns one label through `--json-schema`; B9 |
| P48 Waivers name who can skip a failing check, for how long, with an expiry and a log | 12 | `specs/sca-exceptions.toml`, checks `sca` and `signatures` |

## Controls beyond the slides

Controls the repo demonstrates that no audience slide names. They count toward no slide practice.

| # | Control | Demonstrated by | Status |
|---|---|---|---|
| C01 | Infrastructure as code is checked before deploy | check `iac`: `terraform fmt -check`, `terraform validate` and tflint in `infra/sandbox` and `infra/org` | covered |
| C02 | Separation of duties: the agent cannot approve its own change | agent commits are unsigned; changes to `specs/` and protected paths need an approver-signed commit, check `signatures`; the `validator` subagent works in its own context but is advisory. The owner's own changes are self-approved: `github.sh` sets `prevent_self_review` to false | partial |
| C03 | An agent that reads untrusted input cannot propose spec or pipeline changes | the triage agent's job has `contents: read` and `issues: read`, so it cannot write `proposals/`; a separate job with no agent applies its label. A coding session that reads an issue can still write a proposal | partial |
| C04 | The model is pinned | triage runs `--model ${{ vars.TRIAGE_MODEL }}`, a full model ID set by `github.sh --vars`; agent commits record no model in provenance (D05); no canary for a new model | partial |
