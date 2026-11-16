import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { failedTestDetails, type TestFileResult } from "../scripts/checks.ts";

// What the test check prints when a test fails (SPEC-001-R15). Vitest's JSON report holds each failing test's titles,
// duration and message, but the check kept only the first failing file's path: run 274 on 2026-11-15 failed as
// test/land.test.ts, and nothing in the run named the test (backlog who-gets-the-keys-t5f). The report shapes below,
// the time limit's "STACK_TRACE_ERROR" and the failed hook's empty file message included, are Vitest 4.1's own.

type Assertion = NonNullable<TestFileResult["assertionResults"]>[number];
const failing = (title: string, message: string, duration?: number): Assertion =>
  ({ ancestorTitles: ["outer"], title, status: "failed", failureMessages: [message], ...(duration === undefined ? {} : { duration }) });
const passing = (title: string): Assertion => ({ ancestorTitles: ["outer"], title, status: "passed", failureMessages: [] });
const fileWith = (name: string, ...assertionResults: Assertion[]): TestFileResult => ({
  name, status: assertionResults.some((a) => a.status === "failed") ? "failed" : "passed", message: "", assertionResults,
});

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

// Runs `node scripts/checks.ts test` in a temporary directory whose vitest stand-in copies report to the --outputFile
// path the check passes and exits with status. The directory is a real path, so the names in the report match the
// check's working directory on macOS too, where the temporary directory is reached through a symlink.
function runTestCheck(report: (root: string) => TestFileResult[], status: number, summaryPath?: string) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "test-check-")));
  dirs.push(dir);
  mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true });
  const reportFile = join(dir, "report.json");
  writeFileSync(reportFile, JSON.stringify({ testResults: report(dir) }));
  const vitest = join(dir, "node_modules", ".bin", "vitest");
  writeFileSync(vitest, `#!/bin/sh\nfor a in "$@"; do case "$a" in --outputFile=*) cp '${reportFile}' "\${a#--outputFile=}" ;; esac; done\nexit ${status}\n`);
  chmodSync(vitest, 0o755);
  const summary = summaryPath ?? join(dir, "summary.md");
  if (summaryPath === undefined) writeFileSync(summary, "");
  const r = spawnSync(process.execPath, [join(process.cwd(), "scripts", "checks.ts"), "test"], {
    cwd: dir,
    encoding: "utf8",
    env: { PATH: process.env["PATH"] ?? "", HOME: dir, GITHUB_STEP_SUMMARY: summary },
  });
  let written = "";
  try {
    written = readFileSync(summary, "utf8");
  } catch {
    written = "";
  }
  return { status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr, summary: written };
}

describe("SPEC-001-R15 the test check names each failing test", () => {
  it("SPEC-001-R15 lists each failing test's file, titles, duration, message and first stack frame, and a file that failed to load", () => {
    const results: TestFileResult[] = [
      fileWith("/r/test/b.test.ts", passing("passes"), failing("SPEC-001-R41 lands", "AssertionError: expected 1 to be 2\n    at /r/test/b.test.ts:3:5\n    at file:///x/runner.js:1:1", 12.4)),
      { name: "/r/test/a.test.ts", status: "failed", message: "Cannot find module './gone.ts' imported from /r/test/a.test.ts", assertionResults: [] },
      fileWith("/r/test/c.test.ts", passing("fine")),
    ];
    expect(failedTestDetails(results, "/r")).toEqual([
      "FAIL test/b.test.ts > outer > SPEC-001-R41 lands (12 ms)",
      "  | AssertionError: expected 1 to be 2",
      "  |     at test/b.test.ts:3:5",
      "FAIL test/a.test.ts",
      "  | Cannot find module './gone.ts' imported from test/a.test.ts",
    ]);
    expect(failedTestDetails([fileWith("/r/test/c.test.ts", passing("fine"))], "/r")).toEqual([]);
  });

  it("SPEC-001-R15 shows a test past its time limit by its duration, and says when a file failed with no failing test, as when a hook fails", () => {
    const timedOut = fileWith("/r/test/t.test.ts", failing("slow", "Error: STACK_TRACE_ERROR\n    at task (node_modules/runner.js:1784:27)\n    at more", 60_012.6));
    expect(failedTestDetails([timedOut], "/r")).toEqual([
      "FAIL test/t.test.ts > outer > slow (60013 ms)",
      "  | Error: STACK_TRACE_ERROR",
      "  |     at task (node_modules/runner.js:1784:27)",
    ]);
    const hooked: TestFileResult = { name: "/r/test/h.test.ts", status: "failed", message: "",
      assertionResults: [{ ancestorTitles: ["hooked"], title: "after the hook", status: "skipped", failureMessages: [] }] };
    expect(failedTestDetails([hooked], "/r")).toEqual([
      "FAIL test/h.test.ts",
      "  | Vitest recorded no failing test and no message for this file: a beforeAll or afterAll hook may have failed",
    ]);
  });

  it("SPEC-001-R15 keeps at most 8 lines of a message up to an indented stack frame, 300 characters of a line and 20 failing tests", () => {
    const long = Array.from({ length: 12 }, (_, n) => `line ${n}`).join("\n");
    const [, ...lines] = failedTestDetails([fileWith("/r/test/a.test.ts", failing("long", long))], "/r");
    expect(lines).toEqual(Array.from({ length: 8 }, (_, n) => `  | line ${n}`));
    const [, ...framed] = failedTestDetails([fileWith("/r/test/a.test.ts", failing("at", "AssertionError: no\nat the start of a line\n    at frame (test/a.test.ts:1:1)\n    at next"))], "/r");
    expect(framed).toEqual(["  | AssertionError: no", "  | at the start of a line", "  |     at frame (test/a.test.ts:1:1)"]);
    const [, wide = ""] = failedTestDetails([fileWith("/r/test/a.test.ts", failing("wide", "x".repeat(400)))], "/r");
    expect(wide).toBe(`  | ${"x".repeat(300)}...`);
    const [, faces = ""] = failedTestDetails([fileWith("/r/test/a.test.ts", failing("faces", "\u{1F600}".repeat(400)))], "/r");
    expect(faces).toBe(`  | ${"\u{1F600}".repeat(300)}...`);
    const many = Array.from({ length: 25 }, (_, n) => failing(`t${n}`, "no"));
    const shown = failedTestDetails([fileWith("/r/test/a.test.ts", ...many)], "/r");
    expect(shown.filter((l) => l.startsWith("FAIL test/a.test.ts > "))).toHaveLength(20);
    expect(shown.at(-1)).toBe("FAIL (5 more failing tests not shown)");
  });

  it("SPEC-001-R15 shows control characters and ##[ escaped, and starts every line so that it cannot be a workflow command or end the summary's fence", () => {
    const lines = failedTestDetails([fileWith("/r/test/a\u0007.test.ts", failing("b\u001b[2Kc ##[group]", "::error::forged\n```\n\u001b[31mred\nx ##[error]forged\n\u009b31m"))], "/r");
    expect(lines).toEqual([
      "FAIL test/a\\u0007.test.ts > outer > b\\u001b[2Kc ##\\[group]",
      "  | ::error::forged",
      "  | ```",
      "  | \\u001b[31mred",
      "  | x ##\\[error]forged",
      "  | \\u009b31m",
    ]);
    for (const line of lines) {
      expect(line).toMatch(/^(FAIL |  \| )/);
      expect(line).not.toContain("##[");
      expect(line).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    }
  });

  it("SPEC-001-R15 prints one failure line on standard output, and the failing tests on standard error and in the run summary", () => {
    const report = (root: string): TestFileResult[] => [
      fileWith(`${root}/test/b.test.ts`, failing("SPEC-001-R41 lands", `AssertionError: expected 1 to be 2\n    at ${root}/test/b.test.ts:3:5`, 7)),
      { name: `${root}/test/a.test.ts`, status: "failed", message: "Cannot find module", assertionResults: [] },
    ];
    const details = ["FAIL test/b.test.ts > outer > SPEC-001-R41 lands (7 ms)", "  | AssertionError: expected 1 to be 2", "  |     at test/b.test.ts:3:5", "FAIL test/a.test.ts", "  | Cannot find module"];
    const r = runTestCheck(report, 1);
    expect([r.status, r.stdout]).toEqual([1, "CHECK test FAILED: test/a.test.ts\n"]);
    expect(r.stderr).toContain(`${details.join("\n")}\n`);
    expect(r.summary).toBe(["## Failing tests", "", "```text", ...details, "```", ""].join("\n"));

    const passed = runTestCheck(() => [fileWith("/x/test/c.test.ts", passing("fine"))], 0);
    expect([passed.status, passed.stdout, passed.stderr, passed.summary]).toEqual([0, "", "", ""]);

    const unwritable = runTestCheck(report, 1, join(tmpdir(), "no-such-directory-for-test-check", "summary.md"));
    expect([unwritable.status, unwritable.stdout]).toEqual([1, "CHECK test FAILED: test/a.test.ts\n"]);
    expect(unwritable.stderr).toContain(`${details.join("\n")}\n`);
    expect(unwritable.stderr).toContain("test: could not append the failing tests to the run summary");
  });
});
