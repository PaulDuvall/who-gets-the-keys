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
| 7 | "Gate on mutation score" uses "gate" for a check; "Observes" sits in the sandbox in the hours window | The first now reads "Fail a change whose mutation score drops, on changed code only", as the owner chose. The second is unchanged: the owner's words. Decision 0009, owner question 7 |
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

## Not fixed

Findings 6, 11 and 12 above, and the second half of 7, for the reasons given. The ten Vitest failures in the preflight are the container's, and the candidate run's test check covers them.
