import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A stand-in for gh in the factory-video, practices-carousel and pages workflows' step scripts (SPEC-001-R235, R236).
// It logs every call to $STUB_LOG and answers three kinds:
// - `gh api [--paginate] repos/o/r/actions/artifacts?per_page=100 --jq <filter>` applies the script's own filter, with
//   jq, to the artifact list in $STUB_ARTIFACTS, so the filter itself is tested. STUB_FAIL_LIST fails it.
// - `gh api -X DELETE <path>` succeeds, so a test reads what was deleted from the log.
// - `gh run download <run> --repo <repo> --name <name> --dir <dir>` copies $STUB_BUILDS/<name>/ into <dir>, or into
//   <dir>/<name>/ when STUB_SUBDIR is set, and fails for a name it has no build for.
export const STUB_GH = [
  "#!/usr/bin/env bash",
  'printf \'%s\\n\' "$*" >> "$STUB_LOG"',
  'if [ "$1" = api ] && [ "${2:-}" = -X ]; then exit 0; fi',
  'if [ "$1" = api ]; then',
  '  shift; path=""; filter="."',
  '  while [ $# -gt 0 ]; do case "$1" in --paginate) ;; --jq) filter="$2"; shift ;; *) path="$1" ;; esac; shift; done',
  '  [ "$path" = "repos/o/r/actions/artifacts?per_page=100" ] || exit 1',
  '  [ -z "${STUB_FAIL_LIST:-}" ] || { echo "gh: Server Error (HTTP 500)" >&2; exit 1; }',
  '  exec jq -r "$filter" "$STUB_ARTIFACTS"',
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

export interface Artifact { name: string; created: string; id: number; run: number; branch: string | null; sha: string; expired?: boolean }

// The list GitHub's "List artifacts for a repository" endpoint returns, holding only the fields the scripts read.
export const artifactList = (artifacts: Artifact[]): string =>
  JSON.stringify({
    total_count: artifacts.length,
    artifacts: artifacts.map((a) => ({
      id: a.id, name: a.name, expired: a.expired === true, created_at: a.created,
      workflow_run: a.branch === null ? null : { id: a.run, head_branch: a.branch, head_sha: a.sha },
    })),
  });

// Runs a step's script as GitHub Actions does, `bash -e` with pipefail, with the stand-in gh first on PATH and no git
// configuration of the machine running the tests. Returns the exit status, the output and the logged gh calls.
export function runWithGh(script: string, cwd: string, env: Record<string, string>): { status: number; stdout: string; stderr: string; calls: string[] } {
  const bin = mkdtempSync(join(tmpdir(), "artifacts-gh-"));
  try {
    writeFileSync(join(bin, "gh"), STUB_GH);
    chmodSync(join(bin, "gh"), 0o755);
    const log = join(bin, "calls");
    writeFileSync(log, "");
    const r = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script], {
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
