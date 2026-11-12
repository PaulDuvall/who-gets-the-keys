import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { claimStatus, ledgerProblems, progress, progressFiles, progressSvg, type Claim } from "../scripts/progress.ts";
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

  it("SPEC-001-R226 counts claims by status, and names each claim whose citation no longer holds", () => {
    expect(claimStatus({ id: "a", claim: "", built: ["x"] })).toBe("built");
    expect(claimStatus({ id: "b", claim: "", built: ["x"], open: ["y"] })).toBe("partly built");
    expect(claimStatus({ id: "c", claim: "", planned: ["x"] })).toBe("planned");
    expect(claimStatus({ id: "d", claim: "", open: ["x"] })).toBe("open");
    expect(claimStatus({ id: "e", claim: "", illustrative: true, built: ["x"] })).toBe("illustrative");

    const root = scratch();
    rmSync(root, { recursive: true, force: true });
    mkdirSync(join(root, "specs"), { recursive: true });
    mkdirSync(join(root, "docs/decisions"), { recursive: true });
    mkdirSync(join(root, ".tasks"), { recursive: true });
    writeFileSync(join(root, "specs/SPEC-009-x.md"), "| ID | Requirement |\n|---|---|\n| SPEC-009-R1 | one |\n");
    writeFileSync(join(root, "docs/decisions/0009-x.md"), "| SPEC-009-R1 | again |\n| SPEC-009-R2 | two |\n");
    writeFileSync(join(root, ".tasks/backlog.jsonl"), '{"id": "k-open", "status": "open"}\n{"id": "k-done", "status": "closed"}\n');
    const claims: Claim[] = [
      { id: "C1", claim: "", built: ["SPEC-009-R1"], planned: ["SPEC-009-R2"], open: ["k-open"] },
      { id: "C2", claim: "", built: ["SPEC-009-R2"] },
      { id: "C3", claim: "", planned: ["SPEC-009-R1"] },
      { id: "C4", claim: "", open: ["k-done", "k-gone"] },
      { id: "C5", claim: "" },
    ];
    expect(ledgerProblems(root, claims)).toEqual([
      "C2: SPEC-009-R2 not in specs/",
      "C3: SPEC-009-R1 is in specs/ now; move it to built",
      "C4: k-done is closed; cite what built it, or drop it",
      "C4: k-gone not in .tasks/backlog.jsonl",
      "C5: no evidence, plan or backlog item",
    ]);
  });

  it("SPEC-001-R226 holds no commit SHA or time, and its picture shows each bar's counts", async () => {
    const p = await progress(".");
    const json = JSON.stringify(p);
    expect(json).not.toMatch(/\b[0-9a-f]{40}\b|\d{4}-\d{2}-\d{2}T/);
    expect(p.requirements.approved).toBe(Object.values(p.requirements.approvedBySpec).reduce((a, b) => a + b, 0));
    expect(p.claims.total).toBe(p.claims.built + p.claims["partly built"] + p.claims.planned + p.claims.open + p.claims.illustrative);
    const svg = progressSvg(p);
    expect(svg).toContain(`${p.requirements.approved} approved in specs/`);
    expect(svg).toContain(`${p.claims.built} built`);
    expect(svg).toContain(`${p.scenarios.local} run locally`);
  });

  it("SPEC-001-R228 the README shows the picture and badges that read docs/progress.json on main", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("![Progress against the specs](docs/progress.svg)");
    const raw = "https%3A%2F%2Fraw.githubusercontent.com%2FPaulDuvall%2Fwho-gets-the-keys%2Fmain%2Fdocs%2Fprogress.json";
    for (const key of ["requirements", "claims"]) expect(readme).toContain(`url=${raw}&query=%24.badges.${key}&`);
    const p = JSON.parse(readFileSync("docs/progress.json", "utf8")) as { badges: Record<string, string> };
    expect(Object.keys(p.badges)).toEqual(expect.arrayContaining(["requirements", "claims"]));
  });
});
