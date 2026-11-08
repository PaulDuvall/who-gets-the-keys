import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  CheckFailure, ORDER, byteOrder, flowList, guardedIgnoringCase, inDeliveryScope, parseTask, pathEntries, plainPath, rangeBase, rangeCommits, readTask,
  requirementIdsAt, scopeFailure, TASK_ID,
} from "../scripts/checks.ts";

const CHECKS = join(process.cwd(), "scripts/checks.ts");
// Tests that run git and node in a temporary repository get more than vitest's default 5 s.
const SLOW = 30_000;
const EXAMPLE = "---\nrequirements: [SPEC-014-R7]\nproduces: [src/export.ts, test/export.acceptance.test.ts]\n---\nAdd R7.\n";
const PROTECTED_LIST = [".github/", "scripts/checks.ts", "scripts/ci/", "video/narration/", "CLAUDE.md"];
const task = (front: string, body = "Do it.\n") => `---\n${front}\n---\n${body}`;
const failure = (text: string, list: readonly string[] = PROTECTED_LIST): string | undefined => {
  try {
    parseTask("TASK-1", text, list);
    return undefined;
  } catch (err) {
    if (err instanceof CheckFailure && err.check === "task") return err.id;
    throw err;
  }
};

// A temporary repository whose main holds two approved requirements, a protected-path list and one task file.
function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), "task-scope-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" });
  const write = (files: Record<string, string>) => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
  };
  // Commits what the index holds, after adding every working-tree change unless `add` is false.
  const commit = (message: string, files: Record<string, string> = {}, add = true) => {
    write(files);
    if (add) git("add", "-A");
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-F", "-"],
      { cwd: dir, input: message, encoding: "utf8" });
    return git("rev-parse", "HEAD").trim();
  };
  const run = (check: string, ...args: string[]) => {
    const r = spawnSync(process.execPath, [CHECKS, check, ...args], { cwd: dir, encoding: "utf8" });
    return [r.status, r.stdout];
  };
  git("init", "-q", "-b", "main");
  const base = commit("base", {
    "specs/SPEC-014-x.md": "| ID | Requirement |\n|---|---|\n| SPEC-014-R1 | one |\n| SPEC-014-R2 | two |\n",
    "specs/sub/SPEC-099-y.md": "| SPEC-099-R1 | nested |\n",
    "specs/protected-paths.txt": "# list\n.github/\nscripts/checks.ts\n",
    "tasks/TASK-T.task.md": task("requirements: [SPEC-014-R1]\nproduces: [src/a.ts, test/]"),
    "src/a.ts": "export const a = 1;\n",
    "approvers.txt": "\n",
    "scripts/checks.ts": "// stand-in\n",
  });
  // Each case starts from main on a fresh branch.
  const fresh = () => {
    git("checkout", "-q", "-f", "-B", "work", "main");
    git("clean", "-qfdx");
  };
  return { dir, git, write, commit, run, fresh, base, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

describe("SPEC-001 task files and scope (Tracer 2, T3a)", () => {
  it("SPEC-001-R64 parses the example task file: two flow-list keys and a body", () => {
    expect(parseTask("TASK-1", EXAMPLE, PROTECTED_LIST)).toEqual({
      id: "TASK-1", requirements: ["SPEC-014-R7"], produces: ["src/export.ts", "test/export.acceptance.test.ts"], body: "Add R7.\n",
    });
    expect(parseTask("TASK-1", task("produces: [src/, docs/notes/x.md]\nrequirements: [SPEC-014-R7, SPEC-001-R64]")).produces).toEqual(["src/", "docs/notes/x.md"]);
    expect(TASK_ID.source).toBe("^TASK-[A-Z0-9-]{1,32}$");
    expect([flowList("[a, b]"), flowList("[a,b]"), flowList("[]"), flowList("[a, ]"), flowList("a, b"), flowList("['a']"), flowList("[a b]"), flowList("[[a]]"), flowList("[a] # x")])
      .toEqual([["a", "b"], ["a", "b"], undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
    expect(["src/a.ts", "src/", "a", ".gitattributes", "docs/x-y_z.1.md"].map(plainPath)).toEqual([true, true, true, true, true]);
    expect(["", "/abs", "src//a", "src/../a", "./src", "src/.", "-x", "a b", "a\\b", "a:b", "src//"].map(plainPath)).toEqual(Array(11).fill(false));
  });

  it("SPEC-001-R64 fails a line that is not key: value, or names another key, as unknown key, before judging any field", () => {
    for (const front of ["budget: {max_attempts: 3}", "requirements: [SPEC-014-R7]\nverify:\n  lint: npm run check:lint", "", "# comment", "needs: [src/]", "requirements : [SPEC-014-R7]", "- src/a.ts"]) {
      expect([front, failure(task(`${front}\nrequirements: [SPEC-014-R7]\nproduces: [src/a.ts]`))]).toEqual([front, "TASK-1 unknown key"]);
    }
    expect(failure(task("produces: [specs/x.md]\nextra: 1"))).toBe("TASK-1 unknown key");
  });

  it("SPEC-001-R64 takes only a colon and one space between key and value, and fails any other form as unknown key", () => {
    for (const line of ["requirements:[SPEC-014-R7]", "requirements:\t[SPEC-014-R7]", "requirements:", "requirements :[SPEC-014-R7]", "\trequirements: [SPEC-014-R7]"]) {
      expect([line, failure(task(`${line}\nproduces: [src/a.ts]`))]).toEqual([line, "TASK-1 unknown key"]);
    }
    expect(failure(task("requirements: [SPEC-014-R7]\nproduces:[src/a.ts]"))).toBe("TASK-1 unknown key");
    expect(failure(task("requirements:  [SPEC-014-R7]\nproduces: [src/a.ts]"))).toBe("TASK-1 invalid requirements");
    expect(failure(task("requirements: [SPEC-014-R7] \nproduces: [src/a.ts]"))).toBe("TASK-1 invalid requirements");
    expect(failure(task("requirements: [SPEC-014-R7]\nproduces: [src/a.ts]"))).toBeUndefined();
  });

  it("SPEC-001-R64 fails a missing, repeated or malformed requirements list as invalid requirements, judged before produces", () => {
    const sixteen = Array.from({ length: 16 }, (_, i) => `SPEC-014-R${i + 1}`);
    expect(parseTask("TASK-1", task(`requirements: [${sixteen.join(", ")}]\nproduces: [src/a.ts]`)).requirements).toHaveLength(16);
    const cases = [
      "produces: [src/a.ts]", "requirements: []\nproduces: [src/a.ts]", `requirements: [${sixteen.join(", ")}, SPEC-014-R17]\nproduces: [src/a.ts]`,
      "requirements: [SPEC-014-R7, SPEC-014-R7]\nproduces: [src/a.ts]", "requirements: [R7]\nproduces: [src/a.ts]", "requirements: ['SPEC-014-R7']\nproduces: [src/a.ts]",
      "requirements: SPEC-014-R7\nproduces: [src/a.ts]", "requirements: \nproduces: [src/a.ts]", "requirements: [SPEC-014-R7]\nrequirements: [SPEC-014-R8]\nproduces: [src/a.ts]",
      "requirements: [SPEC-14-R7]\nproduces: [src/a.ts]", "requirements: [SPEC-014-R7]\nproduces: [specs/x.md]",
    ];
    for (const front of cases.slice(0, -1)) expect([front, failure(task(front))]).toEqual([front, "TASK-1 invalid requirements"]);
    expect(failure(task(cases.at(-1) ?? ""))).toBe("TASK-1 invalid produces");
    expect(failure("requirements: [SPEC-014-R7]\nproduces: [src/a.ts]\n\nNo front matter.\n")).toBe("TASK-1 invalid requirements");
    expect(failure(EXAMPLE.replaceAll("\n", "\r\n"))).toBe("TASK-1 invalid requirements");
    expect(failure("---\nrequirements: [SPEC-014-R7]\nproduces: [src/a.ts]\nNever closed.\n")).toBe("TASK-1 invalid requirements");
  });

  it("SPEC-001-R64 fails produces entries under or over specs/, tasks/, approvers.txt or a protected path, or not plain paths", () => {
    const bad = [
      "specs/", "specs/x.md", "tasks/", "tasks/TASK-2.task.md", "approvers.txt", ".github/workflows/x.yml", "scripts/checks.ts", "scripts/", "scripts/ci/x.sh",
      "video/", "CLAUDE.md", "../x", "./src/a.ts", "/src/a.ts", "src//a.ts", "-x", "src/a.ts, src/a.ts",
    ];
    for (const entry of bad) expect([entry, failure(task(`requirements: [SPEC-014-R7]\nproduces: [${entry}]`))]).toEqual([entry, "TASK-1 invalid produces"]);
    const seventeen = Array.from({ length: 17 }, (_, i) => `src/f${i}.ts`).join(", ");
    expect(failure(task(`requirements: [SPEC-014-R7]\nproduces: [${seventeen}]`))).toBe("TASK-1 invalid produces");
    for (const entry of ["src/", "src/lib/", "test/x.test.ts", "docs/notes/", "traceability.md"]) {
      expect([entry, failure(task(`requirements: [SPEC-014-R7]\nproduces: [${entry}]`))]).toEqual([entry, undefined]);
    }
  });

  it("SPEC-001-R64 fails a produces entry outside the producer's scope: not under src/, test/ or docs/, a dot-file segment, or not traceability.md", () => {
    const outside = [".npmrc", ".gitattributes", "scripts/receipt.ts", "video/kit.ts", "README.md", "specs", "src", "docs/.npmrc", "test/.hidden/", "srcx/a.ts", "traceability.md.bak"];
    for (const entry of outside) expect([entry, failure(task(`requirements: [SPEC-014-R7]\nproduces: [${entry}]`), [])]).toEqual([entry, "TASK-1 invalid produces"]);
    expect([inDeliveryScope("src/"), inDeliveryScope("docs/a.md"), inDeliveryScope("traceability.md"), inDeliveryScope("src"), inDeliveryScope("docs//a")]).toEqual([true, true, true, false, false]);
  });

  it("SPEC-001-R64 compares produces entries with reserved and protected paths without regard to letter case", () => {
    expect(failure(task("requirements: [SPEC-014-R7]\nproduces: [docs/]"), ["DOCS/Secret.md"])).toBe("TASK-1 invalid produces");
    expect(failure(task("requirements: [SPEC-014-R7]\nproduces: [docs/secret.md]"), ["Docs/"])).toBe("TASK-1 invalid produces");
    expect(failure(task("requirements: [SPEC-014-R7]\nproduces: [docs/a.md]"), ["DOCS/b.md"])).toBeUndefined();
  });

  it("SPEC-001-R64 fails a body of white space only as empty body", () => {
    for (const body of ["", "\n", "  \n\t\n"]) expect(failure(task("requirements: [SPEC-014-R7]\nproduces: [src/a.ts]", body))).toBe("TASK-1 empty body");
    expect(failure("---\nrequirements: [SPEC-014-R7]\nproduces: [src/a.ts]\n---")).toBe("TASK-1 empty body");
    expect(parseTask("TASK-1", task("requirements: [SPEC-014-R7]\nproduces: [src/a.ts]", "Line one.\n---\nLine two.\n")).body).toBe("Line one.\n---\nLine two.\n");
  });

  it("SPEC-001-R64 fails a body over 8,000 bytes, counted in UTF-8, as body over 8000 bytes", () => {
    const front = "requirements: [SPEC-014-R7]\nproduces: [src/a.ts]";
    expect(parseTask("TASK-1", task(front, `${"x".repeat(7999)}\n`)).body).toHaveLength(8000);
    expect(failure(task(front, `${"x".repeat(8000)}\n`))).toBe("TASK-1 body over 8000 bytes");
    expect(failure(task(front, `${"\u00e9".repeat(4000)}\n`))).toBe("TASK-1 body over 8000 bytes");
    expect(failure(task(front, " ".repeat(9000)))).toBe("TASK-1 empty body");
  });

  describe("on a temporary repository", () => {
    const repo = tempRepo();
    afterAll(() => repo.remove());

    it("SPEC-001-R64 requires the task ID pattern and reads the file only from the base commit with git show", () => {
      expect(readTask("TASK-T", repo.base, repo.dir)).toEqual({ id: "TASK-T", requirements: ["SPEC-014-R1"], produces: ["src/a.ts", "test/"], body: "Do it.\n" });
      for (const id of ["task-t", "TASK-", `TASK-${"A".repeat(33)}`, "TASK-$(id)", "TASK-T/../x", "TASK-T\n"]) {
        expect(() => readTask(id, repo.base, repo.dir)).toThrow(new CheckFailure("task", "invalid task id"));
      }
      repo.fresh();
      repo.write({ "tasks/TASK-LOCAL.task.md": task("requirements: [SPEC-014-R1]\nproduces: [src/a.ts]") });
      expect(() => readTask("TASK-LOCAL", repo.base, repo.dir)).toThrow(new CheckFailure("task", "TASK-LOCAL not found"));
      const later = repo.commit("add a task after the base", {});
      expect(() => readTask("TASK-LOCAL", repo.base, repo.dir)).toThrow(new CheckFailure("task", "TASK-LOCAL not found"));
      expect(readTask("TASK-LOCAL", later, repo.dir).produces).toEqual(["src/a.ts"]);
    }, SLOW);

    it("SPEC-001-R65 fails a task that cites a requirement no file under specs/ defines at the base, naming the first in file order", () => {
      expect([...requirementIdsAt(repo.base, repo.dir)].sort()).toEqual(["SPEC-014-R1", "SPEC-014-R2", "SPEC-099-R1"]);
      repo.fresh();
      const at = repo.commit("tasks", {
        "tasks/TASK-U.task.md": task("requirements: [SPEC-014-R2, SPEC-014-R9, SPEC-014-R8]\nproduces: [src/a.ts]"),
        "tasks/TASK-N.task.md": task("requirements: [SPEC-099-R1, SPEC-014-R1]\nproduces: [src/a.ts]"),
      });
      expect(() => readTask("TASK-U", at, repo.dir)).toThrow(new CheckFailure("task", "TASK-U cites unapproved SPEC-014-R9"));
      expect(readTask("TASK-N", at, repo.dir).requirements).toEqual(["SPEC-099-R1", "SPEC-014-R1"]);
    }, SLOW);

    it("SPEC-001-R68 the task check checks each task the range's Task trailers name, and passes when none does", () => {
      repo.fresh();
      repo.commit("no task\n\nSpec: SPEC-014-R2", { "infra/x.tf": "x\n" });
      expect([repo.run("task"), repo.run("scope")]).toEqual([[0, ""], [0, ""]]);
      repo.commit("tasked\n\nTask: TASK-T\nSpec: SPEC-014-R1", { "src/a.ts": "export const a = 2;\n" });
      expect([repo.run("task"), repo.run("scope")]).toEqual([[0, ""], [0, ""]]);
      repo.commit("missing task\n\nTask: TASK-NONE", {});
      expect(repo.run("task")).toEqual([1, "CHECK task FAILED: TASK-NONE not found\n"]);
      repo.fresh();
      repo.commit("bad id\n\nTask: task-1", {});
      expect([repo.run("task"), repo.run("scope")]).toEqual([[1, "CHECK task FAILED: invalid task id\n"], [1, "CHECK task FAILED: invalid task id\n"]]);
    }, SLOW);

    it("SPEC-001-R68 takes the merge base with refs/remotes/origin/main before refs/heads/main, or a base given, and fails closed without one", () => {
      repo.fresh();
      const bad = repo.commit("tasked\n\nTask: TASK-T", { "src/b.ts": "x\n" });
      expect(rangeBase(undefined, repo.dir)).toBe(repo.base);
      expect(rangeCommits(repo.base, repo.dir)?.map((c) => [c.sha, c.parent, c.tasks])).toEqual([[bad, repo.base, ["TASK-T"]]]);
      expect(repo.run("scope")).toEqual([1, "CHECK scope FAILED: src/b.ts\n"]);
      expect(repo.run("scope", bad)).toEqual([0, ""]);
      repo.git("update-ref", "refs/remotes/origin/main", bad);
      expect([rangeBase(undefined, repo.dir), repo.run("scope")]).toEqual([bad, [0, ""]]);
      repo.git("update-ref", "-d", "refs/remotes/origin/main");
      expect([repo.run("task", "no-such-commit"), repo.run("scope", "--output=x")]).toEqual([[1, "CHECK task FAILED: no merge base\n"], [1, "CHECK scope FAILED: no merge base\n"]]);
      repo.git("branch", "-q", "-m", "main", "trunk");
      expect([repo.run("task"), repo.run("scope")]).toEqual([[1, "CHECK task FAILED: no merge base\n"], [1, "CHECK scope FAILED: no merge base\n"]]);
      repo.git("branch", "-q", "-m", "trunk", "main");
      repo.git("checkout", "-q", "main");
      expect([rangeCommits(repo.base, repo.dir), repo.run("task"), repo.run("scope")]).toEqual([[], [0, ""], [0, ""]]);
    }, SLOW);

    it("SPEC-001-R66 fails mixed Task trailers and a Spec trailer outside the task's requirements", () => {
      repo.fresh();
      repo.commit("one\n\nTask: TASK-T", { "src/a.ts": "1\n" });
      repo.commit("two\n\nTask: TASK-U", { "src/a.ts": "2\n" });
      expect(repo.run("scope")).toEqual([1, "CHECK scope FAILED: mixed Task trailers\n"]);
      repo.fresh();
      repo.commit("twice\n\nTask: TASK-T\nTask: TASK-T", { "src/a.ts": "1\n" });
      expect(repo.run("scope")).toEqual([1, "CHECK scope FAILED: mixed Task trailers\n"]);
      repo.fresh();
      repo.commit("ok\n\nTask: TASK-T\nSpec: SPEC-014-R1", { "src/a.ts": "1\n" });
      repo.commit("stray\n\nSpec: SPEC-014-R1\nSpec: SPEC-014-R2\nTask: TASK-T", { "test/a.test.ts": "1\n" });
      expect(repo.run("scope")).toEqual([1, "CHECK scope FAILED: Spec SPEC-014-R2 not in TASK-T\n"]);
      repo.fresh();
      repo.commit("odd\n\nTask: TASK-T\nSpec: x\u001b[2J", { "src/a.ts": "1\n" });
      expect(repo.run("scope")).toEqual([1, 'CHECK scope FAILED: Spec "x\\u001b[2J" not in TASK-T\n']);
    }, SLOW);

    it("SPEC-001-R67 fails the first path in byte order that is reserved, protected at the base or outside produces, renames split", () => {
      const cases: [Record<string, string>, string][] = [
        [{ "src/b.ts": "x\n", "src/Z.ts": "x\n", "test/ok.test.ts": "x\n" }, "src/Z.ts"],
        [{ "specs/SPEC-014-x.md": "| SPEC-014-R1 | changed |\n" }, "specs/SPEC-014-x.md"],
        [{ "tasks/TASK-T.task.md": task("requirements: [SPEC-014-R1]\nproduces: [src/]") }, "tasks/TASK-T.task.md"],
        [{ "approvers.txt": "x\n" }, "approvers.txt"],
        [{ ".github/workflows/x.yml": "on: push\n", "zzz.md": "x\n" }, ".github/workflows/x.yml"],
        [{ "scripts/checks.ts": "// changed\n" }, "scripts/checks.ts"],
        [{ ".npmrc": "node-options=--import=./test/x.mjs\n", "test/x.mjs": "x\n" }, ".npmrc"],
      ];
      for (const [files, path] of cases) {
        repo.fresh();
        repo.commit("tasked\n\nTask: TASK-T", files);
        expect([path, repo.run("scope")]).toEqual([path, [1, `CHECK scope FAILED: ${path}\n`]]);
      }
      repo.fresh();
      mkdirSync(join(repo.dir, "test"), { recursive: true });
      repo.git("mv", "src/a.ts", "test/a.ts");
      const moved = repo.commit("move\n\nTask: TASK-T");
      expect(pathEntries(moved, repo.base, repo.dir)).toEqual([{ path: "src/a.ts", mode: "100644" }, { path: "test/a.ts", mode: "100644" }]);
      expect(repo.run("scope")).toEqual([0, ""]);
      repo.git("rm", "-q", "scripts/checks.ts");
      repo.commit("delete a protected file\n\nTask: TASK-T");
      expect(repo.run("scope")).toEqual([1, "CHECK scope FAILED: scripts/checks.ts\n"]);
      expect([byteOrder("～", "\u{1F600}"), ["\u{1F600}", "～"].sort(byteOrder)]).toEqual([-1, ["～", "\u{1F600}"]]);
    }, SLOW);

    it("SPEC-001-R67 fails a symlink or gitlink inside produces with its mode, and prints a path with a control character as a JSON string", () => {
      repo.fresh();
      mkdirSync(join(repo.dir, "test"), { recursive: true });
      symlinkSync("../src/a.ts", join(repo.dir, "test", "link"));
      repo.commit("link\n\nTask: TASK-T");
      expect(repo.run("scope")).toEqual([1, "CHECK scope FAILED: test/link mode 120000\n"]);
      repo.fresh();
      repo.git("update-index", "--add", "--cacheinfo", `160000,${repo.base},test/sub`);
      repo.commit("gitlink\n\nTask: TASK-T", {}, false);
      expect(repo.run("scope")).toEqual([1, "CHECK scope FAILED: test/sub mode 160000\n"]);
      repo.fresh();
      const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: repo.dir, input: "x\n", encoding: "utf8" }).trim();
      repo.git("update-index", "--add", "--cacheinfo", `100644,${blob},docs/a\n::warning::x`);
      repo.commit("control\n\nTask: TASK-T", {}, false);
      expect(repo.run("scope")).toEqual([1, 'CHECK scope FAILED: "docs/a\\n::warning::x"\n']);
      expect(scopeFailure([{ path: "src/a.ts", mode: "100755" }, { path: "test/x", mode: "120000" }], ["src/a.ts", "test/"], [])).toBe("test/x mode 120000");
      expect(scopeFailure([{ path: "test/x", mode: "120000" }, { path: "src/b.ts", mode: "100644" }], ["src/a.ts", "test/"], [])).toBe("src/b.ts");
      expect(scopeFailure([{ path: "test/x", mode: "000000" }, { path: "src/a.ts", mode: "100644" }], ["src/a.ts", "test/"], [])).toBeUndefined();
      expect(scopeFailure([{ path: "src/\u{1F600}.ts", mode: "100644" }, { path: "src/\uFF5E.ts", mode: "100644" }], ["test/"], [])).toBe("src/\uFF5E.ts");
    }, SLOW);

    it("SPEC-001-R67 fails a reserved or protected path whatever its letter case, as a case-insensitive checkout would write it", () => {
      const file = (path: string) => ({ path, mode: "100644" });
      expect(scopeFailure([file("TASKS/x.task.md")], ["TASKS/"], [])).toBe("TASKS/x.task.md");
      expect(scopeFailure([file("Specs/SPEC-014-x.md")], ["Specs/"], [])).toBe("Specs/SPEC-014-x.md");
      expect(scopeFailure([file("Approvers.TXT")], ["Approvers.TXT"], [])).toBe("Approvers.TXT");
      expect(scopeFailure([file("docs/A.md")], ["docs/"], ["DOCS/a.md"])).toBe("docs/A.md");
      expect(scopeFailure([file("docs/b.md")], ["docs/"], ["DOCS/a.md"])).toBeUndefined();
      expect([guardedIgnoringCase(".GitHub/workflows/x.yml", [".github/"]), guardedIgnoringCase("src/a.ts", [".github/"])]).toEqual([".github/", undefined]);
      // Through the index alone, so a case-insensitive file system cannot fold TASKS/ into the existing tasks/.
      repo.fresh();
      const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: repo.dir, input: "x\n", encoding: "utf8" }).trim();
      repo.git("update-index", "--add", "--cacheinfo", `100644,${blob},TASKS/x.task.md`);
      repo.commit("tasked\n\nTask: TASK-T", {}, false);
      expect(repo.run("scope")).toEqual([1, "CHECK scope FAILED: TASKS/x.task.md\n"]);
    }, SLOW);
  });

  it("SPEC-001-R68 runs the task and then the scope check as the checks job's last steps, after node scripts/checks.ts, outside the ordered fifteen", () => {
    interface Step { name?: string; run?: string; if?: string; uses?: string; with?: Record<string, unknown> }
    const pipeline = parse(readFileSync(".github/workflows/pipeline.yml", "utf8")) as { jobs: Record<string, { if?: string; steps: Step[] }> };
    const steps = pipeline.jobs["checks"]?.steps ?? [];
    expect(steps.slice(-3).map((s) => [s.run, s.if])).toEqual([["node scripts/checks.ts", undefined], ["node scripts/checks.ts task", undefined], ["node scripts/checks.ts scope", undefined]]);
    expect(steps[0]?.with?.["fetch-depth"]).toBe(0);
    expect(pipeline.jobs["checks"]?.if).toBeUndefined();
    expect(ORDER).not.toContain("task");
    expect(ORDER).not.toContain("scope");
    expect(readFileSync("specs/protected-paths.txt", "utf8").split("\n")).toEqual(expect.arrayContaining(["tasks/", "scripts/receipt.ts"]));
  });
});
