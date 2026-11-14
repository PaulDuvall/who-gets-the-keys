# sca exceptions: evidence log

This file records why each advisory in `specs/sca-exceptions.toml` is excepted, with the evidence. The sca check (SPEC-001-R10) runs OSV-Scanner over every committed lockfile and fails on any advisory, except those listed there whose `ignoreUntil` has not passed. Each exception is a decision to accept a known flaw for a fixed time, so each needs four answers, checked and dated:

| Question | What counts as an answer |
|---|---|
| What is excepted? | The advisory, the package and version, the lockfile, and what the flaw does |
| Why is it not fixed? | The fixed version, and the dependent that stops us installing it, read from the registry on a stated date |
| Why does our use not reach the flaw? | What the flaw needs to run, and a run of our own checks that shows it does not happen |
| When does it end? | The date in `ignoreUntil`, and the release that would let us remove it |

Both files change together, in one approver-signed commit. A renewal re-runs every check under "How each claim was checked", updates each section's log, and moves the dates.

## Summary, as checked on 2026-11-14

| Advisory | Package, lockfile | CVSS | Fixed in | Blocked by | Reached by our use? | Expires |
|---|---|---|---|---|---|---|
| GHSA-mrhx-c7xc-m3w5 | zod 3.25.76, `package-lock.json` | 8.2 | 4.6.6 only | `@anthropic-ai/sandbox-runtime` requires zod 3 | No: one repo-built input, 0 validation issues | 2027-01-13 |
| GHSA-84m7-p3x7-pcfv | mcp 1.29.0, `scripts/ci/requirements.txt` | 7.5 | 1.30.0 | semgrep requires `mcp==1.29.0` | No: no MCP server runs | 2027-01-13 |
| GHSA-g3hv-75wg-m249 | minimatch 10.2.6, `package-lock.json` | 6.9 | 11.0.1 only | Stryker and typescript-eslint require 10.x | No: every matcher at level 1 | 2027-01-13 |
| GHSA-w4fh-qvv9-3v23 | mcp 1.29.0, `scripts/ci/requirements.txt` | 6.8 | 1.30.0 | semgrep requires `mcp==1.29.0` | No: no MCP server runs | 2027-01-13 |
| GHSA-rwrf-2pqf-9j8j | mcp 1.29.0, `scripts/ci/requirements.txt` | 6.5 | 1.30.0 | semgrep requires `mcp==1.29.0` | No: no MCP client runs | 2027-01-13 |
| GHSA-5h93-6whr-6q8j | mcp 1.29.0, `scripts/ci/requirements.txt` | 5.9 | 1.30.0 | semgrep requires `mcp==1.29.0` | No: no MCP client runs | 2027-01-13 |
| GHSA-xcq7-p3pf-p88h | opentelemetry-api 1.37.0, `scripts/ci/requirements.txt` | 5.3 | 1.45.1 | semgrep requires `~=1.37.0` | No: `from_header` never runs | 2027-01-13 |
| GHSA-mf5v-w3w3-f6cg | opentelemetry-api 1.37.0, `scripts/ci/requirements.txt` | 5.3 | 1.45.2 | semgrep requires `~=1.37.0` | No: `extract` never runs | 2027-01-13 |

CVSS is the highest base score OSV-Scanner 2.7.0 reported for the advisory. None of the eight packages is in the Lambda artifact: on 2026-11-14 the build job's steps, run locally, made a `function.zip` of three files, `export.js`, `handler.js` and `package.json`. Inference, not measured: the worst case if a "No" above is wrong is a CI or developer tool that hangs, sends a request, or reads a file on a runner, never the export service's customers. Each section's "If this is wrong" row is inference in the same way.

The 60-day expiry is the owner's decision of 2026-11-14: no reason here depends on time, only on which releases exist. Dependabot does not read `specs/sca-exceptions.toml`, so it keeps alerting on all eight, and a newly reachable fix stays visible between renewals.

## How each claim was checked, 2026-11-14

Environment: `main` at `12693a8`, OSV-Scanner 2.7.0, semgrep 1.181.0 with mcp 1.29.0 and opentelemetry-api 1.37.0 on Python 3.13, Node.js 24.22.2.

### OSV-Scanner

The sca check's own command, `osv-scanner scan source --format json`, over the five tracked lockfiles: `package-lock.json`, `video/record/package-lock.json`, `scripts/ci/requirements.txt`, `video/narration/requirements.txt` and `factory-video/narration/requirements.txt`.

| Run | Exit | Advisories reported |
|---|---|---|
| Without `--config` | 1 | The eight above, and no other |
| With main's `specs/sca-exceptions.toml` | 0 | None |
| With this file's `specs/sca-exceptions.toml` | 0 | None |
| With this file's copy, every `ignoreUntil` moved to 2026-11-13 | 1 | All eight: OSV-Scanner 2.7.0 reads `ignoreUntil` |
| With `ignoreUntil` renamed `effectiveUntil` | 127 | None: "unknown keys in config file" |

The OSV-Scanner configuration page (https://google.github.io/osv-scanner/configuration/, read 2026-11-14) now names the expiry key `effectiveUntil`, not `ignoreUntil`. OSV-Scanner 2.7.0, the version `scripts/ci/install-tools.sh` installs, refuses that key and honours `ignoreUntil`. So an upgrade of OSV-Scanner must re-run the fourth row, or the exceptions could stop expiring.

The advisory texts and fixed versions are OSV's records, `https://api.osv.dev/v1/vulns/<ID>`, read 2026-11-14. None is withdrawn, and no fixed version changed since 2026-11-08.

### Registries

| Page, read 2026-11-14 | What it showed |
|---|---|
| https://pypi.org/pypi/semgrep/json and `.../semgrep/<version>/json` | Latest 1.185.0, uploaded 2026-11-10. Every release from 1.181.0, our pin, through 1.185.0 requires `mcp==1.29.0`, `opentelemetry-api~=1.37.0`, `opentelemetry-sdk~=1.37.0` and `opentelemetry-exporter-otlp-proto-http~=1.37.0` |
| https://pypi.org/pypi/mcp/json | Latest 2.3.0. The fixed 1.x release is 1.30.0 |
| https://pypi.org/pypi/opentelemetry-api/json | Latest 1.45.2 |
| https://registry.npmjs.org/@anthropic-ai%2fsandbox-runtime | Latest 0.0.83, 2026-11-13, requires `zod ^3.25.0`. 0.0.79 is installed |
| https://registry.npmjs.org/zod | Latest 4.6.7. The last 3.x is 3.25.76 |
| https://registry.npmjs.org/minimatch | Latest 11.0.8. The last 10.x is 10.2.6 |
| https://registry.npmjs.org/eslint and `@eslint%2fconfig-array` | eslint 10.15.0 and config-array 0.23.6, both 2026-11-13, require `minimatch ^11.0.5`. Installed: eslint 10.13.0 (`^10.2.5`) and config-array 0.23.5 (`^10.2.4`) |
| https://registry.npmjs.org/@stryker-mutator%2fcore | Latest 10.1.1, 2026-10-23, requires `minimatch ~10.2.4`. Installed: 10.0.0 |
| https://registry.npmjs.org/@typescript-eslint%2ftypescript-estree | Latest 8.72.2, 2026-11-09, requires `minimatch ^10.2.2`. Installed: 8.72.0 |

### Reach probes

Each probe watches one of our own checks run as the pipeline runs it, and records whether the advisory's code runs. The probes are below, in "Probe code"; the commands run from the repository root with `REACH_ROOT` set to it.

| Probe | Check watched | Result |
|---|---|---|
| Python import and call probe | sast: `semgrep scan --config p/default --error --metrics=off --json --quiet` | `semgrep` hands the scan to `pysemgrep` in the same process, which imports mcp and opentelemetry. After import, 0 mcp functions ran. During import, one ran: `mcp/server/fastmcp/utilities/logging.py:get_logger`. 27 opentelemetry functions ran after import: the no-op tracer, context lookups and resource detection. `TraceState.from_header` and `TraceContextTextMapPropagator.extract` never ran |
| minimatch probe | lint: `node scripts/checks.ts lint` | ESLint created 17 matchers, all at the default optimization level 1. `firstPhasePreProcess` ran 0 times |
| minimatch probe | mutation: `node scripts/checks.ts mutation` | Stryker created 414 matchers, all at level 1. `firstPhasePreProcess` ran 0 times |
| zod settings probe | the B9 replay's settings, built with the `jq` of `.github/workflows/scenarios.yml` from `.github/egress/allowlist.json` | 3 array elements in all, valid, 0 issues |

`grep -rl optimizationLevel` over every `.js`, `.cjs` and `.mjs` file in `node_modules`, outside minimatch itself, found no file: no installed package sets the option.

## GHSA-mrhx-c7xc-m3w5: zod 3.25.76

| | |
|---|---|
| What | zod 3.25.76 in `package-lock.json`. "Zod can exhaust memory while validating oversized constrained collections": validating an array keeps one issue object for every failing element, with no cap, so a large hostile input can run the process out of memory. OSV marks every release before 4.6.6 |
| Needs | An attacker who can make the program validate a large array they choose |
| Why not fixed | Only `@anthropic-ai/sandbox-runtime` requires zod 3, and every release through 0.0.83 requires `^3.25.0` and imports `zod/v3`. 4.6.6 fixed only zod 4's own API: the independent review of 2026-11-08 diffed both tarballs and found zod 4.6.7 still ships the flawed `zod/v3` `ZodArray`. So forcing zod 4 under sandbox-runtime would hide the advisory without removing the code |
| Why not reached | sandbox-runtime runs only as `srt`, in the B9 replay job of `.github/workflows/scenarios.yml` (`npx --no-install srt --settings "$RUNNER_TEMP/srt.json"`), and no other file in the repository starts it. It validates one input: the settings that job builds with `jq` from `.github/egress/allowlist.json`, a protected path that changes only in an approver-signed commit. The zod settings probe found 3 array elements and 0 issues, so the issue collection the flaw needs never grows |
| If this is wrong | An oversized allowlist could exhaust the B9 replay runner's memory. The replay fails closed |
| Ends when | sandbox-runtime moves to zod 4's own API, or zod publishes a fixed 3.x |
| Log | 2026-11-08: listed when the public history starts (`b396be7`); renewed to 2026-12-08 (`46e94ac`). 2026-11-14: re-checked as above; renewed to 2027-01-13 |

## GHSA-84m7-p3x7-pcfv: mcp 1.29.0

| | |
|---|---|
| What | mcp 1.29.0 in `scripts/ci/requirements.txt`, the hash-pinned Python tools of the checks. "Unbounded Session Accumulation in StreamableHTTP Transport": a Streamable HTTP MCP server in stateful mode never reclaims sessions, so a client can grow its memory without bound. Affects 1.8.0 through 1.29.1 |
| Needs | A running MCP server, over Streamable HTTP, that untrusted clients can reach |
| Why not fixed | semgrep, from 1.181.0 through 1.185.0, requires exactly `mcp==1.29.0`. semgrep's command line imports mcp at startup, to offer its `semgrep mcp` command, so mcp cannot be left out |
| Why not reached | The sast check runs `semgrep scan`, which starts no MCP server. The Python probe found no mcp function run after import |
| If this is wrong | A runner's memory could grow until the checks job fails, which fails closed |
| Ends when | A semgrep release allows mcp 1.30.0 or later |
| Log | 2026-11-08: listed (`b396be7`); renewed to 2026-12-08 (`46e94ac`). 2026-11-14: re-checked as above; renewed to 2027-01-13 |

## GHSA-g3hv-75wg-m249: minimatch 10.2.6

| | |
|---|---|
| What | minimatch 10.2.6 in `package-lock.json`. "minimatch has potential denial of service via globparts amplification": with `optimizationLevel` 2 or more, `firstPhasePreProcess` lets a crafted pattern multiply its parts, which are then compared pairwise, using CPU and memory. Fixed only in 11.0.1 |
| Needs | A caller that sets `optimizationLevel` to 2 or more, and a glob pattern an attacker chooses |
| Why not fixed | Every 10.x is affected and 10.2.6 is the last. @stryker-mutator/core (`~10.2.4`) and @typescript-eslint/typescript-estree (`^10.2.2`) require 10.x in their latest releases. eslint 10.15.0 moved to 11 on 2026-11-13, but 10.2.6 stays in the lockfile while the other two need it |
| Why not reached | minimatch runs `firstPhasePreProcess` only at level 2 or more (`dist/esm/index.js`, the `optimizationLevel >= 2` branch); the default is 1. No installed package sets the option. Every pattern is fixed text from ESLint's and Stryker's defaults or from `eslint.config.js` and `stryker.config.json`, protected files. The minimatch probe found 431 matchers in the lint and mutation checks, all at level 1, and 0 runs of `firstPhasePreProcess` |
| If this is wrong | A lint or mutation run could slow down until its job times out. That fails closed |
| Ends when | Stryker and typescript-eslint accept minimatch 11. Then update eslint, Stryker and typescript-eslint together |
| Log | 2026-11-08: listed (`b396be7`); renewed to 2026-12-08 (`46e94ac`). 2026-11-14: re-checked as above, with the eslint 10.15.0 change noted; renewed to 2027-01-13 |

## GHSA-w4fh-qvv9-3v23: mcp 1.29.0

| | |
|---|---|
| What | mcp 1.29.0 in `scripts/ci/requirements.txt`. "Server bearer-token authentication accepts tokens issued for a different resource server". Affects 1.10.0 through 1.29.1; 1.30.0 adds a setting that turns the audience check on |
| Needs | An HTTP MCP server using the SDK's bearer authentication |
| Why not fixed | As GHSA-84m7-p3x7-pcfv: semgrep requires exactly `mcp==1.29.0` |
| Why not reached | `semgrep scan` starts no MCP server. The Python probe found no mcp server or auth function run after import |
| If this is wrong | An MCP server semgrep started could accept a token meant for another service. The sast check gives semgrep no authorization server or token |
| Ends when | As GHSA-84m7-p3x7-pcfv |
| Log | 2026-11-08: listed (`b396be7`); renewed to 2026-12-08 (`46e94ac`). 2026-11-14: re-checked as above; renewed to 2027-01-13 |

## GHSA-rwrf-2pqf-9j8j: mcp 1.29.0

| | |
|---|---|
| What | mcp 1.29.0 in `scripts/ci/requirements.txt`. "Client fetched server-chosen $ref URLs while validating tool results against output schemas": a server can make an MCP client request a URL or read a local file, and stall it. Affects 1.10.0 through 1.29.1 |
| Needs | An MCP client (`ClientSession`, `ClientSessionGroup`) calling tools on a server it does not control |
| Why not fixed | As GHSA-84m7-p3x7-pcfv |
| Why not reached | `semgrep scan` opens no MCP session. The Python probe found no mcp client function run after import |
| If this is wrong | A runner could fetch a URL, or read a file the checks job can already read. That job holds only `contents: read`, persists no Git credentials and references no secret (`.github/workflows/pipeline.yml`) |
| Ends when | As GHSA-84m7-p3x7-pcfv |
| Log | 2026-11-08: listed (`b396be7`); renewed to 2026-12-08 (`46e94ac`). 2026-11-14: re-checked as above; renewed to 2027-01-13 |

## GHSA-5h93-6whr-6q8j: mcp 1.29.0

| | |
|---|---|
| What | mcp 1.29.0 in `scripts/ci/requirements.txt`. "HTTP client transports followed cross-origin redirects carrying custom headers and bodies". Affects 1.8.0 through 1.29.1 |
| Needs | An MCP client connecting over HTTP, to an endpoint that redirects elsewhere |
| Why not fixed | As GHSA-84m7-p3x7-pcfv |
| Why not reached | `semgrep scan` opens no MCP connection. The Python probe found no mcp client or transport function run after import |
| If this is wrong | Headers of an MCP request could reach another host. The sast check configures no MCP endpoint, header or credential |
| Ends when | As GHSA-84m7-p3x7-pcfv |
| Log | 2026-11-08: listed (`b396be7`); renewed to 2026-12-08 (`46e94ac`). 2026-11-14: re-checked as above; renewed to 2027-01-13 |

## GHSA-xcq7-p3pf-p88h: opentelemetry-api 1.37.0

| | |
|---|---|
| What | opentelemetry-api 1.37.0 in `scripts/ci/requirements.txt`. "Unbounded tracestate parsing": `TraceState.from_header` parses an inbound `tracestate` header in quadratic time, so one long header can hold a CPU for seconds. Fixed in 1.45.1 |
| Needs | An attacker's `tracestate` header passed to `propagate.extract` |
| Why not fixed | semgrep, from 1.181.0 through 1.185.0, requires opentelemetry-api, -sdk and -exporter-otlp-proto-http `~=1.37.0`, below 1.38 |
| Why not reached | semgrep uses opentelemetry only to trace itself. `semgrep scan` serves no HTTP. semgrep 1.181.0 calls `propagate.extract` only in `Telemetry.extract()` (`semgrep/telemetry.py`), which runs only when `--trace` is on, and the sast check never passes it. The Python probe found that `from_header` never ran |
| If this is wrong | A sast run could slow down until its job times out. That fails closed |
| Ends when | A semgrep release allows opentelemetry 1.45.1 or later |
| Log | 2026-11-08: listed (`b396be7`); renewed to 2026-12-08 (`46e94ac`). 2026-11-14: re-checked as above; renewed to 2027-01-13 |

## GHSA-mf5v-w3w3-f6cg: opentelemetry-api 1.37.0

| | |
|---|---|
| What | opentelemetry-api 1.37.0 in `scripts/ci/requirements.txt`. "Denial of service through quadratic-time traceparent parsing": `TraceContextTextMapPropagator.extract()` backtracks in quadratic time on a crafted `traceparent`. Fixed in 1.45.2 |
| Needs | An attacker's `traceparent`, with an embedded newline, reaching that propagator |
| Why not fixed | As GHSA-xcq7-p3pf-p88h |
| Why not reached | semgrep's only call is in `Telemetry.extract()`, which runs only with `--trace`, and then builds the `traceparent` from two of its own environment variables, `SEMGREP_TRACE_PARENT_TRACE_ID` and `SEMGREP_TRACE_PARENT_SPAN_ID`, never from a scanned file. The Python probe found that `TraceContextTextMapPropagator.extract` never ran |
| If this is wrong | As GHSA-xcq7-p3pf-p88h |
| Ends when | A semgrep release allows opentelemetry 1.45.2 or later |
| Log | 2026-11-13: published 16:43 UTC, after the candidate run of `79f0f06`, and failed `main`'s sca; listed by the owner's hand-signed `a6de08a` until 2026-12-08 (`docs/notes/sca-mf5v.md`). 2026-11-14: re-checked as above; renewed to 2027-01-13 |

## Probe code

### Python import and call probe: `py/sitecustomize.py`

Put this file in a directory of its own, and run the sast command with that directory on `PYTHONPATH`. Python loads `sitecustomize` at start, so it also loads in the `pysemgrep` process the `semgrep` command hands over to.

```python
# Reach probe for the sca exceptions (backlog s7e). With REACH_LOG set, it logs every Python process start, and the
# first run of every function in the mcp and opentelemetry packages, marked IMPORT when it ran while a module was
# being imported and CALL otherwise.
import os, sys
_log = os.environ.get("REACH_LOG")
if _log:
    _roots = tuple(os.sep + p + os.sep for p in ("mcp", "opentelemetry"))
    def _w(line):
        with open(_log, "a", encoding="utf-8") as f:
            f.write(f"{os.getpid()} {line}\n")
    _w("START " + " ".join(sys.argv[:4]))
    _mon = sys.monitoring
    _tool = 5
    _mon.use_tool_id(_tool, "reach-probe")
    def _start(code, offset):
        f = code.co_filename
        if "site-packages" in f and any(r in f for r in _roots) and code.co_flags & 0x1:
            frame, in_import = sys._getframe(1), False
            while frame is not None:
                if frame.f_code.co_filename.startswith("<frozen importlib"):
                    in_import = True
                    break
                frame = frame.f_back
            mod = f.split("site-packages" + os.sep, 1)[1]
            _w(("IMPORT " if in_import else "CALL ") + mod + ":" + code.co_qualname)
        return _mon.DISABLE
    _mon.register_callback(_tool, _mon.events.PY_START, _start)
    _mon.set_events(_tool, _mon.events.PY_START)
```

The filter also matches semgrep's own `semgrep/mcp/` helpers; read only lines that start with `mcp/` or `opentelemetry/`.

### minimatch probe: `minimatch-probe.mjs`

```js
// Reach probe for GHSA-g3hv-75wg-m249: counts Minimatch objects by optimizationLevel, and runs of firstPhasePreProcess,
// the advisory's function, in minimatch's ESM and CommonJS builds. Appends one line per Node.js process at exit.
import { appendFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const root = process.env.REACH_ROOT;
const esm = await import(pathToFileURL(`${root}/node_modules/minimatch/dist/esm/index.js`).href);
const cjs = createRequire(import.meta.url)(`${root}/node_modules/minimatch/dist/commonjs/index.js`);
const seen = { objects: 0, levels: {}, firstPhase: 0, patterns: new Set() };
for (const M of [esm.Minimatch, cjs.Minimatch]) {
  const make = M.prototype.make;
  const first = M.prototype.firstPhasePreProcess;
  M.prototype.make = function (...args) {
    seen.objects++;
    const level = String(this.options?.optimizationLevel ?? "default (1)");
    seen.levels[level] = (seen.levels[level] ?? 0) + 1;
    seen.patterns.add(this.pattern);
    return make.apply(this, args);
  };
  M.prototype.firstPhasePreProcess = function (...args) {
    seen.firstPhase++;
    return first.apply(this, args);
  };
}
process.on("exit", () => appendFileSync(process.env.REACH_LOG, `${process.argv[1]} objects=${seen.objects} ` +
  `levels=${JSON.stringify(seen.levels)} firstPhasePreProcess=${seen.firstPhase} patterns=${JSON.stringify([...seen.patterns])}\n`));
```

### zod settings probe: `zod-probe.mjs`

```js
// Reach probe for GHSA-mrhx-c7xc-m3w5: validates the B9 replay's srt settings with the schema srt itself uses, and
// counts the settings' array elements and the validation issues.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const schema = `${process.env.REACH_ROOT}/node_modules/@anthropic-ai/sandbox-runtime/dist/sandbox/sandbox-config.js`;
const { SandboxRuntimeConfigSchema } = await import(pathToFileURL(schema).href);
const settings = JSON.parse(readFileSync(process.argv[2], "utf8"));
const count = (v) => Array.isArray(v) ? v.length + v.reduce((n, x) => n + count(x), 0)
  : v && typeof v === "object" ? Object.values(v).reduce((n, x) => n + count(x), 0) : 0;
const r = SandboxRuntimeConfigSchema.safeParse(settings);
console.log(`array elements=${count(settings)} valid=${r.success} issues=${r.success ? 0 : r.error.issues.length}`);
```

### Commands

From the repository root, with the three probes in a directory `$PROBES`, outside the checkout, and `py/sitecustomize.py` under it:

```bash
export REACH_ROOT="$PWD"
```

```bash
REACH_LOG="$PROBES/sast.log" PYTHONPATH="$PROBES/py" semgrep scan --config p/default --error --metrics=off --json --quiet > /dev/null
```

```bash
REACH_LOG="$PROBES/lint.log" NODE_OPTIONS="--import $PROBES/minimatch-probe.mjs" node scripts/checks.ts lint
```

```bash
REACH_LOG="$PROBES/mutation.log" NODE_OPTIONS="--import $PROBES/minimatch-probe.mjs" node scripts/checks.ts mutation
```

```bash
jq '{network: {allowedDomains: .allowedDomains, deniedDomains: []}, filesystem: {denyRead: [], allowWrite: ["/tmp"], denyWrite: []}}' \
  .github/egress/allowlist.json > "$PROBES/srt.json"
```

```bash
node "$PROBES/zod-probe.mjs" "$PROBES/srt.json"
```
