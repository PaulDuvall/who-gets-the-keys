# 0005. Signatures and triggers

- Status: Proposed
- Date: 2026-11-06; the owner's revision of the design notes and the owner refinement on risk-based approval recorded 2026-11-06
- Requirements: proposed SPEC-001-R111 to SPEC-001-R143. None is in the signed spec yet. They follow SPEC-001-R110, the highest ID used in `specs/`, `proposals/` and `docs/` (decision 0004). R111 to R119 add approval tiers, co-signs and the ORIGIN and TRIGGER lines. R120 to R124 add release signatures. R125 to R129 add alarm-started runs. R130 to R139 are scenarios B36 to B45, and R140 adds their harness modes. R141 to R143 are release scenarios B46 to B48
- Builds on: decision 0004 (proposed), whose Phases A to D it extends. Decision 0002 (proposed), whose policy file (Phase 1) and signer repository (Phase 3) it needs. Decision 0003 (proposed), whose signature flags co-signs and release tags must assert
- Supersedes in part: decision 0004: "What a human does" rows 2 and 3, two principles, decisions 11 and 14, and the "Where tiers live" row. The principles are "Judgment once, upstream" and "Trusted signals start runs, untrusted text never does". Also R77, R79, R83 and R92, and the owner decision "Reviewer tiers by environment". Also the owner questions on trusted signals and on who reviews production. Decision 0002: R49, and decisions 9 and 14 for release tag runs (see What changes)
- Amends, once approved: signed SPEC-001-R12 (approval tiers and co-signs) and signed SPEC-001-R40 (a deploy from a release tag push)
- Source: the owner's revised notes, [docs/notes/spec-to-production-factory.md](../notes/spec-to-production-factory.md), revised 2026-11-06, and the owner refinement of 2026-11-06

## Context

The owner revised the design notes on 2026-11-06. The revision settles five points raised in an earlier session. 0005 turns them into proposed requirements, and adds the four things the notes' section 6 names.

| # | Point | The owner's settlement | Where in 0005 |
|---|---|---|---|
| 1 | What starts a telemetry run | Only alarms named in signed policy start runs, through a signed alarm-to-spec mapping. Issue fields are data | R125 to R128 |
| 2 | Release signature | Only where the policy tier requires it | R120 to R124 |
| 3 | Approval of every change | Every change needs documented approval. A policy two people signed is that approval, as an ITIL standard change. Auditor acceptance is untested | Regulated environments |
| 4 | Who triggers an alarm run | The two signers of the policy naming the alarm count as its trigger. The release signer differs from both and from the spec's author. So at least three people sign where a release signature is required | R118, R122, R126 |
| 5 | How many signers | Two for policy and pipeline config, one for specs. A proven tightening still needs no signature | R111 to R115, refined below |

Owner refinement, 2026-11-06, after the revised notes:

> Some factory changes will need two human approvers because they're likely changing policies but it can be a risk-based decision.

0005 encodes it as approval tiers that the signed policy sets. Changes that alter policy need two approvers. Listed low-risk factory changes need one. A proven tightening needs none. Anything the policy does not classify fails closed to two. This replaces the revised notes' flat "Pipeline config changes: Two" row. The notes keep the owner's words.

Facts this decision rests on:

| Fact | Evidence | Effect here |
|---|---|---|
| `approvers.txt` has one line: principal `1619259+PaulDuvall@users.noreply.github.com`, key type `sk-ecdsa-sha2-nistp256@openssh.com` | `approvers.txt` | A two-person rule cannot be met today. The rule activates only from a policy switch (R114) |
| A commit carries one approver signature. `commitSignature` returns nothing, and the check fails closed, when more than one header starts with `gpgsig` | `scripts/checks.ts` lines 242 to 259 (SPEC-001-R12, decision 0003) | A second approver needs a second signed object (R115) |
| Git appends every `gpgsig` header into one buffer. OpenSSH's `sshsig_dearmor` stops at the first `END SSH SIGNATURE` marker. Inference from the source, not from a run | git `commit.c`; OpenSSH `sshsig.c` | Two signatures in one commit cannot be verified as two |
| Git's transition design allows one signature per hash algorithm, not one per person | git, hash-function-transition | The same |
| `verifySigned` accepts any one key in `approvers.txt`. Nothing counts distinct signers or compares a signer with an author | `scripts/checks.ts` lines 184 to 192 | R116 names the principal behind each signature |
| `sshSignature` reads the key type from the signature's public key field | `scripts/checks.ts` | Inference: the check can match that key against `approvers.txt` to name the principal |
| `git tag -s` signs with the backend `gpg.format` selects, including `ssh`. `git tag -v` verifies. For SSH, "The principal is only used to identify the key" | git, git-tag; git-config | Inference: verification does not bind the principal to the tagger line. The release check compares principals itself |
| A GitHub environment needs only one of its required reviewers. Prevent self-review excludes only the deployment's initiator | GitHub, Deployments and environments (`docs/verification.md`, "0004: environment reviewers") | Inference: an environment gate alone cannot enforce two signers or three distinct people |
| A tag push can start a workflow. An environment can limit deploys to tags whose name matches a pattern, matched against `GITHUB_REF` | GitHub, Events that trigger workflows; Deployments and environments | Inference: a name rule proves no signature, so the deploy workflow verifies the tag |
| `git tag -v` verifies the tag object only. Nothing compares the object's signed `tag` header with the ref name. Read from source, not run | git `builtin/tag.c` (`verify_tag` marks its ref `UNUSED`) and `tag.c` | A signed tag pushed under another name still verifies. R121 compares the two itself |
| `attest` and `deploy` run only for `refs/heads/main`. `attestationArgs` pins `--source-ref refs/heads/main` | Signed SPEC-001-R40; `pipeline.yml` lines 77 and 114; `scripts/checks.ts` line 319 | A deploy started by a tag push needs R40 amended. It verifies the `main` push run's attestations, so the pins stay |
| zizmor's `impostor-commit` audit finds commits in a repository's fork network that the repository itself lacks. It does not work with `--offline`, which the workflows check passes | docs.zizmor.sh, Audit Rules; `scripts/checks.ts` line 152 | No check today confirms that a new action SHA belongs to the action's own repository. R113 adds one |
| Every file under `specs/` is guarded alike (`f.startsWith("specs/")`). The trace check reads requirement IDs from `specs/*.md` only | `scripts/checks.ts` lines 414 and 431 to 452 | R111 tells specs from the policy files that also sit under `specs/` |
| `specs/receipt-policy.json` does not exist yet | 0002 decision 8 and Phase 1 | Phase I needs 0002 Phase 1 |

### Terms

| Term | Meaning |
|---|---|
| approval tier | How many distinct approvers a change needs: 0 for a proven tightening, 1 or 2 |
| approval class | An entry in the policy's `approval.classes`: a name, `signers`, `paths` and an optional `kind` |
| floor | The files and change kinds R112 holds at two approvers, whatever the classes list |
| co-sign | A commit by a second approver: the change's direct child, with the same tree and a `Co-signs:` trailer |
| principal | The first field of an `approvers.txt` line. R116 takes it from the key that made a signature |
| alarm | A scheduled check workflow named in the mapping. It fails when the threshold the mapping sets is crossed |
| alarm-to-spec mapping | The policy's `signals` list. Each entry names an alarm, its workflow and threshold, spec IDs, a task and limits |
| reader | The quarantined reader: an agent job that reads raw telemetry and emits only the schema fields |
| release signature | An SSH-signed annotated tag on the deployed commit that names the receipt's digest |
| trigger | Who or what started a run: a dispatcher, a task session, or the two signers of an alarm's entry |

## What changes

| Element | Today | Under 0005 |
|---|---|---|
| Signers for a spec | One approver for any change under `specs/` (SPEC-001-R12) | One approver for `specs/SPEC-*.md`, unchanged |
| Signers for policy | One approver | Two approvers once `two_person` is on. Policy means `approvers.txt`, `specs/protected-paths.txt`, the receipt policy, SCA exceptions, `scripts/checks.ts`, `scripts/receipt.ts` and workflow `permissions` |
| Signers for other factory changes | One approver. Under 0004, none for a proven tightening | By tier: none for a proven tightening, one for a listed low-risk kind, two for anything unclassified |
| How a second signature is carried | It cannot be: one signature header per commit | A co-sign commit by a different approver (R115) |
| Who a signer is | Any key in `approvers.txt`; no identity is compared | The principal whose key made the signature (R116) |
| What starts an unattended run | 0004 R92: a failed scheduled workflow tied to a task ID in the policy | An alarm in the signed alarm-to-spec mapping. Two approvers signed its entry, and a rate limit applies (R125 to R128) |
| What a reader decides | 0004 has no reader | Only enumerated fields. Never the spec, the task, the risk tier or whether a run starts (R127) |
| Release | 0004 Phase C: a GitHub environment reviewer on `production` | Where the tier sets `release_signers`, a signed release tag naming the receipt digest, verified before AWS (R120 to R124) |
| Receipt | 0004: FACTORY, INTENT, TASK, AUTHOR and DEPLOY | Adds ORIGIN and TRIGGER. DEPLOY shows the release signer |

What changes in decision 0004:

| 0004 item | Change |
|---|---|
| "What a human does" row 2: factory changes are "applied by the approver's signed commit" | By approval tier: none for a proven tightening, one for a listed low-risk kind, two for policy and anything unclassified (R111 to R115) |
| "What a human does" row 3 and the owner decision "Reviewer tiers by environment": a listed reviewer on `production` | A release signature where the tier sets `release_signers` (R120 to R124). The reviewer stays until B41 to B43 and B46 to B48 pass, then the owner decides |
| Principle "Judgment once, upstream": "An approver signs two things" | One signer for a spec. One or two for a factory change, by tier |
| Principle "Trusted signals start runs, untrusted text never does", and R92: a trusted signal is a workflow file and a task ID | A mapping entry with spec IDs, a task, a threshold and limits, whose last change two approvers signed (R125, R126). R92's five field checks stay |
| R83: the `workflow_run` trigger's `workflows:` list must match the policy | It matches the workflows of the `signals` entries |
| R77: the tier check | A tier may set `release_signers`. Its `reviewers` list becomes optional where it does |
| R79: the DEPLOY line | Adds the release signer and tag, or `release: not required (policy v<n>)` (R124) |
| Decision 11 and "Receipt" | Adds ORIGIN and TRIGGER lines (R118, R119) |
| Decision 14: a change to `scripts/checks.ts` or the policy "always needs an approver signature" | It needs two approvers once `two_person` is on, since both are on the floor (R112) |
| "Deploy tiers", row "Where tiers live": "an approver signature on any tier change" | Two approvers, since the receipt policy is on the floor |
| Owner question "Whether a trusted signal may start a run without the owner", recommendation (b) | (b) becomes the alarm-to-spec mapping. (c) stays rejected |
| Owner question "Who reviews production" | The release signer: listed in `release_signers` and distinct from the cited requirements' and the alarm's signers (R122) |
| R100 to R102: proven tightenings | Unchanged. A proven tightening is tier 0 |
| R80: irreversible changes | Unchanged. They keep an approver signature, whatever the tier |

What changes in decision 0002: R49's `policy not approver-signed` counts the policy's last change as signed only if it meets its tier (R117). Decision 8's policy file gains `approval`, `sources`, `error_classes`, `signals` and `release_signers`. Decision 14 says only the `main` push run deploys. A release tag push now also deploys, to its tier's environment only. Decision 9's `refs/heads/main` pins stay for that run, and R50 is unchanged.

What changes in the signed spec, once approvers sign it:

| Requirement | Change |
|---|---|
| SPEC-001-R12 | The signatures check gives each guarded commit an approval tier and, at tier 2, requires a co-sign by a second approver (R111 to R116). R12's failure lines stay for the first signature |
| SPEC-001-R40 | Adds: WHEN a tag matching `release/<environment>/*` is pushed, and that environment's tier sets `release_signers`, THE pipeline SHALL run only the build and deploy jobs. The deploy job SHALL deploy only to that environment. The attest job still runs only for `refs/heads/main` |
| SPEC-001-R17 | Unchanged. The tag run rebuilds the zip, which is reproducible (0002 decision 14). It verifies the attestations the `main` push run made for that commit, so the `refs/heads/main` pins hold |

### Approval tiers (owner refinement, 2026-11-06)

| Tier | Signers | What the signed policy puts here (recommended split) | Why |
|---|---|---|---|
| none | 0 | A proven tightening (0004 R100 to R102) | Proof replaces judgment. It can only make a check stricter |
| one | 1 | Specs: `specs/SPEC-*.md`. The slide snapshot `specs/source-of-record/slides.txt`. Listed low-risk kinds, first `action-pin`: a pinned action version bump that passes every check | Intent needs one signer (owner). A pin bump changes no policy file or permission. It does change the code that runs with the job's existing permissions, such as the deploy job's `id-token: write`. So R113 accepts only a SHA that the named tag resolves to in the action's own repository |
| two | 2 | `approvers.txt`, `specs/protected-paths.txt` and `specs/sca-exceptions.toml`. The receipt policy `specs/receipt-policy.json`, which holds release tiers, the alarm-to-spec mapping and the classification. `scripts/checks.ts`, which holds `REQUIRED_SIGNATURE_FLAGS`. `scripts/receipt.ts`, which applies R117. Any change to a workflow's `permissions`. Anything the classes do not list | These change policy: who approves, what is protected or excepted, what may start a run, and what ships |

The classification is part of the receipt policy, so changing it is itself a two-approver change. The floor (R112) holds the policy items at two in code, whatever the classes say. `scripts/checks.ts` is on the floor as a whole. It holds the flags, the signatures check and the classifier, so one approver could otherwise weaken the two-person rule (inference). `scripts/receipt.ts` is on it for the same reason: it decides whether the policy's own last change met its tier (R117).

The `action-pin` risk that remains is the action's own repository. A tag moved there to a bad commit still passes R113 (inference). A SHA that exists only in a fork does not.

The slide snapshot is neither a spec nor a policy (repo fact). It records the deck, which is the source of record for every practice. The split puts it at one signer, as an owner decision.

```json
{
  "approval": {
    "two_person": false,
    "classes": [
      { "name": "spec", "signers": 1, "paths": ["specs/SPEC-*.md"] },
      { "name": "source-of-record", "signers": 1, "paths": ["specs/source-of-record/slides.txt"] },
      { "name": "action-pin", "signers": 1, "paths": [".github/workflows/"], "kind": "action-pin" }
    ]
  }
}
```

A commit takes the largest tier among its files. A spec change and a pin bump together need one approver. A spec change and a policy change together need two.

### Co-signs

| Step | What happens | Why |
|---|---|---|
| 1 | The first approver signs the change commit, as today | R12's verification and flags apply unchanged |
| 2 | A second approver makes a co-sign: one parent, the change; the same tree; a final `Co-signs: <full SHA>` trailer; their own signature | A commit object names its parent by hash. Inference: signing the co-sign attests to the change's exact content |
| 3 | Both land in one push. The candidate run's signatures check refuses the change alone, so `main` refuses it too | SPEC-001-R41: `main` moves only to a commit on which `checks` passed |
| 4 | The co-sign changes no file, so it is not itself a guarded commit | Its signature is still verified, with `approvers.txt` and flags as of the change's parent |

Each tier 2 commit needs its own co-sign. A batch that puts its tier 2 changes in one commit needs one. The landing script stops before the candidate push and prints the co-sign step for the second approver (K12). 0004's promote fast-forwards to the co-sign, which is approver-signed, so R66 exempts it from the task rule.

### Activation

`approval.two_person` starts `false`, because this repository has one approver. The signatures check reads it as of each commit's parent, as it reads `approvers.txt` and `REQUIRED_SIGNATURE_FLAGS`. So the commit that turns it on is judged by its parent and lands on one signature. From its child on, tier 2 needs a co-sign.

| Step | Commit | Signers it needs |
|---|---|---|
| 1 | Add the second approver's security key to `approvers.txt` | One: `two_person` is still off |
| 2 | Set `approval.two_person` to `true` | One: its parent's policy has it off |
| 3 | Any later tier 2 change | Two: a signature and a co-sign |
| 4 | A change that turns `two_person` off | Two: its parent's policy has it on |

A HEAD whose policy turns the switch on while `approvers.txt` holds one principal fails (R114). So the switch cannot lock out every later policy change. A two-person rule is enforced against a lone approver only once 0004's R109 runs `signatures` with `main`'s check code. Before that, the candidate's own `scripts/checks.ts` judges it (0002's known gap).

### Release signatures by tier (Phase III)

| Element | Under 0005 |
|---|---|
| When it is required | Only where the environment's tier sets `release_signers`. Not on every change (owner) |
| What the human does | Reviews in staging (`sandbox`) whether the change does what the user wanted. Then signs the release. The signature attests to intent and outcome, not to the code |
| What is signed | An annotated tag `release/<environment>/<n>` on the deployed commit, made with `git tag -s`. Its message holds one line `Receipt: sha256:<digest>`. Its signed `tag` header names the environment, and R121 requires it to equal the pushed ref's name |
| When it is reachable | Only once a complete receipt exists. The tag names the receipt's digest, and the release check compares it with the receipt the receipt check verified |
| What starts the deploy | The tag push. `pipeline.yml` at the tagged commit runs only its build and deploy jobs (SPEC-001-R40, amended). The deploy job calls the signer repository's reusable deploy workflow at the policy's SHA (0004 R78) |
| Which attestations and receipt | Those the `main` push run made for the tagged commit. The build rebuilds the reproducible zip, and the R17 and R50 pins stay `refs/heads/main`. No attest job runs on a tag |
| Which commit | Only `main`'s tip when the release check runs. So an old signed tag cannot redeploy an old commit, and a key removed at the tip signs nothing (R120, R121) |
| Where it is verified | The release check, in that reusable workflow, after `attestation`, `receipt` and `tier`, before any AWS call |
| The environment | Deploys limited to tags matching `release/<environment>/*`. A name rule proves no signature, so the release check still verifies (inference) |
| Who may sign | A principal listed in the tier's `release_signers`, distinct from the cited requirements' and the alarm's signers (R122) |
| What it is | A gate, in this repository's sense: a human approval |
| 0004's `production` reviewer | Stays until B41 to B43 and B46 to B48 pass on `main`. Then the owner decides whether the signature replaces it |
| Irreversible changes | Keep the approver signature on HEAD (SPEC-001-R18, 0004 R80), whatever the tier |

Inference: a receipt that the tag run rendered from its own run would differ from the one the signer read. The receipt names the signer ref (0002 R55), and the test result names its run (R46). So the tag run renders the receipt from the `main` push run's attestations. Whether those bytes match is in Not yet verified.

Commands the release signer runs on `main`'s tip, once the `main` push run's receipt shows in its run summary:

```sh
git tag -s release/production/<n> -m "Receipt: sha256:<digest>" <SHA>
git push origin release/production/<n>
```

Push one release tag per push. GitHub creates no events for tags when more than three are pushed at once.

### Distinct people

| Run started by | Its trigger | The release signer must differ from | People at least |
|---|---|---|---|
| The owner's dispatch or a task session | The dispatcher or session owner, as reported | Each signer and co-signer of a commit that added or changed a cited requirement's row (R122). Open: also the dispatcher, pending the owner decision on dispatchers below | 2 |
| An alarm | The two signers of the alarm's mapping entry (R126) | The cited requirements' signers, and both entry signers | 3 |

A cited requirement is one the signed task's `requirements`, an INTENT record or the alarm's entry names (R122). The agent's `Spec:` trailers can only add to that set.

A spec's signer may also be an entry signer, so an alarm run needs three people, not four. The check compares principals, not people. One person who holds two principals defeats it. `approvers.txt` is on the floor, so once two-person approval is on, each new principal needs two approvers.

### Alarm-started runs (Phase IV)

0004 R92 let a failed scheduled workflow start one named task. 0005 keeps R92's five field checks and replaces its pair with a mapping entry. The entry, not a reader, chooses the spec and the task.

| Step | What happens | Requirement |
|---|---|---|
| 1 | A scheduled check workflow named in an entry fails when the entry's threshold is crossed | R125 |
| 2 | `producer.yml` receives `workflow_run`. R92's five fields must hold: `failure`, `schedule`, `main`, this repository and the listed path | 0004 R83, R92 |
| 3 | The signal check finds the one entry for that path. Its spec IDs must exist at `main`, and its task must cite exactly those IDs | R125 |
| 4 | The entry's last change must carry two distinct signers. They become the run's trigger | R126 |
| 5 | Fewer than `max_runs_per_day` runs from that entry in the last 24 hours | R128 |
| 6 | Where a reader runs, its record holds only `source`, `error_class`, `location` and `count`. Notes go to a separate record for humans | R127 |
| 7 | The producer gets the task and the accepted record as data. It never gets free text | R127; 0004 R92 |
| 8 | Scope caps the delivery at `max_changed_lines`. Over the cap, promote moves nothing and a human decides | R129 |
| 9 | The receipt shows `ORIGIN untrusted telemetry` and `TRIGGER alarm <name>` with its two signers | R118, R119 |

An attacker can still trip an alarm, but only one from the signed list. Steps 5 and 8, the task's `produces` and the sandboxed producer limit what that run can do. The mapping limits where it can happen.

```json
{
  "sources": { "internal": 0, "public issue": 2, "telemetry": 2 },
  "error_classes": ["<enumerated list, owner decision>"],
  "signals": [
    {
      "alarm": "export-latency",
      "revision": 1,
      "workflow": ".github/workflows/latency-probe.yml",
      "threshold": { "p95_ms": 500, "window_minutes": 60 },
      "spec": ["SPEC-014-R6"],
      "task": "TASK-LATENCY",
      "max_runs_per_day": 2,
      "max_changed_lines": 200
    }
  ]
}
```

The entry is an example. No such workflow, task or threshold exists today. Raising `revision` in a two-approver commit re-signs an entry whose content is otherwise unchanged (R126).

### Receipt

Example lines, with placeholders, for an alarm-started run:

```text
INTENT  SPEC-014-R6  specs/SPEC-014-export-latency.md sha256:<digest>  approved <commit>  touch
TASK    TASK-LATENCY  tasks/TASK-LATENCY.task.md sha256:<digest>  base <commit>  producer run <run ID>
ORIGIN  untrusted telemetry  tier 2  fields error_class location count  reader sha256:<digest>
TRIGGER alarm export-latency  policy v8  signed alice@example.com and bob@example.com
DEPLOY  production  receipt verified  release: carol@example.com release/production/12
```

And for a dispatched run:

```text
ORIGIN  internal  tier 0
TRIGGER dispatch by <login> (<user ID>)
```

| Line | Holds | Source |
|---|---|---|
| ORIGIN | `untrusted telemetry` for an alarm-started run, else `internal`. The risk tier comes from the policy's `sources` table, never from the record. Then the accepted field names, or `no fields`, and the reader record's SHA-256 | R119 |
| TRIGGER | `dispatch by <login> (<user ID>)`, `task session on <branch>, as reported`, or `alarm <name>` with the policy version and the entry's two signers | R118 |
| DEPLOY | 0004's line, plus `release: <principal> <tag>` or `release: not required (policy v<n>)` | R124, extending 0004 R79 |

## Regulated environments

The owner's claim, in section 4 of the notes: every change needs documented approval, and a policy signed by two people is that approval. 0005 makes those signatures checkable. Whether auditors accept them is untested.

### What the standards say (read 2026-11-06)

| Source | Text | Implication here |
|---|---|---|
| PCI DSS 6.2.3 | "Bespoke and custom software is reviewed prior to being released into production or to customers, to identify and correct potential coding vulnerabilities" | Code review before release is required. Inference: nothing in it says the review must be manual |
| PCI DSS 6.2.3.1 | "If manual code reviews are performed for bespoke and custom software prior to release to production, code changes are: Reviewed by individuals other than the originating code author" | Applies only to a manual review. 6.2.3 still requires a review before release, and nothing in it requires a manual one (inference) |
| PCI DSS 6.5.1 | "Changes to all system components in the production environment are made according to established procedures that include: ... Documented change approval by authorized parties" | Every change needs a documented approval record. Inference: the text does not say the approval must be a human act on each change |
| PCI DSS 6.5.3 and 6.5.4 | "Preproduction environments are separated from production environments and the separation is enforced with access controls." Roles are separated "such that only reviewed and approved changes are deployed" | Supports keeping the agent's environment away from release (inference) |
| NIST SP 800-53 rev. 5, CM-3 a to d | "Review proposed configuration-controlled changes to the system and approve or disapprove such changes"; "Document configuration change decisions" | Approval is required. Under CM-3a the organization defines which change types are configuration-controlled. Inference: the mechanism is not specified |
| CM-3(1) | Automated mechanisms "Notify [Assignment: organization-defined approval authorities] of proposed changes to the system and request change approval" and "Prohibit changes to the system until designated approvals are received" | The workflow around approval is automated. Approvals still come from approval authorities, so this does not automate the decision. csf.tools lists it in the High baseline only |
| CM-3(3) | "Implement changes to the current system baseline and deploy the updated baseline across the installed base using [Assignment: organization-defined automated mechanisms]" | csf.tools marks it "(Not part of any baseline)" |
| ITIL 4 Foundation glossary | "standard change: A low-risk, pre-authorized change that is well understood and fully documented, and which can be implemented without needing additional authorization." | The precedent for approval at the policy. The AXELOS 2011 glossary reads "A pre-authorized change that is low risk, relatively common and follows a procedure or work instruction" |
| PeopleCert, "How DevOps complements ITIL and enterprise governance" | "Approval can become more risk-based. Routine, well-understood, low-risk changes can flow through standard automated paths. Higher-risk changes can receive deeper review." | Fits the owner refinement's risk-based split. It is an article, not the glossary |

Source of the PCI text: Microsoft Learn's requirement 6 page, which names no version and was last updated 2023-10-23. Its series overview names PCI DSS v4.0, so "reflects v4.0" is an inference. The council's v4.0.1 PDF needs a click-through license, which was not accepted for the owner. The v4.0.1 wording is in Not yet verified.

| Statement | Status |
|---|---|
| Every change needs documented approval | Quoted above: PCI DSS 6.5.1 and NIST CM-3 |
| A policy signed by two people is that approval, as an ITIL standard change is pre-authorized | Inference. Untested with auditors |
| 0005 makes the approval checkable: R111 to R117 refuse a policy change without its signers, and the receipt names them | Design, once approved |
| Auditors accept it | Not yet verified. A regulated pilot settles it |

Draft mapping for the pilot (inference):

| Requirement item | Receipt line or check |
|---|---|
| 6.5.1: reason for, and description of, the change | INTENT (signed spec), TASK and FILES |
| 6.5.1: documentation of security impact | PASS lines for `secrets`, `workflows`, `sast` and `sca`; ORIGIN |
| 6.5.1: documented change approval by authorized parties | INTENT's approving commit, FACTORY's version and its signers, TRIGGER, and DEPLOY's release signer |
| 6.5.1: testing | PASS lines for `test` and `mutation` |
| 6.5.1: procedures to address failures | Nothing yet. `docs/factory-log.md` (0004 decision 16) is a candidate |
| CM-3(1) d: prohibit changes until approvals are received | `signatures` (R115), receipt admission (0004 R99) and `release` (R120) |
| CM-3 c: document change decisions | Signed commits, co-signs and the receipt |

## Decisions (proposed)

| # | Decision |
|---|---|
| 1 | Approval is risk-based and set in the signed policy (owner refinement, 2026-11-06). A proven tightening needs 0 approvers, specs and listed low-risk kinds 1, and policy and anything unclassified 2 |
| 2 | A floor in the check code holds the policy items at two. A class that lists one of them lower fails (R112) |
| 3 | The second signature is a co-sign commit by a different approver (R115). The alternatives are an owner decision |
| 4 | A signer is the principal whose key made the signature, never an author, committer or tagger line (R116) |
| 5 | Two-person approval applies from the first commit whose parent's policy turns it on. A HEAD with the switch on and one principal fails (R114) |
| 6 | A release signature is required only where the tier sets `release_signers`. It is an SSH-signed annotated tag naming the receipt digest, verified before any AWS call (R120 to R124). Its push deploys only `main`'s tip, and only to its own environment (SPEC-001-R40 amended, R120, R121) |
| 7 | The release signer differs from every signer of each cited requirement's row. For an alarm-started run, it also differs from both entry signers (R122) |
| 8 | Only alarms in the signed alarm-to-spec mapping start unattended runs. The entry chooses spec and task, and two approvers signed its last change (R125, R126) |
| 9 | A reader emits enumerated fields only. Its free text never reaches the producer (R127) |
| 10 | Alarm runs are rate-limited and capped in changed lines. Over the cap, a human decides (R128, R129) |
| 11 | The receipt gains ORIGIN and TRIGGER lines, and DEPLOY shows the release signer (R118, R119, R124) |
| 12 | A two-person signed policy is the documented approval of each change it governs, as an ITIL standard change. Auditor acceptance is untested (inference) |

## Plan

Four phases, alongside 0004's. No phase removes a human approval before its replacement exists. Each phase lands as one push whose last commit is approver-signed and carries a `Spec:` trailer. From Phase II, a tier 2 change in it also carries a co-sign.

| Phase | Delivers | Human step still in place | Needs |
|---|---|---|---|
| I. Approval tiers and co-signs | The classifier, the floor, `action-pin`, the co-sign rule, principal lookup, `two_person: false`, ORIGIN and TRIGGER for dispatched and session runs, and B36 to B40 | Every protected change keeps one approver signature, as today. Nothing is removed | 0002 Phase 1 (the policy file and the receipt); 0004 Phase A (task records). Tier 0 arrives with 0004 Phase B (R100 to R102) |
| II. Activation | A second approver's security key in `approvers.txt`, then `two_person: true` | Adds a second approver for tier 2. Removes nothing | Phase I and a second person. Recommended after 0004 Phase B, whose R109 stops a lone approver skipping the rule in the same commit |
| III. Release signatures by tier | `release_signers` in tiers, the release check, the tag rule, the release tag run (R40 amended), the DEPLOY release field, and B41 to B43 and B46 to B48 | 0004's `production` reviewer stays until B41 to B43 and B46 to B48 pass on `main`. Irreversible changes keep the approver signature | 0004 Phase C, 0002 Phase 3's reusable deploy workflow, and Phase II, so the tier change itself has two signers |
| IV. Alarm-started runs | The `signals` mapping, the signal check, the reader record, the rate limit and diff cap, the alarm values on ORIGIN and TRIGGER, and B44 and B45 | The owner dispatches each run until B44 and B45 pass on `main` and the owner approves the first entry | 0004 Phase D, Phase II for two-signed entries, and Phase III for B45 |

### Tasks

| ID | Phase | Task | Files | Protected | Verified by |
|---|---|---|---|---|---|
| K01 | I | Spec amendment: an "Approval tiers" section with R111 to R119, R130 to R134 and R140; R12 amended | `proposals/SPEC-001-delivery-pipeline.md` | yes | trace passes once K03 to K06 name each in a test title |
| K02 | I | Policy: `approval` with `two_person: false` and the three classes, and the `sources` table | `proposals/receipt-policy.json` | yes | `test/approval.test.ts` parses it |
| K03 | I | `checks.ts`: tier per commit, the floor, `action-pin` with its tag lookup, the co-sign rule, principal lookup and activation. Add a first-parent child lookup from HEAD for R115. Today's walk lists every reachable commit and compares each with its first parent only. Reuse 0004's raw-blob reader and R100's unclassifiable list | `proposals/scripts/checks.ts`, `test/approval.test.ts` | yes, except the test | one test per identifier in R111 to R116; the mutation check |
| K04 | I | `receipt.ts`: ORIGIN and TRIGGER lines; R49 reads the policy's tier | `proposals/scripts/receipt.ts`, `test/receipt.test.ts` | yes, except the test | snapshot test of the rendered lines |
| K05 | I | Harness mode `cosign-verify` with stand-in security keys made at run time, as `test/signatures.test.ts` does. Scenarios B36 to B40 | `proposals/scenarios/run.ts`, `scenarios/scenarios.yaml`, the B36 to B40 patches, `scenarios/fixtures/approval/` | `run.ts` only | `npm run scenarios -- B36` to `-- B40` print their lines |
| K06 | I | Scenario table rows R130 to R134; `cosign-verify` treated as a local mode | `test/scenarios.test.ts` | no | trace and test checks |
| K07 | I | Map B36, B37, B39 and B40 to P49, and B38 to P45; plain words; traceability rows | `practices.yaml`, `video/explanations.yaml`, `docs/practices.md`, `traceability.md` | no | slides and test checks |
| K08 | I | A co-sign helper for the second approver. It prints the change's file list and the co-sign command for one SHA, then verifies the result | `proposals/scripts/bootstrap/co-sign.sh` | yes | `bash -n`; it prints no `#` comment |
| K09 | I | Approver lands Phase I | K01 to K08 | yes | `npm run checks` and `npm run scenarios` pass on `main` with `two_person` off |
| K10 | II | Owner enrolls a second person's security key, through the rotation script extended to add a principal | `proposals/scripts/bootstrap/rotate-approver-key.sh`, `approvers.txt` | yes; owner only | the signatures check's final step finds no software key |
| K11 | II | Activation commit: `two_person: true` | `specs/receipt-policy.json` | owner only | it lands on one signature; the next tier 2 commit fails without a co-sign |
| K12 | II | Landing: a batch with a tier 2 commit stops before the candidate push and prints the co-sign step. `CLAUDE.md` conventions say so | `proposals/scripts/bootstrap/land.sh`, `proposals/CLAUDE.proposed.md` | yes | `bash -n`; approver review |
| K13 | III | Spec amendment R120 to R124, R135 to R137 and R141 to R143; R40 amended for the release tag run; R77 and R79 amended | `proposals/SPEC-001-delivery-pipeline.md` | yes | trace passes once K15, K17 and K18 name each in a test title |
| K14 | III | Policy: `release_signers` on the example `production` tier | `proposals/receipt-policy.json` | yes | R120 tests |
| K15 | III | `checks.ts`: the `release` check and the `release-without-tag` workflows rule; `receipt.ts`: the DEPLOY release field and the receipt rendered from the `main` push run's attestations | `proposals/scripts/checks.ts`, `proposals/scripts/receipt.ts`, `test/release.test.ts` | yes, except the test | one test per identifier in R120 to R122 and R124; one receipt rendered from one attestation fixture under two run contexts, compared byte for byte |
| K16 | III | Signer repository's reusable deploy workflow: `release` after `tier` where the tier sets `release_signers`. `pipeline.yml` runs only build and deploy on `release/*/*` tag pushes (R40 as amended) | signer repository, `proposals/github-workflows/pipeline.yml` | owner only; yes | `npm run check:workflows`; one tag-started signer workflow run whose zip digest and receipt digest equal the `main` push run's |
| K17 | III | `github.sh`: the tag rule `release/<environment>/*` on environments whose tier sets `release_signers` | `proposals/scripts/bootstrap/github.sh`, `test/checks-before-main.test.ts` | yes, except the test | stub-`gh` tests on the environment bodies |
| K18 | III | Harness mode `release-verify`; scenarios B41 to B43 and B46 to B48; scenario table rows R135 to R137 and R141 to R143 | `proposals/scenarios/run.ts`, `scenarios/`, `test/scenarios.test.ts` | `run.ts` only | `npm run scenarios -- B41` to `-- B43`, and `-- B46` to `-- B48` |
| K19 | III | Map B41 to B43 and B46 to B48 to P45 | `practices.yaml`, `video/explanations.yaml`, `docs/practices.md`, `traceability.md` | no | slides and test checks |
| K20 | III | Approvers land Phase III | K13 to K19 | yes | a `production` deploy from an unsigned tag fails the release check |
| K21 | IV | Spec amendment R125 to R129, R138 and R139; R83 and R92 amended | `proposals/SPEC-001-delivery-pipeline.md` | yes | trace passes once K23 and K25 name each in a test title |
| K22 | IV | Policy: `signals` and `error_classes`, after the owner decisions on thresholds, format and error classes | `proposals/receipt-policy.json` | yes | R125 tests |
| K23 | IV | `checks.ts`: the `signal` check and the scope diff cap | `proposals/scripts/checks.ts`, `test/factory.test.ts` | yes, except the test | one test per identifier in R125 to R129 |
| K24 | IV | The driver passes the accepted reader record as a data file and no free text | `proposals/scripts/ci/producer.ts`, `test/producer.test.ts` | yes, except the test | an argv and file test for R127 |
| K25 | IV | Harness mode `signal-verify`; scenarios B44 and B45; scenario table rows R138 and R139 | `proposals/scenarios/run.ts`, `scenarios/`, `test/scenarios.test.ts` | `run.ts` only | `npm run scenarios -- B44` and `-- B45` |
| K26 | IV | Map B44 to P15 and B45 to P45 | `practices.yaml`, `video/explanations.yaml`, `docs/practices.md`, `traceability.md` | no | slides and test checks |
| K27 | IV | Approvers land Phase IV, and two approvers sign the first mapping entry. Any entry signed before Phase II gets its `revision` raised in a two-approver commit | K21 to K26 | yes | `npm run checks` and `npm run scenarios` pass on `main` |

The agent cannot sign, so it cannot run the new scenarios against a protected batch before it lands. Each phase's last task runs them on `main`, as in 0004. Protected files go under `proposals/`, as `CLAUDE.md` says.

## Draft requirements

Scenario rows read: WHEN the harness runs scenario `<ID>` in the mode its `run` field names, THE first failing check SHALL be the named check. Its output SHALL contain the expected line.

| ID | Requirement |
|---|---|
| SPEC-001-R111 | WHEN the signatures check judges a commit that touches `specs/`, `approvers.txt` or a protected path, THE signatures check SHALL give it an approval tier. It SHALL read the tier from `specs/receipt-policy.json` as of the commit's parent. The tier SHALL be 0 only IF the classifier proves the commit a tightening (R100, R101). Otherwise each changed file SHALL take the largest `signers` among the `approval.classes` that match it, and 2 where none matches. A class SHALL match by path as `specs/protected-paths.txt` does, with `*` matching within one path segment. WHERE a class names a `kind`, it SHALL match only a change of that kind (R113). A symlink, gitlink or mode change SHALL take 2. The commit's tier SHALL be the largest of its files' tiers. IF the parent's policy exists and does not parse, THEN THE signatures check SHALL print `CHECK signatures FAILED: approval policy unreadable`. IF a class's `signers` is not the integer 1 or 2, THEN it SHALL print the same line. |
| SPEC-001-R112 | THE signatures check SHALL give tier 2 to any change, other than a proven tightening, to `approvers.txt`, `specs/protected-paths.txt`, `specs/receipt-policy.json`, `specs/sca-exceptions.toml`, `scripts/checks.ts` or `scripts/receipt.ts`, whatever the classes list. It SHALL parse both blobs of each changed file under `.github/workflows/`. IF a workflow-level or job-level `permissions` value differs, or a blob does not parse, THEN that file SHALL take tier 2. IF a class with `signers` below 2 matches one of those six paths, as of any commit's parent or at HEAD, THEN it SHALL print `CHECK signatures FAILED: classification below floor <path>`. |
| SPEC-001-R113 | A change SHALL be of kind `action-pin` only IF its file is a UTF-8 regular file under `.github/workflows/` at both the parent and the commit. Both blobs SHALL have the same lines, except lines whose text after indentation and an optional `- ` is `uses: <action>@<40 lowercase hex> # <tag>`. Each such line SHALL keep its position and its `<action>`. Only the SHA and the tag SHALL differ. Each new SHA SHALL be the commit that `<tag>` resolves to in the repository that `<action>`'s first two path segments name. THE signatures check SHALL read that from GitHub when it runs. IF it cannot confirm one, THEN the change SHALL NOT be of kind `action-pin`. Any other change SHALL NOT be of kind `action-pin`. |
| SPEC-001-R114 | WHILE `approval.two_person` in the policy as of a commit's parent is not `true`, THE signatures check SHALL judge a tier 2 commit as tier 1. IF `approval.two_person` is `true` at HEAD and `approvers.txt` at HEAD holds fewer than two distinct principals, THEN it SHALL print `CHECK signatures FAILED: two-person approval with one approver`. |
| SPEC-001-R115 | WHERE a commit's tier is 2, THE signatures check SHALL accept it only IF its child on the first-parent walk to HEAD is a co-sign for it. A co-sign SHALL have that commit as its one parent and the same tree. Its message SHALL end with exactly one `Co-signs: <full SHA>` trailer naming that commit. Its signature SHALL pass R12's verification and flags, with `approvers.txt` and `REQUIRED_SIGNATURE_FLAGS` as of the change's parent. Its principal (R116) SHALL differ from the change's. IF no co-sign follows, THEN it SHALL print `CHECK signatures FAILED: second approver needed for <path>`. IF the principals are equal, THEN it SHALL print `CHECK signatures FAILED: co-signed by the same approver for <path>`. IF the next commit names the change but its tree differs, THEN it SHALL print `CHECK signatures FAILED: co-sign changes files for <path>`. `<path>` SHALL be the change's first tier 2 file in byte order. |
| SPEC-001-R116 | THE signatures check and the release check SHALL take a signature's principal from the `approvers.txt` line whose public key equals the key in the signature. They SHALL NOT take it from an author, committer or tagger line. IF a line's principal field holds a comma or a wildcard, or two lines with different principals hold the same key, THEN THE signatures check SHALL print `CHECK signatures FAILED: ambiguous principal in approvers.txt`. IF a line carries a `cert-authority` option, or no line's public key equals the key in the signature, THEN it SHALL print the same line. THE release check SHALL print `CHECK release FAILED: ambiguous principal in approvers.txt` in each of these cases. |
| SPEC-001-R117 | WHEN the receipt check reads the policy for SPEC-001-R49, THE receipt check SHALL count the policy's last change as approver-signed only IF it meets its tier (R111 to R115). IF it does not, THEN the R49 identifier `policy not approver-signed` SHALL apply. |
| SPEC-001-R118 | WHEN the build job writes a task record (R70), THE build job SHALL add a trigger record. For a producer run started by `workflow_dispatch`, it SHALL hold `dispatch by <login> (<user ID>)` from `github.actor` and `github.actor_id`. For a task session's delivery, it SHALL hold `task session on <branch>, as reported`. For an alarm-started run, it SHALL hold `alarm <name>`, the policy version and the principals R126 found. THE receipt SHALL show one TRIGGER line per record. |
| SPEC-001-R119 | THE build job SHALL add an origin record to each task record. For an alarm-started run, it SHALL hold `untrusted telemetry` and the tier the policy's `sources` table gives `telemetry`. It SHALL then hold the field names and SHA-256 of the reader record R127 accepted, or `no fields`. For any other run, it SHALL hold `internal` and the tier `sources` gives `internal`. A reader record's `source` field SHALL NOT set the origin or its tier. THE receipt SHALL show one ORIGIN line per record. IF an alarm-started run's delivery has no origin record, THEN THE build job SHALL print `CHECK receipt FAILED: missing origin <task ID>`. |
| SPEC-001-R120 | WHERE the target environment's tier sets `release_signers`, THE reusable deploy workflow SHALL run the release check after `tier` and before any AWS call. THE release check SHALL first compare the deployed commit with `main`'s tip, fetched when it runs. IF they differ, THEN it SHALL print `CHECK release FAILED: <tag> is not on main's tip`, naming the pushed tag. It SHALL then list the annotated tags that point at the deployed commit and match `release/<environment>/*`. IF there is none, THEN it SHALL print `CHECK release FAILED: <environment> needs a release signature`. It SHALL verify each tag, in byte order of name, with `git tag -v` and `approvers.txt` at `main`'s tip as allowed signers. IF verification fails, THEN it SHALL print `CHECK release FAILED: <tag> not signed by an approver`. The tag's SSH signature SHALL pass R12's key-type and flag rules, with `REQUIRED_SIGNATURE_FLAGS` at `main`'s tip. IF it does not, THEN it SHALL print `CHECK release FAILED: release signature without <flags>: <tag>`. |
| SPEC-001-R121 | THE release check SHALL accept a verified tag only IF the tag object's signed `tag` header equals the tag's ref name without `refs/tags/`. IF not, THEN it SHALL print `CHECK release FAILED: <ref name> was signed as <header name>`. Its message SHALL hold exactly one line `Receipt: sha256:<digest>`. The digest SHALL equal the SHA-256 of the receipt the receipt check verified in that run. IF not, THEN it SHALL print `CHECK release FAILED: <tag> names another receipt`. THE receipt check SHALL render that receipt from the attestations the `main` push run made for the deployed commit. The tag's principal (R116) SHALL be in the tier's `release_signers` in the policy at `main`'s tip. IF not, THEN it SHALL print `CHECK release FAILED: <environment> release signed by unlisted <principal>`. THE release check SHALL pass on the first tag that meets R120 to R122. Otherwise it SHALL print the first tag's first failure. |
| SPEC-001-R122 | THE release check SHALL take as cited requirements each task record's task `requirements` (R70) and each INTENT record's ID (SPEC-001-R63). WHERE the trigger record names an alarm, it SHALL also take the entry's `spec` list. For each cited requirement, it SHALL find every commit reachable from the deployed commit that added or changed its row. A row is the line in its spec file that starts with `\| <requirement ID> \|`. THE release check SHALL accept a tag only IF its principal differs from each principal that signed or co-signed one of those commits (R115, R116). WHERE the trigger record names an alarm, the principal SHALL also differ from each principal that record lists. IF it does not, THEN it SHALL print `CHECK release FAILED: release signer <principal> also signed <requirement ID>`. For an alarm signer it SHALL print `CHECK release FAILED: release signer <principal> also signed alarm <name>`. WHERE the owner adopts option (b) on a spec's author, it SHALL also refuse a principal equal to one of those commits' author emails. WHERE the owner adopts the policy's `people` map, it SHALL also refuse the dispatcher's principal. |
| SPEC-001-R123 | WHERE a tier sets `release_signers`, `scripts/bootstrap/github.sh` SHALL limit that environment's deployments to tags matching `release/<environment>/*`. IF it does not, THEN THE test check SHALL print `CHECK test FAILED: test/checks-before-main.test.ts`. `pipeline.yml` SHALL deploy to such an environment only from a tag push of that pattern. IF it does otherwise, THEN THE workflows check SHALL print `CHECK workflows FAILED: release-without-tag`. |
| SPEC-001-R124 | THE DEPLOY line (R79) SHALL also show `release: <principal> <tag>` WHERE the tier sets `release_signers`, and `release: not required (policy v<n>)` otherwise. |
| SPEC-001-R125 | THE `signals` list in `specs/receipt-policy.json` SHALL replace R92's trusted-signal pairs. Each entry SHALL hold an `alarm` name, a `revision` integer, a `workflow` file under `.github/workflows/`, a `threshold`, 1 to 16 `spec` IDs, a `task` ID, `max_runs_per_day` and `max_changed_lines`. WHEN a `workflow_run` event passes R92's five field checks, THE signal check SHALL find the one entry whose `workflow` equals the event's path. IF there is none, THEN it SHALL print `CHECK signal FAILED: <path> is not a mapped alarm`. IF a `spec` ID is not defined in `specs/` at `main`, THEN it SHALL print `CHECK signal FAILED: <alarm> cites unapproved <requirement ID>`. IF the task's `requirements` differ from `spec`, THEN it SHALL print `CHECK signal FAILED: <alarm> task cites other requirements`. Only the entry SHALL choose the spec and the task. |
| SPEC-001-R126 | THE signal check SHALL find the last commit reachable from `main` that changed the entry, compared as canonical JSON. It SHALL find the principals of that commit's signature and co-sign (R115, R116). IF they are fewer than two distinct principals, THEN it SHALL print `CHECK signal FAILED: <alarm> not signed by two approvers`. They SHALL be the trigger record's principals (R118). |
| SPEC-001-R127 | WHERE an alarm-started run receives a reader record, THE signal check SHALL accept it only IF it holds the keys `source`, `error_class`, `location` and `count`, and no other. IF it holds another key, THEN it SHALL print `CHECK signal FAILED: reader field <key>`, naming the first in byte order. `source` SHALL be `telemetry`, the source an alarm implies, and `error_class` SHALL be in the policy's `error_classes`. `location` SHALL be a file and line that exist at the base commit, and `count` an integer of at least 1. IF a value fails, THEN it SHALL print `CHECK signal FAILED: invalid <field>`. THE driver SHALL pass the accepted record to the producer as a data file, and SHALL pass no free text. IF it passes other text, THEN THE test check SHALL print `CHECK test FAILED: test/producer.test.ts`. |
| SPEC-001-R128 | WHEN an entry would start a run, THE signal check SHALL count the producer runs that entry started in the 24 hours before the event. IF the count is at least `max_runs_per_day`, THEN it SHALL print `CHECK signal FAILED: <alarm> rate limit` and start nothing. |
| SPEC-001-R129 | WHEN the scope check covers a delivery from an alarm-started run, THE scope check SHALL count the lines the range adds and deletes. IF the count exceeds the entry's `max_changed_lines`, THEN it SHALL print `CHECK scope FAILED: <alarm> over <n> changed lines`. Promote SHALL then move nothing, and the run SHALL get a row in `docs/factory-log.md` for a human to decide. |
| SPEC-001-R130 | B36 single signature on a two-approver change to `specs/sca-exceptions.toml`, in `cosign-verify` mode: `CHECK signatures FAILED: second approver needed for specs/sca-exceptions.toml` |
| SPEC-001-R131 | B37 change to the receipt policy co-signed by its own signer, in `cosign-verify` mode: `CHECK signatures FAILED: co-signed by the same approver for specs/receipt-policy.json` |
| SPEC-001-R132 | B38 action pin bump that also widens a job's `permissions`, on one signature, in `cosign-verify` mode: `CHECK signatures FAILED: second approver needed for .github/workflows/pipeline.yml`. The pin bump alone, on one signature, SHALL pass the signatures check. A bump to a SHA that its `# <tag>` does not resolve to, on one signature, SHALL fail with the same line |
| SPEC-001-R133 | B39 co-signed class that lists `specs/sca-exceptions.toml` at one signer, in `cosign-verify` mode: `CHECK signatures FAILED: classification below floor specs/sca-exceptions.toml` |
| SPEC-001-R134 | B40 `two_person` turned on with one principal in `approvers.txt`, in `cosign-verify` mode: `CHECK signatures FAILED: two-person approval with one approver` |
| SPEC-001-R135 | B41 deploy to a tier that sets `release_signers`, with no release tag, in `release-verify` mode: `CHECK release FAILED: production needs a release signature` |
| SPEC-001-R136 | B42 release tag signed by the approver who added the cited requirement, after another approver's later edit to the same spec file, in `release-verify` mode: `CHECK release FAILED: release signer alice@example.com also signed SPEC-014-R6` |
| SPEC-001-R137 | B43 release tag naming another receipt, in `release-verify` mode: `CHECK release FAILED: release/production/1 names another receipt` |
| SPEC-001-R138 | B44 reader record that sets a spec, in `signal-verify` mode: `CHECK signal FAILED: reader field spec` |
| SPEC-001-R139 | B45 alarm-started run released by a signer of its mapping entry, in `release-verify` mode: `CHECK release FAILED: release signer bob@example.com also signed alarm export-latency` |
| SPEC-001-R140 | WHEN a scenario has `run: cosign-verify`, THE harness SHALL build a new repository holding `main`'s tree with the scenario's `approvers.txt` and policy fixtures. It SHALL make stand-in security keys at run time, as `test/signatures.test.ts` does, and keep them only in its temporary directory. It SHALL commit and sign as the scenario's `commits:` field lists, then run only the signatures check. WHEN a scenario has `run: release-verify`, THE harness SHALL run only the release check on fixture records, a fixture `main` and tags it signs with stand-in keys. WHEN a scenario has `run: signal-verify`, it SHALL run only the signal check on fixture events and records. IF the mode's check passes where the scenario expects a failure, THEN THE harness SHALL fail the scenario. |
| SPEC-001-R141 | B46 release tag object signed as `release/staging/3` and pushed as `release/production/9`, in `release-verify` mode: `CHECK release FAILED: release/production/9 was signed as release/staging/3` |
| SPEC-001-R142 | B47 signed release tag on a commit that is no longer `main`'s tip, in `release-verify` mode: `CHECK release FAILED: release/production/1 is not on main's tip` |
| SPEC-001-R143 | B48 release tag on `main`'s tip signed by a key that an earlier `approvers.txt` listed and the tip's removed, in `release-verify` mode: `CHECK release FAILED: release/production/2 not signed by an approver` |

`release` and `signal` print the same prefix as every check. Each also needs a `check:<name>` script where it runs locally, as 0004's F05 adds for `task` and `scope`.

## Scenarios

Each expected line is a draft until a real failing run confirms it, as `scenarios/scenarios.yaml` requires. B36 to B48 have never been used in any file or commit. The principals `alice@example.com`, `bob@example.com`, `carol@example.com` and `dave@example.com` exist only in fixtures, with stand-in keys made at run time. B36 to B39 use a policy fixture with `two_person` on and an `approvers.txt` fixture holding `alice` and `bob`. Without both, R114 would judge their tier 2 commits as tier 1, or fail them at HEAD first.

| ID | Scenario | Phase | Check | Expected line | How it runs | Practice |
|---|---|---|---|---|---|---|
| B36 | Adds one `[[IgnoredVulns]]` entry to `specs/sca-exceptions.toml`, signed by `alice` alone, with `two_person` on | I | signatures | `CHECK signatures FAILED: second approver needed for specs/sca-exceptions.toml` | Local harness, `run: cosign-verify` | P49 |
| B37 | Lowers `telemetry` from 2 to 0 in the `sources` table of `specs/receipt-policy.json`. `alice` signs it, and `alice` also signs the co-sign | I | signatures | `CHECK signatures FAILED: co-signed by the same approver for specs/receipt-policy.json` | `cosign-verify` | P49 |
| B38 | Bumps an action pin in `pipeline.yml` and sets one job's `permissions` to `contents: write`, signed by `alice` alone | I | signatures | `CHECK signatures FAILED: second approver needed for .github/workflows/pipeline.yml` | `cosign-verify`. The harness also commits the pin bump alone, signed by `alice`, and asserts the signatures check passes. It then commits a bump to a SHA its `# <tag>` does not resolve to, signed by `alice`, and asserts the same failure line | P45 |
| B39 | Adds a class listing `specs/sca-exceptions.toml` at one signer. `alice` signs it and `bob` co-signs it | I | signatures | `CHECK signatures FAILED: classification below floor specs/sca-exceptions.toml` | `cosign-verify` | P49 |
| B40 | Turns `two_person` on while `approvers.txt` holds only `alice`, signed by `alice` | I | signatures | `CHECK signatures FAILED: two-person approval with one approver` | `cosign-verify`. The activating commit passes on one signature; HEAD fails | P49 |
| B41 | Deploy to `production`, whose tier sets `release_signers`, with no release tag | III | release | `CHECK release FAILED: production needs a release signature` | Local harness, `run: release-verify`, with policy and receipt fixtures | P45 |
| B42 | Release tag signed by `alice`, who is listed in `release_signers` and signed the commit adding the cited `SPEC-014-R6`. `bob` later signed an edit to `SPEC-014-R1` in the same file, so that file's last change is his | III | release | `CHECK release FAILED: release signer alice@example.com also signed SPEC-014-R6` | `release-verify`, with a spec history fixture and an INTENT fixture | P45 |
| B43 | Release tag `release/production/1` signed by `carol`, naming another receipt's digest | III | release | `CHECK release FAILED: release/production/1 names another receipt` | `release-verify` | P45 |
| B44 | A reader record that also sets `spec: SPEC-001-R12` | IV | signal | `CHECK signal FAILED: reader field spec` | Local harness, `run: signal-verify`, with an event fixture, a two-signed mapping fixture and a reader-record fixture | P15 |
| B45 | An alarm-started run released by `bob`, who co-signed the `export-latency` entry. `alice` approved the cited spec | IV | release | `CHECK release FAILED: release signer bob@example.com also signed alarm export-latency` | `release-verify`, with INTENT and TRIGGER fixtures | P45 |
| B46 | A tag object `carol` signed as `release/staging/3`, for a fixture tier `staging` that also sets `release_signers`, pushed as `release/production/9` on `main`'s tip | III | release | `CHECK release FAILED: release/production/9 was signed as release/staging/3` | `release-verify`, with a fixture `main` and a renamed tag ref | P45 |
| B47 | Release tag `release/production/1`, signed by `carol` on an earlier commit, pushed again after `main` has moved on | III | release | `CHECK release FAILED: release/production/1 is not on main's tip` | `release-verify`, with a fixture `main` two commits past the tag | P45 |
| B48 | Release tag `release/production/2` on `main`'s tip, signed by `dave`, whose key an earlier `approvers.txt` listed and the tip's removed | III | release | `CHECK release FAILED: release/production/2 not signed by an approver` | `release-verify`, with a fixture `main` whose last commit removes `dave` | P45 |

B38 shows the risk-based line: the same pin bump needs one approver alone and two once it touches `permissions`. B40 shows why the switch is judged by its parent, and why a HEAD check backs it. B42 shows why R122 walks the requirement's own row, not the file's last change. B46 to B48 show that a signed tag cannot be replayed under another name, onto an old commit, or with a removed key.

## Decided by the owner, 2026-11-06

| Topic | Decision | Effect here |
|---|---|---|
| Signers by artifact | Specs one; policy two; pipeline config two; a release one, where the tier requires it | R111 to R115 and R120. Refined by the next row |
| Risk-based approval (refinement, 2026-11-06) | Some factory changes will need two approvers, because they likely change policy. Where the line sits is a risk-based decision | The classification, the floor and the fail-closed default (R111 to R113). Replaces the notes' flat "Pipeline config changes: Two" row |
| Proven tightenings | Still need no signature | Tier 0 (R111), from 0004 R100 to R102 |
| What starts a telemetry run | Only alarms named in signed policy, through a signed alarm-to-spec mapping. Issue fields are data and never start a run | R125 to R128 |
| Release signature | Only where the policy tier requires it | R120 to R124 |
| Approval of every change | Every change needs documented approval. A policy two people signed is that approval, an ITIL standard change. Auditor acceptance is untested | Regulated environments |
| Trigger of an alarm run | The two signers of the policy naming the alarm. The release signer differs from both and from the spec's author: at least three people where a release signature is required | R118, R122, R126 |

## Decisions for the owner

| Decision | Options | Recommendation |
|---|---|---|
| Where the line sits between one and two approvers | (a) The split in "Approval tiers": the floor at two, specs and the slide snapshot at one, `action-pin` at one, and anything unclassified at two. (b) The revised notes' rows: two for every pipeline config and policy change, one for specs | (a). Policy changes need two, listed low-risk kinds need one, and the rest fails closed to two |
| Which low-risk kinds the policy lists first | (a) `action-pin` only. (b) Also files under `video/narration/`. (c) Also lockfile-only version bumps | (a). Add one kind at a time, each with a classifier rule and a scenario. Lockfile bumps change supply chain inputs, so not yet |
| The slide snapshot's tier | One approver, like a spec; or two, like policy | One. It records the deck, and `refresh-slides.sh` writes it |
| How a second signature is carried | (a) A co-sign commit by a different approver naming the SHA. (b) A signed tag per approval, such as `cosign/<SHA>`. Tags sit outside history and can be deleted, so the history walk alone proves nothing. (c) Signed git notes, which live on a ref the history walk does not read. (d) A GitHub review, which is not a signature; pull requests are never merged here. (e) Two signatures in one commit, which git cannot verify | (a). It reuses R12's verification, lives in history, and its signature covers the change's SHA |
| How the release signature is carried | (a) An SSH-signed annotated tag naming the receipt digest, verified by the release check. (b) An approver-signed release-record commit on `main`, which puts deploy decisions into history. (c) 0004's environment reviewer, which is not a signature, needs only one approval and excludes only the initiator. (d) A detached signature over the receipt digest, stored as an artifact that expires after 90 days by default | (a). It reuses the approver keys and flags, and GitHub's tag event and tag rule exist |
| Whether the `production` reviewer stays once release signatures work | (a) The release signature replaces it after B41 to B43 and B46 to B48 pass on `main`. (b) Keep both | (a). A second human step on the same release adds no judgment the signature lacks |
| Small teams and the three-person rule (open question in the notes) | (a) Alarm runs stay off for a tier that requires a release signature until three principals exist. (b) Also allow an outside release signer, such as a customer's representative, listed in `release_signers`. (c) Small teams use only tiers that need no release signature, where the two policy signers' approval stands | (a). The three-person rule is the owner's. Dispatched runs need two people, so a two-person team can still release them. (b) would need its own allowed-signers list. R120 verifies against `approvers.txt`, and an outside signer listed there could sign specs and co-sign policy |
| Two-person signing in every tier or only regulated tiers (open question in the notes) | (a) Every tier: one switch, `approval.two_person`, for the whole policy. (b) Only regulated tiers: the classifier splits the policy by entry, and each entry carries its own signer count | (a). The policy is one file. Entry-level classification adds a parser the floor would have to trust (inference) |
| Alarm thresholds and mapping format (open question in the notes) | (a) The threshold in the mapping entry, read by the alarm workflow from the policy at `main`. (b) The threshold inside the workflow file. (c) CloudWatch alarms in Terraform, with a bridge to GitHub | (a). The whole alarm sits in one two-signed place, and TRIGGER can name it. Format: JSON entries in `signals`, as in "Alarm-started runs" |
| Alarm transport | (a) A scheduled check workflow named in the entry, through `workflow_run` and R92's guard. (b) An outside alarm through `repository_dispatch`, which needs a token with Contents write held outside GitHub | (a), as 0004 recommends. (b) adds a key holder. Scheduled runs can be delayed or dropped |
| The reader's telemetry access | (a) No reader at first: the alarm alone starts the run, and the producer gets no telemetry fields. (b) A read-only, OIDC-federated logs role for the export Lambda's log group, separate from the producer. (c) A redacted extract that the alarm workflow uploads | (a) until the error classes are set, then (b). It follows the notes' graduated trust and P17's read-only, redacted telemetry |
| Error classes and stack-trace normalization (open question in the notes) | The enumerated list in `error_classes`, and which frames survive normalization | Start from the export service's own failures: status 400, status 413 and the 500 ms limit (SPEC-014-R4 to R6). Keep only frames whose file is tracked at the base commit and whose function name appears in it (inference) |
| Who counts as a spec's author | (a) Each signer and co-signer of a commit that added or changed the requirement's row (R122). (b) Also those commits' author emails where they match a principal, as reported. (c) A signed `Spec-Author:` trailer | (a) and (b). (b) only adds exclusions, so a forged email can block a release but never allow one |
| Whether a dispatched run's dispatcher may sign its release | (a) No: a `people` map in the policy ties GitHub user IDs to principals, and the release check excludes the dispatcher. (b) Yes | (a). The notes treat the agent as a tool of whoever triggered it (inference). The map is policy, so it needs two approvers |
| Which source gets risk tier 1 | The draft schema has tiers 0, 1 and 2 but three sources | `internal` 0, `telemetry` and `public issue` 2. Reserve 1 for customer text a team member pastes verbatim (inference from section 5) |
| Which receipt fields map to PCI 6.5.1 and CM-3 first (open question in the notes) | (a) 6.5.1's items first. (b) CM-3(1)'s automation first | (a). 6.5.1 names the approval record the claim rests on. Start from the draft mapping in "Regulated environments" |
| Candidate customer for a regulated pilot (open question in the notes) | The owner's choice | No recommendation. The pilot settles auditor acceptance |

## Options considered

| Option | Verdict |
|---|---|
| A. Two signatures in one commit object | Rejected. Inference: git verifies one (Facts), and SPEC-001-R12 fails closed on a second `gpgsig` header |
| B. The revised notes' rows: two approvers for every pipeline config and policy change, one for specs | Refined by the owner refinement of 2026-11-06. Pipeline config that is not policy goes by tier |
| C. Risk-based tiers in the signed policy, with a floor in the check code | **Chosen** |
| D. Tiers in the policy with no floor | Not chosen. A two-signed typo in the table could drop a policy file to one signer. The floor costs one test |
| E. A reader that chooses the spec ID, as in the first version of the notes | Rejected by the owner's revision. An attacker who triggers errors would choose where and when the agent works |
| F. 0004's trusted signal: a workflow tied to a task ID | Superseded. The mapping entry adds spec IDs, two signers, a threshold and limits |
| G. A release signature on every change | Rejected by the owner. By tier only |
| H. A GitHub environment with two required reviewers | Not possible. "Only one of the required reviewers needs to approve the job" |
| I. Distinct people by author or committer email | Rejected. Those fields are unsigned, and the agent can set them |
| J. A co-sign as a merge commit with two parents | Rejected. `github.sh` requires linear history (SPEC-001-R41), and the signatures check compares each commit with its first parent only |

## Consequences

| Consequence | Mitigation |
|---|---|
| Two-person approval needs a second person with a security key. Until Phase II, policy changes keep one signer | The activation rule. `two_person` is in the policy, which the factory fingerprint covers (0004 R97), so the FACTORY version changes when it does |
| Before 0004 Phase B, the candidate's own `scripts/checks.ts` judges it. A lone approver could drop the co-sign rule in the commit that needs it | Activate after 0004 Phase B, whose R109 runs `signatures` with `main`'s check code |
| Each tier 2 commit needs its own co-sign | Put a batch's tier 2 changes in one commit. K12's landing step prints the co-sign |
| A co-sign attests to a SHA, not to a reading of the change | Accepted: a co-sign is a gate. K08's helper prints the change's file list before the command |
| Principals are not people. One person with two principals passes the distinct-people rule | `approvers.txt` is on the floor, so a new principal needs two approvers once active. Each person keeps one principal, a human control |
| Two colluding approvers can still change policy | Accepted. Segregation of duties stops one person. The release rule adds a third person where a release signature is required |
| Anyone with write access can delete or move a release tag | The release check reads the tag at deploy time, and the DEPLOY line records signer and tag in the receipt. A re-pushed tag fails R120 or R121: its signed name must equal its ref, and its commit must be `main`'s tip |
| A release signs `main`'s tip, so a commit that lands between the `sandbox` review and the signature needs a new review | Accepted. Every `main` push deploys to `sandbox`, so the signer reviews the tip there |
| An `action-pin` bump to a commit that the action's own repository tagged still runs with the job's permissions | Accepted at one approver. R113 refuses a SHA its tag does not resolve to, which rules out a fork-only commit |
| GitHub creates no tag events when more than three tags are pushed at once | Push one release tag per push |
| An attacker who trips a mapped alarm starts a run | The run is one from the signed list, rate-limited, capped in changed lines, and labelled `untrusted telemetry` on ORIGIN |
| Mapping entries signed before activation carry one signer, so they cannot start runs (R126) | Re-sign each entry after Phase II: raise its `revision` in a two-approver commit. A commit that leaves an entry unchanged does not re-sign it (K27) |
| Scheduled runs can be delayed or dropped, and public repositories disable schedules after 60 days without activity | Alarm liveness only, with no safety effect. The owner can still dispatch |
| A required release signature adds a human step per release | By tier only, as the owner decided |
| The revised notes keep a flat "Pipeline config changes: Two" row, which 0005 refines | 0005 records the refinement with its date. The notes' section 6 calls 0005 a proposal |
| A signed policy as PCI 6.5.1's approval is untested with auditors | A regulated pilot; Not yet verified |

## Not yet verified

| Item | How to settle it |
|---|---|
| The PCI DSS v4.0.1 wording of 6.2.3, 6.2.3.1, 6.5.1, 6.5.3 and 6.5.4. The text here is Microsoft Learn's, inferred to be v4.0 | The owner accepts the council's license and reads the v4.0.1 PDF and its Summary of Changes |
| Whether auditors accept a two-person signed policy as the documented change approval under PCI DSS 6.5.1 or NIST CM-3 | A regulated pilot |
| ITIL Version 5's glossary wording for a standard change | Read the ITIL Version 5 glossary |
| The CM-3(1) and CM-3(3) baselines come from csf.tools, not from NIST SP 800-53B | Read SP 800-53B's control baselines |
| Whether `git tag -v` with `gpg.format=ssh` verifies a tag signed by a security key, and whether `sshSignature` reads its flags as it reads a commit's | K15: a test with stand-in keys, then one real approver tag |
| Whether an environment's tag rule `release/production/*` matches `refs/tags/release/production/<n>` and refuses a branch deploy | K17: one deploy from a tag and one from a branch |
| Whether a tag-started run rebuilds the zip the `main` push run attested, and renders a receipt byte-identical to that run's from its attestations | K15: one receipt rendered from one attestation fixture under two run contexts. K16: one tag-started run, comparing both digests with the `main` push run's |
| Which GitHub API calls resolve an action's tag to a commit for R113, and whether the checks job can make them without a token | K03, before the `action-pin` class is listed |
| Whether a ruleset can restrict creating, moving and deleting `release/**` tags to listed actors | Read GitHub's rulesets pages before K17 |
| Which REST call lists producer runs by alarm for the rate limit, and whether a token with `actions: read` can read them | K23 |
| Whether the co-sign helper's command lands an empty, signed commit whose tree equals its parent's | K08: run it once in a scratch repository |

## Sources

| Source | Read |
|---|---|
| https://learn.microsoft.com/en-us/entra/standards/pci-requirement-6 | 2026-11-06 |
| https://learn.microsoft.com/en-us/entra/standards/pci-dss-guidance | 2026-11-06 |
| https://www.pcisecuritystandards.org/document_library/ (resolves; the v4.0.1 PDF it links returned 403 behind a license agreement) | 2026-11-06 |
| https://csrc.nist.gov/extensions/nudp/services/json/nudp/framework/version/sp_800_53_5_1_1/export/json?element=all | 2026-11-06 |
| https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json | 2026-11-06 |
| https://csf.tools/reference/nist-sp-800-53/r5/cm/cm-3/ | 2026-11-06 |
| https://csf.tools/reference/nist-sp-800-53/r5/cm/cm-3/cm-3-1/ | 2026-11-06 |
| https://csf.tools/reference/nist-sp-800-53/r5/cm/cm-3/cm-3-3/ | 2026-11-06 |
| https://igen.nl/wp-content/uploads/2024/10/ITIL-4-Foundation_Glossary_Digital.pdf | 2026-11-06 |
| https://www.bu.edu/tech/files/2018/10/ITIL%C2%AE-glossary-and-abbreviations.pdf | 2026-11-06 |
| https://www.peoplecert.org/news-and-announcements/how-devops-complements-itil-and-enterprise-governance | 2026-11-06 |
| https://www.peoplecert.org/news-and-announcements/itil-version-5-ai-governance-controls | 2026-11-06 |
| https://git-scm.com/docs/git-tag | 2026-11-06 |
| https://raw.githubusercontent.com/git/git/master/tag.c | 2026-11-06 |
| https://raw.githubusercontent.com/git/git/master/builtin/tag.c | 2026-11-06 |
| https://docs.zizmor.sh/audits/ | 2026-11-06 |
| https://git-scm.com/docs/git-config | 2026-11-06 |
| https://git-scm.com/docs/gitformat-signature | 2026-11-06 |
| https://git-scm.com/docs/hash-function-transition | 2026-11-06 |
| https://raw.githubusercontent.com/git/git/master/Documentation/RelNotes/2.34.0.adoc | 2026-11-06 |
| https://raw.githubusercontent.com/git/git/master/commit.c | 2026-11-06 |
| https://raw.githubusercontent.com/openssh/openssh-portable/master/sshsig.c | 2026-11-06 |
| https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows | 2026-11-06 |
| https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments | 2026-11-06 |
| `scripts/checks.ts` lines 131 to 259, 316 to 319 and 431 to 452, `.github/workflows/pipeline.yml` lines 77 to 123, and `approvers.txt`, at `63cfcd4` | 2026-11-06 |
| `docs/notes/spec-to-production-factory.md`, revised 2026-11-06 | 2026-11-06 |
