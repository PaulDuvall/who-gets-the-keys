import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// scripts/bootstrap/aws-setup.sh is the owner's one command for the AWS setup: the sandbox member account, the
// break-glass alert, the SCP from the management account (SPEC-001-R30), then the roles and triage model as repository
// variables (SPEC-001-R28). Each test runs it end to end in a temporary clone whose HEAD is its origin/main, with the
// real aws.sh and github.sh it calls, and stand-ins for aws, terraform, gh, npm, zip, openssl and node on PATH. Each
// stand-in logs every call with its AWS_PROFILE; answers go in on standard input. Nothing reaches AWS or GitHub.
const script = join(process.cwd(), "scripts/bootstrap/aws-setup.sh");
const COPIED = ["scripts/bootstrap/aws-setup.sh", "scripts/bootstrap/aws.sh", "scripts/bootstrap/github.sh", ".gitignore"];
const TIMEOUT = 60_000;
const SANDBOX = "111111111111";
const MANAGEMENT = "222222222222";
const SANDBOX_BUCKET = `who-gets-the-keys-tfstate-${SANDBOX}-us-east-1-an`;
const ORG_BUCKET = `who-gets-the-keys-orgstate-${MANAGEMENT}-us-east-1-an`;
const TOPIC = `arn:aws:sns:us-east-1:${SANDBOX}:who-gets-the-keys-break-glass`;
// Bedrock's answer, unsorted, as text output puts it: tab-separated on one line.
const PROFILES = "us.anthropic.claude-example-b-v1:0\tus.anthropic.claude-example-a-v1:0";
const PICKED = "us.anthropic.claude-example-a-v1:0";
// The break-glass user (SPEC-001-R217), its TOTP device and the two CLI profiles aws-setup.sh writes by default.
const BG_USER = "who-gets-the-keys-break-glass-user";
const BG_ROLE = `arn:aws:iam::${SANDBOX}:role/who-gets-the-keys/who-gets-the-keys-break-glass`;
const SERIAL = `arn:aws:iam::${SANDBOX}:mfa/who-gets-the-keys/${BG_USER}`;
const BG_PROFILE = "who-gets-the-keys-break-glass";
const USER_PROFILE = `${BG_PROFILE}-user`;
const SEED = "JBSWY3DPEHPK3PXPSTUBSEEDVALUE";
const SECRET = "stub/secret+value/never/printed";

const log = 'printf "%s %s | %s\\n" "$(basename "$0")" "${AWS_PROFILE:-}" "$*" >> "$STUB_DIR/calls"';

// aws: answers each read from the STUB_* variables, and keeps what the writes create (buckets, the OIDC provider, the
// SCP attachment, subscriptions) in files, so a rerun sees them.
const stubAws = [
  "#!/usr/bin/env bash",
  log,
  'arg() { local want="$1"; shift; while [ $# -gt 0 ]; do if [ "$1" = "$want" ]; then printf "%s" "$2"; return 0; fi; shift; done; }',
  'account() { case "${AWS_PROFILE:-}" in sbx) echo "$STUB_SBX_ACCOUNT" ;; mgmt) echo "$STUB_MGMT_ACCOUNT" ;; *) return 1 ;; esac; }',
  'refused() { echo "An error occurred ($1) when calling the $2 operation: stub" >&2; exit 254; }',
  'case "$1 ${2:-}" in',
  '  "sts get-caller-identity")',
  '    a="$(account)" || { echo "The config profile (${AWS_PROFILE:-}) could not be found" >&2; exit 255; }',
  '    case "$(arg --query "$@")" in',
  '      Account) echo "$a" ;;',
  '      Arn) echo "arn:aws:sts::$a:assumed-role/Admin/owner" ;;',
  '      *) printf "%s\\tarn:aws:sts::%s:assumed-role/Admin/owner\\n" "$a" "$a" ;;',
  "    esac ;;",
  '  "organizations describe-organization") printf "o-example1234\\t%s\\n" "$STUB_ORG_MANAGEMENT" ;;',
  '  "organizations describe-account")',
  '    [ "$(arg --account-id "$@")" = "$STUB_MEMBER" ] || refused AccountNotFoundException DescribeAccount',
  '    echo "${STUB_ACCOUNT_STATE:-ACTIVE}" ;;',
  '  "organizations list-roots") printf "r-ab12\\t%s\\n" "$STUB_SCP" ;;',
  '  "organizations list-policies-for-target") if [ -f "$STUB_DIR/scp" ]; then echo p-example1234; fi ;;',
  '  "bedrock list-inference-profiles") printf "%s\\n" "$STUB_PROFILES" ;;',
  '  "s3api create-bucket")',
  '    if [ "${3:-}" = --generate-cli-skeleton ]; then',
  '      if [ -n "${STUB_NO_NAMESPACE:-}" ]; then echo \'{"Bucket": ""}\'; else echo \'{"Bucket": "", "BucketNamespace": "account-regional"}\'; fi',
  "      exit 0",
  "    fi",
  '    echo "$(arg --bucket "$@") $(account)" >> "$STUB_DIR/buckets"',
  "    echo '{\"Location\": \"/stub\"}' ;;",
  '  "s3api head-bucket")',
  '    grep -qxF -- "$(arg --bucket "$@") $(arg --expected-bucket-owner "$@")" "$STUB_DIR/buckets" 2>/dev/null || refused 404 HeadBucket ;;',
  '  "iam get-open-id-connect-provider")',
  '    [ -f "$STUB_DIR/oidc-$(account)" ] || refused NoSuchEntity GetOpenIDConnectProvider',
  '    cat "$STUB_DIR/oidc-$(account)" ;;',
  '  "iam create-open-id-connect-provider") echo sts.amazonaws.com > "$STUB_DIR/oidc-$(account)"; echo "{}" ;;',
  '  "sns list-subscriptions-by-topic") if [ -f "$STUB_DIR/subscriptions" ]; then cat "$STUB_DIR/subscriptions"; fi ;;',
  // The break-glass user's MFA devices and keys live in files too. The TOTP seed's file mode is kept, the seed is not.
  '  "iam list-mfa-devices") if [ -f "$STUB_DIR/mfa" ]; then cat "$STUB_DIR/mfa"; fi ;;',
  '  "iam list-access-keys") if [ -f "$STUB_DIR/keys" ]; then cat "$STUB_DIR/keys"; fi ;;',
  '  "iam list-virtual-mfa-devices") if [ -f "$STUB_DIR/unassigned" ]; then cat "$STUB_DIR/unassigned"; fi ;;',
  '  "iam delete-virtual-mfa-device") rm -f "$STUB_DIR/unassigned" ;;',
  '  "iam create-virtual-mfa-device")',
  '    seed="$(arg --outfile "$@")"; echo "$STUB_SEED" > "$seed"; echo "$seed" > "$STUB_DIR/seed-path"',
  '    ls -l "$seed" | cut -c1-10 > "$STUB_DIR/seed-mode"',
  '    echo "arn:aws:iam::$(account):mfa$(arg --path "$@")$(arg --virtual-mfa-device-name "$@")" | tee "$STUB_DIR/unassigned" ;;',
  '  "iam enable-mfa-device")',
  '    [ "$(arg --authentication-code1 "$@") $(arg --authentication-code2 "$@")" = "111111 222222" ] || refused InvalidAuthenticationCode EnableMFADevice',
  '    arg --serial-number "$@" > "$STUB_DIR/mfa"; rm -f "$STUB_DIR/unassigned" ;;',
  '  "iam create-access-key") printf "AKIASTUBNEWKEY\\t%s\\n" "$STUB_SECRET"; echo AKIASTUBNEWKEY > "$STUB_DIR/keys" ;;',
  '  "iam delete-access-key") rm -f "$STUB_DIR/keys" ;;',
  // aws configure keeps "<profile> <key> <value>" lines; get prints the last value set.
  '  "configure set") printf "%s %s %s\\n" "$(arg --profile "$@")" "$3" "$4" >> "$STUB_DIR/config" ;;',
  '  "configure get") awk -v p="$(arg --profile "$@")" -v k="$3" \'$1 == p && $2 == k { v = $3 } END { if (v == "") exit 1; print v }\' "$STUB_DIR/config" 2>/dev/null || exit 1 ;;',
  '  "sns subscribe")',
  '    printf "%s\\tPendingConfirmation\\n" "$(arg --notification-endpoint "$@")" >> "$STUB_DIR/subscriptions"',
  '    echo "pending confirmation" ;;',
  "esac",
  "exit 0",
  "",
].join("\n");

// terraform: plan -out writes a marked file whose kind (create, delete or noop) comes from STUB_DIR/plan-<dir>;
// show reads that file; apply records whether its file is one a plan saved, then makes the next plan a no-op.
const stubTerraform = [
  "#!/usr/bin/env bash",
  log,
  'dir=""',
  'case "${1:-}" in -chdir=*) dir="${1#-chdir=}"; shift ;; esac',
  'name="${dir##*/}"',
  'last="${!#}"',
  'case "$1" in',
  '  version) printf \'{"terraform_version":"%s","platform":"linux_amd64"}\\n\' "${STUB_TF_VERSION:-1.16.6}" ;;',
  '  init) echo "Terraform has been successfully initialized!" ;;',
  "  plan)",
  '    out=""; for a in "$@"; do case "$a" in -out=*) out="${a#-out=}" ;; esac; done',
  '    kind="$(cat "$STUB_DIR/plan-$name" 2>/dev/null || echo create)"',
  '    printf "saved by plan %s %s\\n" "$name" "$kind" > "$out"',
  '    echo "planned $name" ;;',
  "  show)",
  '    read -r _ _ _ planned kind < "$last" || exit 1',
  '    if [ "${2:-}" = -json ]; then',
  '      case "$kind" in',
  '        create) echo \'{"resource_changes":[{"address":"aws_sns_topic.break_glass","change":{"actions":["create"]}}],"output_changes":{"break_glass_topic_arn":{"actions":["create"]}}}\' ;;',
  '        delete) echo \'{"resource_changes":[{"address":"aws_dynamodb_table.export_jobs","change":{"actions":["delete","create"]}},{"address":"aws_sns_topic.break_glass","change":{"actions":["update"]}}]}\' ;;',
  '        *) echo \'{"resource_changes":[{"address":"aws_sns_topic.break_glass","change":{"actions":["no-op"]}}],"output_changes":{"break_glass_topic_arn":{"actions":["no-op"]}}}\' ;;',
  "      esac",
  '    else echo "Saved plan for $planned: $kind"; fi ;;',
  "  apply)",
  '    content="$(cat "$last" 2>/dev/null || true)"',
  '    case "$content" in',
  '      "saved by plan $name "*) echo "applied $name ${content##* } from $last" >> "$STUB_DIR/applied"; echo noop > "$STUB_DIR/plan-$name" ;;',
  '      *) echo "apply of $last, which no plan saved" >> "$STUB_DIR/applied"; exit 1 ;;',
  "    esac ;;",
  "  output)",
  '    if [ "${2:-}" = -raw ]; then',
  '      case "${3:-}" in',
  '        break_glass_user_name) [ -n "${STUB_NO_USER:-}" ] || echo who-gets-the-keys-break-glass-user ;;',
  '        break_glass_role_arn) [ -n "${STUB_NO_USER:-}" ] || echo "arn:aws:iam::${STUB_SBX_ACCOUNT}:role/who-gets-the-keys/who-gets-the-keys-break-glass" ;;',
  '        *) echo "arn:aws:sns:us-east-1:${STUB_SBX_ACCOUNT}:who-gets-the-keys-break-glass" ;;',
  '      esac',
  '    else r="arn:aws:iam::${STUB_SBX_ACCOUNT}:role/who-gets-the-keys/who-gets-the-keys"',
  '      printf \'{"deploy_role_arn":{"value":"%s-deploy"},"triage_role_arn":{"value":"%s-triage-bedrock"},"probe_role_arn":{"value":"%s-scenario-probe"},"producer_role_arn":{"value":"%s-producer-bedrock"},"producer_inference_profile":{"value":"us.anthropic.claude-example-p"}}\\n\' "$r" "$r" "$r" "$r"',
  "    fi ;;",
  "esac",
  "",
].join("\n");

// gh: answers the reads github.sh makes for a public repository o/r whose environments each have a required reviewer.
const stubGh = [
  "#!/usr/bin/env bash",
  log,
  'if [ "$1 ${2:-}" = "variable list" ]; then if [ -n "${STUB_VARIABLES:-}" ]; then cat "$STUB_VARIABLES"; else printf \'DEPLOY_ROLE_ARN\\nTRIAGE_MODEL\\nPROBE_ROLE_ARN\\n\'; fi; exit 0; fi',
  'case "$1" in auth|variable|secret) exit 0 ;; esac',
  'if [ "${2:-}" = "-X" ]; then',
  '  case " $* " in *" --input - "*) cat > /dev/null ;; esac',
  "  exit 0",
  "fi",
  'case "${2:-}" in',
  '  "repos/o/r") if [ "$4" = ".visibility" ]; then echo public; elif [[ "$4" == *"allow_merge_commit) "* ]]; then echo "true false false"; else echo stub; fi ;;',
  '  user) if [ "$4" = ".id" ]; then echo 1; else echo owner; fi ;;',
  '  *"/rulesets?includes_parents=false") echo 7 ;;',
  '  *"/check-runs?check_name=checks") echo 15368 ;;',
  '  *"/deployment-branch-policies") echo main ;;',
  '  */environments/sandbox|*/environments/probe) echo 1 ;;',
  "  *) echo stub ;;",
  "esac",
  "",
].join("\n");

const stubs: Record<string, string> = {
  aws: stubAws,
  terraform: stubTerraform,
  gh: stubGh,
  // npm: run build writes one module, or nothing when STUB_NO_BUILD is set.
  npm: ["#!/usr/bin/env bash", log, 'if [ "$1 ${2:-}" = "run build" ] && [ -z "${STUB_NO_BUILD:-}" ]; then mkdir -p dist/src && echo "export const handler = 1;" > dist/src/handler.js; fi', ""].join("\n"),
  zip: ["#!/usr/bin/env bash", log, 'for a in "$@"; do case "$a" in *.zip) echo stub > "$a" ;; esac; done', ""].join("\n"),
  openssl: ["#!/usr/bin/env bash", log, 'printf "digest of %s" "${!#}"', ""].join("\n"),
  node: ["#!/usr/bin/env bash", 'echo "${STUB_NODE_VERSION:-v24.11.1}"', ""].join("\n"),
};

// The only calls allowed before the confirm. Every one of them reads.
const READS = [
  /^aws \S+ \| sts get-caller-identity /,
  /^aws mgmt \| organizations (describe-organization|describe-account|list-roots|list-policies-for-target) /,
  /^aws sbx \| bedrock list-inference-profiles /,
  /^aws (sbx|mgmt) \| s3api head-bucket /,
  /^aws sbx \| iam get-open-id-connect-provider /,
  /^aws {2}\| s3api create-bucket --generate-cli-skeleton input$/,
  /^terraform {2}\| version -json$/,
  /^gh {2}\| auth status$/,
];
const isRead = (call: string) => READS.some((read) => read.test(call));

interface Repo { work: string; origin: string; stub: string; tmp: string; env: NodeJS.ProcessEnv }
interface Result { status: number | null; stdout: string; out: string; calls: string[] }

describe("SPEC-001-R30 aws-setup.sh sets up the sandbox member account, its SCP and the repository secrets and variables in one command", () => {
  // Made in beforeAll, not here, so listing the tests (the trace check runs vitest list) leaves no directory behind.
  let scratch = "";
  beforeAll(() => { scratch = mkdtempSync(join(tmpdir(), "aws-setup-")); });
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  const git = (repo: Repo, ...args: string[]): string => execFileSync("git", args, { cwd: repo.work, env: repo.env, encoding: "utf8" }).trim();
  const lines = (file: string): string[] => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : []);

  function makeRepo(): Repo {
    const dir = mkdtempSync(join(scratch, "repo-"));
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (!/^(AWS_|TF_|GIT_|GH_|GITHUB_|SSH_AUTH_SOCK$|TRIAGE_MODEL$|BEDROCK_FORM$)/.test(key)) env[key] = value;
    }
    const repo: Repo = { work: join(dir, "work"), origin: join(dir, "origin.git"), stub: join(dir, "stub"), tmp: join(dir, "tmp"), env };
    Object.assign(env, {
      HOME: join(dir, "home"), GIT_CONFIG_GLOBAL: join(dir, "gitconfig"), GIT_CONFIG_NOSYSTEM: "1", GH_CONFIG_DIR: join(dir, "home"),
      TMPDIR: repo.tmp, PATH: `${repo.stub}:${process.env["PATH"] ?? ""}`, STUB_DIR: repo.stub, REPO: "o/r",
      SANDBOX_ACCOUNT_ID: SANDBOX, SANDBOX_PROFILE: "sbx", MANAGEMENT_PROFILE: "mgmt", ALERT_EMAIL: "owner@example.com",
      STUB_SBX_ACCOUNT: SANDBOX, STUB_MGMT_ACCOUNT: MANAGEMENT, STUB_ORG_MANAGEMENT: MANAGEMENT, STUB_MEMBER: SANDBOX,
      STUB_SCP: "ENABLED", STUB_PROFILES: PROFILES, STUB_SEED: SEED, STUB_SECRET: SECRET,
    });
    for (const path of [repo.stub, repo.tmp, join(dir, "home"), join(repo.work, "infra/sandbox"), join(repo.work, "infra/org")]) mkdirSync(path, { recursive: true });
    writeFileSync(join(dir, "gitconfig"), "[user]\n\tname = Owner\n\temail = owner@example.com\n[commit]\n\tgpgsign = false\n");
    for (const [name, text] of Object.entries(stubs)) {
      writeFileSync(join(repo.stub, name), text);
      chmodSync(join(repo.stub, name), 0o755);
    }
    execFileSync("git", ["init", "-q", "--bare", "-b", "main", repo.origin], { env });
    execFileSync("git", ["init", "-q", "-b", "main", repo.work], { env });
    for (const path of COPIED) {
      mkdirSync(dirname(join(repo.work, path)), { recursive: true });
      copyFileSync(join(process.cwd(), path), join(repo.work, path));
    }
    // The break-glass user starts set up, as after a first run: one device, one key, and this computer holds the key.
    writeFileSync(join(repo.stub, "mfa"), `${SERIAL}\n`);
    writeFileSync(join(repo.stub, "keys"), "AKIASTUBOLDKEY\n");
    writeFileSync(join(repo.stub, "config"), `${USER_PROFILE} aws_access_key_id AKIASTUBOLDKEY\n`);
    writeFileSync(join(repo.work, "infra/sandbox/main.tf"), "# stand-in\n");
    writeFileSync(join(repo.work, "infra/org/main.tf"), "# stand-in\n");
    git(repo, "remote", "add", "origin", repo.origin);
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "init");
    git(repo, "push", "-q", "-u", "origin", "main");
    return repo;
  }

  function run(repo: Repo, input: string, extra: NodeJS.ProcessEnv = {}, cwd = repo.work): Result {
    rmSync(join(repo.stub, "calls"), { force: true });
    const r = spawnSync("bash", [script], { cwd, env: { ...repo.env, ...extra }, input, encoding: "utf8", timeout: TIMEOUT });
    return { status: r.status, stdout: r.stdout, out: `${r.stdout}${r.stderr}`, calls: lines(join(repo.stub, "calls")) };
  }

  function expectNothingChanged(repo: Repo, r: Result) {
    expect(r.status).toBe(1);
    expect(r.out).toContain("Nothing changed.");
    expect(r.calls.filter((call) => !isRead(call))).toEqual([]);
    expect(r.out).not.toContain("Stopped.");
    expect(existsSync(join(repo.work, "dist"))).toBe(false);
    expect(existsSync(join(repo.stub, "buckets"))).toBe(false);
    expect(existsSync(join(repo.stub, "applied"))).toBe(false);
  }

  // index <calls> <start>: the first call that starts with <start>, or -1.
  const index = (calls: string[], start: string) => calls.findIndex((call) => call.startsWith(start));

  it("SPEC-001-R30 asks once before any write, then runs each step in order with the profile of the account it changes", () => {
    const declined = makeRepo();
    const no = run(declined, "1\nn\n");
    expectNothingChanged(declined, no);
    expect(no.out).toContain("You chose not to go ahead.\nNothing changed.");
    expect(no.stdout).toContain(`  1. ${PICKED}\n  2. us.anthropic.claude-example-b-v1:0\nPick one, 1 to 2: `);
    expect(no.stdout).toContain(`Sandbox account ${SANDBOX}, profile sbx, as arn:aws:sts::${SANDBOX}:assumed-role/Admin/owner, a member of o-example1234:`);
    expect(no.stdout).toContain(`  state bucket ${SANDBOX_BUCKET} is created, with versioning`);
    expect(no.stdout).toContain("  GitHub OIDC provider is created, with client ID sts.amazonaws.com");
    expect(no.stdout).toContain(`  infra/org is planned: SCP who-gets-the-keys-sandbox-writes attached to ${SANDBOX}`);
    expect(no.stdout).toContain(`TRIAGE_MODEL=${PICKED}`);
    expect(no.stdout).toContain("Go ahead? [y/N]");
    expect(git(declined, "status", "--porcelain")).toBe("");

    const repo = makeRepo();
    const r = run(repo, "1\ny\ny\n\ny\n");
    expect(r.status).toBe(0);
    // The same inputs give the same calls up to the confirm, and the first call after it is the first write.
    expect(r.calls.slice(0, no.calls.length)).toEqual(no.calls);
    expect(r.calls[no.calls.length]).toBe("npm  | ci --ignore-scripts");
    const steps = [
      "npm  | ci --ignore-scripts",
      "npm  | run build",
      "zip  | -X -q ../function.zip ./handler.js ./package.json",
      "openssl  | dgst -sha256 -binary dist/function.zip",
      `aws sbx | s3api create-bucket --bucket ${SANDBOX_BUCKET} --bucket-namespace account-regional --region us-east-1`,
      `aws sbx | s3api put-bucket-policy --bucket ${SANDBOX_BUCKET} `,
      "aws sbx | iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com",
      `terraform sbx | -chdir=infra/sandbox init -input=false -reconfigure -lockfile=readonly -backend-config=bucket=${SANDBOX_BUCKET}`,
      "terraform sbx | -chdir=infra/sandbox plan -input=false -out=",
      "terraform sbx | -chdir=infra/sandbox apply -input=false ",
      "terraform sbx | -chdir=infra/sandbox output -raw break_glass_topic_arn",
      `aws sbx | sns list-subscriptions-by-topic --region us-east-1 --topic-arn ${TOPIC} `,
      `aws sbx | sns subscribe --region us-east-1 --topic-arn ${TOPIC} --protocol email --notification-endpoint owner@example.com `,
      "terraform sbx | -chdir=infra/sandbox output -raw break_glass_user_name",
      "terraform sbx | -chdir=infra/sandbox output -raw break_glass_role_arn",
      `aws sbx | iam list-mfa-devices --user-name ${BG_USER} `,
      `aws sbx | iam list-access-keys --user-name ${BG_USER} `,
      `aws  | configure get aws_access_key_id --profile ${USER_PROFILE}`,
      `aws  | configure set role_arn ${BG_ROLE} --profile ${BG_PROFILE}`,
      `aws mgmt | s3api create-bucket --bucket ${ORG_BUCKET} --bucket-namespace account-regional --region us-east-1`,
      `aws mgmt | s3api put-bucket-policy --bucket ${ORG_BUCKET} `,
      `terraform mgmt | -chdir=infra/org init -input=false -reconfigure -lockfile=readonly -backend-config=bucket=${ORG_BUCKET}`,
      "terraform mgmt | -chdir=infra/org plan -input=false -out=",
      "terraform mgmt | -chdir=infra/org apply -input=false ",
      "gh sbx | auth status",
      "terraform sbx | -chdir=infra/sandbox output -json",
      "gh sbx | variable list --repo o/r --json name --jq .[].name",
      `gh sbx | secret set DEPLOY_ROLE_ARN --repo o/r --body arn:aws:iam::${SANDBOX}:role/who-gets-the-keys/who-gets-the-keys-deploy`,
      `gh sbx | secret set TRIAGE_ROLE_ARN --repo o/r --body arn:aws:iam::${SANDBOX}:role/who-gets-the-keys/who-gets-the-keys-triage-bedrock`,
      `gh sbx | secret set PROBE_ROLE_ARN --repo o/r --body arn:aws:iam::${SANDBOX}:role/who-gets-the-keys/who-gets-the-keys-scenario-probe`,
      `gh sbx | secret set PRODUCER_ROLE_ARN --repo o/r --body arn:aws:iam::${SANDBOX}:role/who-gets-the-keys/who-gets-the-keys-producer-bedrock`,
      `gh sbx | variable set TRIAGE_MODEL --repo o/r --body ${PICKED}`,
      "gh sbx | variable set PRODUCER_MODEL --repo o/r --body us.anthropic.claude-example-p",
      "gh sbx | variable delete DEPLOY_ROLE_ARN --repo o/r",
      "gh sbx | variable delete PROBE_ROLE_ARN --repo o/r",
    ];
    // SPEC-001-R86: the role ARNs are secrets, and only the variables that held one are deleted, after every secret is set.
    expect(r.calls.filter((call) => /variable delete|variable set \w*_ROLE_ARN/.test(call))).toEqual([
      "gh sbx | variable delete DEPLOY_ROLE_ARN --repo o/r", "gh sbx | variable delete PROBE_ROLE_ARN --repo o/r",
    ]);
    const at = steps.map((start) => [start, index(r.calls, start)] as const);
    expect(at.filter(([, i]) => i < no.calls.length)).toEqual([]);
    expect(at.map(([, i]) => i)).toEqual([...at.map(([, i]) => i)].sort((a, b) => a - b));
    // The sandbox plan carries the hash of the artifact built here, and the SCP is planned for the sandbox account.
    const digest = Buffer.from("digest of dist/function.zip").toString("base64");
    const plans = r.calls.filter((call) => / -chdir=\S+ plan /.test(call));
    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatch(/^terraform sbx \| -chdir=infra\/sandbox plan -input=false -out=\S+ -var /);
    expect(plans[0]?.endsWith(` -var artifact_sha256=${digest}`)).toBe(true);
    expect(plans[1]).toMatch(/^terraform mgmt \| -chdir=infra\/org plan -input=false -out=\S+ -var /);
    expect(plans[1]?.endsWith(` -var sandbox_account_id=${SANDBOX}`)).toBe(true);
    // Each call runs as the account it changes: the SCP, the organization and infra/org as the management account.
    const wrongProfile = r.calls.filter((call) => {
      const profile = call.split(" ")[1];
      if (/-chdir=infra\/org|orgstate|organizations /.test(call)) return profile !== "mgmt";
      if (/-chdir=infra\/sandbox|tfstate|sns |iam |bedrock |variable (set|list|delete)|secret set/.test(call)) return profile !== "sbx";
      return false;
    });
    expect(wrongProfile).toEqual([]);
    expect(r.calls.filter((call) => / (sns|iam|organizations|bedrock) /.test(call)).length).toBeGreaterThan(8);
    expect(lines(join(repo.stub, "buckets"))).toEqual([`${SANDBOX_BUCKET} ${SANDBOX}`, `${ORG_BUCKET} ${MANAGEMENT}`]);
    expect(lines(join(repo.stub, "subscriptions"))).toEqual(["owner@example.com\tPendingConfirmation"]);
    expect(r.stdout).toContain("Click Confirm subscription in the email from AWS Notifications, then press Enter.");
    expect(r.stdout).toContain("Confirm within 48 hours, or SNS deletes the subscription and break-glass alerts reach no one.");
    expect(r.stdout).toContain("Apply this plan to account 111111111111? [y/N]");
    expect(r.stdout).toContain("Apply this plan to account 222222222222? [y/N]");
    const head = git(repo, "rev-parse", "HEAD");
    expect(r.stdout).toContain("Done. To check the repository secrets and variables:\ngh secret list --repo o/r\ngh variable list --repo o/r\n");
    expect(r.stdout).toContain(`Next, approve the sandbox deploy in main's tip run, for ${head.slice(0, 12)}, in GitHub.`);
    expect(r.stdout).toContain("Never approve the deploy of an older run: it would deploy an older commit.");
    expect(r.stdout.trimEnd().split("\n").slice(-3)).toEqual([
      `gh run list --workflow pipeline.yml --branch main --commit ${head} --limit 1`,
      "If that run's deploy already failed, because it ran before this setup, rerun its failed jobs, then approve:",
      "gh run rerun <run ID> --failed",
    ]);
    // Commands printed for a person to paste carry no comments.
    expect(r.stdout.split("\n").filter((line) => /^(gh|aws|terraform|git) /.test(line) && line.includes("#"))).toEqual([]);
    expect(git(repo, "status", "--porcelain")).toBe("");
  }, TIMEOUT);

  it("SPEC-001-R30 applies only the plan file it saved and showed, and never runs terraform destroy", () => {
    const repo = makeRepo();
    const r = run(repo, "1\ny\ny\n\ny\n");
    expect(r.status).toBe(0);
    for (const dir of ["infra/sandbox", "infra/org"]) {
      const mine = r.calls.filter((call) => call.includes(`-chdir=${dir} `));
      const plan = mine.find((call) => call.includes(" plan "))?.match(/ -out=(\S+)/)?.[1] ?? "";
      expect(plan.startsWith(`${repo.tmp}/aws-setup.`)).toBe(true);
      const tail = mine.slice(mine.findIndex((call) => call.includes(" plan ")) + 1).map((call) => call.split(" | ")[1]);
      expect(tail.slice(0, 3)).toEqual([`-chdir=${dir} show ${plan}`, `-chdir=${dir} show -json ${plan}`, `-chdir=${dir} apply -input=false ${plan}`]);
      expect(mine.filter((call) => call.includes(" apply"))).toHaveLength(1);
      expect(existsSync(plan)).toBe(false);
    }
    expect(lines(join(repo.stub, "applied")).map((line) => line.split(" from ")[0])).toEqual(["applied sandbox create", "applied org create"]);
    expect(r.calls.filter((call) => /\bdestroy\b| -auto-approve| -replace=| -target=| -migrate-state| -force-copy/.test(call))).toEqual([]);
    // The owner sees each readable plan on standard output before the question that applies it.
    for (const [planned, prompt] of [["Saved plan for sandbox: create", `Apply this plan to account ${SANDBOX}? [y/N]`],
      ["Saved plan for org: create", `Apply this plan to account ${MANAGEMENT}? [y/N]`]] as const) {
      expect([planned, r.stdout.indexOf(planned)]).not.toEqual([planned, -1]);
      expect(r.stdout.indexOf(planned)).toBeLessThan(r.stdout.indexOf(prompt));
    }
  }, TIMEOUT);

  it("SPEC-001-R30 stops with nothing applied when the owner answers no to a plan, and runs no later step", () => {
    const repo = makeRepo();
    const r = run(repo, "1\ny\nn\n");
    expect(r.status).toBe(1);
    expect(r.out).toContain("Not applied. Nothing in this plan changed.");
    // A deliberate no is a choice, not a problem to fix. Before the SCP is attached, nothing offers to skip the plan.
    expect(r.out).toContain("Stopped, as you chose. The steps that finished stay done.");
    expect(r.out).not.toContain("Fix the problem above");
    expect(r.out).not.toContain("Skip infra/sandbox");
    expect(existsSync(join(repo.stub, "applied"))).toBe(false);
    expect(r.calls.filter((call) => / apply |sns |mgmt \| s3api (create|put)|infra\/org|variable (set|delete)|secret set/.test(call))).toEqual([]);
  }, TIMEOUT);

  it("SPEC-001-R30 counts an empty answer, or the end of input, as no at the confirm and at a plan", () => {
    const repo = makeRepo();
    const ended = run(repo, "1\n");
    expectNothingChanged(repo, ended);
    expect(ended.out).toContain("You chose not to go ahead.\nNothing changed.");
    const empty = run(repo, "1\ny\n\n");
    expect(empty.status).toBe(1);
    expect(empty.stdout).toContain(`Apply this plan to account ${SANDBOX}? [y/N]`);
    expect(empty.out).toContain("Not applied. Nothing in this plan changed.");
    expect(existsSync(join(repo.stub, "applied"))).toBe(false);
    expect(empty.calls.filter((call) => / apply |sns |mgmt \| s3api (create|put)|infra\/org|variable (set|delete)|secret set/.test(call))).toEqual([]);
  }, TIMEOUT);

  it("SPEC-001-R30 lets a rerun skip a declined infra/sandbox plan once the SCP is attached, and go on to the later steps", () => {
    const repo = makeRepo();
    expect(run(repo, "1\ny\ny\n\ny\n").status).toBe(0);
    writeFileSync(join(repo.stub, "scp"), "attached\n");
    // A plan with changes, as a Lambda built on another machine could give, which the SCP refuses at apply.
    writeFileSync(join(repo.stub, "plan-sandbox"), "create\n");
    const later = / sns subscribe |-chdir=infra\/org plan |variable set /;
    const stop = run(repo, "y\nn\nn\n", { TRIAGE_MODEL: PICKED });
    expect(stop.status).toBe(1);
    expect(stop.stdout).toContain("If this plan changes them, answer no, then skip infra/sandbox to go on to the later steps.");
    expect(stop.stdout).toContain("Skip infra/sandbox and go on to the alert, infra/org and the repository secrets and variables? [y/N]");
    expect(stop.out).toContain("Stopped, as you chose.");
    expect(stop.calls.filter((call) => later.test(call))).toEqual([]);

    const skip = run(repo, "y\nn\ny\n\n", { TRIAGE_MODEL: PICKED });
    expect(skip.status).toBe(0);
    expect(skip.stdout).toContain("Skipped infra/sandbox. The pipeline's deploy job, or break-glass, applies its changes.");
    expect(skip.calls.filter((call) => call.includes("-chdir=infra/sandbox apply"))).toEqual([]);
    expect(index(skip.calls, "terraform mgmt | -chdir=infra/org plan ")).toBeGreaterThan(-1);
    expect(index(skip.calls, `gh sbx | variable set TRIAGE_MODEL --repo o/r --body ${PICKED}`)).toBeGreaterThan(-1);
    expect(lines(join(repo.stub, "applied")).map((line) => line.split(" from ")[0])).toEqual(["applied sandbox create", "applied org create"]);
  }, TIMEOUT);

  it("SPEC-001-R30 stops before any plan when npm run build writes no JavaScript, as the pipeline's build job does", () => {
    const repo = makeRepo();
    const r = run(repo, "1\ny\n", { STUB_NO_BUILD: "1" });
    expect(r.status).toBe(1);
    expect(r.out).toContain("npm run build wrote no dist/src/*.js, so there is no Lambda artifact to plan.");
    expect(r.out).toContain("Fix the problem above");
    expect(r.calls.filter((call) => /^(zip|openssl|terraform \S+ \| -chdir)/.test(call) || (!isRead(call) && / create-| put-/.test(call)))).toEqual([]);
    expect(existsSync(join(repo.work, "dist/function.zip"))).toBe(false);
    expect(existsSync(join(repo.stub, "applied"))).toBe(false);
  }, TIMEOUT);

  it("SPEC-001-R30 says loudly when a plan deletes or replaces anything, and applies it only when the owner types delete", () => {
    const repo = makeRepo();
    writeFileSync(join(repo.stub, "plan-sandbox"), "delete\n");
    const y = run(repo, "1\ny\ny\n");
    expect(y.status).toBe(1);
    expect(y.stdout).toContain(`WARNING: THIS PLAN DELETES OR REPLACES RESOURCES IN ACCOUNT ${SANDBOX}:\n  aws_dynamodb_table.export_jobs: delete then create\n`);
    expect(y.stdout).not.toContain("aws_sns_topic.break_glass: update");
    expect(y.stdout).toContain("Type delete to apply this plan, which deletes or replaces them, or anything else to stop:");
    expect(y.out).toContain("Not applied: you did not type delete. Nothing in this plan changed.");
    expect(existsSync(join(repo.stub, "applied"))).toBe(false);
    expect(y.calls.filter((call) => call.includes(" apply "))).toEqual([]);

    const typed = run(repo, "1\ny\ndelete\n\ny\n");
    expect(typed.status).toBe(0);
    expect(lines(join(repo.stub, "applied")).map((line) => line.split(" from ")[0])).toEqual(["applied sandbox delete", "applied org create"]);
  }, TIMEOUT);

  it("SPEC-001-R30 skips on a rerun what exists: the buckets, the OIDC provider, no-change plans and the subscription", () => {
    const repo = makeRepo();
    expect(run(repo, "1\ny\ny\n\ny\n").status).toBe(0);
    writeFileSync(join(repo.stub, "scp"), "attached\n");
    const again = run(repo, "y\n\n", { TRIAGE_MODEL: PICKED });
    expect(again.status).toBe(0);
    expect(again.stdout).not.toContain("Pick one");
    expect(again.stdout).toContain(`  state bucket ${SANDBOX_BUCKET} exists; versioning, encryption, public access block and TLS-only policy are re-applied`);
    expect(again.stdout).toContain(`  state bucket ${ORG_BUCKET} exists;`);
    expect(again.stdout).toContain("  GitHub OIDC provider exists with client ID sts.amazonaws.com; no change");
    expect(again.stdout).toContain("  The SCP is already attached (p-example1234), so profile sbx cannot write the export Lambda,");
    expect(again.stdout).toContain("No changes in infra/sandbox, so nothing to apply.");
    expect(again.stdout).toContain("No changes in infra/org, so nothing to apply.");
    expect(again.stdout).not.toContain("Apply this plan");
    expect(again.stdout).toContain(`owner@example.com already has a subscription to ${TOPIC}, still waiting for confirmation.`);
    expect(again.calls.filter((call) => / s3api create-bucket --bucket | create-open-id-connect-provider | apply | sns subscribe /.test(call))).toEqual([]);
    expect(lines(join(repo.stub, "buckets"))).toHaveLength(2);
    expect(lines(join(repo.stub, "subscriptions"))).toHaveLength(1);

    // A confirmed subscription is skipped with no pause, and the address matches whatever its case.
    writeFileSync(join(repo.stub, "subscriptions"), `owner@example.com\tarn:aws:sns:us-east-1:${SANDBOX}:who-gets-the-keys-break-glass:0f1e\n`);
    const confirmed = run(repo, "y\n", { TRIAGE_MODEL: PICKED, ALERT_EMAIL: "Owner@Example.com" });
    expect(confirmed.status).toBe(0);
    expect(confirmed.stdout).toContain(`Owner@Example.com already has a confirmed subscription to ${TOPIC}. Skipped.`);
    expect(confirmed.stdout).not.toContain("press Enter");
    expect(confirmed.calls.filter((call) => call.includes("sns subscribe"))).toEqual([]);

    // Another address's confirmed subscription does not count for ALERT_EMAIL.
    const subscribe = `aws sbx | sns subscribe --region us-east-1 --topic-arn ${TOPIC} --protocol email --notification-endpoint owner@example.com `;
    writeFileSync(join(repo.stub, "subscriptions"), `other@example.com\tarn:aws:sns:us-east-1:${SANDBOX}:who-gets-the-keys-break-glass:9a8b\n`);
    const other = run(repo, "y\n\n", { TRIAGE_MODEL: PICKED });
    expect(other.status).toBe(0);
    expect(index(other.calls, subscribe)).toBeGreaterThan(-1);
    expect(other.stdout).toContain("Click Confirm subscription in the email from AWS Notifications, then press Enter.");

    // After an unsubscribe SNS can list the subscription as Deleted for a while. It delivers nothing, so subscribe again.
    writeFileSync(join(repo.stub, "subscriptions"), "owner@example.com\tDeleted\n");
    const deleted = run(repo, "y\n\n", { TRIAGE_MODEL: PICKED });
    expect(deleted.status).toBe(0);
    expect(deleted.stdout).toContain(`owner@example.com's subscription to ${TOPIC} shows Deleted, so it gets no alerts.`);
    expect(deleted.stdout).not.toContain("already has a confirmed subscription");
    expect(index(deleted.calls, subscribe)).toBeGreaterThan(-1);
    expect(deleted.stdout).toContain("Click Confirm subscription in the email from AWS Notifications, then press Enter.");
  }, TIMEOUT);

  it.each([
    ["the sandbox is the management account", { STUB_MGMT_ACCOUNT: SANDBOX, STUB_ORG_MANAGEMENT: SANDBOX },
      /Account 111111111111 is both the sandbox and the management account\.\nSCPs do not affect users or roles in the management account/],
    ["the sandbox is not in the organization", { STUB_MEMBER: "333333333333" }, /Account 111111111111 is not a member of organization o-example1234: An error occurred \(AccountNotFoundException\)/],
    ["the sandbox account is suspended", { STUB_ACCOUNT_STATE: "SUSPENDED" }, /Account 111111111111 is SUSPENDED in o-example1234, not ACTIVE\./],
    ["service control policies are off on the root", { STUB_SCP: "None" },
      /not enabled on root r-ab12 of o-example1234 \(status: None\)\.\nEnable them, then run this again:\naws organizations enable-policy-type --root-id r-ab12 --policy-type SERVICE_CONTROL_POLICY --profile mgmt\n/],
    ["the management profile is not for the management account", { STUB_ORG_MANAGEMENT: "333333333333" },
      /Account 222222222222 is not the management account of o-example1234; 333333333333 is\./],
    ["the sandbox profile is for another account", { SANDBOX_ACCOUNT_ID: "444444444444" }, /Profile sbx is for account 111111111111, not SANDBOX_ACCOUNT_ID 444444444444\./],
    ["a profile has no credentials", { MANAGEMENT_PROFILE: "missing" }, /Profile missing has no working credentials: The config profile \(missing\) could not be found/],
    ["AWS credentials are in the environment", { AWS_ACCESS_KEY_ID: "AKIAEXAMPLE" }, /AWS credentials are set in the environment/],
    ["the AWS CLI cannot create a bucket in the account regional namespace", { STUB_NO_NAMESPACE: "1" }, /has no --bucket-namespace option/],
    ["Terraform is older than 1.11", { STUB_TF_VERSION: "1.10.5" }, /This needs Terraform 1\.11 or later, for the S3 backend's use_lockfile\. This is 1\.10\.5\./],
    ["Node.js is not 24", { STUB_NODE_VERSION: "v22.23.4" }, /This needs Node\.js 24, as package\.json engines says\. This is v22\.23\.4\./],
    ["Bedrock lists no us.anthropic. inference profile", { STUB_PROFILES: "" }, /Bedrock lists no active inference profile starting us\.anthropic\. in us-east-1/],
    ["the alert address is not an email address", { ALERT_EMAIL: "owner" }, /ALERT_EMAIL owner is not an email address\./],
    ["BEDROCK_FORM is not a file", { BEDROCK_FORM: "missing.json" }, /BEDROCK_FORM missing\.json is not a file\./],
    ["a TF_VAR_ variable is set", { TF_VAR_repository_id: "1" },
      /These environment variables change what Terraform plans, so the plan would differ from the pipeline's:\nTF_VAR_repository_id\nUnset them/],
    ["TF_WORKSPACE is set", { TF_WORKSPACE: "other" }, /change what Terraform plans[^\n]*\nTF_WORKSPACE\n/],
    ["TF_CLI_ARGS_plan is set", { TF_CLI_ARGS_plan: "-target=aws_sns_topic.break_glass" }, /change what Terraform plans[^\n]*\nTF_CLI_ARGS_plan\n/],
  ])("SPEC-001-R30 refuses before any write when %s", (_title, extra, message) => {
    const repo = makeRepo();
    const r = run(repo, "1\ny\ny\n\ny\n", extra);
    expectNothingChanged(repo, r);
    expect(r.out).toMatch(message);
    expect(r.out).not.toContain("Go ahead?");
  }, TIMEOUT);

  // .gitignore ignores *.tfvars and *.tfvars.json, so git status cannot see them, yet Terraform loads some on its own.
  it.each(["infra/sandbox/terraform.tfvars", "infra/org/extra.auto.tfvars.json"])(
    "SPEC-001-R30 refuses before any write when the ignored variable file %s is present", (path) => {
      const repo = makeRepo();
      writeFileSync(join(repo.work, path), "sandbox_account_id = \"333333333333\"\n");
      expect(git(repo, "status", "--porcelain")).toBe("");
      const r = run(repo, "1\ny\ny\n\ny\n");
      expectNothingChanged(repo, r);
      expect(r.out).toContain(`Terraform would load these ignored variable files, so the plan would differ from the pipeline's:\n${path}\n`);
      expect(r.calls.filter((call) => call.startsWith("aws ") && !call.includes("--generate-cli-skeleton"))).toEqual([]);
    }, TIMEOUT);

  it.each([
    ["openai.gpt-example", /TRIAGE_MODEL openai\.gpt-example starts with neither us\.anthropic\. nor anthropic\.\nThe triage role may invoke only foundation-model\/anthropic\.\* and inference-profile\/us\.anthropic\.\* in us-east-1\./],
    ["eu.anthropic.claude-example-a-v1:0", /starts with neither us\.anthropic\. nor anthropic\./],
    ["us.anthropic.claude-unlisted-v1:0", /TRIAGE_MODEL us\.anthropic\.claude-unlisted-v1:0 is not an active inference profile in us-east-1 for account 111111111111\./],
    // issue-triage.yml splices the variable into the agent's arguments, so a space would add flags to the triage job.
    ["anthropic.x --permission-mode bypassPermissions",
      /TRIAGE_MODEL anthropic\.x --permission-mode bypassPermissions holds a character that no Bedrock model ID has\.\nModel IDs use only letters, digits, dot, colon and hyphen\./],
    ["anthropic.x\nus.anthropic.y", /holds a character that no Bedrock model ID has\./],
  ])("SPEC-001-R28 refuses TRIAGE_MODEL %s, which the triage role could not invoke, before any write", (model, message) => {
    const repo = makeRepo();
    const r = run(repo, "y\ny\n\ny\n", { TRIAGE_MODEL: model });
    expectNothingChanged(repo, r);
    expect(r.out).toMatch(message);
  }, TIMEOUT);

  it("SPEC-001-R28 takes TRIAGE_MODEL from the numbered list only as a number in range, and accepts a foundation model ID", () => {
    const repo = makeRepo();
    for (const pick of ["3", "0", "two", ""]) {
      const r = run(repo, `${pick}\ny\n`);
      expectNothingChanged(repo, r);
      expect(r.out).toContain(`${pick || "Nothing"} is not a number from 1 to 2.`);
    }
    const foundation = run(repo, "n\n", { TRIAGE_MODEL: "anthropic.claude-example-v1:0" });
    expectNothingChanged(repo, foundation);
    expect(foundation.stdout).toContain("TRIAGE_MODEL=anthropic.claude-example-v1:0");
    expect(foundation.stdout).toContain("Go ahead? [y/N]");
  }, TIMEOUT);

  it("SPEC-001-R28 reads a relative BEDROCK_FORM from where the owner runs it, and submits that file after the confirm", () => {
    const repo = makeRepo();
    const form = join(dirname(repo.work), "form.json");
    writeFileSync(form, "{}\n");
    const r = run(repo, "1\ny\ny\n\ny\n", { BEDROCK_FORM: "../../form.json" }, join(repo.work, "infra"));
    expect(r.status).toBe(0);
    const absolute = realpathSync(form);
    expect(r.stdout).toContain(`  the Anthropic first-time-use form ${absolute} is submitted to Bedrock`);
    const submit = index(r.calls, `aws sbx | bedrock put-use-case-for-model-access --region us-east-1 --form-data fileb://${absolute}`);
    expect(submit).toBeGreaterThan(index(r.calls, "npm  | ci --ignore-scripts"));
  }, TIMEOUT);

  it("SPEC-001-R30 refuses a dirty working tree, and a HEAD that is not origin/main, before any AWS call", () => {
    const repo = makeRepo();
    const noAws = (r: Result) => r.calls.filter((call) => call.startsWith("aws ") && !call.includes("--generate-cli-skeleton"));
    writeFileSync(join(repo.work, "scripts/bootstrap/aws.sh"), "echo edited\n");
    const modified = run(repo, "1\ny\n");
    expectNothingChanged(repo, modified);
    expect(modified.out).toContain("The working tree is not clean. Commit, stash or remove these first:\n M scripts/bootstrap/aws.sh");
    expect(noAws(modified)).toEqual([]);
    git(repo, "checkout", "-q", "--", "scripts/bootstrap/aws.sh");
    writeFileSync(join(repo.work, "notes.txt"), "draft\n");
    const untracked = run(repo, "1\ny\n");
    expectNothingChanged(repo, untracked);
    expect(untracked.out).toContain("?? notes.txt");
    rmSync(join(repo.work, "notes.txt"));

    const main = git(repo, "rev-parse", "HEAD");
    writeFileSync(join(repo.work, "notes.txt"), "local\n");
    git(repo, "add", "notes.txt");
    git(repo, "commit", "-q", "-m", "local only");
    const ahead = run(repo, "1\ny\n");
    expectNothingChanged(repo, ahead);
    expect(ahead.out).toContain(`HEAD is ${git(repo, "rev-parse", "HEAD").slice(0, 12)}, but origin/main is ${main.slice(0, 12)}.`);
    expect(ahead.out).toContain("What you apply must be what the pipeline deploys from main.");
    expect(noAws(ahead)).toEqual([]);
    git(repo, "push", "-q", "origin", "main");
    git(repo, "reset", "-q", "--hard", main);
    const behind = run(repo, "1\ny\n");
    expectNothingChanged(repo, behind);
    expect(behind.out).toContain(`HEAD is ${main.slice(0, 12)}, but origin/main is `);
    expect(noAws(behind)).toEqual([]);

    // main moved on from another clone, and this clone has not fetched: the script's own fetch must show it.
    const stale = makeRepo();
    const head = git(stale, "rev-parse", "HEAD");
    const other = join(dirname(stale.work), "other");
    execFileSync("git", ["clone", "-q", stale.origin, other], { env: stale.env });
    writeFileSync(join(other, "elsewhere.txt"), "pushed from another machine\n");
    for (const args of [["add", "elsewhere.txt"], ["commit", "-q", "-m", "elsewhere"], ["push", "-q", "origin", "main"]]) {
      execFileSync("git", args, { cwd: other, env: stale.env });
    }
    const moved = execFileSync("git", ["rev-parse", "HEAD"], { cwd: other, env: stale.env, encoding: "utf8" }).trim();
    expect(git(stale, "rev-parse", "refs/remotes/origin/main")).toBe(head);
    const unfetched = run(stale, "1\ny\n");
    expectNothingChanged(stale, unfetched);
    expect(unfetched.out).toContain(`HEAD is ${head.slice(0, 12)}, but origin/main is ${moved.slice(0, 12)}.`);
    expect(noAws(unfetched)).toEqual([]);
  }, TIMEOUT);

  it("SPEC-001-R30 leaves aws.sh working on its own: it still asks, still prints the steps, and --org-state makes only the management state bucket", () => {
    const repo = makeRepo();
    const aws = (args: string[], input: string, profile: string, account: string) => {
      rmSync(join(repo.stub, "calls"), { force: true });
      const r = spawnSync("bash", ["scripts/bootstrap/aws.sh", ...args],
        { cwd: repo.work, env: { ...repo.env, AWS_PROFILE: profile, EXPECTED_ACCOUNT_ID: account }, input, encoding: "utf8", timeout: TIMEOUT });
      return { status: r.status, out: `${r.stdout}${r.stderr}`, calls: lines(join(repo.stub, "calls")) };
    };
    const no = aws([], "", "sbx", SANDBOX);
    expect(no.status).toBe(1);
    expect(no.out).toContain("Nothing changed.");
    expect(no.calls.filter((call) => / create-| put-/.test(call))).toEqual([]);

    const sandbox = aws([], "y\ny\n", "sbx", SANDBOX);
    expect(sandbox.status).toBe(0);
    expect(index(sandbox.calls, `aws sbx | s3api create-bucket --bucket ${SANDBOX_BUCKET} --bucket-namespace account-regional`)).toBeGreaterThan(-1);
    expect(index(sandbox.calls, "aws sbx | iam create-open-id-connect-provider ")).toBeGreaterThan(-1);
    expect(sandbox.out).toContain("Run these yourself, in order, or run scripts/bootstrap/aws-setup.sh, which does all of them.");
    expect(sandbox.out).toContain("(cd dist/function && TZ=UTC touch -t 198001010000 ./* && zip -X -q ../function.zip ./*)");
    expect(sandbox.out).toContain("EXPECTED_ACCOUNT_ID=<management account> scripts/bootstrap/aws.sh --org-state");

    const org = aws(["--org-state"], "y\n", "mgmt", MANAGEMENT);
    expect(org.status).toBe(0);
    expect(org.calls.filter((call) => / create-| put-/.test(call)).every((call) => call.startsWith("aws mgmt | ") && call.includes(ORG_BUCKET))).toBe(true);
    expect(org.calls.filter((call) => call.includes(" iam "))).toEqual([]);
    expect(org.out).toContain(`terraform -chdir=infra/org init -backend-config=bucket=${ORG_BUCKET}`);
    expect(aws(["--org-state", "--bedrock-form", "scripts/bootstrap/aws.sh"], "", "mgmt", MANAGEMENT).status).toBe(2);
  }, TIMEOUT);

  // config: the AWS config lines the stub kept, as "<profile> <key> <value>".
  const config = (repo: Repo) => lines(join(repo.stub, "config"));
  const unenrolled = (repo: Repo) => { for (const name of ["mfa", "keys", "config"]) rmSync(join(repo.stub, name), { force: true }); };

  it("SPEC-001-R217 gives the break-glass user a TOTP device and one access key before infra/org attaches the SCP, and never prints the seed or the secret", () => {
    const repo = makeRepo();
    unenrolled(repo);
    const r = run(repo, "1\ny\ny\n\n\n111111\n222222\ny\n");
    expect(r.status).toBe(0);
    const order = [
      `aws sbx | iam list-mfa-devices --user-name ${BG_USER} `,
      `aws sbx | iam list-access-keys --user-name ${BG_USER} `,
      `aws sbx | iam create-virtual-mfa-device --path /who-gets-the-keys/ --virtual-mfa-device-name ${BG_USER} --bootstrap-method Base32StringSeed --outfile ${repo.tmp}/aws-setup.`,
      `aws sbx | iam enable-mfa-device --user-name ${BG_USER} --serial-number ${SERIAL} --authentication-code1 111111 --authentication-code2 222222`,
      `aws sbx | iam create-access-key --user-name ${BG_USER} `,
      `aws  | configure set aws_access_key_id AKIASTUBNEWKEY --profile ${USER_PROFILE}`,
      `aws  | configure set role_arn ${BG_ROLE} --profile ${BG_PROFILE}`,
      "terraform mgmt | -chdir=infra/org plan -input=false -out=",
      "terraform mgmt | -chdir=infra/org apply -input=false ",
    ].map((start) => index(r.calls, start));
    expect(order.every((i) => i > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Every IAM call runs as the sandbox admin, and none hands AWS a password or a login profile.
    expect(r.calls.filter((call) => / iam /.test(call) && !call.startsWith("aws sbx | "))).toEqual([]);
    expect(r.calls.filter((call) => /login-profile|--password/.test(call))).toEqual([]);
    // The seed went to a file only its owner can read, inside the run's own temporary directory, and is gone.
    const seedPath = readFileSync(join(repo.stub, "seed-path"), "utf8").trim();
    expect(seedPath.startsWith(`${repo.tmp}/aws-setup.`) && seedPath.endsWith("/totp-seed")).toBe(true);
    expect(readFileSync(join(repo.stub, "seed-mode"), "utf8").trim()).toBe("-rw-------");
    expect(existsSync(seedPath)).toBe(false);
    expect(r.out).not.toContain(SEED);
    expect(r.out).not.toContain(SECRET);
    expect(r.stdout).toContain(`ykman oath accounts add --touch --issuer AWS ${BG_USER} "$(cat ${seedPath})"`);
    expect(r.stdout).toContain(`ykman oath accounts code --single ${BG_USER}`);
    expect(config(repo)).toEqual([
      `${USER_PROFILE} aws_access_key_id AKIASTUBNEWKEY`, `${USER_PROFILE} aws_secret_access_key ${SECRET}`,
      `${USER_PROFILE} region us-east-1`, `${BG_PROFILE} role_arn ${BG_ROLE}`, `${BG_PROFILE} source_profile ${USER_PROFILE}`,
      `${BG_PROFILE} mfa_serial ${SERIAL}`, `${BG_PROFILE} region us-east-1`, `${BG_PROFILE} duration_seconds 3600`,
    ]);
    expect(r.stdout).toContain(`Check break-glass once. It asks for a code from your YubiKey, and owner@example.com gets an alert email:\naws sts get-caller-identity --profile ${BG_PROFILE} --region us-east-1\n`);
    expect(r.stdout).not.toContain("Break-glass is not usable yet.");
  }, TIMEOUT);

  it("SPEC-001-R217 makes no TOTP device or access key while the SCP is attached, says how to finish, and still applies infra/org", () => {
    const repo = makeRepo();
    unenrolled(repo);
    writeFileSync(join(repo.stub, "scp"), "");
    const r = run(repo, "y\ny\n\ny\n", { TRIAGE_MODEL: PICKED });
    expect(r.status).toBe(0);
    expect(r.calls.filter((call) => /iam (create-virtual|create-access|enable-mfa|delete-)|configure set/.test(call))).toEqual([]);
    expect(r.stdout).toContain(`The SCP is attached, so only break-glass can give ${BG_USER} a TOTP device or an access key`);
    expect(r.stdout).toContain("Break-glass is not usable yet. The SCP is attached");
    expect(r.stdout).not.toContain("Check break-glass once.");
    expect(lines(join(repo.stub, "applied")).map((line) => line.split(" from ")[0])).toEqual(["applied sandbox create", "applied org create"]);
  }, TIMEOUT);

  it("SPEC-001-R217 skips the enrollment when infra/sandbox has no break-glass user yet, and still applies infra/org", () => {
    const repo = makeRepo();
    unenrolled(repo);
    const r = run(repo, "y\ny\n\ny\n", { TRIAGE_MODEL: PICKED, STUB_NO_USER: "1" });
    expect(r.status).toBe(0);
    expect(r.calls.filter((call) => /iam (create-virtual|create-access|enable-mfa|delete-)|configure set/.test(call))).toEqual([]);
    expect(r.stdout).toContain("infra/sandbox has no break-glass user yet, because its plan was not applied. Skipped.");
    expect(r.stdout).toContain("Break-glass is not usable yet.");
    expect(lines(join(repo.stub, "applied")).map((line) => line.split(" from ")[0])).toContain("applied org create");
  }, TIMEOUT);

  it("SPEC-001-R217 stops asking after three failed tries, makes no access key without a device, deletes the seed, and still attaches the SCP", () => {
    const repo = makeRepo();
    unenrolled(repo);
    // Not six digits; the same code twice; then two codes AWS refuses.
    const r = run(repo, "1\ny\ny\n\n\nabc\n111111\n111111\n333333\n444444\ny\n");
    expect(r.status).toBe(0);
    expect(r.calls.filter((call) => call.includes(" iam enable-mfa-device "))).toHaveLength(1);
    expect(r.calls.filter((call) => call.includes(" iam create-access-key "))).toEqual([]);
    expect(r.calls.filter((call) => call.includes(" configure set "))).toEqual([]);
    expect(r.stdout).toContain("That is not a code of six digits.");
    expect(r.stdout).toContain("That is not a second, different code of six digits.");
    expect(r.stdout).toContain("AWS refused those codes:");
    expect(r.stdout).toContain("Break-glass is not usable yet. who-gets-the-keys-break-glass-user has no enabled TOTP device: three tries failed.");
    expect(existsSync(readFileSync(join(repo.stub, "seed-path"), "utf8").trim())).toBe(false);
    expect(lines(join(repo.stub, "applied")).map((line) => line.split(" from ")[0])).toEqual(["applied sandbox create", "applied org create"]);
    // A rerun deletes the device that was never enabled before it makes a new one under the same name.
    const again = run(repo, "y\n\n\n111111\n222222\n", { TRIAGE_MODEL: PICKED });
    expect(again.status).toBe(0);
    const del = index(again.calls, `aws sbx | iam delete-virtual-mfa-device --serial-number ${SERIAL}`);
    expect(del).toBeGreaterThan(-1);
    expect(del).toBeLessThan(index(again.calls, "aws sbx | iam create-virtual-mfa-device "));
    expect(lines(join(repo.stub, "mfa"))).toEqual([SERIAL]);
    expect(again.stdout).toContain("Check break-glass once.");
  }, TIMEOUT);

  it("SPEC-001-R217 replaces an access key this computer does not hold only when the owner agrees", () => {
    const repo = makeRepo();
    rmSync(join(repo.stub, "config"));
    const no = run(repo, "1\ny\ny\n\nn\ny\n");
    expect(no.status).toBe(0);
    expect(no.calls.filter((call) => / iam (delete|create)-access-key /.test(call))).toEqual([]);
    expect(no.stdout).toContain(`Profile ${USER_PROFILE} does not hold ${BG_USER}'s access key AKIASTUBOLDKEY. Delete that key and make a new one? [y/N]`);
    expect(no.stdout).toContain("Break-glass is not usable yet.");
    const other = makeRepo();
    rmSync(join(other.stub, "config"));
    const yes = run(other, "1\ny\ny\n\ny\ny\n");
    expect(yes.status).toBe(0);
    const del = index(yes.calls, `aws sbx | iam delete-access-key --user-name ${BG_USER} --access-key-id AKIASTUBOLDKEY`);
    expect(del).toBeGreaterThan(-1);
    expect(del).toBeLessThan(index(yes.calls, `aws sbx | iam create-access-key --user-name ${BG_USER} `));
    expect(yes.calls.filter((call) => call.includes(" iam create-virtual-mfa-device "))).toEqual([]);
    expect(yes.out).not.toContain(SECRET);
    expect(yes.stdout).toContain("Check break-glass once.");
  }, TIMEOUT);

  it("SPEC-001-R217 refuses a BREAK_GLASS_PROFILE that is not a plain name or would overwrite another profile, before any write", () => {
    const cases: [NodeJS.ProcessEnv, string][] = [
      [{ BREAK_GLASS_PROFILE: "bad name" }, "is not a profile name"],
      [{ BREAK_GLASS_PROFILE: "-x" }, "is not a profile name"],
      [{ BREAK_GLASS_PROFILE: "a[b]" }, "is not a profile name"],
      [{ BREAK_GLASS_PROFILE: "sbx" }, "would overwrite profile"],
      [{ BREAK_GLASS_PROFILE: "mgmt" }, "would overwrite profile"],
      [{ BREAK_GLASS_PROFILE: "sb", SANDBOX_PROFILE: "sb-user" }, "would overwrite profile"],
    ];
    for (const [extra, said] of cases) {
      const repo = makeRepo();
      const r = run(repo, "1\ny\n", extra);
      expectNothingChanged(repo, r);
      expect(r.calls).toEqual([]);
      expect(r.out).toContain(said);
    }
  }, TIMEOUT);

  it("SPEC-001-R30 aws-setup.sh is executable, parses, and keeps to bash 3.2 so it runs on macOS as well as Linux", () => {
    expect(statSync(script).mode & 0o111).not.toBe(0);
    expect(spawnSync("bash", ["-n", script]).status).toBe(0);
    expect(spawnSync("bash", [script, "--help"], { encoding: "utf8" }).stdout).toContain("usage: SANDBOX_ACCOUNT_ID=");
    const text = readFileSync(script, "utf8");
    expect(text.startsWith("#!/usr/bin/env bash\n")).toBe(true);
    expect(text).toContain("\nset -euo pipefail\n");
    // Comment lines may name what the script avoids; only the code is scanned.
    const code = text.split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");
    const bash4 = [/\bmapfile\b/, /\breadarray\b/, /\b(?:declare|local|typeset) -[a-zA-Z]*[An]/, /\$\{[^}]*(?:,,|\^\^)\}/, /\$\{[A-Za-z_][A-Za-z_0-9]*[,^]\}/,
      /\bcoproc\b/, /\|&/, /&>>/, /;;&/, /\bwait -n\b/, /\$\{[^}]*@[QEPAaKUuL]\}/, /\bEPOCH(?:SECONDS|REALTIME)\b/];
    for (const feature of bash4) expect([String(feature), feature.test(code)]).toEqual([String(feature), false]);
    expect(code).not.toMatch(/^\s*(?:eval|source|\.)\s/m);
  });
});

// github.sh --vars on its own, as the owner runs it after the role ARN batch lands: the stub gh above, and a terraform
// that prints the outputs in STUB_OUTPUTS.
describe("SPEC-001-R86 github.sh --vars sets the four role ARNs as secrets, then deletes only their variables", () => {
  let scratch = "";
  beforeAll(() => { scratch = mkdtempSync(join(tmpdir(), "github-vars-")); });
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));
  const ROLE = "arn:aws:iam::111111111111:role/who-gets-the-keys/who-gets-the-keys";
  const ALL = { deploy_role_arn: `${ROLE}-deploy`, triage_role_arn: `${ROLE}-triage-bedrock`, probe_role_arn: `${ROLE}-scenario-probe`, producer_role_arn: `${ROLE}-producer-bedrock`, producer_inference_profile: "us.anthropic.claude-example-p" };

  function vars(outputs: Record<string, string>, variables: string): { status: number | null; out: string; writes: string[] } {
    const dir = mkdtempSync(join(scratch, "run-"));
    const stub = join(dir, "stub");
    mkdirSync(stub);
    writeFileSync(join(stub, "gh"), stubGh);
    writeFileSync(join(stub, "terraform"), ["#!/usr/bin/env bash", log, 'cat "$STUB_OUTPUTS"', ""].join("\n"));
    for (const name of ["gh", "terraform"]) chmodSync(join(stub, name), 0o755);
    writeFileSync(join(dir, "outputs.json"), JSON.stringify(Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k, { value: v }]))));
    writeFileSync(join(dir, "variables"), variables);
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) if (!/^(AWS_|GH_|GITHUB_|TRIAGE_MODEL$)/.test(key)) env[key] = value;
    Object.assign(env, { PATH: `${stub}:${process.env["PATH"] ?? ""}`, STUB_DIR: stub, REPO: "o/r", TRIAGE_MODEL: PICKED, STUB_OUTPUTS: join(dir, "outputs.json"), STUB_VARIABLES: join(dir, "variables"), GH_CONFIG_DIR: dir });
    const r = spawnSync("bash", [join(process.cwd(), "scripts/bootstrap/github.sh"), "--vars"], { cwd: dir, env, input: "y\ny\n", encoding: "utf8", timeout: TIMEOUT });
    const calls = existsSync(join(stub, "calls")) ? readFileSync(join(stub, "calls"), "utf8").split("\n").filter(Boolean) : [];
    return { status: r.status, out: `${r.stdout}${r.stderr}`, writes: calls.filter((c) => / (secret|variable) (set|delete) /.test(c)) };
  }

  it("SPEC-001-R86 sets the four secrets and two model variables, and deletes no variable when none holds a role ARN", { timeout: TIMEOUT }, () => {
    const r = vars(ALL, "TRIAGE_MODEL\nPRODUCER_MODEL\n");
    expect(r.status).toBe(0);
    expect(r.writes.map((c) => c.split(" | ")[1])).toEqual([
      `secret set DEPLOY_ROLE_ARN --repo o/r --body ${ROLE}-deploy`, `secret set TRIAGE_ROLE_ARN --repo o/r --body ${ROLE}-triage-bedrock`,
      `secret set PROBE_ROLE_ARN --repo o/r --body ${ROLE}-scenario-probe`, `secret set PRODUCER_ROLE_ARN --repo o/r --body ${ROLE}-producer-bedrock`,
      `variable set TRIAGE_MODEL --repo o/r --body ${PICKED}`, "variable set PRODUCER_MODEL --repo o/r --body us.anthropic.claude-example-p",
    ]);
  });

  it.each(Object.keys(ALL))("SPEC-001-R86 sets and deletes nothing when the output %s is missing", { timeout: TIMEOUT }, (missing) => {
    const r = vars(Object.fromEntries(Object.entries(ALL).filter(([k]) => k !== missing)), "DEPLOY_ROLE_ARN\n");
    expect(r.status).toBe(1);
    expect(r.out).toContain("Apply infra/sandbox first. Nothing set.");
    expect(r.writes).toEqual([]);
  });
});
