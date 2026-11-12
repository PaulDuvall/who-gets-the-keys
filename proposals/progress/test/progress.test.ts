import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { claimStatus, ledgerProblems, progress, progressFiles, progressSvg, requirementSets, type Claim } from "../scripts/progress.ts";
import { scratchDir } from "./helpers/temp-repo.ts";

// The README's progress visual and the factory video's claim statuses come from scripts/progress.ts, from committed
// files only. The test check fails when the committed copy is stale or a claim no longer matches the repository
// (SPEC-001-R226 to R228).
describe("SPEC-001-R226 to R228 the progress record is generated, current, and shown in the README", () => {
  const scratch = scratchDir("progress-");

  it("SPEC-001-R227 docs/progress.json and docs/progress.svg are what npm run progress writes for this tree", async () => {
    const files = await progressFiles(".");
    for (const [path, text] of Object.entries(files)) {
      expect([path, readFileSync(path, "utf8") === text]).toEqual([path, true]);
    }
  });

  it("SPEC-001-R227 docs/practices.md is what npm run practices writes for this tree", () => {
    const dir = scratch();
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(join(dir, "practices.yaml"), readFileSync("practices.yaml"));
    execFileSync(process.execPath, [join(process.cwd(), "scripts/checks.ts"), "practices-md"], { cwd: dir });
    expect(readFileSync(join(dir, "docs/practices.md"), "utf8")).toBe(readFileSync("docs/practices.md", "utf8"));
  });

  it("SPEC-001-R227 every claim in the factory video's ledger matches the repository", () => {
    const { claims } = JSON.parse(readFileSync("factory-video/claims.json", "utf8")) as { claims: Claim[] };
    expect(ledgerProblems(".", claims)).toEqual([]);
  });

  // A git repository of the files given, all added, so the counts read only what git tracks.
  function fixture(files: Record<string, string>): string {
    const root = mkdtempSync(join(scratch(), "tree-"));
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "add", "-A"]);
    return root;
  }

  const TREE: Record<string, string> = {
    "specs/SPEC-009-x.md": "| ID | Requirement |\n|---|---|\n| SPEC-009-R1 | one |\n",
    "docs/decisions/0009-x.md": "| SPEC-009-R1 | again |\n| SPEC-009-R2 | two |\n",
    "proposals/b/SPEC-009-x.md": "| SPEC-009-R3 | three, staged |\n",
    "proposals/b/notes.md": "| SPEC-009-R4 | in a note, not a spec copy |\n",
    "docs/e.md": "has the words\n",
    ".tasks/backlog.jsonl": '{"id": "k-open", "status": "open"}\n{"id": "k-done", "status": "closed"}\n',
  };

  it("SPEC-001-R226 counts claims by status, and SPEC-001-R227 names each kind of citation that no longer holds", () => {
    expect(claimStatus({ id: "a", claim: "", built: ["x"] })).toBe("built");
    expect(claimStatus({ id: "b", claim: "", built: ["x"], open: ["y"] })).toBe("partly built");
    expect(claimStatus({ id: "c", claim: "", planned: ["x"] })).toBe("planned");
    expect(claimStatus({ id: "d", claim: "", open: ["x"] })).toBe("open");
    expect(claimStatus({ id: "e", claim: "", illustrative: true, built: ["x"] })).toBe("illustrative");

    const root = fixture(TREE);
    // Untracked files never count: a scratch spec copy outside git changes nothing.
    mkdirSync(join(root, "proposals/scratch"), { recursive: true });
    writeFileSync(join(root, "proposals/scratch/SPEC-009-y.md"), "| SPEC-009-R9 | untracked |\n");
    const sets = requirementSets(root);
    expect([[...sets.approved], [...sets.drafted].sort()]).toEqual([["SPEC-009-R1"], ["SPEC-009-R2", "SPEC-009-R3"]]);
    const claims: Claim[] = [
      { id: "C1", claim: "", built: ["SPEC-009-R1", { file: "docs/e.md", contains: "the words" }], planned: ["SPEC-009-R2", "SPEC-009-R3"], open: ["k-open"] },
      { id: "C2", claim: "", built: ["SPEC-009-R2", { file: "docs/e.md", contains: "other words" }, { file: "docs/gone.md", contains: "x" }] },
      { id: "C3", claim: "", planned: ["SPEC-009-R1", "SPEC-009-R4"] },
      { id: "C4", claim: "", open: ["k-done", "k-gone"] },
      { id: "C5", claim: "" },
    ];
    expect(ledgerProblems(root, claims)).toEqual([
      "C2: SPEC-009-R2 not in specs/",
      'C2: docs/e.md lacks "other words"',
      'C2: docs/gone.md lacks "x"',
      "C3: SPEC-009-R1 is in specs/ now; move it to built",
      "C3: SPEC-009-R4 not drafted in docs/decisions/ or proposals/",
      "C4: k-done is closed; cite what built it, or drop it",
      "C4: k-gone not in .tasks/backlog.jsonl",
      "C5: no evidence, plan or backlog item",
    ]);
  });

  it("SPEC-001-R226 counts practices, scenarios and backlog items, and refuses a value it would count in no bar", async () => {
    const claims = { claims: [{ id: "C1", claim: "", built: ["SPEC-009-R1"] }, { id: "C2", claim: "", planned: ["SPEC-009-R2"] }] };
    const base = {
      ...TREE,
      "factory-video/claims.json": JSON.stringify(claims),
      "practices.yaml": "practices:\n  - coverage: good+bad\n  - coverage: not-shown\n  - coverage: not-shown\n",
      "scenarios/scenarios.yaml": "scenarios:\n  - id: B1\n  - id: B9\n    requires: github-actions\n  - id: B11\n    requires: sandbox-account\n",
    };
    const p = await progress(fixture(base));
    expect(p.requirements).toEqual({ approved: 1, drafted: 2, approvedBySpec: { "SPEC-009": 1 } });
    expect(p.claims).toEqual({ built: 1, "partly built": 0, planned: 1, open: 0, illustrative: 0, total: 2 });
    expect(p.practices).toEqual({ "good+bad": 1, "good-only": 0, partial: 0, "not-shown": 2, total: 3 });
    expect(p.scenarios).toEqual({ local: 1, "github-actions": 1, "sandbox-account": 1, total: 3 });
    expect(p.backlog).toEqual({ open: 1, closed: 1 });

    await expect(progress(fixture({ ...base, "practices.yaml": "practices:\n  - coverage: half\n" }))).rejects.toThrow('practices.yaml coverage: "half" is not one of');
    await expect(progress(fixture({ ...base, "scenarios/scenarios.yaml": "scenarios:\n  - requires: github_actions\n" }))).rejects.toThrow('"github_actions" is not one of');
    await expect(progress(fixture({ ...base, ".tasks/backlog.jsonl": '{"id": "k", "status": "in_progress"}\n' }))).rejects.toThrow('k has status "in_progress"');
    await expect(progress(fixture({ ...base, "factory-video/claims.json": JSON.stringify({ claims: [{ id: "C9", claim: "", built: ["SPEC-009-R7"] }] }) })))
      .rejects.toThrow("C9: SPEC-009-R7 not in specs/");
  });

  it("SPEC-001-R226 holds no commit SHA or time, and its picture shows each bar's counts", async () => {
    const p = await progress(".");
    const json = JSON.stringify(p);
    expect(json).not.toMatch(/\b[0-9a-f]{40}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}:\d{2}\b/);
    expect(p.requirements.approved).toBe(Object.values(p.requirements.approvedBySpec).reduce((a, b) => a + b, 0));
    expect(p.claims.total).toBe(p.claims.built + p.claims["partly built"] + p.claims.planned + p.claims.open + p.claims.illustrative);
    const svg = progressSvg(p);
    expect(svg).toContain(`${p.requirements.approved} approved in specs/`);
    expect(svg).toContain(`${p.claims.built} built`);
    expect(svg).toContain(`${p.scenarios.local} on every push`);
    // A screen reader gets the numbers from the title, since GitHub shows the picture as an image.
    expect(svg).toMatch(new RegExp(`<title id="title">Built against the specs\\. Requirements: ${p.requirements.approved} approved in specs/, `));
  });

  it("SPEC-001-R228 the README shows the picture and badges that read docs/progress.json on main", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("![Progress against the specs: the counts are in docs/progress.json](docs/progress.svg)");
    const raw = "https%3A%2F%2Fraw.githubusercontent.com%2FPaulDuvall%2Fwho-gets-the-keys%2Fmain%2Fdocs%2Fprogress.json";
    for (const key of ["requirements", "claims"]) expect(readme).toContain(`url=${raw}&query=%24.badges.${key}&`);
    const p = JSON.parse(readFileSync("docs/progress.json", "utf8")) as { badges: Record<string, string> };
    expect(Object.keys(p.badges)).toEqual(expect.arrayContaining(["requirements", "claims"]));
  });
});
