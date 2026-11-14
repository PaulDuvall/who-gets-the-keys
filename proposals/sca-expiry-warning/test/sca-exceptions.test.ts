import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { EXCEPTION_LABELS, expiryWarnings, scaExceptions } from "../scripts/checks.ts";

const labelled = (labels: readonly string[] = EXCEPTION_LABELS): string[] => labels.map((l) => `${l}: text.`);
const entry = (id: string, until = "2027-01-13T00:00:00Z", reason = ['reason = """', ...labelled(), '"""']): string[] =>
  ["[[IgnoredVulns]]", `id = "${id}"`, `ignoreUntil = ${until}`, ...reason];
const toml = (...lines: string[][]): string => `# header\n\n${lines.map((l) => l.join("\n")).join("\n\n")}\n`;
const evidence = (...ids: string[]): string => ids.map((id) => `## ${id}: package 1.0\n\nWhy.\n`).join("\n");
const ids = (result: ReturnType<typeof scaExceptions>): string[] | string => (typeof result === "string" ? result : result.map((e) => e.id));

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

// Runs `node scripts/checks.ts sca` in a temporary directory, with an osv-scanner stand-in that passes.
function runSca(files: Record<string, string>): { status: number; stdout: string; stderr: string; summary: string } {
  const dir = mkdtempSync(join(tmpdir(), "sca-exceptions-"));
  dirs.push(dir);
  mkdirSync(join(dir, "specs"));
  mkdirSync(join(dir, "bin"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  writeFileSync(join(dir, "bin", "osv-scanner"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(dir, "bin", "osv-scanner"), 0o755);
  const summary = join(dir, "summary.md");
  writeFileSync(summary, "");
  const r = spawnSync(process.execPath, [join(process.cwd(), "scripts", "checks.ts"), "sca"], {
    cwd: dir,
    encoding: "utf8",
    env: { PATH: `${join(dir, "bin")}:${process.env["PATH"] ?? ""}`, HOME: dir, GITHUB_STEP_SUMMARY: summary },
  });
  return { status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr, summary: readFileSync(summary, "utf8") };
}

const inDays = (days: number): string => new Date(Math.floor(Date.now() / 1000) * 1000 + days * 86_400_000).toISOString().replace(".000Z", "Z");

describe("SPEC-001 sca exceptions", () => {
  it("SPEC-001-R234 accepts this repository's exceptions file and its evidence log", () => {
    const result = scaExceptions(readFileSync("specs/sca-exceptions.toml", "utf8"), readFileSync("specs/sca-exceptions.md", "utf8"));
    expect(typeof result).toBe("object");
    expect((result as unknown[]).length).toBeGreaterThan(0);
  });

  it("SPEC-001-R234 reads each entry's id, ignoreUntil and one-line or multi-line reason", () => {
    const oneLine = ['reason = "What: a. Why not fixed: b."'];
    const result = scaExceptions(toml(entry("GHSA-a"), entry("GHSA-b", "2026-12-08T00:00:00Z")), evidence("GHSA-a", "GHSA-b"));
    expect(result).toEqual([
      { id: "GHSA-a", ignoreUntil: "2027-01-13T00:00:00Z", reason: labelled().join("\n") },
      { id: "GHSA-b", ignoreUntil: "2026-12-08T00:00:00Z", reason: labelled().join("\n") },
    ]);
    // A one-line reason is read, but its labels after the first do not start a line.
    expect(scaExceptions(toml(entry("GHSA-a", undefined, oneLine)), evidence("GHSA-a"))).toBe("GHSA-a reason lacks Why not fixed");
    expect(scaExceptions("", "")).toEqual([]);
  });

  it("SPEC-001-R234 names the first line outside the allowed form", () => {
    const at = (lines: string[]): string | ScaResult => scaExceptions(toml(lines), evidence("GHSA-a"));
    const base = entry("GHSA-a");
    expect(at(["[[IgnoredVulns]]", 'id = "GHSA-a"', "effectiveUntil = 2027-01-13T00:00:00Z"])).toBe("exceptions file line 5");
    expect(scaExceptions('id = "GHSA-a"\n', "")).toBe("exceptions file line 1");
    expect(at(["[[IgnoredVulns]]", "id = 'GHSA-a'"])).toBe("exceptions file line 4");
    expect(at(["[[IgnoredVulns]]", "  id = \"GHSA-a\""])).toBe("exceptions file line 4");
    expect(at(["[[IgnoredVulns]]", 'id = "GHSA a"'])).toBe("exceptions file line 4");
    expect(at([...base.slice(0, 2), "ignoreUntil = 2027-01-13"])).toBe("exceptions file line 5");
    expect(at([...base.slice(0, 2), "ignoreUntil = 2027-02-30T00:00:00Z"])).toBe("exceptions file line 5");
    expect(at([...base.slice(0, 2), '"ignoreUntil" = 2027-01-13T00:00:00Z'])).toBe("exceptions file line 5");
    expect(at([...base.slice(0, 3), 'reason = """', "What: never closed."])).toBe("exceptions file line 6");
    expect(at([...base.slice(0, 3), 'reason = """', "What: a \\n b.", '"""'])).toBe("exceptions file line 6");
    expect(at([...base.slice(0, 3), 'reason = "What: \\"quoted\\""'])).toBe("exceptions file line 6");
    expect(at([...base, "[IgnoredVulns]"])).toBe("exceptions file line 13");
  });

  it("SPEC-001-R234 names the first entry that lacks a key, sets one twice or repeats an ID", () => {
    const noUntil = ["[[IgnoredVulns]]", 'id = "GHSA-b"', 'reason = """', ...labelled(), '"""'];
    expect(scaExceptions(toml(entry("GHSA-a"), noUntil), evidence("GHSA-a", "GHSA-b"))).toBe("GHSA-b lacks ignoreUntil");
    expect(scaExceptions(toml(["[[IgnoredVulns]]", "ignoreUntil = 2027-01-13T00:00:00Z"]), "")).toBe("entry at line 3 lacks id");
    expect(scaExceptions(toml(["[[IgnoredVulns]]", 'id = "GHSA-c"', "ignoreUntil = 2027-01-13T00:00:00Z"]), "")).toBe("GHSA-c lacks reason");
    expect(scaExceptions(toml([...entry("GHSA-a"), "ignoreUntil = 2028-01-01T00:00:00Z"]), evidence("GHSA-a"))).toBe("GHSA-a sets ignoreUntil twice");
    expect(scaExceptions(toml(entry("GHSA-a"), entry("GHSA-a")), evidence("GHSA-a"))).toBe("GHSA-a listed twice");
  });

  it("SPEC-001-R234 requires the five labels, each at the start of a line, in order", () => {
    const withLabels = (labels: readonly string[]): string | ScaResult =>
      scaExceptions(toml(entry("GHSA-a", undefined, ['reason = """', ...labelled(labels), '"""'])), evidence("GHSA-a"));
    expect(withLabels(["What", "Why not fixed", "Evidence", "Expires"])).toBe("GHSA-a reason lacks Why not reached");
    expect(withLabels(["What", "Why not reached", "Why not fixed", "Evidence", "Expires"])).toBe("GHSA-a reason lacks Why not reached");
    expect(withLabels(["What", "Why not fixed", "Why not reached", "Evidence"])).toBe("GHSA-a reason lacks Expires");
    expect(withLabels([])).toBe("GHSA-a reason lacks What");
    const indented = ['reason = """', " What: text.", ...labelled().slice(1), '"""'];
    expect(scaExceptions(toml(entry("GHSA-a", undefined, indented)), evidence("GHSA-a"))).toBe("GHSA-a reason lacks What");
  });

  it("SPEC-001-R234 requires exactly one evidence section for each entry", () => {
    const file = toml(entry("GHSA-a"), entry("GHSA-ab"));
    expect(ids(scaExceptions(file, evidence("GHSA-a", "GHSA-ab")))).toEqual(["GHSA-a", "GHSA-ab"]);
    expect(scaExceptions(file, evidence("GHSA-ab"))).toBe("GHSA-a has no evidence section");
    expect(scaExceptions(file, evidence("GHSA-a"))).toBe("GHSA-ab has no evidence section");
    expect(scaExceptions(file, "### GHSA-a\n## GHSA-ab\n")).toBe("GHSA-a has no evidence section");
    expect(scaExceptions(file, `${evidence("GHSA-a", "GHSA-ab")}\n## GHSA-a\n`)).toBe("GHSA-a has more than one evidence section");
    expect(ids(scaExceptions(toml(entry("GHSA-a")), "## GHSA-a\n"))).toEqual(["GHSA-a"]);
  });

  it("SPEC-001-R233 warns from 14 days before an ignoreUntil, and after it has passed", () => {
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
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("CHECK sca FAILED: GHSA-a has no evidence section\n");
  });

  it("SPEC-001-R233 prints the warning on standard error and in the run summary, and passes", () => {
    const soon = inDays(3), later = inDays(30);
    const r = runSca({
      "specs/sca-exceptions.toml": toml(entry("GHSA-soon", soon), entry("GHSA-later", later)),
      "specs/sca-exceptions.md": evidence("GHSA-soon", "GHSA-later"),
    });
    const line = `CHECK sca WARNING: GHSA-soon expires ${soon.slice(0, 10)}`;
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain(line);
    expect(r.stderr).not.toContain("GHSA-later");
    expect(r.summary).toContain(line);
    const quiet = runSca({ "specs/sca-exceptions.toml": toml(entry("GHSA-later", later)), "specs/sca-exceptions.md": evidence("GHSA-later") });
    expect([quiet.status, quiet.stderr, quiet.summary]).toEqual([0, "", ""]);
  });
});

type ScaResult = ReturnType<typeof scaExceptions>;
