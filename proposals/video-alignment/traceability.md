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
| SPEC-001-R45 | `test/receipt.test.ts` | test | — |
| SPEC-001-R48 | `test/receipt.test.ts` | test | — |
| SPEC-001-R50 | `test/checks.test.ts` | receipt | — |
| SPEC-001-R55 | `test/checks.test.ts` | receipt | — |
| SPEC-001-R56 | `test/checks.test.ts`, `test/receipt.test.ts` | receipt | — |
| SPEC-001-R190 | `test/checks.test.ts`, `test/checks-before-main.test.ts` | deploy-tip | — |
| SPEC-001-R144 | `test/checks.test.ts` | workflows | — |
| SPEC-001-R145 | `test/validator.test.ts` | test | — |
| SPEC-001-R146 | `test/validator.test.ts` | validator | — |
| SPEC-001-R147 | `test/validator.test.ts` | validator | — |
| SPEC-001-R148 | `test/validator.test.ts` | validator | — |
| SPEC-001-R149 | `test/checks.test.ts` | workflows | — |
| SPEC-001-R150 | `test/validator.test.ts` | validator | — |
| SPEC-001-R151 | `test/checks-before-main.test.ts` | test | — |
| SPEC-001-R152 | `test/validator.test.ts` | validator | — |
| SPEC-001-R153 | `test/receipt.test.ts` | receipt | — |
| SPEC-001-R154 | `test/drift.test.ts` | test | — |
| SPEC-001-R155 | `test/drift.test.ts` | test | — |
| SPEC-001-R156 | `test/drift.test.ts` | drift | — |
| SPEC-001-R157 | `test/drift.test.ts` | drift | — |
| SPEC-001-R158 | `test/checks.test.ts` | freeze | — |
| SPEC-001-R159 | `test/checks.test.ts` | freeze | — |
| SPEC-001-R160 | `test/checks.test.ts` | task | — |
| SPEC-001-R161 | `test/receipt.test.ts` | receipt | — |
| SPEC-001-R162 | `test/issue-fields.test.ts` | test | — |
| SPEC-001-R163 | `test/issue-fields.test.ts` | workflows | — |
| SPEC-001-R164 | `test/hook.test.ts` | allowlist | — |
| SPEC-001-R165 | `test/release.test.ts` | release | — |
| SPEC-001-R166 | `test/scenarios.test.ts` | test | — |
| SPEC-001-R167 | `test/scenarios.test.ts` | workflows | B49 |
| SPEC-001-R168 | `test/scenarios.test.ts` | test | B50 |
| SPEC-001-R169 | `test/scenarios.test.ts` | validator | B51 |
| SPEC-001-R170 | `test/scenarios.test.ts` | validator | B52 |
| SPEC-001-R171 | `test/scenarios.test.ts` | validator | B53 |
| SPEC-001-R172 | `test/scenarios.test.ts` | workflows | B54 |
| SPEC-001-R173 | `test/scenarios.test.ts` | validator | B55 |
| SPEC-001-R174 | `test/scenarios.test.ts` | test | B56 |
| SPEC-001-R175 | `test/scenarios.test.ts` | validator | B57 |
| SPEC-001-R176 | `test/scenarios.test.ts` | receipt | B58 |
| SPEC-001-R177 | `test/scenarios.test.ts` | test | B59 |
| SPEC-001-R178 | `test/scenarios.test.ts` | test | B60 |
| SPEC-001-R179 | `test/scenarios.test.ts` | drift | B61 |
| SPEC-001-R180 | `test/scenarios.test.ts` | drift | B62 |
| SPEC-001-R181 | `test/scenarios.test.ts` | freeze | B63 |
| SPEC-001-R182 | `test/scenarios.test.ts` | freeze | B64 |
| SPEC-001-R183 | `test/scenarios.test.ts` | task | B65 |
| SPEC-001-R184 | `test/scenarios.test.ts` | receipt | B66 |
| SPEC-001-R185 | `test/scenarios.test.ts` | test | B67 |
| SPEC-001-R186 | `test/scenarios.test.ts` | workflows | B68 |
| SPEC-001-R187 | `test/scenarios.test.ts` | allowlist | B69 |
| SPEC-001-R188 | `test/scenarios.test.ts` | release | B70 |
| SPEC-001-R189 | `test/scenarios.test.ts` | test | B71 |
| SPEC-001-R191 | `test/validator.test.ts` | validator | — |
| SPEC-001-R192 | `test/validator.test.ts` | validator | — |
| SPEC-001-R193 | `test/validator.test.ts` | test | — |
| SPEC-001-R194 | `test/validator.test.ts` | validator | — |
| SPEC-001-R195 | `test/drift.test.ts` | drift | — |
| SPEC-001-R196 | `test/drift.test.ts` | drift | — |
| SPEC-001-R197 | `test/drift.test.ts` | test | — |
| SPEC-001-R198 | `test/scenarios.test.ts` | validator | B72 |
| SPEC-001-R199 | `test/scenarios.test.ts` | validator | B73 |
| SPEC-001-R200 | `test/scenarios.test.ts` | validator | B74 |
| SPEC-001-R201 | `test/scenarios.test.ts` | test | B75 |
| SPEC-001-R202 | `test/scenarios.test.ts` | validator | B76 |
| SPEC-001-R203 | `test/scenarios.test.ts` | workflows | B77 |
| SPEC-001-R204 | `test/scenarios.test.ts` | drift | B78 |
| SPEC-001-R205 | `test/scenarios.test.ts` | drift | B79 |
| SPEC-001-R206 | `test/scenarios.test.ts` | test | B80 |
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
