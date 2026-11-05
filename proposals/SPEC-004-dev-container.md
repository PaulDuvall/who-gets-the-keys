# SPEC-004: Dev container

Intent: a workshop attendee opens the repository in GitHub Codespaces, and every check and local scenario runs with no other setup. The same container also runs locally in VS Code Dev Containers, as best effort.

Status: proposed. It lands with its implementation, because the trace check requires a test that names every requirement. The free exercises (SPEC-003) do not need it. Revised 2026-11-05: GitHub Codespaces is the supported workshop path, and the local setup is best effort.

| Term | Meaning |
|---|---|
| container | the image and settings under `.devcontainer/` |
| check tools | gitleaks, zizmor, Terraform, tflint and its AWS ruleset, Semgrep and OSV-Scanner, at the versions `scripts/ci/install-tools.sh` and `scripts/ci/requirements.txt` pin |
| codespace | the container running in GitHub Codespaces, the supported workshop path |
| local container | the container running in VS Code Dev Containers on the attendee's own machine, which is best effort |

## Requirements

| ID | Requirement |
|---|---|
| SPEC-004-R1 | THE repository SHALL include `.devcontainer/devcontainer.json` and an image definition whose base image is pinned by digest. The image SHALL hold Node.js at the version in `package.json` `engines`, uv at the version CI pins, git and OpenSSH. |
| SPEC-004-R2 | WHEN the container image is built, THE build SHALL install the check tools for `linux/amd64` with `scripts/ci/install-tools.sh`, verifying each download against a pinned SHA-256. A `linux/arm64` build is optional: on Apple Silicon, the local container MAY run the `linux/amd64` image and its x86-64 tools under emulation. |
| SPEC-004-R3 | WHEN a codespace starts on `main`, `npm ci --ignore-scripts`, `npm run checks` and `npm run scenarios` SHALL pass, except the scenarios that need GitHub Actions or the sandbox account. |
| SPEC-004-R4 | THE container SHALL hold no secrets, AWS credentials or cloud logins, and SHALL mount none of the host's `~/.ssh`, `~/.aws` or `~/.config/gh`. |
| SPEC-004-R5 | WHEN a codespace is created from `main` with the repository's default dev container configuration, THE container SHALL build and pass SPEC-004-R3. THE local container SHALL use the same `.devcontainer/` configuration on macOS (Apple Silicon and Intel), Linux and Windows. It is best effort: SPEC-004-R3 does not apply to it. |
| SPEC-004-R6 | `.devcontainer/` SHALL be listed in `specs/protected-paths.txt`, because it decides which tools the checks run with. |
| SPEC-004-R7 | THE container SHALL NOT include the walkthrough video's tools (ffmpeg, Xvfb, the browser); the video is built in CI (SPEC-002). |
| SPEC-004-R8 | THE README's Quick start SHALL begin with GitHub's "Open in GitHub Codespaces" badge, `[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/<owner>/<repo>)`, naming this repository. It SHALL say that the local VS Code Dev Containers setup is best effort, and that VS Code forwards a running host ssh-agent into it. |
| SPEC-004-R9 | `.devcontainer/devcontainer.json` SHALL set `"hostRequirements": { "cpus": 2 }` at the top level, so that a codespace runs on a machine with at least 2 cores. |

## Notes

- `scripts/ci/install-tools.sh` downloads Linux x86-64 builds only today, which meets SPEC-004-R2. Pinning ARM64 builds later would let Apple Silicon attendees skip emulation.
- The AWS sandbox scenarios (B9's AWS checks, B11, B14) are an instructor demo in the workshop, so the container needs no AWS tooling.
- SPEC-003 is unchanged. The free exercises need only Node.js, npm, git and OpenSSH on a laptop (SPEC-003-R5), with no container or codespace.
- Codespaces gives every codespace a GitHub token, scoped read/write when the attendee has write access and clone-only when they have read access. SPEC-004-R4 covers what the container adds; it cannot remove that token. Source: [Security in GitHub Codespaces](https://docs.github.com/en/codespaces/reference/security-in-github-codespaces), Authentication, checked 2026-11-05.
- Codespaces machine types range from 2 to 32 cores, and the smallest valid type is the default. SPEC-004-R9 therefore changes no Codespaces default; it records the minimum, and other tools may warn on a smaller host.
- The trace check needs a test that names each requirement. A test can read `.devcontainer/` and the README for SPEC-004-R5, R8 and R9. The codespace run itself would be recorded in `docs/verification.md`.

## Answered

| Question | Answer | Source, checked 2026-11-05 |
|---|---|---|
| Does VS Code Dev Containers forward the host's ssh-agent into the container by default? | Yes, whenever an agent runs on the host: "the extension will automatically forward your local SSH agent if one is running." So the local container can use any key loaded in the host's agent. | [Sharing Git credentials with your container](https://code.visualstudio.com/remote/advancedcontainers/sharing-git-credentials), linked from [Developing inside a Container](https://code.visualstudio.com/docs/devcontainers/containers) |
| What is the `hostRequirements` syntax? | A top-level object in `devcontainer.json`. `cpus` is an integer, the minimum number of cores. `memory` and `storage` are strings with a `tb`, `gb`, `mb` or `kb` suffix. Codespaces then offers only machine types that meet them. | [Dev container metadata reference](https://containers.dev/implementors/json_reference/); [Setting a minimum specification for codespace machines](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/configuring-dev-containers/setting-a-minimum-specification-for-codespace-machines) |

## Open questions

| Question | Why it matters | Checked on 2026-11-05 |
|---|---|---|
| How to turn off ssh-agent forwarding in VS Code Dev Containers | A forwarded agent would let any process in the local container, including an agent session, use the host's signing keys. Decision 0003 assumes the agent cannot reach them | No documented setting. [Sharing Git credentials](https://code.visualstudio.com/remote/advancedcontainers/sharing-git-credentials), [Developing inside a Container](https://code.visualstudio.com/docs/devcontainers/containers), [Tips and tricks](https://code.visualstudio.com/docs/devcontainers/tips-and-tricks) and the [FAQ](https://code.visualstudio.com/docs/devcontainers/faq) give none. Settle by test: run `ssh-add -l` in a local container while a host agent holds a key |
| Whether a codespace opened in the browser or in VS Code desktop gets the attendee's local ssh-agent | The same exposure, on the supported path | Not stated. [Security in GitHub Codespaces](https://docs.github.com/en/codespaces/reference/security-in-github-codespaces), [Using Codespaces in VS Code](https://docs.github.com/en/codespaces/developing-in-a-codespace/using-github-codespaces-in-visual-studio-code) and [Using Codespaces with GitHub CLI](https://docs.github.com/en/codespaces/developing-in-a-codespace/using-github-codespaces-with-github-cli) do not mention agent forwarding. Settle by test: run `ssh-add -l` in a codespace from each |
| Which workflow builds the `linux/amd64` image in CI | The build would change `.github/`, a protected path | Not checked |
| Whether a 2-core codespace runs `npm run checks` and `npm run scenarios` in workshop time | SPEC-004-R9 may need a higher minimum if the checks are too slow on 2 cores | Not measured |
