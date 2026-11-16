import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// grep -q and grep -m stop reading early, and head at its last line. Under set -o pipefail, a writer still writing
// when its reader stops dies of SIGPIPE, and the whole pipeline fails: a check that matched reports that it did not.
// doctor.sh's signer check did so in about one in seven loaded test runs, which stopped land.sh at the doctor (backlog
// who-gets-the-keys-t5f). The same shape could skip land.sh's git apply --check for a moved file (SPEC-001-R213), or
// let the B9 replay miss a secret in env (SPEC-001-R28). Every script that sets pipefail feeds such a reader from a
// here-string or a file instead.

// A single | or |&, not the || of a list; then any command prefix or variable assignments; then grep. With -q, --quiet
// or --silent the pipeline's status is the answer, so a SIGPIPE always corrupts it. With -m or --max-count, or head, the
// answer is the output, and a "|| true" on the pipeline keeps a SIGPIPE from failing the script: land.sh's control
// character check reads LAND.txt that way, because a here-string would drop the NUL bytes it looks for.
const PIPE = String.raw`(?<!\|)\|&?(?!\|)\s*(?:(?:command|builtin|env)\s+|[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*`;
const PIPE_INTO_QUIET_GREP = new RegExp(String.raw`${PIPE}[ef]?grep\b[^|]*?\s(?:-[A-Za-z]*q[A-Za-z0-9]*|--quiet|--silent)\b`);
const PIPE_INTO_COUNTED_GREP = new RegExp(String.raw`${PIPE}[ef]?grep\b[^|]*?\s(?:-[A-Za-z]*m[A-Za-z0-9]*|--max-count)\b`);
// A builtin that writes a variable, printf or echo, piped into head.
const BUILTIN_INTO_HEAD = /\b(?:printf|echo)\b[^|]*\|&?(?!\|)\s*head\b/;
const OR_TRUE = /\|\|\s*true\b/;

// A script's commands as one line each: a line that ends in | or \ goes on with the next. Comment lines are dropped.
function logicalLines(text: string): { line: string; at: number }[] {
  const out: { line: string; at: number }[] = [];
  let pending: { line: string; at: number } | undefined;
  text.split("\n").forEach((raw, n) => {
    if (/^\s*#/.test(raw) && pending === undefined) return;
    const joined = pending ? { line: `${pending.line} ${raw.trim()}`, at: pending.at } : { line: raw, at: n + 1 };
    if (/(?:\||\\)\s*$/.test(raw)) pending = { line: joined.line.replace(/\\\s*$/, ""), at: joined.at };
    else {
      out.push(joined);
      pending = undefined;
    }
  });
  if (pending) out.push(pending);
  return out;
}

const offendsIn = (line: string): boolean =>
  PIPE_INTO_QUIET_GREP.test(line) || ((PIPE_INTO_COUNTED_GREP.test(line) || BUILTIN_INTO_HEAD.test(line)) && !OR_TRUE.test(line));

function offenders(): string[] {
  const files = execFileSync("git", ["ls-files", "-z", "--", "*.sh"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const found: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (!/\bpipefail\b/.test(text)) continue;
    for (const { line, at } of logicalLines(text)) if (offendsIn(line)) found.push(`${file}:${at}: ${line.trim()}`);
  }
  return found;
}

describe("SPEC-001-R218, SPEC-001-R213 and SPEC-001-R28 no pipefail script feeds an early-exiting reader from a pipe", () => {
  it("SPEC-001-R218, SPEC-001-R213 and SPEC-001-R28 find no pipe into grep -q or -m, and no printf or echo into head, in a script that sets pipefail", () => {
    expect(offenders()).toEqual([]);
  });

  it("SPEC-001-R218 the patterns catch the shapes that failed and their variants, and pass the here-string forms", () => {
    const caught = [
      `if ! printf '%s\\n' "$types" | grep -qxF 'sk-ssh-ed25519@openssh.com'; then`,
      "if env | grep -qE '^(AWS_|.*SECRET)' || gh api x; then",
      "ykman oath accounts list | grep --quiet break-glass",
      "x | egrep -q y", "x | command grep -q y", "x | LC_ALL=C grep -q y", "x |& grep -q y", "x | grep -m1 y", "x | grep -E -q y",
      `serial="$(printf '%s\\n' "$devices" | head -n 1)"`, `first="$(echo "$list" | head -n 1)"`,
    ];
    for (const line of caught) expect([line, offendsIn(line)]).toEqual([line, true]);
    const passed = [
      `if ! grep -qxF 'sk-ssh-ed25519@openssh.com' <<<"$types"; then`,
      `serial="$(head -n 1 <<<"$devices")"`,
      "count=\"$(ykman list | grep -c . || true)\"",
      `if [ "$a" = "$b" ] || grep -qxF -- "$a" <<<"$list"; then`,
      `printf '%s\\n' "$x" || head -n 1 file`,
      "git log --format=%s | grep -F word",
      `bad_line="$(git show "HEAD:\${manifest}" | LC_ALL=C grep -a -n -v -m 1 "^[[:print:]]*\\$" | cut -d: -f1 || true)"`,
      `version="$("$found" --version 2>/dev/null | head -n 1 || true)"`,
    ];
    expect(offendsIn("x | grep -q y || true")).toBe(true);
    for (const line of passed) expect([line, offendsIn(line)]).toEqual([line, false]);
  });

  it("SPEC-001-R218 joins a command continued over lines before it matches, and skips comment lines", () => {
    const text = "#!/usr/bin/env bash\nset -euo pipefail\n# x | grep -q y\nif list a b |\n  grep -qxF -- \"$s\"; then\n  echo \\\n    done\nfi\n";
    const lines = logicalLines(text);
    expect(lines.find((l) => l.at === 4)?.line).toBe("if list a b | grep -qxF -- \"$s\"; then");
    expect(lines.some((l) => l.line.includes("# x"))).toBe(false);
    expect(lines.filter((l) => offendsIn(l.line)).map((l) => l.at)).toEqual([4]);
  });
});
