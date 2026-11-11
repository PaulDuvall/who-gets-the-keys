import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll } from "vitest";

// The fixture the owner scripts' tests share: a temporary clone with a local bare origin, stub executables in a
// directory first on PATH, and a run of a bash script with an environment and standard input. Each test file keeps
// its stubs' behaviour, which is specific to the script it tests. Nothing here reaches GitHub or AWS.

/** The longest a script run may take, and the timeout of a test that runs one. */
export const TIMEOUT = 60_000;

/** dir holds the rest: work, the clone; origin, its bare origin; stub, first on PATH; home and tmp, its HOME and TMPDIR. */
export interface TempRepo { dir: string; work: string; origin: string; stub: string; home: string; tmp: string; env: NodeJS.ProcessEnv }
export interface ScriptRun { status: number | null; stdout: string; stderr: string; out: string }

// A directory for the enclosing describe block. It is made in beforeAll, not when the file loads, so listing the tests
// (the trace check runs vitest list) leaves no directory behind, and it is removed in afterAll.
export function scratchDir(prefix: string): () => string {
  let dir = "";
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), prefix)); });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  return () => dir;
}

/** A file's lines without the empty ones, or none when the file does not exist. */
export const lines = (file: string): string[] => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : []);

export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

/** Writes each stub, by name, as an executable in dir. */
export function writeStubs(dir: string, stubs: Record<string, string>): void {
  writeFiles(dir, stubs);
  for (const name of Object.keys(stubs)) chmodSync(join(dir, name), 0o755);
}

export const git = (repo: { work: string; env: NodeJS.ProcessEnv }, ...args: string[]): string =>
  execFileSync("git", args, { cwd: repo.work, env: repo.env, encoding: "utf8" }).trim();

/** The commit a branch of origin points at, or "" when origin has no such branch. */
export const originRef = (repo: TempRepo, branch: string): string =>
  spawnSync("git", ["--git-dir", repo.origin, "rev-parse", "-q", "--verify", `refs/heads/${branch}`], { env: repo.env, encoding: "utf8" }).stdout.trim();

/** Commits the whole tree unsigned, pushes main to origin, and returns the commit. */
export function commitAll(repo: TempRepo, message: string): string {
  git(repo, "add", "-A");
  git(repo, "-c", "commit.gpgsign=false", "commit", "-q", "-m", message);
  git(repo, "push", "-q", "-u", "origin", "main");
  return git(repo, "rev-parse", "HEAD");
}

// A clone in a new directory under parent, with a bare origin, the stubs first on PATH, its own HOME, TMPDIR and global
// git config (user Owner <owner@example.com>, commit.gpgsign false), and STUB_DIR and STUB_ORIGIN telling a stub where
// its directory and the origin are. Its environment is process.env without the variables drop matches, by default
// git's location variables, SSH_AUTH_SOCK and STUB_ ones, then those defaults, then env. config is set in the clone.
// Given files, it commits them with message and pushes main to origin; without, the clone has no commit.
export function tempRepo(parent: string, options: { drop?: RegExp; stubs?: Record<string, string>; env?: NodeJS.ProcessEnv;
  config?: Record<string, string>; files?: Record<string, string>; message?: string } = {}): TempRepo {
  const dir = mkdtempSync(join(parent, "repo-"));
  const repo: TempRepo = { dir, work: join(dir, "work"), origin: join(dir, "origin.git"), stub: join(dir, "stub"), home: join(dir, "home"), tmp: join(dir, "tmp"), env: {} };
  const drop = options.drop ?? /^(GIT_DIR|GIT_WORK_TREE|GIT_INDEX_FILE|SSH_AUTH_SOCK|STUB_\w+)$/;
  for (const [key, value] of Object.entries(process.env)) if (!drop.test(key)) repo.env[key] = value;
  Object.assign(repo.env, {
    HOME: repo.home, GIT_CONFIG_GLOBAL: join(dir, "gitconfig"), GIT_CONFIG_NOSYSTEM: "1", TMPDIR: repo.tmp,
    PATH: `${repo.stub}:${process.env["PATH"] ?? ""}`, STUB_DIR: repo.stub, STUB_ORIGIN: repo.origin, ...options.env,
  });
  for (const path of [repo.stub, repo.home, repo.tmp]) mkdirSync(path);
  writeFileSync(join(dir, "gitconfig"), "[user]\n\tname = Owner\n\temail = owner@example.com\n[commit]\n\tgpgsign = false\n");
  writeStubs(repo.stub, options.stubs ?? {});
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", repo.origin], { env: repo.env });
  execFileSync("git", ["init", "-q", "-b", "main", repo.work], { env: repo.env });
  for (const [key, value] of Object.entries(options.config ?? {})) git(repo, "config", key, value);
  git(repo, "remote", "add", "origin", repo.origin);
  if (options.files) {
    writeFiles(repo.work, options.files);
    commitAll(repo, options.message ?? "init");
  }
  return repo;
}

/** Runs a bash script in the clone with its environment and env, and input on standard input. */
export function runScript(repo: TempRepo, script: string, args: string[], options: { input?: string; env?: NodeJS.ProcessEnv } = {}): ScriptRun {
  const r = spawnSync("bash", [script, ...args], { cwd: repo.work, env: { ...repo.env, ...options.env }, input: options.input ?? "", encoding: "utf8", timeout: TIMEOUT });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, out: `${r.stdout}${r.stderr}` };
}
