# Batch notes: practices-carousel (decision 0009)

The kit, `practices-carousel/`, is unprotected and lands by `land.sh --to-main`. The batch `proposals/practices-carousel/` moves the workflow and the protected-paths copy, and needs an approver's signature. Decision 0009 holds the why; these notes hold the evidence.

## Preflight, 2026-11-14

A scratch worktree outside the checkout at `71d354e`, with the batch's two moves applied and committed as `land.sh` would, `node_modules` linked from the checkout. The owner's Mac was simulated as CLAUDE.md asks: a Homebrew-style `node@24` under `/opt/homebrew/opt/`, and a `seq` first on `PATH` that prints `1` and `0` for `seq 0`.

| Step | Result |
|---|---|
| `tsc --noEmit` | Passed |
| ESLint on `practices-carousel/` | Passed. The workflow and `protected-paths.txt` are not linted files |
| Vitest, every test | 313 passed, 28 skipped, 10 failed. The same 10 fail on unchanged `main` at `0e2acac` in the same container: `test/checks.test.ts` R12's signing test (`spawnSync ssh-keygen ENOENT`, as the container has no OpenSSH) and 9 tests in `test/land-presign.test.ts`, which stop at the doctor's signer check for the same reason. The batch changes neither file nor anything they read. The candidate run's test check covers them on a runner that has OpenSSH |
| `node scripts/checks.ts trace`, `slides`, `secrets`, `workflows` | Passed |
| zizmor 1.31.1 offline over `.github/workflows/` with the new file | No findings (11 suppressed, as on `main`) |
| `git apply --check` on scenario patches that touch a changed file | None touches one. All 19 apply |
| `npm run progress` | No change: neither the decision nor the batch changes an input it counts |
| Semgrep `p/default` on `practices-carousel/` | No findings |

The kit's own checks, `practices-carousel/build.sh` from an empty font cache: 10 of 10 passed at `71d354e`, and 11 of 11 with the poster and the review's fixes. Each check was made to fail once on purpose; decision 0009, "The checks", lists how.

## Second preflight, after the rebase onto `fc97f75`, 2026-11-14

`main` moved to `fc97f75` (backlog w8x) while the first candidate run was going, so the chain was replayed onto it with no conflict. The same preflight, at `47dc327` with the moves applied: `tsc`, ESLint, trace, slides, secrets, workflows and zizmor passed; every scenario patch applies; `npm run progress` changes nothing; `node factory-video/verify.mjs --only claims` passed, since landing touches `docs/decisions/` and `proposals/`. Vitest: 322 passed, 28 skipped and 10 failed, the same 10 tests as on unchanged `main` at `fc97f75` in this container.

The first candidate run, 43610590868 on `71d354e`, passed its `checks` job and failed its `receipt` job: `gh attestation verify` reported `Error: verifying with issuer "sigstore.dev"`. The second, 43612336637 on `b987689` in `candidate/practices-carousel-2`, did the same. Nothing in this chain changes what the build, attest or receipt jobs read.

The cause is backlog `who-gets-the-keys-r1k`, which another session diagnosed and staged in `proposals/receipt-limit/` on `candidate/progress-badge-2026-11-14` (its notes, `docs/notes/receipt-limit.md`). The Lambda zip has been the same bytes since 2026-11-12, so every run attests one digest; from its 101st attestation, at run 218, `gh` 2.103.3's paging overwrites the newest entries, and the run cannot find its own. Until that batch lands, every pipeline run fails its receipt job and `land.sh --to-main` refuses every candidate, this one included. When it has landed, this chain is replayed onto the new `main` and pushed to a new candidate branch, whose run should then pass.

## Third base, `fa38bed`, 2026-11-14

`main` moved to `fa38bed` when the receipt-limit batch (backlog r1k) landed, so the chain was replayed onto it with no conflict, to `candidate/practices-carousel-3`. Its 15 new commits touch no workflow, `specs/protected-paths.txt` or `practices.yaml`, so the staged batch is unchanged.

## Independent review

A general-purpose subagent reviewed `0e2acac..71d354e` against the task's requirements, CLAUDE.md, `land.sh` and SPEC-001-R4, R12, R41 and R232, given the files and the requirements, not these notes. It confirmed the workflow, the batch's format, the pipeline checks with the moves applied, the fit loop's choice of `--k`, `build.sh` on BSD tools and the prose rules. Its findings, most severe first, and what happened to each:

| # | Finding | Outcome |
|---|---|---|
| 1 | Fit missed text running sideways into the margin, and `fits()` checked only height | Fixed. `fits()` checks width too, row text wraps a word too long for its line, and `measure()` checks every line of text against the margins. A 59-character word with wrapping turned off now fails Fit |
| 2 | Map never checked the flow's order or which boxes sit beside which | Fixed. Map checks spec, sandbox, pipeline and production run top to bottom, policy sits beside the pipeline and humans beside the spec. Humans reach the pipeline by a wire, not by position: a box cannot sit beside both without covering policy |
| 3 | The `--` exemption covered all text, and any key named `url` was skipped | Fixed. Only a tool's name may hold a flag, and only a tool's `url` is skipped |
| 4 | The template held text of its own: DIY, the OWASP prefix, the map's page labels | Fixed. They moved to `labels` in `carousel.yaml`. The ` · ` separator stays in the templates as punctuation |
| 5 | Count compared a number with itself and needed the word "practices" | Fixed. It counts the rows the pages render and the poster's cards, and finds the number where the subtitle's and the poster's templates put it |
| 6 | Schema accepts `tools: []` | Not changed. Six of Appendix A's rows name no tool, because each is a rule you write; the owner's tools are examples (decision 0009) |
| 7 | "Gate on mutation score" uses "gate" for a check; "Observes" sits in the sandbox in the hours window | Fixed as the owner chose: the first reads "Fail a change whose mutation score drops, on changed code only", and "Observes" moved to the inspector section, tagged inspector. Decision 0009, owner question 7 |
| 8 | `verify.mjs` could throw before printing its table, and `--only` with a bad name passed with no checks | Fixed. A check that throws is a FAIL with its error, a check the page could not build is a FAIL, and `--only` with an unknown or empty name exits 2 |
| 9 | The landing steps named one commit, and the `requires:` lines could never refuse | Fixed. The steps name the candidate tip, and the `requires:` lines are gone |
| 10 | Protecting `fonts.json` alone does not stop an unsigned change to `build.sh` or the templates | Recorded. Decision 0009 says so in decision 8 and asks the owner (question 6) |
| 11 | The decision names the live deck's file ID | Not changed. The task gave the ID and the date; no file was read |
| 12 | Page 2's top line is 20 px | Not changed. It is the top line every page shares; the 26 px rule is for the map, which Map measures |

## Second independent review

A second subagent reviewed `059d608..47dc327`, the poster and the first review's fixes, given the files and the requirements. It found nothing wrong in Phrasing's handling of comments and flags, in Schema, Count, Offline or Pages, in the templates, in the poster's fit at scale 1 against scale 2, in the edge label, in `LAND.txt` or the staged files, or in the workflow. Its findings:

| # | Finding | Outcome |
|---|---|---|
| 1 | Poster read each card's section from a label the template sets, and only the arrows' order, so columns swapped on the grid passed | Fixed. Each column must sit under its own arrow, which must name its section; policy under the columns; the bands in order down the page |
| 2 | The poster's margin was its page edge, as it has no padding | Fixed. The poster's margins are 64 px at each side; only the full-width header, legend, body and footer boxes may cross them, and no text may |
| 3 | A word wider than its own box, such as "Specifications" in the spec's arrow, passed while clipped | Fixed. Every line of text must fit across its own box, on every page and the poster. A word too long for a heading fails; a row's text still wraps |
| 4 | The poster leaves out part of page 9 and more, which the comment and README did not say | Fixed in the words: the README, the decision and the comment list what it leaves out |
| 5 | A string repeated on the poster could stand in for one missing | Fixed. Each card must hold its own row's text, lead, reference, tools, where tag and DIY tag |
| 6 | "Patch" had no Phrasing rule | Fixed |
| 7 | The Fonts detail listed one PDF's fonts for both, and any name starting `Archivo` or `IBMPlex` passed | Fixed. Each PDF's fonts are listed, and each must be one of the pinned files by the PostScript name in its name table |
| 8 | `build.sh` and the README's key table did not mention the poster | Fixed |

Each fix was made to fail once on purpose, as decision 0009, "The checks", lists.

## The AWS Deployment Pipeline Reference Architecture

On 2026-11-14 the owner asked whether the carousel accounts for every relevant check on the reference architecture's application pipeline page. It did not: Appendix A kept the security scans and dropped the tests, infrastructure scans, SBOM and progressive release, and neither `practices.yaml` nor the deck snapshot lists them. The owner chose four grouped rows, `source: dpra` (decision 0009, owner question 8). The Practices check accepts that source only on a row that cites no practice. Every new tool link returned 200 on 2026-11-14. Page 5 overflowed with both a test row and the release row, so the release row went to page 7, and two rows were shortened to fit at `--k` 0.84.

## The pipeline-view poster

On 2026-11-14 the owner shared the earlier "Pipeline view" poster, 43 practices, as a source of additions and changes, and said specs are more than EARS. Three practices the carousel lacked were added, `source: pipeline-view`, with the poster's OWASP IDs; specs list EARS, Gherkin and Markdown; three rows gained a tool. Every new link returned 200, and the Claude Code docs name `allowedMcpServers`, `managed-mcp.json`, `--max-turns` and `--max-budget-usd`. Correction: these notes first said the OWASP list is the 2025 edition and three IDs did not match it. OWASP's web page showed the 2025 list on 2026-11-14, but the owner showed the 2026 document, and every ID matches its titles (decision 0009, owner question 10). The cover and the poster now name the list. Firecrawl had run out of credits, so the page was fetched with `curl`.

Fitting 43 rows took three steps, each checked by Fit: the staging-tests row moved to page 4; the section summaries widened from 42 to 52 characters; and the legend's tools line became "Tools are examples", which fits on the second line (239 px free, measured) where "Tools: examples of the kind of tool to use" needed 366 px.

## Everything is the factory

On 2026-11-14 the owner said the whole picture is the factory: the inspector watches the pipeline from outside the pipeline, not from outside the factory. The inspector's tag now reads "Watch the pipeline from a separate account", its map box "Runs in a security account the pipeline can't reach", and page 2's lede "Everything that turns a signed spec into a deployed change, and watches it". The dashed "factory's edge" around the sandbox, pipeline and policy is gone; a dashed frame labelled "Security account" surrounds the inspector alone, on page 2 and on the poster. Map and Poster check that only the inspector is framed and that the frame carries its label.

## Page 11: a real receipt

On 2026-11-14 the owner asked for a sample receipt that shows "No evidence, no deploy" and many of the 42 practices, then made it page 11. Four versions followed, each after the owner's or a reviewer's objection.

| Version | What it showed | The objection |
|---|---|---|
| `TASK-0042`, illustrative | Invented values and a PASS on every line | The owner: no real evidence, such as provenance, hash pins or attestations; it reads as marketing |
| `8504e11`, `12cff5e` | `main` run 114's seven printed lines, and log quotes behind each | A reviewer: some evidence overstated, and the check passed false values. The owner: it needs actual hashes and digital signatures |
| `0382853` | Full hashes and signatures, each verified offline | A reviewer: `carousel.yaml` chose the trust anchor, so forged evidence passed; no certificate identity was pinned, so a candidate run's real signatures passed as `main`'s; words and short IDs were unchecked |
| This one | The same values, printed by `receipt-proof.mjs` from verified evidence | |

A receipt is printed by a machine, as the pipeline's receipt job prints its lines from verified statements (SPEC-001-R55). So `receipt-proof.mjs` now prints page 11's ten lines and its gaps, and `carousel.yaml` holds only the wording around them. Its templates may name only `{ref}`, `{run}`, `{date}` and `{deployed}`, values the printer proves, and hold no digit of their own. The printer pins in code what the receipt is for and what it trusts:

| Pin | Value |
|---|---|
| Delivery | commit `9f959a3`, spec commit `c7c6b4d`, run 42501305077 attempt 1, `refs/heads/main`, `.github/workflows/pipeline.yml` |
| Trust root | `evidence/sigstore-trusted-root.json` by its SHA-256, `6494e21e…`, and Rekor log `c0d23d6a…` |
| Identity | Issuer `https://token.actions.githubusercontent.com`; the SAN and build signer `…/pipeline.yml@refs/heads/main`; signer and source digests the commit; source repository, ref `refs/heads/main`, run `…/runs/42501305077/attempts/1`, runner `github-hosted`. SPEC-001-R50 pins the pipeline's own receipt check the same way |
| Rows | The rows each line covers, in full or in part, by their text in `carousel.yaml` |

The batch protects `receipt-proof.mjs`. An unsigned change to any pin then fails the signatures check. `verify.mjs`, `lib.mjs` and the template stay unprotected, as decision 0009's decision 8 says of the kit's code. An unsigned change there could skip the check or render other lines. Owner question 6 covers that choice.

### What each line proves

| Line | Value | Proof |
|---|---|---|
| SPEC | SPEC-014-R7, TASK-T4-DUP-COLUMNS | `c7c6b4d`, an ancestor of `9f959a3`, adds exactly one requirement row under `specs/` and one task file |
| APPROVED | Key `SHA256:xOytozuS…`, signature `AAAAIQCU…`, flags, counter 1923 | The commit's one signature header, the one git verifies, is an SSHSIG blob with namespace `git`. Its key is a security key that `approvers.txt` admits at the parent, with its options honoured. Its flags hold every bit `REQUIRED_SIGNATURE_FLAGS` names in `scripts/checks.ts` at the parent. Its signature verifies over the commit without that header, as OpenSSH's `ssh-ecdsa-sk.c` checks it. `sk-ssh-ed25519` keys verify too |
| AGENT | `sha256:1eda4ee5…`, Claude Code 2.1.304, MCP servers allowed: 0 | `producer.yml` in the tree of the signed spec commit. Turns and cost come from the run log |
| DIFF | `sha256:0c1051d0…` | `git diff c7c6b4d 9f959a3`, with no user or system git settings and explicit prefixes, equals the `PATCH_SHA256` the publish job checked |
| COMMIT | `9f959a35…`, its Spec and Agent trailers | The commit's last paragraph. The checks' pass lines come from the run log, in SPEC-001-R1's order |
| FILES | `sha256:722ac671…` | The one subject of both verified statements |
| SLSA, RECORD | Payload digests, DSSE signatures, Rekor indexes and times, the provenance/v2 record | Each statement hashes to the payload its Rekor entry logged, and its DSSE signature verifies. Each Fulcio certificate chains issuer by issuer to a CA in the pinned root. Every certificate in the chain, and the CA's `validFor`, covers the moment Rekor logged it. The leaf is for code signing, with the pinned identity in its extensions, parsed as DER. Each Rekor entry is in the pinned log, whose key was valid then. Its signed entry timestamp verifies, its inclusion proof reaches its checkpoint's root, its UUID is that tree and leaf hash, and its checkpoint carries the log's key hint and signature. The SLSA statement names the pinned workflow, ref, commit and run |
| SIGNER | `pipeline.yml@refs/heads/main`, `github-hosted`, run, certificate serials, issuer | The pinned identity, which both certificates match |
| DEPLOY | `source_code_hash cirGcVoN…=` | The base64 of the FILES digest, which the deploy log's planned change must name. `pipeline.yml` at the commit takes an OIDC role and holds no access key. Counts and time come from the run log |
| Gaps | The model, intent and task lines, the producer run, a hash of every agent input, a signer the agent can't edit | From what the proofs lack: the record's model is `not recorded`; it has no task, intent or producer run; the statement has no factory fingerprint; and the signer's workflow is in the repository it signs |

A line whose proof fails prints NOT VERIFIED, and the Receipt check fails.

### What was tried, and failed

| Attack | Result |
|---|---|
| The reviewer's forged CA, Rekor key and entries, in `evidence/` | The trusted root is not the pinned one |
| Real evidence from candidate run 42501078505, same commit | The certificate names `refs/heads/candidate/TASK-T4-DUP-COLUMNS-owner`, not `refs/heads/main` |
| The reviewer's expired CA and old timestamps, with the root re-pinned to theirs | No CA valid at that time |
| The reviewer's forged leaf, re-pinned | Not for code signing |
| A Rekor UUID edited | Not its tree and leaf hash |
| A byte of a statement, an unsigned spec commit, another pinned ref | Each fails its proof |
| A `lines` key, or a digit of its own, in `carousel.yaml`'s receipt | The Schema check |
| A row renamed in `carousel.yaml` | The line's claim names no row |

One probe did not run: a user git setting such as `diff.noprefix`, passed through the environment. The repository's `no-sign` hook refuses any command that sets git configuration, as SPEC-001-R39 intends. The printer runs only read-only git commands, with the user's and the system's git settings switched off and explicit diff prefixes.

### What is not proved

| Gap | Why |
|---|---|
| The trusted root itself | The pin is the SHA-256 that Sigstore's TUF `targets.json` version 14 named on 2026-11-14. The check does not walk TUF's signed metadata back to a root of trust |
| The certificates' SCTs | Not verified |
| Turns, cost, the checks' pass lines, the deploy's planned hash, counts and time | Only GitHub's logs hold them, and they expire. The printer reads them from the quotes below and prints them after "run log:" |
| The statements' bytes | Rekor stores a DSSE entry's payload hash. The statements in `evidence/` were rebuilt from the run's facts and `scripts/receipt.ts` at `9f959a3`, and each hashes exactly to what Rekor logged |
| That the RECORD digest names this run | The provenance/v2 statement is the same bytes in every run on this commit. The certificate's pinned ref and run tie each signature to run 42501305077 |

### Log lines, quoted

Copied from the GitHub API's job logs on 2026-11-14. ANSI colour codes are removed, and timestamps too, except on the last line, whose time page 11 shows. The script that made this block refused any line holding the account ID, which two of these logs print.

```text
producer run 42499336951, job 128788563404, produce a patch with Claude Code
TOOL Bash: npm run check:lint 2>&1
TOOL Bash: npm run check:typecheck 2>&1
TOOL Bash: npm run check:trace 2>&1
TOOL Bash: npm run check:test 2>&1
RUN ENDED: success, 10 turns, estimated USD 0.2377491
Permission mode: default.

producer run 42499336951, job 128788887004, publish the candidate branch
  PATCH_SHA256: 0c1051d044e7b3f02d7000cfd4fb806a99232266b70865cd49326ddf5d5c3e97
Pushed 9f959a350e541d1aa52654e4ace7d7fdd4fa52a6 to candidate/TASK-T4-DUP-COLUMNS. That push starts no run. To land it (SPEC-001-R210):

main run 114 (42501305077), job 128794438881, checks
check secrets passed
check allowlist passed
check workflows passed
check install passed
check lint passed
check typecheck passed
check iac passed
check sast passed
check sca passed
check trace passed
check ratchet passed
check signatures passed
check slides passed
check test passed
check mutation passed

main run 114 (42501305077), job 128794922989, receipt
receipt: verified https://slsa.dev/provenance/v1: {"certificateIssuer":"CN=sigstore-intermediate,O=sigstore.dev","subjectAlternativeName":"https://github.com/PaulDuvall/who-gets-the-keys/.github/workflows/pipeline.yml@refs/heads/main","issuer":"https://token.actions.githubusercontent.com","githubWorkflowTrigger":"push","githubWorkflowSHA":"9f959a350e541d1aa52654e4ace7d7fdd4fa52a6","githubWorkflowName":"pipeline","githubWorkflowRepository":"PaulDuvall/who-gets-the-keys","githubWorkflowRef":"refs/heads/main","buildSignerURI":"https://github.com/PaulDuvall/who-gets-the-keys/.github/workflows/pipeline.yml@refs/heads/main","buildSignerDigest":"9f959a350e541d1aa52654e4ace7d7fdd4fa52a6","runnerEnvironment":"github-hosted","sourceRepositoryURI":"https://github.com/PaulDuvall/who-gets-the-keys","sourceRepositoryDigest":"9f959a350e541d1aa52654e4ace7d7fdd4fa52a6","sourceRepositoryRef":"refs/heads/main","sourceRepositoryIdentifier":"1443586681","sourceRepositoryOwnerURI":"https://github.com/PaulDuvall","sourceRepositoryOwnerIdentifier":"1619259","buildConfigURI":"https://github.com/PaulDuvall/who-gets-the-keys/.github/workflows/pipeline.yml@refs/heads/main","buildConfigDigest":"9f959a350e541d1aa52654e4ace7d7fdd4fa52a6","buildTrigger":"push","runInvocationURI":"https://github.com/PaulDuvall/who-gets-the-keys/actions/runs/42501305077/attempts/1","sourceRepositoryVisibilityAtSigning":"public"}
receipt: verified https://github.com/PaulDuvall/who-gets-the-keys/provenance/v2: {"certificateIssuer":"CN=sigstore-intermediate,O=sigstore.dev","subjectAlternativeName":"https://github.com/PaulDuvall/who-gets-the-keys/.github/workflows/pipeline.yml@refs/heads/main","issuer":"https://token.actions.githubusercontent.com","githubWorkflowTrigger":"push","githubWorkflowSHA":"9f959a350e541d1aa52654e4ace7d7fdd4fa52a6","githubWorkflowName":"pipeline","githubWorkflowRepository":"PaulDuvall/who-gets-the-keys","githubWorkflowRef":"refs/heads/main","buildSignerURI":"https://github.com/PaulDuvall/who-gets-the-keys/.github/workflows/pipeline.yml@refs/heads/main","buildSignerDigest":"9f959a350e541d1aa52654e4ace7d7fdd4fa52a6","runnerEnvironment":"github-hosted","sourceRepositoryURI":"https://github.com/PaulDuvall/who-gets-the-keys","sourceRepositoryDigest":"9f959a350e541d1aa52654e4ace7d7fdd4fa52a6","sourceRepositoryRef":"refs/heads/main","sourceRepositoryIdentifier":"1443586681","sourceRepositoryOwnerURI":"https://github.com/PaulDuvall","sourceRepositoryOwnerIdentifier":"1619259","buildConfigURI":"https://github.com/PaulDuvall/who-gets-the-keys/.github/workflows/pipeline.yml@refs/heads/main","buildConfigDigest":"9f959a350e541d1aa52654e4ace7d7fdd4fa52a6","buildTrigger":"push","runInvocationURI":"https://github.com/PaulDuvall/who-gets-the-keys/actions/runs/42501305077/attempts/1","sourceRepositoryVisibilityAtSigning":"public"}
COMMIT   9f959a350e54
FILES    dist/function.zip sha256:722ac6715a0d
AGENT    Claude Code (as reported by the commit)
MODEL    not recorded
SPEC     SPEC-014-R7
SIGNED   pipeline.yml@refs/heads/main (editable by the agent)
VERIFIED 2/2 predicate types

main run 114 (42501305077), job 128795003787, deploy to sandbox
      ~ source_code_hash               = "jmV3T5ehFBKJBIb+A0wyaeDcMaW2AO2pRTQYhpqqj5Y=" -> "cirGcVoNEagYllHWjviAKNAav4EOSi564+nsdKTnZsw="
Plan: 0 to add, 1 to change, 0 to destroy.
Saved the plan to: plan.out
2026-11-08T16:46:39.0695771Z Apply complete! Resources: 0 added, 1 changed, 0 destroyed.
```

### Which rows it covers

| Covers | Rows |
|---|---|
| In full, 10 | Approver-signed specs; approvers sign factory changes; cap turns and spend; tests and code quality in the sandbox and the pipeline; SAST; SCA; property tests; no shared cache; build once and verify attestations at deploy; one OIDC identity |
| In part, 12 | Trace (the trace check needs a `Spec:` trailer only on changes to `src/` and `test/`). A hash of every agent input (Claude Code only, inside the signed tree). Pinning (actions and Claude Code are pinned; the runner image and the sandbox's apt packages are not). MCP allowlist (an empty list, with no server allowed by command or URL). Integrity of what it retrieves (digests checked before unpacking, for two downloads). The allow list of commands and paths (paths only). Mutation (all of `src/`, against a fixed bar). Secrets (the pipeline scanned and the agent did not). IaC scan and SBOM (lint and validate, with no SBOM). Dependency allowlist and mirror (the allowlist, with no mirror). Provenance with the model (`not recorded`). Human approval of irreversible actions (the check ran and found nothing to approve) |
| Not on this receipt, 20 | DAST, staging tests, the customer's acceptance, the validator, IAM proofs, every watch practice and every routing practice, among others |

"No agent runs in the jobs that verify and deploy" is true of run 114: the agent ran only in the producer run's agent job. The SIGNER line says what that sentence leaves out: the agent can edit `pipeline.yml`.

### Review of the second version

A subagent reviewed `8504e11` against the raw logs, git and the specs. Every value on the page matched. Its findings, and what happened to each:

| # | Finding | Outcome |
|---|---|---|
| 1 | The Receipt check read only hex digests and long run IDs, anywhere in the notes. Eleven false values passed at once | Fixed in `12cff5e` with per-line quotes. This version goes further: every hash and signature is derived and verified |
| 2 | The signature check read the whole commit object, message included, and matched no key | Fixed. It reads the one signature header and verifies the signature itself, by an `approvers.txt` key |
| 3 | Five rows were counted in full that the logs cover in part | Fixed, as the table above says |
| 4 | "No network", "a line that fails stops the deploy", "copied from the pipeline's log", the DEPLOY note, "$0.24" and the B10 stub overstated the evidence | Fixed. The stub names the scenario and its date |
| 5 | "Integrity of what it retrieves" was left out | Added, in part |
| 6 | Trailers were read from the whole message, and the Spec match was a substring | Fixed: the last paragraph only, and exact IDs |
| 7 | The workflow: sound, but it runs only on `main` | Unchanged. Decision 0009 runs the build on `main` and on demand |
| 8, 9 | Docs that disagreed, and six sentences over 30 words | Fixed |

### Review of `0382853`

A subagent reviewed the third version against OpenSSH's PROTOCOL.sshsig and `ssh-ecdsa-sk.c`, DSSE, Rekor, RFC 9162 and Fulcio's OIDs, and attacked it with forged and real evidence. It found the SSH and Rekor cryptography correct. Its findings, and what happened to each:

| # | Finding | Outcome |
|---|---|---|
| 1 | `carousel.yaml` chose the evidence directory, so a forged root passed | Fixed. The printer pins the directory, the root's SHA-256 and the Rekor log, and the batch protects the printer |
| 2 | No certificate identity was pinned; a candidate run's real signatures passed | Fixed. Issuer, SAN, build signer, repository, ref, run and runner are pinned, and the SLSA statement's workflow, ref, commit and run are checked |
| 3 | Words and short IDs on the page were unchecked, and the Spec check had regressed | Fixed. The printer prints every line, and `carousel.yaml` can put no value on the receipt |
| 4 | Each line chose its own proof, lines could be dropped, gaps and rows edited | Fixed. The printer fixes the lines, derives the gaps and holds the row claims |
| 5 | The chain check was signature-only | Fixed: issuer by issuer, CA flags, validity at signing time, the CA's `validFor`, code-signing usage. SCTs are still unchecked |
| 6 | The Rekor UUID was not checked | Fixed. Its tree and leaf hash must match |
| 7 | Smaller Rekor checks | Fixed: leaf index within the tree, origin line and tree ID, key hint, payload hash algorithm, the log key's `validFor` |
| 8 | Extensions were found by byte search | Fixed. A DER parse of the extensions, refusing a repeated OID |
| 9 | `approvers.txt` options, flags from `REQUIRED_SIGNATURE_FLAGS`, `sk-ssh-ed25519`, trailing bytes | Fixed |
| 10 | The diff hash depended on git settings | Fixed, as above |
| 11 | Docs claimed more than the code verified | Rewritten for this version |

## Not fixed

Findings 6, 11 and 12 of the first review, for the reasons given. The ten Vitest failures in the preflight are the container's, and the candidate run's test check covers them.
