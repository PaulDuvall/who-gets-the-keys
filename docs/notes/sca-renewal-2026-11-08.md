# sca exceptions, re-checked 2026-11-08 (backlog s7e)

Status: staged in `proposals/sca-renewal/`, not landed. It renews all 7 exceptions in `specs/sca-exceptions.toml` to `2026-12-08T00:00:00Z`, each with a re-checked reason. Without it, the sca check (SPEC-001-R10) fails on every push from 2026-11-22.

## OSV-Scanner on the committed lockfiles

OSV-Scanner 2.7.0, run on 2026-11-08 over the five tracked lockfiles the sca check reads (`package-lock.json`, `video/record/package-lock.json`, `scripts/ci/requirements.txt`, `video/narration/requirements.txt`, `factory-video/narration/requirements.txt`):

| Run | Exit | Advisories reported |
|---|---|---|
| Without `--config` | 1 | The same 7 as the exceptions file, and no other |
| With `specs/sca-exceptions.toml` (main) | 0 | None |
| With the staged copy | 0 | None |
| With the staged copy, every date moved to 2026-11-01 | 1 | All 7: OSV-Scanner reads `ignoreUntil` |

## Is a fixed version reachable?

Registry data read on 2026-11-08 from the JSON APIs behind each page.

| Advisory | Package in the lockfile | Fixed in (OSV) | Who pins it, latest release | Reachable? |
|---|---|---|---|---|
| GHSA-mrhx-c7xc-m3w5 | zod 3.25.76 (`package-lock.json`) | 4.6.6 | `@anthropic-ai/sandbox-runtime` 0.0.81 (2026-10-20) still requires `zod ^3.25.0`; 0.0.79 is installed | Not within range. Only by an npm override, below |
| GHSA-84m7-p3x7-pcfv, GHSA-w4fh-qvv9-3v23, GHSA-rwrf-2pqf-9j8j, GHSA-5h93-6whr-6q8j | mcp 1.29.0 (`scripts/ci/requirements.txt`) | 1.30.0 (1.x), 2.2.0 (2.x) | semgrep 1.184.0 (2026-11-05), the latest, still requires `mcp==1.29.0` | No |
| GHSA-xcq7-p3pf-p88h | opentelemetry-api 1.37.0 (`scripts/ci/requirements.txt`) | 1.45.1 | semgrep 1.184.0 still requires `opentelemetry-api~=1.37.0` and `opentelemetry-sdk~=1.37.0` | No |
| GHSA-g3hv-75wg-m249 | minimatch 10.2.6 (`package-lock.json`) | 11.0.1 | eslint 10.14.0 (2026-10-30) `^10.2.6`; @eslint/config-array 0.23.5 `^10.2.4`; @stryker-mutator/core 10.1.1 (2026-10-23) `~10.2.4`; @typescript-eslint/typescript-estree 8.72.1 (2026-10-26) `^10.2.2`. 10.2.6 is the last 10.x | No: every dependent requires 10.x |

Pages:

- https://pypi.org/project/semgrep/ (JSON: https://pypi.org/pypi/semgrep/json), read 2026-11-08: latest 1.184.0
- https://pypi.org/project/mcp/, read 2026-11-08: latest 2.3.0; 1.29.1 exists and is still affected, so the only fixed 1.x release is 1.30.0
- https://pypi.org/project/opentelemetry-api/, read 2026-11-08: latest 1.45.2
- https://www.npmjs.com/package/@anthropic-ai/sandbox-runtime, read 2026-11-08: latest 0.0.81
- https://www.npmjs.com/package/eslint, https://www.npmjs.com/package/@eslint/config-array, https://www.npmjs.com/package/@stryker-mutator/core, https://www.npmjs.com/package/typescript-eslint and https://www.npmjs.com/package/@typescript-eslint/typescript-estree, read 2026-11-08
- https://www.npmjs.com/package/minimatch, read 2026-11-08: latest 11.0.5, which adds the dependency `@isaacs/nonrecursive-glob-match`
- https://osv.dev/vulnerability/GHSA-mrhx-c7xc-m3w5 and the six others, through `https://api.osv.dev/v1/vulns/<ID>`, read 2026-11-08: none withdrawn, fixed versions as above

## What each reason now says, and what changed

| Advisory | Re-checked against the advisory text | Change from main's reason |
|---|---|---|
| GHSA-mrhx-c7xc-m3w5 | The advisory names `handleArrayResult` in zod 4's `$ZodArray`, but OSV marks every release before 4.6.6, and zod 3's `ZodArray._parse` (`zod/v3/types.js`) has the same flaw: after a failed `maxLength` it still parses every element and keeps every issue. 4.6.6 fixed only `zod/v4`. `@anthropic-ai/sandbox-runtime` imports `zod/v3` (`dist/sandbox/sandbox-config.js`), so the flaw is on its path. Its input is not an attacker's: it runs only in the B9 replay (`scenarios.yml`, `srt --settings`) and parses settings generated from `.github/egress/allowlist.json` | Names the B9 replay as the only user and the repo-generated input as the mitigation |
| The four mcp advisories | Server sessions, server bearer auth, client `$ref` fetching, client redirects. `semgrep scan` starts no MCP server or client | semgrep range now "1.181.0 through 1.184.0" |
| GHSA-xcq7-p3pf-p88h | `TraceState.from_header` on an inbound header. `semgrep scan` serves no HTTP | Names the function, and the sdk and exporter pins that also block an api upgrade |
| GHSA-g3hv-75wg-m249 | Needs an attacker-controlled pattern and `optimizationLevel` 2 or more. The tools match patterns from repo config files | Adds the newer releases of each dependent |

## Upgrades the owner could run instead

None is reachable inside the dependents' declared ranges, so the batch renews. Two version bumps are reachable only by overriding a dependent's range. Neither is staged: the agent may not install dependencies or regenerate a lockfile, so neither is tested, and the zod one would not fix the flaw.

| Fix | Commands, from a clean checkout of `main` | Risk | Recommendation |
|---|---|---|---|
| zod 4.6.7 for sandbox-runtime only | see below | It hides the advisory without fixing it. sandbox-runtime imports `zod/v3`, and zod 4.6.7 still ships that code unchanged (the independent review diffed both tarballs' `ZodArray`). OSV would stop reporting a flaw sandbox-runtime still runs | Not recommended. Wait for a sandbox-runtime release on zod 4's own API, or for a zod 3 fix |
| minimatch 11.0.5 for everyone | `npm pkg set overrides.minimatch=11.0.5`, then the same lockfile command | A major version under four packages that declare 10.x, plus one new transitive package. Lint, Stryker and the typecheck could break in ways only a full run shows | Not recommended. Wait for eslint or Stryker to move |

For the record only, not recommended, the zod override would be:

```bash
npm pkg set 'overrides.@anthropic-ai/sandbox-runtime.zod=4.6.7'
```

```bash
npm install --package-lock-only --ignore-scripts
```

```bash
npm ci --ignore-scripts
```

```bash
npm run checks
```

The syntax of the first command was checked on a copy of `package.json`: it writes `"overrides": {"qs": "6.16.1", "@anthropic-ai/sandbox-runtime": {"zod": "4.6.7"}}`.

For the Python advisories, `uv pip compile --override` could force mcp 1.30.0 under semgrep, but semgrep pins it exactly, and moving opentelemetry-api means moving opentelemetry-sdk, opentelemetry-exporter-otlp-proto-http and two instrumentation packages that semgrep also pins. Not recommended.

## Open, for the owner

- Renew for another 30 days, as staged, or upgrade first? Recommendation: land the renewal now; the deadline is 2026-11-22, and no real fix exists yet.
- All 7 now expire at the same moment, so the four 2026-11-30 entries gain only 8 days. Recommendation: accept it; one review date is simpler.
- Should the sca check warn, without failing, when an exception expires within 7 days? That would be a new SPEC-001 requirement. Recommendation: yes, after T3b; this is the second renewal by hand.

## Review, 2026-11-08

An independent review found nothing critical or medium, one high and four low. Each is fixed or recorded here.

| Severity | Finding | Done |
|---|---|---|
| High | The first draft said the zod flaw was not on sandbox-runtime's path, because the advisory's function is in `zod/v4/core`. zod 3's `ZodArray` has the same flaw, and zod 4.6.6 fixed only v4, so the override the draft suggested would hide the advisory, not fix it | Confirmed in `node_modules/zod/v3/types.js`: after a failed `maxLength`, `_parse` maps every element. The reason now rests on the input, which the repo generates; the override is marked not recommended |
| Low | mcp 1.29.1 exists | "the only fixed 1.x release is 1.30.0" |
| Low | semgrep also pins `opentelemetry-exporter-otlp-proto-http~=1.37.0` | Named in the reason and the notes |
| Low | The `requires:` line proved only that one 2026-11-22 entry is on `main`; an eighth exception landed first would be dropped silently, though the sca check would then fail | A second `requires:` for a 2026-11-30 entry, and a LAND.txt comment to answer no if the diff removes another ID |
| Low | All 7 expire at once | Recorded as an owner question above |
