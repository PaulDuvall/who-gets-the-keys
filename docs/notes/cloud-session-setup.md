# Cloud session setup script in the repository (Tracer 2 T3b, backlog j5t)

Status: staged in `proposals/cloud-session-setup/`, not landed. Drafted 2026-11-08. Lands after `proposals/role-arn-secrets/`, whose spec copy it builds on.

## What and why

The claude.ai cloud environment's setup script was recorded only in the README ("Cloud session environment"), and nothing noticed drift between that copy and claude.ai (`docs/notes/tracer-2-lessons.md`, L4). The owner decided on 2026-11-07 to move it into the repository as a protected script, under a new SPEC-001 requirement, with claude.ai holding a one-line call (`docs/notes/tracer-2.md`, owner decisions).

| File | Change |
|---|---|
| `scripts/bootstrap/cloud-session-setup.sh` | New, mode 755. The README's script, run from the repository root it finds from its own path. Same Node.js release, SHA-256, install prefix, links, `install-tools.sh` call and `npm ci` line. Differences: it prints one line of its own and installs nothing when the checksum fails; it removes its temporary directory on any exit; `NODE_PREFIX` and `BIN_DIR` override the install paths for the tests |
| `specs/SPEC-001-delivery-pipeline.md` | New section "Cloud sessions" with SPEC-001-R211, after "Local sessions" |
| `test/cloud-session-setup.test.ts` | Five R211 tests: `bash -n`; the pinned release and SHA-256 equal `docs/verification.md`'s row; the README's only bash block in "Cloud session environment" is the one line in the script's header; the release is in `package.json`'s `engines` range; the order of the steps; and, with stub `curl`, `tar`, `npm` and `uv`, a download that does not match exits 1 after one `curl` call, leaving an earlier install's file in place and creating nothing |
| `traceability.md` | Row SPEC-001-R211 |
| `README.md` | "Cloud session environment" shows the one-line claude.ai script and points at the script instead of copying it |

## A deviation from the backlog item

The backlog's one line was `if [ -d who-gets-the-keys ]; then bash who-gets-the-keys/scripts/bootstrap/cloud-session-setup.sh; fi`. A session that checks out a branch older than the script would then fail its setup with "No such file". The staged line tests `-f` on the script instead, so such a session starts with nothing installed, as the image ships it. R211 says "when that file exists".

## Owner steps after landing

1. In claude.ai, open the cloud environment menu in a session's title bar, then Edit, and replace the setup script with the one line in the README. This location comes from the README's own text of 2026-11-07; the agent did not re-check the claude.ai UI.
2. Start a fresh session on `main`. Success: `node --version` prints `v24.22.2` and `npm run check:typecheck` passes.

## Open question (from the backlog)

The script runs as root from whatever branch a session checks out, so an agent branch could change what it installs. Inference: acceptable, because it changes only that session's own container, and `main`'s copy is signed. Recommendation: accept.

## Not verified

- The success path end to end: it downloads Node.js and installs tools, which the tests stub. A fresh session after landing checks it.

## Review, 2026-11-08

An independent review found nothing critical or high, one medium and three low. It checked the script line by line against the README's script on `main`, and, with stubs, the success path's order.

| Severity | Finding | Done |
|---|---|---|
| Medium | R211's first sentence, that the claude.ai setup script "SHALL only run" the script, could not be tested: no check reads claude.ai | R211 now requires the README to give that one line, equal to the line in the script's header, and a test compares them. claude.ai's copy stays an owner step |
| Low | The refused-download test did not create the install directory first, so moving `rm -rf "$prefix"` above the checksum would have passed | The test creates `node/marker` first and checks it survives |
| Low | A missing `sha256sum` was reported as "does not match" | The script checks for `sha256sum` first and says so |
| Low | The spec section said "the one call below" but showed none | It now says the README gives the line |
