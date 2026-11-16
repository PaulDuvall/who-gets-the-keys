# Factory log

The evidence for loosening or tightening an approval (decision 0010, section 4). It holds one row for each human approval, each rejection of a change whose checks passed, and each escaped defect.

The agent keeps it by hand, from the `land.sh` summaries the owner pastes. It does so until decision 0004's rejection job writes the rows itself.

- **Loosen:** a class of change drops one tier after 60 approvals in a row with no rejection.
- **Tighten:** an escaped defect moves its class up one tier. The agent stages that change under `proposals/`, and the owner signs it. Where the class already needs this repository's top tier, one signature, a new check answers the escape instead.

Rows dated before 2026-11-16 are summaries taken from the specs and the backlog. They are not one row per approval.

## Approvals

| Date | Commit | Approval | What it covered | Outcome | Caught what the checks missed |
|---|---|---|---|---|---|
| 2026-11-11 to 2026-11-13 | 11 pushes to `main` | `sandbox` reviewer | Deploys whose Terraform plans changed nothing | 11 approved | Nothing. SPEC-001-R232 then stopped asking for this approval. Source: SPEC-001-R232 and backlog `who-gets-the-keys-g4e` |
| 2026-11-16 | `46d402d` | Approver signature | Batch `t5f`: SPEC-001-R15, `scripts/checks.ts`, five shell scripts, three tests and `traceability.md` | Approved, with no change asked | Nothing recorded |

## Rejections after the checks passed

None recorded.

## Escaped defects

| Found | Introduced by | Its approval | Defect | Fixed by | Tier change |
|---|---|---|---|---|---|
| 2026-11-15, pipeline run 274 | `1d6aed9`, 2026-11-12, batch `k7d` | Approver signature, as for every change to `scripts/bootstrap/` | `doctor.sh` piped `printf` into `grep -q` under `pipefail`. When `printf` died of SIGPIPE, the doctor reported no security-key type and stopped `land.sh`. It failed 4 of 29 loaded full test runs in a cloud session (`docs/notes/t5f.md`) | `46d402d`, batch `t5f`. The new check is `test/pipe-early-exit.test.ts` | None. The class already needs one signature, the top tier here, so a new check answered it |
