# Security policy

## Reporting a vulnerability

Report vulnerabilities privately, not in a public issue. Every new issue here is read and labelled by an automated triage job.

On the repository's **Security and quality** tab, choose **Report a vulnerability**. GitHub's steps: https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately

## Scope

In scope: the delivery pipeline and its gates (`scripts/gates.ts`, `.github/workflows/`), the Terraform under `infra/`, the bootstrap scripts under `scripts/bootstrap/`, the export service under `src/`, and the walkthrough kit under `video/`.

Out of scope, because they are deliberately unsafe: the scenario patches under `scenarios/` (including the synthetic token in `scenarios/B05-hard-coded-secret.patch`) and the poisoned issue fixture under `scenarios/fixtures/`.
