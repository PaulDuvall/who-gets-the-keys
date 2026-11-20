# sca exception for GHSA-qx49-fqc8-xw99, 2026-11-20

## What happened

OSV published GHSA-qx49-fqc8-xw99 on 2026-11-19 at 22:45 UTC: "Model Context Protocol Python SDK: OAuth client could send credentials to an authorization server chosen by the MCP server", in the Python package `mcp` from 1.9.1, fixed in 1.30.0. `scripts/ci/requirements.txt` pins `mcp==1.29.0`, which semgrep requires.

The next candidate run after that, 44804762012 on `b0fab2e`, a docs change, failed at 19:44 UTC on 2026-11-20 with `CHECK sca FAILED: GHSA-qx49-fqc8-xw99`. That is lesson L32 again, as for GHSA-mf5v-w3w3-f6cg (`docs/notes/sca-mf5v.md`) and GHSA-fc5q-39xc-vjpf (`docs/notes/sca-fc5q.md`). Every candidate run then failed sca until an exception landed.

The same run reported the picomatch exception, GHSA-fc5q-39xc-vjpf, as unused: GitHub withdrew that advisory on 2026-11-18 at 15:38 UTC.

## Why an exception, not a fix

| Fact | Source, read 2026-11-20 |
|---|---|
| semgrep 1.186.0, uploaded 2026-11-18, is the latest | https://pypi.org/pypi/semgrep/json |
| 1.184.0, 1.185.0 and 1.186.0 each require `mcp==1.29.0` | `https://pypi.org/pypi/semgrep/<version>/json` |
| mcp 1.30.0 fixes the flaw; mcp's latest is 2.3.0 | https://api.osv.dev/v1/vulns/GHSA-qx49-fqc8-xw99; https://pypi.org/pypi/mcp/json |

No semgrep release allows the fixed mcp, so the lockfile cannot move.

## Why our use does not reach the flaw

The flaw needs an MCP client running the SDK's OAuth flow against a server. The sast check runs `semgrep scan`, which opens no MCP session. The Python probe from `specs/sca-exceptions.md` was run with the sast check's own command on `main` at `36730f2`, with semgrep 1.181.0 and mcp 1.29.0 on Python 3.13. Two processes started. One mcp function ran, during import: `mcp/server/fastmcp/utilities/logging.py:get_logger`. No mcp function ran after import, and no function under `mcp/client/` ran at all. That is the same result as the 2026-11-14 run.

## How it landed

The agent put copies of both files on its session branch (`78baf39`, `proposals/sca-qx49/`). With them in place, the sca check passed on `main` at `36730f2` with no unused ignore. The copies add the qx49 entry and section and a "Changes on 2026-11-20" record. They also remove the withdrawn picomatch entry and section, and the picomatch probe's code stays as history.

The owner copied them onto `b0fab2e` with `git show`, committed them with a signature as `e27db6d`, and pushed. The command printed `==> TOUCH YOUR SECURITY KEY NOW` before git asked for the touch, as `docs/notes/sca-fc5q.md` said every hand-signed command would until backlog j5j lands.

| Run | Result |
|---|---|
| Candidate run 44818090143 on `e27db6d` | Passed, the sca and signatures checks included |
| Main's run 44818553220, after the owner's `land.sh --to-main` | Passed; the deploy was skipped, as nothing deployable changed |

`main` then held `0acbd82`, the rollback record; `b0fab2e`, the factory map's prompt; and `e27db6d`.

## What it cost the owner

Seven commands to prepare and sign, then `land.sh --to-main`, for a change whose only control is the touch. That cost is why the owner asked, the same day, to sign without running the process on the laptop. Backlog r8s, filed with this note, covers it. Since the same day, the agent also pushes to `main` itself any commit whose checks passed, unsigned or already signed (batch `agent-lands-main`).
