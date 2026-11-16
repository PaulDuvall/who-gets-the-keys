# 0010. Recommend starting strict; this repository starts with fewer approvals

- Status: Accepted. Drafted on 2026-11-16 from the owner's statements that day; the owner settled its four questions the same day ("Owner decisions of 2026-11-16"). Once the batch `proposals/approval-policy/` lands, `CLAUDE.md`'s section "Questions and approvals" carries these rules under the approver's signature, and wins where the two differ, because this file needs no signature
- Date: 2026-11-16
- Requirements: none new. Section 2 restates what SPEC-001-R12, R18, R41 and R232 enforce today. Decisions 0004 and 0005, both proposed, draft the requirements that would enforce section 1 here
- Builds on: decision 0004, "Signed intent, checked delivery" (owner decision, 2026-11-16), "What a human does" and "Deploy tiers"; decision 0005, "Approval tiers"; backlog items `who-gets-the-keys-s3p`, `who-gets-the-keys-x2r`, `who-gets-the-keys-g4e` and `who-gets-the-keys-b7e`
- Adds to decision 0004: the recommendation for other repositories, and the evidence that loosens or tightens an approval. Section 2 summarizes 0004's rule for this repository, and 0004 governs where the two differ
- Sources: the owner, in a session on 2026-11-16. Anthropic, [How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/), by Addy Osmani, Morgan Westlee Lunt and Qing Wang, published 2026-10-15, read 2026-11-16

## Context

The owner holds one view of human approval and runs a narrower version of it here.

The view: start with human approvals across the factory and the pipeline. Remove each one when the evidence shows it catches nothing the checks miss, and add it back when a defect gets through.

This repository: the owner keeps the approvals "less than I would recommend on a 'real' repo" (owner, 2026-11-16). They cover what impacts the specs, and irreversible changes. A backlog change that changes no spec needs no separate approval.

Until now the repository said neither in one place. A reader could take this repository's settings for the recommendation. This record states the recommendation first, then what this repository does, and why the two differ.

The Claude Code team describes the same approach for its own repositories: risk tiers of "no person, one, or two", set by "a classifier" that "reads the change". It recommends "Write down risk tiers, set from the change rather than the author; start strict and loosen with evidence."

## Decision

### 1. The recommendation: start strict, then loosen with evidence

This is what the repository recommends to anyone building a delivery pipeline for agent-written code. This repository does not apply it yet (section 2).

| Tier | People | Changes |
|---|---|---|
| Two | 2 | Policy and the line: who approves, what is protected or excepted, the tier map itself, the check code, a workflow's permissions. Irreversible changes. Anything the tier map does not classify |
| One | 1 | Specs. Ordinary product changes. Sensitive areas, such as an updater or a system prompt |
| None | 0 | Docs, copy and additive changes behind a flag, once the checks and automated review pass. Proven tightenings (0004) |

Four rules go with the tiers:

1. **The change sets the tier, not the author.** The tier map sits in the top tier, so no change can lower its own tier with fewer approvals than that move needs.
2. **An agent's approval never counts as a person's.** The Claude Code post says the same: "Automated review can clear a low-risk change, but it can't fill a slot that calls for a human."
3. **An approval covers one commit.** A new commit needs a new approval, as a signature on a commit already does.
4. **An unclassified change fails closed** to the top tier, as decision 0005 drafts.

Decision 0005 drafts only the two-signer part for this repository: a co-sign for factory changes, and the flag `approval.two_person`. That flag starts off, because `approvers.txt` holds one key and a two-person rule cannot be met. Its tiers are not this section's: in 0005, no signer means only a proven tightening, and product changes and docs need no signer at all.

### 2. This repository: fewer approvals, on purpose

Decision 0004's section "Signed intent, checked delivery" sets this rule. This section summarizes it, with what is enforced today.

| What changes | Approval | Enforced by |
|---|---|---|
| What a spec says: a requirement row, or the slide snapshot | Approver signature | The signatures check, for every path under `specs/` (SPEC-001-R12) |
| Work a backlog item plans that changes a spec | The same signature, when its batch moves the file into `specs/`. The backlog entry needs none | The path, not the backlog text. No check can tell from an edit to `.tasks/backlog.jsonl` whether the work will change a spec |
| A backlog entry, or work, that changes no spec and no protected path | None | Nothing to enforce. `5eb2946` and `ecd877f` landed unsigned |
| The line that enforces the specs: `approvers.txt`, and the 33 entries of `specs/protected-paths.txt`, among them `.github/`, `scripts/checks.ts`, the lockfiles, `tasks/`, `.claude/`, `CLAUDE.md`, `infra/` and `scripts/bootstrap/` | Approver signature | The signatures check (SPEC-001-R12) |
| An irreversible change: a plan that deletes or replaces a DynamoDB table, S3 bucket, RDS instance or KMS key | Approver signature on the commit | The deploy job's plan check (SPEC-001-R18) |
| Everything else | None. The checks decide. Once `who-gets-the-keys-x2r` lands, a commit that touches anything but `docs/`, `proposals/` and `.tasks/` must also align with a signed task | Today, the ordered checks and the `protect main` ruleset (SPEC-001-R1, R41). After x2r, also the task and scope checks (SPEC-001-R64 to R67, R66 amended) |

The line is in this list because it impacts the specs. An unsigned edit to `scripts/checks.ts` could turn off the trace check, and then a spec stops binding the code. The owner's first statement named specs and irreversible changes. The owner confirmed on 2026-11-16 that the line belongs too, as decision 0004 already has it ("Approve the factory").

This repository differs from section 1 in three ways:

- It has one approver, so nothing reaches two.
- Ordinary product changes need nobody.
- The tier map is a fixed path list, not a classifier. That list is `specs/protected-paths.txt`, plus the deployable paths in `pipeline.yml` (SPEC-001-R232). Both are signed.

### 3. Approvals today that section 2 does not call for

| Approval | Why it is still there | What removes it |
|---|---|---|
| The `sandbox` reviewer, on every push to `main` that changes a deployable path (SPEC-001-R232) | A commit can rewrite the checks that judge it. The reviewer is the only human step between that gap and AWS | `who-gets-the-keys-g4e`. The owner set the order on 2026-11-16: s3p, then x2r, then g4e (decision 0004) |
| A person moves `main`, in practice | In these sessions the owner moves `main` with `land.sh --to-main`. The README and `CLAUDE.md` also let a session push an unprotected commit to `main` by its SHA. Either way the ruleset requires only a passing `checks` status (SPEC-001-R41) | Decision 0004 Phase B's promote App, the only identity that may move `main` |
| The `probe` reviewer, on `scenarios.yml`'s on-demand job | `scripts/bootstrap/github.sh` requires a reviewer on `sandbox` and `probe` once the repository is public | Nothing planned. Decision 0004 leaves `probe` unchanged, and it is not on the path to `main` or `sandbox` |

The reviewer is also weaker than it looks. GitHub lets administrators bypass an environment's reviewers by default, and `scripts/bootstrap/github.sh` does not turn that off. Backlog `who-gets-the-keys-b7e` records this, and since 2026-11-16 it covers only reporting changes to the `protect main` ruleset, because g4e removes the reviewer.

### 4. Loosen and tighten on evidence

Each approval should earn its place, here and under section 1. The evidence goes in `docs/factory-log.md`, the file decision 0004 names for rejections. It starts now and is kept by hand: the agent adds rows from the `land.sh` summaries the owner pastes, until decision 0004's rejection job writes them.

| Record | When |
|---|---|
| Each approval: the commit, its tier, approved or rejected, and how long it waited | Every human approval |
| Each rejection of a change whose checks passed: decision 0004's `GATE <environment> REJECTED` line | When a reviewer rejects |
| Each escaped defect: a revert, incident or fix-forward, and the tier its change took | When it is found |

**Loosen:** a class of change may drop one tier after 60 approvals in a row with no rejection. As with tightening, the agent stages the change under `proposals/`, and the owner signs it. This is arithmetic, not a measurement. With 0 rejections in n, the 95% upper bound on the rate at which the approval catches something is about 3/n, so 60 supports a rate under 5%.

**Tighten:** an escaped defect moves its class up one tier until a new check or spec row covers it, as a station stops the line. When the log records an escape, the agent stages the tier change as a batch under `proposals/`, and the owner signs it. No circuit breaker in the pipeline does it. The Claude Code post names an automatic breaker as its own missing piece: "We don't yet have circuit breakers that tighten approval when those numbers move; engineers here want them before more code moves to zero-human merges."

Either change edits the tier map, so it needs the tier map's own approval. Where a class already sits at this repository's top tier, one signature, the escape is answered by a new check alone.

One loosening has happened already, without the record. From 2026-11-11 to 2026-11-13 the owner approved 11 `sandbox` deploys whose plans changed nothing. SPEC-001-R232 then stopped asking for an approval when the deploy cannot change anything.

### 5. Where the repository says this

Wherever the repository describes approvals, it gives section 1 as the recommendation, then section 2 as what it does. That covers the README and `docs/factory-map.md`. The map's subtitle, "A person signs every drawing, not every part", describes section 2.

## Alternatives

| Option | Verdict |
|---|---|
| Run this repository at section 1 now | Rejected for now. One approver cannot meet a two-person rule, and the repository exists to show the checks deciding |
| Require approval of a backlog entry that plans a spec change | Rejected. No check can read intent from a backlog entry. The approval belongs on the spec file |
| Approve only specs and irreversible changes, leaving the line unsigned | Not recommended. An unsigned change to `scripts/checks.ts` could disable the trace check |

## Owner decisions of 2026-11-16

The owner answered the draft's four open questions, each with its recommended option.

| Question | Answer |
|---|---|
| Does "anything that impacts specs" include the line that enforces them? | Yes. The 33 protected paths keep needing a signature (section 2) |
| How many approvals in a row, with no rejection, before a class drops a tier? | 60 (section 4) |
| How does a class move up a tier after an escaped defect? | The agent proposes a signed tier change, and the owner signs it. No automatic circuit breaker (section 4) |
| Does `docs/factory-log.md` start now? | Yes, kept by hand from the `land.sh` summaries (section 4) |

Once the batch `proposals/approval-policy/` lands, `CLAUDE.md` points each session to this record, so a session follows it without asking again.
