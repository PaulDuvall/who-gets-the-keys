import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { expiryWarnings, scaExceptions } from "../scripts/checks.ts";

// Written out here, not imported, so a label dropped from the code fails these tests.
const LABELS = ["What", "Why not fixed", "Why not reached", "Evidence", "Expires"];
const reasonLines = (labels: readonly string[] = LABELS): string[] => ['reason = """', ...labels.map((l) => `${l}: text.`), '"""'];
const entry = (id: string, until = "2027-01-13T00:00:00Z", reason = reasonLines()): string[] =>
  ["[[IgnoredVulns]]", `id = "${id}"`, `ignoreUntil = ${until}`, ...reason];
const toml = (...lines: string[][]): string => `# header\n\n${lines.map((l) => l.join("\n")).join("\n\n")}\n`;
const evidence = (...ids: string[]): string => ids.map((id) => `## ${id}: package 1.0\n\nWhy.\n`).join("\n");
type ScaResult = ReturnType<typeof scaExceptions>;
const ids = (result: ScaResult): string[] | string => (typeof result === "string" ? result : result.map((e) => e.id));

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

// Runs `node scripts/checks.ts sca` in a temporary directory. The osv-scanner stand-in passes and leaves a marker,
// so a test can tell whether the check reached it.
function runSca(files: Record<string, string>, summaryPath?: string) {
  const dir = mkdtempSync(join(tmpdir(), "sca-exceptions-"));
  dirs.push(dir);
  mkdirSync(join(dir, "specs"));
  mkdirSync(join(dir, "bin"));
  for (const [name, text] of Object.entries(files)) {
    if (text === "<directory>") mkdirSync(join(dir, name));
    else writeFileSync(join(dir, name), text);
  }
  writeFileSync(join(dir, "bin", "osv-scanner"), `#!/bin/sh\n: > "${join(dir, "osv-ran")}"\nexit 0\n`);
  chmodSync(join(dir, "bin", "osv-scanner"), 0o755);
  const summary = summaryPath ?? join(dir, "summary.md");
  if (summaryPath === undefined) writeFileSync(summary, "");
  const r = spawnSync(process.execPath, [join(process.cwd(), "scripts", "checks.ts"), "sca"], {
    cwd: dir,
    encoding: "utf8",
    env: { PATH: `${join(dir, "bin")}:${process.env["PATH"] ?? ""}`, HOME: dir, GITHUB_STEP_SUMMARY: summary },
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout,
    stderr: r.stderr,
    summary: existsSync(summary) ? readFileSync(summary, "utf8") : "",
    osvRan: existsSync(join(dir, "osv-ran")),
  };
}

const inDays = (days: number): string => new Date(Math.floor(Date.now() / 1000) * 1000 + days * 86_400_000).toISOString().replace(".000Z", "Z");

describe("SPEC-001 sca exceptions", () => {
  it("SPEC-001-R234 accepts this repository's exceptions file and its evidence log, with LF or CRLF line ends", () => {
    const file = readFileSync("specs/sca-exceptions.toml", "utf8");
    const log = readFileSync("specs/sca-exceptions.md", "utf8");
    const result = scaExceptions(file, log);
    expect(typeof result).toBe("object");
    expect((result as unknown[]).length).toBeGreaterThan(0);
    expect(scaExceptions(file.replaceAll("\n", "\r\n"), log)).toEqual(result);
  });

  it("SPEC-001-R234 reads each entry's id, ignoreUntil and multi-line reason", () => {
    const text = LABELS.map((l) => `${l}: text.`).join("\n");
    expect(scaExceptions(toml(entry("GHSA-a"), entry("GHSA-b", "2026-12-08T00:00:00Z")), evidence("GHSA-a", "GHSA-b"))).toEqual([
      { id: "GHSA-a", ignoreUntil: "2027-01-13T00:00:00Z", reason: text },
      { id: "GHSA-b", ignoreUntil: "2026-12-08T00:00:00Z", reason: text },
    ]);
    const spaced = ["  # indented comment", " \t", ...entry("GHSA-c")];
    expect(ids(scaExceptions(toml(spaced), evidence("GHSA-c")))).toEqual(["GHSA-c"]);
    expect(scaExceptions("", "")).toEqual([]);
  });

  it("SPEC-001-R234 names the first line outside the allowed form", () => {
    const at = (lines: string[]): ScaResult => scaExceptions(toml(lines), evidence("GHSA-a"));
    const head = entry("GHSA-a").slice(0, 3);
    expect(at(["[[IgnoredVulns]]", 'id = "GHSA-a"', "effectiveUntil = 2027-01-13T00:00:00Z"])).toBe("exceptions file line 5");
    expect(scaExceptions('id = "GHSA-a"\n', "")).toBe("exceptions file line 1");
    for (const bad of ["id = 'GHSA-a'", '  id = "GHSA-a"', 'id="GHSA-a"', 'id = "GHSA-a" ', 'id = "GHSA-a" # note', 'id = "GHSA a"', 'id = "-GHSA"']) {
      expect(at(["[[IgnoredVulns]]", bad])).toBe("exceptions file line 4");
    }
    for (const bad of ["ignoreUntil = 2027-01-13", "ignoreUntil = 2027-02-30T00:00:00Z", '"ignoreUntil" = 2027-01-13T00:00:00Z']) {
      expect(at([...head.slice(0, 2), bad])).toBe("exceptions file line 5");
    }
    expect(at([...head, 'reason = "What: a. Why not fixed: b."'])).toBe("exceptions file line 6");
    expect(at([...head, 'reason = """', "What: never closed."])).toBe("exceptions file line 6");
    expect(at([...head, 'reason = """', "What: a \\n b.", '"""'])).toBe("exceptions file line 6");
    expect(at([...head, 'reason = """', 'What: a """ b.', '"""'])).toBe("exceptions file line 6");
    expect(at([...head, 'reason = """', "What: a \u0007 b.", '"""'])).toBe("exceptions file line 6");
    expect(at([...entry("GHSA-a"), "[IgnoredVulns]"])).toBe("exceptions file line 13");
    expect(at([" ", ...entry("GHSA-a")])).toBe("exceptions file line 3");
    expect(at(["# a \u007f in a comment", ...entry("GHSA-a")])).toBe("exceptions file line 3");
  });

  it("SPEC-001-R234 names the first entry that lacks a key, sets one twice or repeats an ID", () => {
    const noUntil = ["[[IgnoredVulns]]", 'id = "GHSA-b"', ...reasonLines()];
    expect(scaExceptions(toml(entry("GHSA-a"), noUntil), evidence("GHSA-a", "GHSA-b"))).toBe("GHSA-b lacks ignoreUntil");
    expect(scaExceptions(toml(["[[IgnoredVulns]]", "ignoreUntil = 2027-01-13T00:00:00Z"]), "")).toBe("entry at line 3 lacks id");
    expect(scaExceptions(toml(["[[IgnoredVulns]]", 'id = "GHSA-c"']), "")).toBe("GHSA-c lacks ignoreUntil");
    expect(scaExceptions(toml(["[[IgnoredVulns]]", 'id = "GHSA-c"', "ignoreUntil = 2027-01-13T00:00:00Z"]), "")).toBe("GHSA-c lacks reason");
    expect(scaExceptions(toml([...entry("GHSA-a"), "ignoreUntil = 2028-01-01T00:00:00Z"]), evidence("GHSA-a"))).toBe("GHSA-a sets ignoreUntil twice");
    expect(scaExceptions(toml(entry("GHSA-a"), entry("GHSA-a")), evidence("GHSA-a"))).toBe("GHSA-a listed twice");
    const both = toml(["[[IgnoredVulns]]", 'id = "GHSA-d"', 'id = "GHSA-e"']);
    expect(scaExceptions(both, "")).toBe("GHSA-d lacks ignoreUntil");
  });

  it("SPEC-001-R234 requires the five labels, each at the start of a line, in order", () => {
    const withLabels = (labels: readonly string[]): ScaResult => scaExceptions(toml(entry("GHSA-a", undefined, reasonLines(labels))), evidence("GHSA-a"));
    for (const missing of LABELS) {
      expect(withLabels(LABELS.filter((l) => l !== missing))).toBe(`GHSA-a reason lacks ${missing}`);
    }
    expect(withLabels(["What", "Why not reached", "Why not fixed", "Evidence", "Expires"])).toBe("GHSA-a reason lacks Why not reached");
    expect(withLabels([])).toBe("GHSA-a reason lacks What");
    const indented = ['reason = """', " What: text.", ...LABELS.slice(1).map((l) => `${l}: text.`), '"""'];
    expect(scaExceptions(toml(entry("GHSA-a", undefined, indented)), evidence("GHSA-a"))).toBe("GHSA-a reason lacks What");
  });

  it("SPEC-001-R234 requires exactly one evidence section for each entry", () => {
    const file = toml(entry("GHSA-a"), entry("GHSA-ab"));
    expect(ids(scaExceptions(file, evidence("GHSA-a", "GHSA-ab")))).toEqual(["GHSA-a", "GHSA-ab"]);
    expect(scaExceptions(file, evidence("GHSA-ab"))).toBe("GHSA-a has no evidence section");
    expect(scaExceptions(file, evidence("GHSA-a"))).toBe("GHSA-ab has no evidence section");
    expect(scaExceptions(file, "### GHSA-a\n## GHSA-ab\n")).toBe("GHSA-a has no evidence section");
    expect(scaExceptions(file, "## GHSA-a.x\n## GHSA-ab\n")).toBe("GHSA-a has no evidence section");
    expect(scaExceptions(file, `${evidence("GHSA-a", "GHSA-ab")}\n## GHSA-a\n`)).toBe("GHSA-a has more than one evidence section");
    expect(ids(scaExceptions(toml(entry("GHSA-a")), "## GHSA-a\n"))).toEqual(["GHSA-a"]);
    expect(ids(scaExceptions(toml(entry("GHSA-a")), "## GHSA-a\tzod\n"))).toEqual(["GHSA-a"]);
  });

  it("SPEC-001-R233 warns from 14 days before an ignoreUntil, and at and after it", () => {
    const now = new Date("2026-12-25T12:00:00Z");
    const e = (id: string, ignoreUntil: string) => ({ id, ignoreUntil, reason: "" });
    expect(expiryWarnings([e("GHSA-far", "2027-01-08T12:00:01Z")], now)).toEqual([]);
    expect(expiryWarnings([e("GHSA-edge", "2027-01-08T12:00:00Z")], now)).toEqual(["CHECK sca WARNING: GHSA-edge expires 2027-01-08"]);
    expect(expiryWarnings([e("GHSA-now", "2026-12-25T12:00:00Z")], now)).toEqual(["CHECK sca WARNING: GHSA-now expired 2026-12-25"]);
    expect(expiryWarnings([e("GHSA-soon", "2026-12-25T12:00:01Z"), e("GHSA-old", "2026-11-01T00:00:00Z")], now)).toEqual([
      "CHECK sca WARNING: GHSA-soon expires 2026-12-25",
      "CHECK sca WARNING: GHSA-old expired 2026-11-01",
    ]);
    expect(expiryWarnings([e("GHSA-week", "2027-01-01T00:00:00Z")], now, 7)).toEqual(["CHECK sca WARNING: GHSA-week expires 2027-01-01"]);
  });

  it("SPEC-001-R234 fails the sca check with one line before OSV-Scanner runs", () => {
    const r = runSca({ "specs/sca-exceptions.toml": toml(entry("GHSA-a")), "specs/sca-exceptions.md": "# no sections\n" });
    expect([r.status, r.stdout, r.osvRan]).toEqual([1, "CHECK sca FAILED: GHSA-a has no evidence section\n", false]);
    const unreadable = runSca({ "specs/sca-exceptions.toml": toml(entry("GHSA-a")), "specs/sca-exceptions.md": "<directory>" });
    expect([unreadable.status, unreadable.stdout, unreadable.osvRan]).toEqual([1, "CHECK sca FAILED: specs/sca-exceptions.md unreadable\n", false]);
  });

  it("SPEC-001-R233 prints the warnings on standard error and in the run summary, and passes", () => {
    const soon = inDays(13), later = inDays(15), gone = inDays(-1);
    const r = runSca({
      "specs/sca-exceptions.toml": toml(entry("GHSA-soon", soon), entry("GHSA-later", later), entry("GHSA-gone", gone)),
      "specs/sca-exceptions.md": evidence("GHSA-soon", "GHSA-later", "GHSA-gone"),
    });
    const lines = [`CHECK sca WARNING: GHSA-soon expires ${soon.slice(0, 10)}`, `CHECK sca WARNING: GHSA-gone expired ${gone.slice(0, 10)}`];
    expect([r.status, r.stdout, r.osvRan]).toEqual([0, "", true]);
    expect(r.stderr).toBe(`${lines.join("\n")}\n`);
    expect(r.summary).toContain(lines.join("\n"));
    const quiet = runSca({ "specs/sca-exceptions.toml": toml(entry("GHSA-later", later)), "specs/sca-exceptions.md": evidence("GHSA-later") });
    expect([quiet.status, quiet.stderr, quiet.summary, quiet.osvRan]).toEqual([0, "", "", true]);
    const missing = runSca(
      { "specs/sca-exceptions.toml": toml(entry("GHSA-soon", soon)), "specs/sca-exceptions.md": evidence("GHSA-soon") },
      join(tmpdir(), "no-such-directory-for-sca", "summary.md"),
    );
    expect([missing.status, missing.stdout]).toEqual([0, ""]);
    expect(missing.stderr).toContain("could not append the warnings to the run summary");
  });
});
