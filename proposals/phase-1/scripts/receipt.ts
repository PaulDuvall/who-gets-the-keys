// Receipt predicate (SPEC-001-R45), slice 1 of decision 0002. Usage: node scripts/receipt.ts predicate <commit SHA>
// Prints {commits: [one record]} for the pushed commit; later slices widen the array. The attest job signs the output.
import { spawnSync } from "node:child_process";

/** Every record's model, whatever trailer the commit carries (owner decision D3), and a commit's agent with no `Agent:` trailer. @requirement SPEC-001-R45 */
export const NOT_RECORDED = "not recorded", NONE_REPORTED = "none reported";

/** One commit as its own trailers report it. Nothing attests trailers. @requirement SPEC-001-R45 */
export interface CommitRecord { commit: string; spec_ids: string[]; agent: string; model: string }

/**
 * The record for one commit: its SHA, its `Spec:` trailer values and its `Agent:` trailer as reported. Throws when
 * `commit` is not a full SHA or git cannot read it, so the build fails rather than sign a guess. @requirement SPEC-001-R45
 */
export function commitRecord(commit: string, cwd = "."): CommitRecord {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit)) throw new Error(`not a full commit SHA: ${commit}`);
  const trailer = (key: string): string[] => {
    const r = spawnSync("git", ["log", "-1", `--format=%(trailers:key=${key},valueonly,unfold,separator=%x1f)`, commit, "--"], { cwd, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git cannot read commit ${commit}: ${(r.stderr || String(r.error)).trim()}`);
    return r.stdout.split("\x1f").map((v) => v.trim()).filter(Boolean);
  };
  const agents = trailer("Agent");
  return { commit, spec_ids: trailer("Spec"), agent: agents.length > 0 ? agents.join(", ") : NONE_REPORTED, model: NOT_RECORDED };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, commit] = process.argv.slice(2);
  try {
    if (command !== "predicate" || commit === undefined) throw new Error("usage: node scripts/receipt.ts predicate <commit SHA>");
    process.stdout.write(`${JSON.stringify({ commits: [commitRecord(commit)] })}\n`);
  } catch (err) {
    process.stderr.write(`receipt: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}
