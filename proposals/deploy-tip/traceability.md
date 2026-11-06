# Traceability

Each requirement, the test that names it, the check that runs the test, and the scenario that shows the check stopping a bad change.

Requirement IDs refer to `specs/`. Each listed test file holds a test whose title names the requirement ID; the trace check fails if any ID has none.

| Requirement | Test file | Check | Scenario |
|---|---|---|---|
| SPEC-014-R1 | `test/export.acceptance.test.ts`, `test/export.property.test.ts` | test, mutation | — |
| SPEC-014-R2 | `test/export.acceptance.test.ts`, `test/export.property.test.ts` | test, mutation | — |
| SPEC-014-R3 | `test/export.acceptance.test.ts` | test, mutation | — |
| SPEC-014-R4 | `test/export.acceptance.test.ts` | test, mutation | — |
| SPEC-014-R5 | `test/export.acceptance.test.ts` | test, mutation | — |
| SPEC-014-R6 | `test/export.performance.test.ts` | test | — |
| SPEC-001-R1 | `test/checks.test.ts` | checks (runner) | — |
| SPEC-001-R2 | `test/checks.test.ts` | secrets | — |
| SPEC-001-R3 | `test/checks.test.ts` | allowlist | — |
| SPEC-001-R4 | `test/checks.test.ts` | workflows | — |
| SPEC-001-R5 | `test/checks.test.ts` | install | — |
| SPEC-001-R6 | `test/checks.test.ts` | lint | — |
| SPEC-001-R7 | `test/checks.test.ts` | typecheck | — |
| SPEC-001-R8 | `test/checks.test.ts` | iac | — |
| SPEC-001-R9 | `test/checks.test.ts` | sast | — |
| SPEC-001-R10 | `test/checks.test.ts` | sca | — |
| SPEC-001-R11 | `test/checks.test.ts` | trace | — |
| SPEC-001-R12 | `test/checks.test.ts`, `test/signatures.test.ts` | signatures | — |
| SPEC-001-R13 | `test/checks.test.ts` | slides | — |
| SPEC-001-R14 | `test/checks.test.ts` | ratchet | — |
| SPEC-001-R15 | `test/checks.test.ts` | test | — |
| SPEC-001-R16 | `test/checks.test.ts` | mutation | — |
| SPEC-001-R17 | `test/checks.test.ts` | attestation | — |
| SPEC-001-R18 | `test/checks.test.ts` | irreversible | — |
| SPEC-001-R19 | `test/scenarios.test.ts` | lint | B1 |
| SPEC-001-R20 | `test/scenarios.test.ts` | mutation | B2 |
| SPEC-001-R21 | `test/scenarios.test.ts` | trace | B3 |
| SPEC-001-R22 | `test/scenarios.test.ts` | signatures | B4 |
| SPEC-001-R23 | `test/scenarios.test.ts` | secrets | B5 |
| SPEC-001-R24 | `test/scenarios.test.ts` | allowlist | B6 |
| SPEC-001-R25 | `test/scenarios.test.ts` | ratchet | B7 |
| SPEC-001-R26 | `test/scenarios.test.ts` | workflows | B8a |
| SPEC-001-R27 | `test/scenarios.test.ts` | workflows | B8b |
| SPEC-001-R28 | `test/scenarios.test.ts` | boundary | B9 |
| SPEC-001-R29 | `test/scenarios.test.ts` | attestation | B10 |
| SPEC-001-R30 | `test/scenarios.test.ts` | boundary | B11 |
| SPEC-001-R31 | `test/scenarios.test.ts` | sast | B12 |
| SPEC-001-R32 | `test/scenarios.test.ts` | sca | B13 |
| SPEC-001-R33 | `test/scenarios.test.ts` | irreversible | B14 |
| SPEC-001-R34 | `test/scenarios.test.ts` | trace | B15 |
| SPEC-001-R35 | `test/scenarios.test.ts` | trace | B16 |
| SPEC-001-R36 | `test/scenarios.test.ts` | signatures | B17 |
| SPEC-001-R37 | `test/scenarios.test.ts` | harness | all |
| SPEC-001-R38 | `test/scenarios.test.ts` | signatures | B18 |
| SPEC-001-R39 | `test/hook.test.ts` | test | — |
| SPEC-001-R40 | `test/checks-before-main.test.ts` | test | — |
| SPEC-001-R41 | `test/checks-before-main.test.ts`, `test/land.test.ts` | test | — |
| SPEC-001-R190 | `test/checks.test.ts`, `test/checks-before-main.test.ts` | deploy-tip | — |
| SPEC-002-R1 | `test/video.test.ts` | test | — |
| SPEC-002-R2 | `test/video.test.ts` | test | — |
| SPEC-002-R3 | `test/video.test.ts` | test | — |
| SPEC-002-R4 | `test/video.test.ts` | test | — |
| SPEC-002-R5 | `test/video.test.ts` | test | — |
| SPEC-002-R6 | `test/video.test.ts` | test | — |
| SPEC-002-R7 | `test/video.test.ts` | test | — |
| SPEC-002-R8 | `test/video.test.ts` | test | — |
| SPEC-002-R9 | `test/video.test.ts` | test | — |
| SPEC-002-R10 | `test/video.test.ts` | test | — |
| SPEC-002-R11 | `test/video.test.ts` | test | — |
| SPEC-002-R12 | `test/video.test.ts` | test | — |
| SPEC-002-R13 | `test/video.test.ts` | test | — |
| SPEC-002-R14 | `test/video.test.ts` | test | — |
| SPEC-002-R15 | `test/video.test.ts` | test | — |
| SPEC-002-R16 | `test/video.test.ts` | test | — |
