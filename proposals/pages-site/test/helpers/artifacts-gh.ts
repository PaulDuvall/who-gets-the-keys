import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A stand-in for gh in the factory-video, practices-carousel and pages workflows' step scripts (SPEC-001-R235, R236).
// It logs every call to $STUB_LOG and answers:
// - `gh api [--paginate] repos/o/r/actions/artifacts?per_page=100 --jq <filter>`: the list in $STUB_ARTIFACTS, served
//   in pages of $STUB_PAGE_SIZE (2 by default), the first page alone without --paginate, as gh does. It applies the
//   script's own filter to each page with jq, so the filter itself is tested. STUB_FAIL_LIST fails the call.
// - `gh api repos/o/r/actions/runs/<id> --jq <filter>`: run <id> of the object in $STUB_RUNS, or a 404.
// - `gh api repos/o/r/branches/main --jq <filter>`: a branch whose tip is $STUB_TIP.
// - `gh api repos/o/r/compare/<base>...<head> --jq <filter>`: status `identical` when base is head, `ahead` when base
//   is listed in $STUB_ON_MAIN, and `diverged` otherwise.
// - `gh api -X DELETE <path>`: success, so a test reads what was deleted from the log.
// - `gh run download <run> --repo <repo> --name <name> --dir <dir>`: copies $STUB_BUILDS/<name>/ into <dir>, or into
//   <dir>/<name>/ when STUB_SUBDIR is set; a name it has no build for fails.
export const STUB_GH = [
  "#!/usr/bin/env bash",
  'printf \'%s\\n\' "$*" >> "$STUB_LOG"',
  'if [ "$1" = api ] && [ "${2:-}" = -X ]; then exit 0; fi',
  'if [ "$1" = api ]; then',
  '  shift; path=""; filter="."; paginate=""',
  '  while [ $# -gt 0 ]; do case "$1" in --paginate) paginate=1 ;; --jq) filter="$2"; shift ;; *) path="$1" ;; esac; shift; done',
  '  case "$path" in',
  '    "repos/o/r/actions/artifacts?per_page=100")',
  '      [ -z "${STUB_FAIL_LIST:-}" ] || { echo \'{"message":"Server Error"}\'; echo "gh: Server Error (HTTP 500)" >&2; exit 1; }',
  '      size="${STUB_PAGE_SIZE:-2}"; total="$(jq \'.artifacts | length\' "$STUB_ARTIFACTS")"; page=0',
  '      while [ $((page * size)) -lt "$total" ] || [ "$page" -eq 0 ]; do',
  '        jq --argjson a $((page * size)) --argjson b $(((page + 1) * size)) \'{artifacts: .artifacts[$a:$b]}\' "$STUB_ARTIFACTS" | jq -r "$filter"',
  '        [ -n "$paginate" ] || break',
  '        page=$((page + 1))',
  '      done ;;',
  '    "repos/o/r/actions/runs/"*)',
  '      id="${path#repos/o/r/actions/runs/}"',
  '      jq -e --arg id "$id" \'has($id)\' "$STUB_RUNS" > /dev/null || { echo \'{"message":"Not Found"}\'; echo "gh: Not Found (HTTP 404)" >&2; exit 1; }',
  '      jq --arg id "$id" \'.[$id]\' "$STUB_RUNS" | jq -r "$filter" ;;',
  '    "repos/o/r/branches/main") printf \'{"commit":{"sha":"%s"}}\' "$STUB_TIP" | jq -r "$filter" ;;',
  '    "repos/o/r/compare/"*)',
  '      range="${path#repos/o/r/compare/}"; base="${range%%...*}"; head="${range#*...}"; status=diverged',
  '      if [ "$base" = "$head" ]; then status=identical; else case " ${STUB_ON_MAIN:-} " in *" $base "*) status=ahead ;; esac; fi',
  '      printf \'{"status":"%s"}\' "$status" | jq -r "$filter" ;;',
  '    *) echo "gh: Not Found (HTTP 404)" >&2; exit 1 ;;',
  '  esac',
  '  exit 0',
  "fi",
  'if [ "$1 ${2:-}" = "run download" ]; then',
  '  shift 3; name=""; dir=""',
  '  while [ $# -gt 0 ]; do case "$1" in --name) name="$2"; shift ;; --dir) dir="$2"; shift ;; --repo) shift ;; esac; shift; done',
  '  [ -d "$STUB_BUILDS/$name" ] || { echo "no artifact named $name" >&2; exit 1; }',
  '  dest="$dir"; [ -z "${STUB_SUBDIR:-}" ] || dest="$dir/$name"',
  '  mkdir -p "$dest" && cp -R "$STUB_BUILDS/$name/." "$dest/"',
  "  exit 0",
  "fi",
  "exit 1",
  "",
].join("\n");

export interface Artifact { name: string; created: string; id: number; run: number | string; branch: string | null; sha: string; expired?: boolean }
export interface Run { event: string; path: string; head_branch: string; head_repository: { full_name: string } }

// The list GitHub's "List artifacts for a repository" endpoint returns, holding only the fields the scripts read.
export const artifactList = (artifacts: Artifact[]): string =>
  JSON.stringify({
    total_count: artifacts.length,
    artifacts: artifacts.map((a) => ({
      id: a.id, name: a.name, expired: a.expired === true, created_at: a.created,
      workflow_run: a.branch === null ? null : { id: a.run, head_branch: a.branch, head_sha: a.sha },
    })),
  });

// The runs behind `artifacts`, keyed by run ID: by default each was a push to its branch running the workflow that
// writes artifacts of its name, in repository o/r. `over` replaces fields of a run by its ID.
export const runsFor = (artifacts: Artifact[], over: Record<string, Partial<Run>> = {}): string => {
  const runs: Record<string, Run> = {};
  for (const a of artifacts) {
    const kit = a.name.startsWith("practices-carousel-") ? "practices-carousel" : "factory-video";
    runs[String(a.run)] = { event: "push", path: `.github/workflows/${kit}.yml`, head_branch: a.branch ?? "main", head_repository: { full_name: "o/r" }, ...over[String(a.run)] };
  }
  return JSON.stringify(runs);
};

// Runs a step's script as GitHub Actions runs a step with no shell: set, `bash -e`, without pipefail, so the script's own
// `set -o pipefail` is under test. The stand-in gh is first on PATH, and no git configuration of the machine running the
// tests applies. Returns the exit status, the output and the logged gh calls.
export function runWithGh(script: string, cwd: string, env: Record<string, string>): { status: number; stdout: string; stderr: string; calls: string[] } {
  const bin = mkdtempSync(join(tmpdir(), "artifacts-gh-"));
  try {
    writeFileSync(join(bin, "gh"), STUB_GH);
    chmodSync(join(bin, "gh"), 0o755);
    const log = join(bin, "calls");
    writeFileSync(log, "");
    const r = spawnSync("bash", ["--noprofile", "--norc", "-e", "-c", script], {
      cwd,
      encoding: "utf8",
      env: { PATH: `${bin}:${process.env["PATH"] ?? ""}`, HOME: cwd, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", STUB_LOG: log, GH_TOKEN: "stub", REPO: "o/r", ...env },
    });
    const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
    return { status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr, calls };
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}
