# Deviations

<!-- PAUL: one-line description of what this log is for -->

| ID | Departs from | What changed | Why | Date |
|---|---|---|---|---|
| D01 | Prompt, Ground rule 1 ("Action SHAs come from GitHub ... with `gh api`") | Tags resolved with `git ls-remote`; tools downloaded from release asset URLs | Session's GitHub REST access covers only attached repos; `git ls-remote` reads the same refs from GitHub | 2026-10-20 |
| D02 | Prompt, Phase 0 (current TypeScript) | TypeScript pinned to 6.0.3, not latest 7.0.2 | typescript-eslint 8.72.0 peer range is `>=4.8.4 <6.1.0` | 2026-10-20 |
| D03 | Prompt, Phase 0 (current Active LTS) | Node 24 and `nodejs24.x` | v24 leaves Active LTS on 2026-10-20 and v26 enters it 2026-10-28; Lambda `nodejs26.x` is preview only | 2026-10-20 |
| D04 | Prompt, Phase 0 egress (prefer Claude Code sandbox settings) | Egress via Anthropic `sandbox-runtime` (`srt`) 0.0.79 for the replay job, plus Claude Code `sandbox` settings for the triage job, both generated from one allowlist file | Claude Code's sandbox covers only its Bash tool and cannot wrap plain shell steps; harden-runner block mode needs a paid plan for private repos. `srt` is first-party and labelled beta research preview | 2026-10-20 |
| D05 | Prompt, Phase 2 provenance (`Model:` trailer) | Agent commits carry `Agent:` only; the provenance predicate's model field is empty for agent commits | This session's operating rules forbid model identifiers in commit messages | 2026-10-20 |
| D06 | Prompt, Visibility | Deploy job verifies attestations and fails closed while private | Artifact attestations are public-only on GitHub Pro | 2026-10-20 |
| D07 | Prompt, Identities (OIDC `sub` format) | Trust policies use the immutable subject `repo:PaulDuvall@1619259/who-gets-the-keys@1427202012:...` | Repo created after 2026-07-15; to be confirmed against a real token in Phase 5 | 2026-10-20 |
| D08 | Prompt, gate `workflows` | zizmor runs with `--offline` | Online audits need a GitHub token and network, which would make the gate nondeterministic | 2026-10-20 |
| D09 | Prompt, B8a | `cache-poisoning` targets release-like workflows; whether it fires on a deploy job is confirmed in Phase 7 | zizmor audit docs | 2026-10-20 |
| D10 | Prompt, Phase 0 (current Vitest) | Vitest pinned to 4.1.12, not latest 5.0.5 | With Vitest 5.0.5, `@stryker-mutator/vitest-runner` 10.0.0 never activates mutants: 2.33% score, 0.08 tests per mutant. Vitest 4.1.12 gives 2.01 tests per mutant and 98.67%. Stryker 10.0.0 (2026-08-14) predates Vitest 5.0.0 (2026-09-03) | 2026-10-20 |
| D11 | Prompt, Phase 3 (mutation) | One equivalent mutant survives on `main` (empty `catch` in `src/handler.ts`); no Stryker suppression comment is used | Emptying the `catch` returns `undefined`, which the same 400 path rejects; an in-source suppression would be a guardrail the agent controls | 2026-10-20 |
