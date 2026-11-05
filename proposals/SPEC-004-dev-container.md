# SPEC-004: Dev container

Intent: a workshop attendee opens the repository in a container and every check and local scenario runs with no other setup, on the machine they already have.

Status: proposed. It lands with its implementation, because the trace check requires a test that names every requirement. The free exercises (SPEC-003) do not need it.

| Term | Meaning |
|---|---|
| container | the image and settings under `.devcontainer/` |
| check tools | gitleaks, zizmor, Terraform, tflint and its AWS ruleset, Semgrep and OSV-Scanner, at the versions `scripts/ci/install-tools.sh` and `scripts/ci/requirements.txt` pin |

## Requirements

| ID | Requirement |
|---|---|
| SPEC-004-R1 | THE repository SHALL include `.devcontainer/devcontainer.json` and an image definition whose base image is pinned by digest, with Node.js at the version in `package.json` `engines`, uv at the version CI pins, git and OpenSSH. |
| SPEC-004-R2 | WHEN the container image is built, THE build SHALL install the check tools with `scripts/ci/install-tools.sh`, verifying each download against a pinned SHA-256, for both `linux/amd64` and `linux/arm64`. |
| SPEC-004-R3 | WHEN the container starts on `main`, `npm ci --ignore-scripts`, `npm run checks` and `npm run scenarios` SHALL pass, except the scenarios that need GitHub Actions or the sandbox account. |
| SPEC-004-R4 | THE container SHALL hold no secrets, AWS credentials or cloud logins, and SHALL mount none of the host's `~/.ssh`, `~/.aws` or `~/.config/gh`. |
| SPEC-004-R5 | THE container SHALL build and pass SPEC-004-R3 in GitHub Codespaces and in VS Code Dev Containers on macOS (Apple Silicon and Intel), Linux and Windows. |
| SPEC-004-R6 | `.devcontainer/` SHALL be listed in `specs/protected-paths.txt`, because it decides which tools the checks run with. |
| SPEC-004-R7 | THE container SHALL NOT include the walkthrough video's tools (ffmpeg, Xvfb, the browser); the video is built in CI (SPEC-002). |

## Notes

- `scripts/ci/install-tools.sh` downloads Linux x86-64 builds only today. SPEC-004-R2 needs ARM64 builds pinned as well, or Apple Silicon attendees run every tool under emulation.
- The AWS sandbox scenarios (B9's AWS checks, B11, B14) are an instructor demo in the workshop, so the container needs no AWS tooling.

## Open questions

| Question | Why it matters |
|---|---|
| Whether VS Code Dev Containers and Codespaces forward the host's ssh-agent socket into the container by default, and how to turn that off | A forwarded agent would let any process in the container, including an agent session, use the host's signing keys. Decision 0003 assumes the agent cannot reach them. Not verified |
| Which workflow builds the image for both platforms in CI | The build would change `.github/`, a protected path |
