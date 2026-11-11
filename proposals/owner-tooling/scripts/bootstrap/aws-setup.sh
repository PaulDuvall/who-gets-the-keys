#!/usr/bin/env bash
# The whole AWS setup as one command: the sandbox member account, its break-glass alert, the SCP from the management
# account, then the repository secrets and variables. Checks that change nothing in AWS or GitHub come first, then one
# confirm.
# Step 5 of 7 also enrolls the break-glass user, while the SCP is not attached (SPEC-001-R217).
# It pauses again only to review each Terraform plan and to remind you to confirm the alert email.
# The sandbox must be a member account: SCPs do not affect the management account, so B11 needs one (SPEC-001-R30).
# Runs on macOS's bash 3.2 and on Linux: no mapfile, no associative arrays, no case-changing expansions.
set -euo pipefail

region="us-east-1"
repo="${REPO:-PaulDuvall/who-gets-the-keys}"
scp_name="who-gets-the-keys-sandbox-writes"
default_break_glass_profile="who-gets-the-keys-break-glass"

usage() {
  echo "usage: SANDBOX_ACCOUNT_ID=<12 digits> SANDBOX_PROFILE=<profile> MANAGEMENT_PROFILE=<profile> \\"
  echo "       ALERT_EMAIL=<address> [TRIAGE_MODEL=<model ID>] [BEDROCK_FORM=<form.json>] \\"
  echo "       [BREAK_GLASS_PROFILE=<profile>] scripts/bootstrap/aws-setup.sh"
  echo "  SANDBOX_PROFILE     admin profile for the sandbox account, a member of your AWS Organization"
  echo "  MANAGEMENT_PROFILE  admin profile for the organization's management account, where the SCP is applied"
  echo "  ALERT_EMAIL         gets an email each time someone assumes the break-glass role"
  echo "  TRIAGE_MODEL        Bedrock model for issue triage, starting us.anthropic. or anthropic."
  echo "                      Unset, you pick from the us.anthropic. inference profiles Bedrock lists in ${region}"
  echo "  BEDROCK_FORM        Anthropic first-time-use form for Bedrock, submitted with scripts/bootstrap/aws.sh"
  echo "  BREAK_GLASS_PROFILE CLI profile this writes for assuming break-glass with MFA. Default ${default_break_glass_profile};"
  echo "                      the break-glass user's access key goes in profile <BREAK_GLASS_PROFILE>-user"
  echo "  First it checks the tools, the working tree, both accounts, the organization and Bedrock, changing nothing."
  echo "  After one confirm it runs scripts/bootstrap/aws.sh in the sandbox account, builds the Lambda artifact,"
  echo "  plans infra/sandbox, shows the plan and applies that saved plan once you agree. Then it subscribes"
  echo "  ALERT_EMAIL to the break-glass topic. While the SCP is not attached, it gives the break-glass user the TOTP"
  echo "  device you add to your YubiKey and one access key, and writes the two break-glass CLI profiles. Then it"
  echo "  creates infra/org's state bucket in the management account, plans, shows and applies infra/org the same"
  echo "  way, and runs scripts/bootstrap/github.sh --vars."
  echo "  A rerun skips what exists. It never runs terraform destroy."
}

say() { printf '%s\n' "$@"; }
# first_line <lines...>: the first non-empty argument, for the summary's result.
first_line() {
  local line
  for line in "$@"; do
    [ -z "$line" ] || { printf '%s' "$line"; return 0; }
  done
}
fail() { summary_result="stopped: $(first_line "$@")"; printf '%s\n' "$@" >&2; exit 1; }
# refuse: a failed check before the confirm, so nothing has changed.
refuse() { summary_result="refused, nothing changed: $(first_line "$@")"; printf '%s\n' "$@" "Nothing changed." >&2; exit 1; }

# The summary's lines, set as the run goes and printed when it ends (SPEC-001-R225).
summary_result=""
summary_head=""
summary_sandbox="not reached"
summary_alert="not reached"
summary_break_glass="not reached"
summary_org="not reached"
summary_github="not reached"
plan_result=""
lowercase() { printf '%s' "$1" | tr 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' 'abcdefghijklmnopqrstuvwxyz'; }
# shown: copies its input with control characters made visible, for text that AWS or a tool returns.
shown() { cat -v; }

# ask "<question>": prints the question, reads one line, and succeeds only on a yes. End of input counts as no.
ask() {
  local answer=""
  printf '%s [y/N] ' "$1"
  IFS= read -r answer || answer=""
  [ -t 0 ] || printf '\n'
  case "$answer" in
    y|Y|yes|Yes|YES) return 0 ;;
  esac
  return 1
}

# ask_word <word> "<question>": succeeds only when the answer is exactly <word>.
ask_word() {
  local answer=""
  printf '%s ' "$2"
  IFS= read -r answer || answer=""
  [ -t 0 ] || printf '\n'
  [ "$answer" = "$1" ]
}

# pause "<message>": waits for Enter. End of input goes on too.
pause() {
  local answer=""
  printf '%s ' "$1"
  IFS= read -r answer || answer=""
  [ -t 0 ] || printf '\n'
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  "") [ $# -eq 0 ] || { usage >&2; exit 2; } ;;
  *) usage >&2; exit 2 ;;
esac

sandbox_id="${SANDBOX_ACCOUNT_ID:-}"
sandbox_profile="${SANDBOX_PROFILE:-}"
management_profile="${MANAGEMENT_PROFILE:-}"
email="${ALERT_EMAIL:-}"
model="${TRIAGE_MODEL:-}"
form="${BEDROCK_FORM:-}"
bg_profile="${BREAK_GLASS_PROFILE:-$default_break_glass_profile}"
bg_user_profile="${bg_profile}-user"
if [ -z "$sandbox_id" ] || [ -z "$sandbox_profile" ] || [ -z "$management_profile" ] || [ -z "$email" ]; then
  usage >&2
  exit 2
fi

# Each AWS call names its profile, so none can use an ambient one by mistake.
unset AWS_PROFILE AWS_DEFAULT_PROFILE
export AWS_PAGER="" AWS_REGION="$region" AWS_DEFAULT_REGION="$region"
sandbox() { env AWS_PROFILE="$sandbox_profile" "$@"; }
management() { env AWS_PROFILE="$management_profile" "$@"; }

started=""
# chosen: set when the owner said no to a plan, so the run stopped by choice and not on a problem.
chosen=""
work="$(mktemp -d "${TMPDIR:-/tmp}/aws-setup.XXXXXX")"
# print_summary: at most 10 lines for the owner to paste to the agent, also copied to the clipboard on macOS
# (SPEC-001-R225). It names no AWS account: twelve digits that stand alone, as in an ARN, are replaced.
print_summary() {
  {
    say "--- aws-setup.sh summary: paste this to the agent ---" "result: ${summary_result:-ended}"
    # Ten characters of a SHA can never be twelve digits, which the next step would take for an account ID.
    [ -z "$summary_head" ] || say "commit: ${summary_head}"
    say "infra/sandbox: ${summary_sandbox}" "alert email: ${summary_alert}" "break-glass: ${summary_break_glass}" \
      "infra/org: ${summary_org}" "GitHub secrets and variables: ${summary_github}" "---"
  } | tr -d '\000-\010\013-\037\177' | sed -E 's/(^|[^0-9A-Za-z])[0-9]{12}([^0-9A-Za-z]|$)/\1<account>\2/g' |
    cut -c1-200 > "$work/summary"
  say ""
  cat "$work/summary"
  if [ "$(uname -s 2>/dev/null || true)" = Darwin ] && command -v pbcopy >/dev/null 2>&1; then
    pbcopy < "$work/summary" 2>/dev/null && say "(copied to the clipboard)" || true
  fi
}

cleanup() {
  local status=$?
  case "$status" in
    0) [ -n "$summary_result" ] || summary_result="done" ;;
    130|143) summary_result="interrupted" ;;
  esac
  print_summary || true
  rm -rf "$work"
  if [ "$status" -ne 0 ] && [ -n "$chosen" ]; then
    printf '%s\n' "" "Stopped, as you chose. The steps that finished stay done. To go on, run this again:" \
      "a rerun skips what exists." >&2
  elif [ "$status" -ne 0 ] && [ -n "$started" ]; then
    printf '%s\n' "" "Stopped. The steps that finished stay done. Fix the problem above, then run this again:" \
      "a rerun skips what exists." >&2
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# last_error: the last line an AWS or tool call wrote to standard error.
last_error() { tail -n 1 "$work/err" 2>/dev/null | shown; }

# ---------- Checks. Nothing below changes AWS or GitHub until the confirm. ----------

say "Checking inputs."
printf '%s\n' "$sandbox_id" | grep -Eq '^[0-9]{12}$' || refuse "SANDBOX_ACCOUNT_ID must be the sandbox account's 12-digit ID."
case "$email" in
  *[[:space:]]*|*@*@*|@*|*@|*@.*|*.) refuse "ALERT_EMAIL ${email} is not an email address." ;;
  *@*.*) ;;
  *) refuse "ALERT_EMAIL ${email} is not an email address." ;;
esac
# issue-triage.yml splices TRIAGE_MODEL into the triage agent's arguments, so it may hold only model ID characters.
# Listing them avoids locale-dependent ranges.
model_chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.:-"
case "$model" in
  *[!$model_chars]*)
    refuse "TRIAGE_MODEL $(printf '%s' "$model" | shown) holds a character that no Bedrock model ID has." \
      "Model IDs use only letters, digits, dot, colon and hyphen." ;;
  ""|us.anthropic.*|anthropic.*) ;;
  *) refuse "TRIAGE_MODEL ${model} starts with neither us.anthropic. nor anthropic." \
       "The triage role may invoke only foundation-model/anthropic.* and inference-profile/us.anthropic.* in ${region}." \
       "Unset TRIAGE_MODEL to pick from the inference profiles Bedrock lists." ;;
esac
# The profile names go into ~/.aws/config and ~/.aws/credentials section headers, so they may hold only these.
profile_chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-"
case "$bg_profile" in
  ""|-*|*[!$profile_chars]*)
    refuse "BREAK_GLASS_PROFILE $(printf '%s' "$bg_profile" | shown) is not a profile name: use letters, digits, dot, underscore and hyphen." ;;
esac
if [ "$bg_profile" = "$sandbox_profile" ] || [ "$bg_profile" = "$management_profile" ] ||
  [ "$bg_user_profile" = "$sandbox_profile" ] || [ "$bg_user_profile" = "$management_profile" ]; then
  refuse "BREAK_GLASS_PROFILE ${bg_profile} would overwrite profile ${sandbox_profile} or ${management_profile}. Choose another name."
fi
if [ -n "$form" ]; then
  [ -f "$form" ] || refuse "BEDROCK_FORM ${form} is not a file."
  # aws.sh runs from the repository root, so a path relative to here becomes absolute.
  form="$(CDPATH='' cd -- "$(dirname -- "$form")" && pwd)/$(basename -- "$form")"
fi
if [ -n "${AWS_ACCESS_KEY_ID:-}${AWS_SECRET_ACCESS_KEY:-}${AWS_SESSION_TOKEN:-}" ]; then
  refuse "AWS credentials are set in the environment, and they override a profile's, so both profiles would act as one." \
    "Unset AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN, then run this again."
fi
# Terraform reads these on its own. They would make the plan differ from the one the pipeline makes from main.
tf_env="$(compgen -e | grep -E '^(TF_VAR_.+|TF_WORKSPACE|TF_CLI_ARGS|TF_CLI_ARGS_.+)$' || true)"
[ -z "$tf_env" ] || refuse "These environment variables change what Terraform plans, so the plan would differ from the pipeline's:" \
  "$tf_env" "Unset them, then run this again."

say "Checking tools."
need() { command -v "$1" >/dev/null 2>&1 || refuse "This needs $1. $2"; }
need aws "Install AWS CLI version 2."
need terraform "Install Terraform 1.11 or later."
need node "Install Node.js 24.11 or later, as package.json engines says."
need npm "It comes with Node.js."
need zip "Install zip."
need openssl "Install OpenSSL."
need jq "Install jq."
need gh "Install the GitHub CLI and sign in with gh auth login."
need git "Install git."
skeleton="$(aws s3api create-bucket --generate-cli-skeleton input 2>/dev/null || true)"
case "$skeleton" in
  *'"BucketNamespace"'*) ;;
  *) refuse "This AWS CLI's s3api create-bucket has no --bucket-namespace option. Update AWS CLI version 2." ;;
esac
tf_version="$(terraform version -json 2>/dev/null | jq -r '.terraform_version // empty' 2>/dev/null || true)"
tf_major="${tf_version%%.*}"
tf_minor="${tf_version#*.}"
tf_minor="${tf_minor%%.*}"
case "${tf_major}:${tf_minor}" in
  *[!0123456789:]*|:*|*:) refuse "Cannot read the Terraform version. This needs Terraform 1.11 or later." ;;
esac
if [ "$tf_major" -lt 1 ] || { [ "$tf_major" -eq 1 ] && [ "$tf_minor" -lt 11 ]; }; then
  refuse "This needs Terraform 1.11 or later, for the S3 backend's use_lockfile. This is ${tf_version}."
fi
node_version="$(node --version 2>/dev/null || true)"
node_minor="${node_version#v24.}"
node_minor="${node_minor%%.*}"
case "$node_version" in
  v24.*) ;;
  *) refuse "This needs Node.js 24, as package.json engines says. This is ${node_version:-unknown}." ;;
esac
case "$node_minor" in
  ""|*[!0123456789]*) refuse "Cannot read the Node.js version ${node_version}. This needs 24.11 or later." ;;
esac
[ "$node_minor" -ge 11 ] || refuse "This needs Node.js 24.11 or later, as package.json engines says. This is ${node_version}."
gh auth status >/dev/null 2>&1 || refuse "gh is not signed in. Run gh auth login, then run this again."

say "Checking the working tree."
top="$(git rev-parse --show-toplevel 2>/dev/null)" || refuse "Run this inside the repository."
cd "$top"
dirty="$(git status --porcelain)"
[ -z "$dirty" ] || refuse "The working tree is not clean. Commit, stash or remove these first:" "$dirty"
# git status omits ignored files. .gitignore ignores *.tfvars and *.tfvars.json, which Terraform can load on its own.
tfvars="$(git ls-files --others --ignored --exclude-standard -- infra/sandbox infra/org |
  grep -E '^infra/(sandbox|org)/[^/]*\.tfvars(\.json)?$' | shown || true)"
[ -z "$tfvars" ] || refuse "Terraform would load these ignored variable files, so the plan would differ from the pipeline's:" \
  "$tfvars" "Move them out of the repository, then run this again."
git fetch -q origin 2>"$work/err" || refuse "git fetch origin failed: $(last_error)"
head="$(git rev-parse HEAD)"
summary_head="${head:0:10}"
main="$(git rev-parse -q --verify refs/remotes/origin/main || true)"
[ "$head" = "$main" ] || refuse "HEAD is ${head:0:12}, but origin/main is ${main:0:12}." \
  "What you apply must be what the pipeline deploys from main. Check out main and pull it, then run this again."

say "Checking both accounts."
# identity <profile function>: prints "<account> <ARN>" for that profile's credentials.
identity() { "$1" aws sts get-caller-identity --query '[Account,Arn]' --output text 2>"$work/err"; }
# sign_in_hint <profile>: a role profile takes its credentials from its source_profile, so that is the profile to sign
# in to; aws sso login on the role profile itself fails (lesson L28, SPEC-001-R224).
sign_in_hint() {
  local source
  source="$(aws configure get source_profile --profile "$1" 2>/dev/null || true)"
  if [ -n "$source" ] && [ "$source" != "$1" ]; then
    printf '%s\n' "Profile $1 takes its credentials from profile ${source}. Sign in to that one, then run this again:" \
      "aws sso login --profile ${source}"
  else
    printf '%s\n' "Sign in to it, then run this again:" "aws sso login --profile $1"
  fi
}
sandbox_identity="$(identity sandbox)" || refuse "Profile ${sandbox_profile} has no working credentials: $(last_error)" \
  "$(sign_in_hint "$sandbox_profile")"
read -r sandbox_actual sandbox_arn <<EOF
$sandbox_identity
EOF
management_identity="$(identity management)" || refuse "Profile ${management_profile} has no working credentials: $(last_error)" \
  "$(sign_in_hint "$management_profile")"
read -r management_id management_arn <<EOF
$management_identity
EOF
[ "$sandbox_actual" = "$sandbox_id" ] || refuse "Profile ${sandbox_profile} is for account ${sandbox_actual}, not SANDBOX_ACCOUNT_ID ${sandbox_id}."
if [ "$sandbox_id" = "$management_id" ]; then
  refuse "Account ${sandbox_id} is both the sandbox and the management account." \
    "SCPs do not affect users or roles in the management account, so B11's SCP denial could not hold (SPEC-001-R30)." \
    "Use a member account of your organization for the sandbox."
fi

org="$(management aws organizations describe-organization --query 'Organization.[Id,MasterAccountId]' --output text 2>"$work/err")" ||
  refuse "Profile ${management_profile} cannot read its organization: $(last_error)" \
    "MANAGEMENT_PROFILE must be an admin profile for your organization's management account."
read -r org_id org_management <<EOF
$org
EOF
[ "$org_management" = "$management_id" ] || refuse "Account ${management_id} is not the management account of ${org_id}; ${org_management} is." \
  "Set MANAGEMENT_PROFILE to a profile for account ${org_management}."
sandbox_state="$(management aws organizations describe-account --account-id "$sandbox_id" --query Account.State --output text 2>"$work/err")" ||
  refuse "Account ${sandbox_id} is not a member of organization ${org_id}: $(last_error)" \
    "Invite it to the organization, or create the sandbox account in it, then run this again."
[ "$sandbox_state" = ACTIVE ] || refuse "Account ${sandbox_id} is ${sandbox_state} in ${org_id}, not ACTIVE."
roots="$(management aws organizations list-roots \
  --query "Roots[0].[Id, PolicyTypes[?Type=='SERVICE_CONTROL_POLICY'].Status | [0]]" --output text 2>"$work/err")" ||
  refuse "Cannot list the roots of ${org_id}: $(last_error)"
read -r root_id scp_status <<EOF
$roots
EOF
if [ "$scp_status" != ENABLED ]; then
  refuse "Service control policies are not enabled on root ${root_id} of ${org_id} (status: ${scp_status:-none})." \
    "Enable them, then run this again:" \
    "aws organizations enable-policy-type --root-id ${root_id} --policy-type SERVICE_CONTROL_POLICY --profile ${management_profile}"
fi
attached="$(management aws organizations list-policies-for-target --target-id "$sandbox_id" --filter SERVICE_CONTROL_POLICY \
  --query "Policies[?Name=='${scp_name}'].Id" --output text 2>"$work/err")" ||
  refuse "Cannot list the SCPs attached to account ${sandbox_id}: $(last_error)"
case "$attached" in None) attached="" ;; esac

say "Checking Bedrock in ${region}."
sandbox aws bedrock list-inference-profiles --region "$region" --type-equals SYSTEM_DEFINED \
  --query "inferenceProfileSummaries[?starts_with(inferenceProfileId, 'us.anthropic.') && status=='ACTIVE'].inferenceProfileId" \
  --output text > "$work/listed" 2>"$work/err" || refuse "Cannot list Bedrock inference profiles in ${region}: $(last_error)"
tr '\t' '\n' < "$work/listed" | sed -n '/^us\.anthropic\.[A-Za-z0-9.:-]*$/p' | sort -u > "$work/profiles"
count="$(wc -l < "$work/profiles" | tr -d ' ')"
[ "$count" -gt 0 ] || refuse "Bedrock lists no active inference profile starting us.anthropic. in ${region} for account ${sandbox_id}." \
  "Check that Amazon Bedrock is available to that account in ${region}."
case "$model" in
  us.anthropic.*)
    grep -qxF -- "$model" "$work/profiles" ||
      refuse "TRIAGE_MODEL ${model} is not an active inference profile in ${region} for account ${sandbox_id}." ;;
  "")
    say "" "Bedrock's Anthropic inference profiles in ${region}, for the triage model:"
    n=0
    while IFS= read -r id; do
      n=$((n + 1))
      say "  ${n}. ${id}"
    done < "$work/profiles"
    printf 'Pick one, 1 to %s: ' "$count"
    IFS= read -r pick || pick=""
    [ -t 0 ] || printf '\n'
    case "$pick" in
      ""|*[!0123456789]*) refuse "${pick:-Nothing} is not a number from 1 to ${count}." ;;
    esac
    { [ "$pick" -ge 1 ] && [ "$pick" -le "$count" ]; } || refuse "${pick} is not a number from 1 to ${count}."
    model="$(sed -n "$((10#$pick))p" "$work/profiles")"
    ;;
esac

# What already exists, so the summary can say exactly what changes.
sandbox_bucket="who-gets-the-keys-tfstate-${sandbox_id}-${region}-an"
org_bucket="who-gets-the-keys-orgstate-${management_id}-${region}-an"
bucket_plan() {
  if "$1" aws s3api head-bucket --bucket "$2" --expected-bucket-owner "$3" >/dev/null 2>&1; then
    printf 'exists; versioning, encryption, public access block and TLS-only policy are re-applied'
  else
    printf 'is created, with versioning, SSE-S3 and a bucket key, all public access blocked and a TLS-only policy'
  fi
}
sandbox_bucket_plan="$(bucket_plan sandbox "$sandbox_bucket" "$sandbox_id")"
org_bucket_plan="$(bucket_plan management "$org_bucket" "$management_id")"
provider_arn="arn:aws:iam::${sandbox_id}:oidc-provider/token.actions.githubusercontent.com"
if clients="$(sandbox aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$provider_arn" \
    --query ClientIDList --output text 2>/dev/null)"; then
  case " ${clients} " in
    *[[:space:]]sts.amazonaws.com[[:space:]]*) oidc_plan="exists with client ID sts.amazonaws.com; no change" ;;
    *) oidc_plan="exists; client ID sts.amazonaws.com is added. Other repositories using it are not affected" ;;
  esac
else
  oidc_plan="is created, with client ID sts.amazonaws.com"
fi

say "" "Checks passed. Nothing has changed yet." "" \
  "Sandbox account ${sandbox_id}, profile ${sandbox_profile}, as ${sandbox_arn}, a member of ${org_id}:" \
  "  state bucket ${sandbox_bucket} ${sandbox_bucket_plan}" \
  "  GitHub OIDC provider ${oidc_plan}"
[ -z "$form" ] || say "  the Anthropic first-time-use form ${form} is submitted to Bedrock"
say "  infra/sandbox is planned with the Lambda artifact built here at ${head:0:12}; you review the plan before it applies" \
  "  ${email} is subscribed to break-glass alerts, unless it already has a subscription" \
  "  the break-glass user gets a TOTP device and one access key if it lacks them, while the SCP is not attached;" \
  "  you add the device to your YubiKey. Profiles ${bg_profile} and ${bg_user_profile} are written to your AWS config" \
  "Management account ${management_id}, profile ${management_profile}, as ${management_arn}:" \
  "  state bucket ${org_bucket} ${org_bucket_plan}" \
  "  infra/org is planned: SCP ${scp_name} attached to ${sandbox_id}; you review the plan before it applies"
if [ -n "$attached" ]; then
  say "  The SCP is already attached (${attached}), so profile ${sandbox_profile} cannot write the export Lambda," \
    "  its table, its log group or the who-gets-the-keys roles. A sandbox plan that changes them fails at apply."
fi
say "GitHub ${repo}, through scripts/bootstrap/github.sh --vars:" \
  "  repository settings, environments sandbox, probe and producer, ruleset \"protect main\", the secrets" \
  "  DEPLOY_ROLE_ARN, TRIAGE_ROLE_ARN, PROBE_ROLE_ARN and PRODUCER_ROLE_ARN and the variable PRODUCER_MODEL from" \
  "  infra/sandbox, the variable TRIAGE_MODEL=${model}, and deleting any variable of a role ARN's name" \
  "Here: npm ci --ignore-scripts and npm run build replace node_modules/ and dist/." ""
ask "Go ahead?" || refuse "You chose not to go ahead."
started="yes"

# ---------- Changes ----------

# init_backend <profile function> <dir> <bucket>: points <dir> at that account's state bucket. -reconfigure never copies
# state from a backend this checkout used before, such as another account's.
init_backend() {
  if ! "$1" terraform -chdir="$2" init -input=false -reconfigure -lockfile=readonly -backend-config="bucket=$3" \
      </dev/null >"$work/init.log" 2>&1; then
    shown < "$work/init.log"
    fail "terraform init failed in $2."
  fi
}

# plan_and_apply <profile function> <account> <dir> <plan file> [plan options]: plans to a file, shows that file,
# and applies exactly that file once the owner agrees. A plan that deletes or replaces anything needs a typed word.
plan_and_apply() {
  local who="$1" account="$2" dir="$3" plan="$4" changed deletes
  shift 4
  say "Planning ${dir}."
  if ! "$who" terraform -chdir="$dir" plan -input=false -out="$plan" "$@" </dev/null >"$work/plan.log" 2>&1; then
    shown < "$work/plan.log"
    fail "terraform plan failed in ${dir}. Nothing in it was applied."
  fi
  "$who" terraform -chdir="$dir" show "$plan" </dev/null
  "$who" terraform -chdir="$dir" show -json "$plan" </dev/null > "$work/plan.json"
  changed="$(jq '[.resource_changes[]? | select(.change.actions != ["no-op"] and .change.actions != ["read"])] | length' "$work/plan.json")"
  changed=$((changed + $(jq '[(.output_changes // {}) | to_entries[] | select(.value.actions != ["no-op"])] | length' "$work/plan.json")))
  if [ "$changed" -eq 0 ]; then
    plan_result="no changes"
    say "No changes in ${dir}, so nothing to apply."
    return 0
  fi
  deletes="$(jq -r '.resource_changes[]? | select(.change.actions | any(. == "delete")) | "  \(.address): \(.change.actions | join(" then "))"' "$work/plan.json" | shown)"
  say ""
  if [ -n "$deletes" ]; then
    say "WARNING: THIS PLAN DELETES OR REPLACES RESOURCES IN ACCOUNT ${account}:" "$deletes" \
      "A deleted resource loses its data. A replaced one also gets a new ID." ""
    if ! ask_word delete "Type delete to apply this plan, which deletes or replaces them, or anything else to stop:"; then
      plan_result="not applied, by your choice; skipped"
      declined "$dir" "Not applied: you did not type delete. Nothing in this plan changed."
      return 0
    fi
  elif ! ask "Apply this plan to account ${account}?"; then
    plan_result="not applied, by your choice; skipped"
    declined "$dir" "Not applied. Nothing in this plan changed."
    return 0
  fi
  plan_result="apply failed"
  "$who" terraform -chdir="$dir" apply -input=false "$plan" </dev/null
  plan_result="applied ${changed} change(s)"
}

# declined <dir> "<message>": the owner did not agree to a plan, so the run stops. Once the SCP is attached, the owner
# may instead skip infra/sandbox and go on, since the SCP refuses some of its changes here.
declined() {
  printf '%s\n' "$2" >&2
  if [ "$1" = infra/sandbox ] && [ -n "$attached" ] &&
    ask "Skip infra/sandbox and go on to the alert, infra/org and the repository secrets and variables?"; then
    say "Skipped infra/sandbox. The pipeline's deploy job, or break-glass, applies its changes."
    return 0
  fi
  chosen="yes"
  exit 1
}

say "" "Step 1 of 7: build the Lambda artifact at ${head:0:12}, as pipeline.yml's build job does."
rm -rf dist
npm ci --ignore-scripts </dev/null
npm run build </dev/null
# One command per line, as in pipeline.yml: set -e does not stop at a failure inside an && list.
ls dist/src/*.js >/dev/null 2>&1 || fail "npm run build wrote no dist/src/*.js, so there is no Lambda artifact to plan."
mkdir -p dist/function
cp dist/src/*.js dist/function/
echo '{"type":"module"}' > dist/function/package.json
(cd dist/function && TZ=UTC touch -t 198001010000 ./* && zip -X -q ../function.zip ./*)
artifact_sha256="$(openssl dgst -sha256 -binary dist/function.zip | base64)"
say "Built dist/function.zip."

say "" "Step 2 of 7: sandbox account ${sandbox_id}: state bucket and GitHub OIDC provider, by scripts/bootstrap/aws.sh."
if [ -n "$form" ]; then
  sandbox EXPECTED_ACCOUNT_ID="$sandbox_id" bash scripts/bootstrap/aws.sh --yes --bedrock-form "$form" </dev/null
else
  sandbox EXPECTED_ACCOUNT_ID="$sandbox_id" bash scripts/bootstrap/aws.sh --yes </dev/null
fi

say "" "Step 3 of 7: sandbox account ${sandbox_id}: infra/sandbox."
init_backend sandbox infra/sandbox "$sandbox_bucket"
if [ -n "$attached" ]; then
  say "The SCP is attached, so a change to the export Lambda, its table, its log group or the roles fails at apply." \
    "Make those through the pipeline, or as who-gets-the-keys-break-glass (scripts/bootstrap/aws.sh, step 4)." \
    "If this plan changes them, answer no, then skip infra/sandbox to go on to the later steps."
fi
summary_sandbox="plan failed"
plan_and_apply sandbox "$sandbox_id" infra/sandbox "$work/sandbox.tfplan" -var "artifact_sha256=${artifact_sha256}"
summary_sandbox="$plan_result"

say "" "Step 4 of 7: break-glass alerts to ${email}."
topic="$(sandbox terraform -chdir=infra/sandbox output -raw break_glass_topic_arn </dev/null)"
sandbox aws sns list-subscriptions-by-topic --region "$region" --topic-arn "$topic" \
  --query "Subscriptions[?Protocol=='email'].[Endpoint,SubscriptionArn]" --output text > "$work/subscriptions"
tab="$(printf '\t')"
subscription=""
stale=""
# Only a subscription ARN means confirmed. Any other value, such as Deleted after an unsubscribe, delivers nothing,
# so it counts as no subscription and the address is subscribed again.
while IFS="$tab" read -r endpoint arn; do
  [ "$(lowercase "$endpoint")" = "$(lowercase "$email")" ] || continue
  case "$arn" in
    arn:aws:sns:*) subscription="confirmed" ;;
    PendingConfirmation) [ "$subscription" = confirmed ] || subscription="pending" ;;
    *) stale="$arn" ;;
  esac
done < "$work/subscriptions"
email_reminder=""
case "$subscription" in
  confirmed) summary_alert="confirmed"; say "${email} already has a confirmed subscription to ${topic}. Skipped." ;;
  pending)
    summary_alert="waiting for you to confirm the email"
    email_reminder="yes"
    say "${email} already has a subscription to ${topic}, still waiting for confirmation." \
      "SNS deletes an unconfirmed subscription after 48 hours. If you cannot find the email, run this again after then."
    pause "Click Confirm subscription in the email from AWS Notifications, then press Enter."
    ;;
  *)
    [ -z "$stale" ] || say "${email}'s subscription to ${topic} shows $(printf '%s' "$stale" | shown), so it gets no alerts."
    sandbox aws sns subscribe --region "$region" --topic-arn "$topic" --protocol email --notification-endpoint "$email" \
      --query SubscriptionArn --output text >/dev/null
    email_reminder="yes"
    summary_alert="subscribed; waiting for you to confirm the email"
    say "Subscribed ${email} to ${topic}. AWS has sent it a confirmation email." \
      "Confirm within 48 hours, or SNS deletes the subscription and break-glass alerts reach no one."
    pause "Click Confirm subscription in the email from AWS Notifications, then press Enter."
    ;;
esac

# ---------- Step 5: the break-glass user (SPEC-001-R217) ----------
# The SCP lets only break-glass give that user an MFA device or an access key, and break-glass needs both, so this
# step can make them only while the SCP is not attached: on a first setup, or after you lift it. A failure here leaves
# break-glass unusable but never stops the run, so the next step still attaches the SCP.

bg_status=""
mfa_path="/who-gets-the-keys/"

# bg_read <command...>: runs a sandbox read and prints its text output, with AWS's "None" for an empty list as nothing.
bg_read() {
  local out
  out="$(sandbox "$@" --output text 2>"$work/err")" || return 1
  case "$out" in None) out="" ;; esac
  printf '%s' "$out" | tr '\t' '\n' | sed '/^$/d'
}

# read_code <prompt>: reads one line into code and succeeds only for six digits.
read_code() {
  code=""
  printf '%s ' "$1"
  IFS= read -r code || code=""
  [ -t 0 ] || printf '\n'
  printf '%s\n' "$code" | grep -Eq '^[0-9]{6}$'
}

# add_totp: makes the user's virtual MFA device, has you add its secret to your YubiKey, and enables it with two codes.
add_totp() {
  local attempt code="" first=""
  # A device that an earlier run made but never enabled is deleted first, so its name can be used again.
  if bg_read aws iam list-virtual-mfa-devices --assignment-status Unassigned --query 'VirtualMFADevices[].SerialNumber' |
    grep -qxF -- "$serial"; then
    sandbox aws iam delete-virtual-mfa-device --serial-number "$serial" 2>"$work/err" ||
      { bg_status="Cannot delete the unused TOTP device ${serial}: $(last_error)"; return 1; }
  fi
  if ! (umask 077 && sandbox aws iam create-virtual-mfa-device --path "$mfa_path" --virtual-mfa-device-name "$bg_user" \
      --bootstrap-method Base32StringSeed --outfile "$work/totp-seed" --query VirtualMFADevice.SerialNumber --output text \
      >/dev/null 2>"$work/err"); then
    bg_status="Cannot create a TOTP device for ${bg_user}: $(last_error)"
    return 1
  fi
  say "Created TOTP device ${serial}." \
    "Its secret is in ${work}/totp-seed, readable only by you. It is deleted when this step ends, and never printed." \
    "Add it to your YubiKey's OATH application, with a touch required for every code. In a second terminal," \
    "copy and run these two commands, one at a time. Each fits on one line, so it copies whole (lesson L23):" \
    "cd ${work}" \
    "ykman oath accounts add -t -i AWS ${bg_user} \"\$(cat totp-seed)\"" \
    "AWS takes it as an authenticator app. It accepts no FIDO2 security key or passkey for AssumeRole."
  pause "When the YubiKey holds it, press Enter."
  for attempt in 1 2 3; do
    say "Get a code with a touch:" "ykman oath accounts code --single ${bg_user}"
    if read_code "First code:"; then
      first="$code"
      say "Wait for the next code, up to 30 seconds, and get it the same way."
      if read_code "Next code:" && [ "$code" != "$first" ]; then
        if sandbox aws iam enable-mfa-device --user-name "$bg_user" --serial-number "$serial" \
            --authentication-code1 "$first" --authentication-code2 "$code" 2>"$work/err"; then
          rm -f "$work/totp-seed"
          say "Enabled TOTP device ${serial} for ${bg_user}. Deleted ${work}/totp-seed."
          return 0
        fi
        say "AWS refused those codes: $(last_error)"
      else
        say "That is not a second, different code of six digits."
      fi
    else
      say "That is not a code of six digits."
    fi
    [ "$attempt" = 3 ] || say "Try again, ${attempt} of 3 tries used."
  done
  rm -f "$work/totp-seed"
  bg_status="${bg_user} has no enabled TOTP device: three tries failed. Delete the account from the YubiKey with ykman oath accounts delete ${bg_user}, lift the SCP and run this again."
  return 1
}

# add_key: makes the user's one access key and saves it in the user profile, never printing the secret.
add_key() {
  local key_id="" key_secret=""
  if ! (umask 077 && sandbox aws iam create-access-key --user-name "$bg_user" \
      --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text > "$work/key" 2>"$work/err"); then
    rm -f "$work/key"
    bg_status="Cannot create an access key for ${bg_user}: $(last_error)"
    return 1
  fi
  IFS="$(printf '\t')" read -r key_id key_secret < "$work/key" || true
  rm -f "$work/key"
  if [ -z "$key_id" ] || [ -z "$key_secret" ]; then
    bg_status="AWS returned no access key for ${bg_user}. Delete any key it lists, lift the SCP and run this again."
    return 1
  fi
  # aws configure set puts the secret on a command line for an instant, as ykman does the seed (decision 0007).
  if ! aws configure set aws_access_key_id "$key_id" --profile "$bg_user_profile" ||
    ! aws configure set aws_secret_access_key "$key_secret" --profile "$bg_user_profile"; then
    key_secret=""
    bg_status="Created access key ${key_id} for ${bg_user}, but could not save it in profile ${bg_user_profile}. Lift the SCP, delete that key and run this again."
    return 1
  fi
  key_secret=""
  keys="$key_id"
  say "Created access key ${key_id} for ${bg_user} and saved it in profile ${bg_user_profile}, in your AWS credentials file." \
    "The secret was not printed. It can do one thing: assume break-glass with a code from your YubiKey."
}

say "" "Step 5 of 7: break-glass user: its TOTP device and access key, and profiles ${bg_profile} and ${bg_user_profile}."
bg_user="$(sandbox terraform -chdir=infra/sandbox output -raw break_glass_user_name </dev/null 2>/dev/null || true)"
bg_role="$(sandbox terraform -chdir=infra/sandbox output -raw break_glass_role_arn </dev/null 2>/dev/null || true)"
printf '%s\n' "$bg_user" | grep -Eq '^who-gets-the-keys-[a-z-]+$' || bg_user=""
printf '%s\n' "$bg_role" | grep -Eq "^arn:aws:iam::${sandbox_id}:role/who-gets-the-keys/who-gets-the-keys-[a-z-]+\$" || bg_role=""
if [ -z "$bg_user" ] || [ -z "$bg_role" ]; then
  bg_status="infra/sandbox has no break-glass user yet, because its plan was not applied."
  say "${bg_status} Skipped."
else
  serial="arn:aws:iam::${sandbox_id}:mfa${mfa_path}${bg_user}"
  if ! devices="$(bg_read aws iam list-mfa-devices --user-name "$bg_user" --query 'MFADevices[].SerialNumber')"; then
    bg_status="Cannot list the MFA devices of ${bg_user}: $(last_error)"
  elif ! keys="$(bg_read aws iam list-access-keys --user-name "$bg_user" --query 'AccessKeyMetadata[].AccessKeyId')"; then
    bg_status="Cannot list the access keys of ${bg_user}: $(last_error)"
  fi
  if [ -z "$bg_status" ]; then
    # The key this computer holds must be one the user has; a new computer or a lost credentials file needs a new key.
    held="$(aws configure get aws_access_key_id --profile "$bg_user_profile" 2>/dev/null || true)"
    if [ -n "$keys" ] && ! printf '%s\n' "$keys" | grep -qxF -- "$held"; then
      if [ -n "$attached" ]; then
        bg_status="Profile ${bg_user_profile} does not hold ${bg_user}'s access key $(printf '%s' "$keys" | head -n 1). Lift the SCP and run this again to replace it."
      elif [ "$(printf '%s\n' "$keys" | wc -l | tr -d ' ')" = 1 ] &&
        ask "Profile ${bg_user_profile} does not hold ${bg_user}'s access key ${keys}. Delete that key and make a new one?"; then
        if sandbox aws iam delete-access-key --user-name "$bg_user" --access-key-id "$keys" 2>"$work/err"; then
          say "Deleted access key ${keys}."
          keys=""
        else
          bg_status="Cannot delete access key ${keys}: $(last_error)"
        fi
      else
        bg_status="Profile ${bg_user_profile} does not hold an access key of ${bg_user}, which has: $(printf '%s' "$keys" | tr '\n' ' ')"
      fi
    fi
  fi
  if [ -z "$bg_status" ] && { [ -z "$devices" ] || [ -z "$keys" ]; } && [ -n "$attached" ]; then
    bg_status="The SCP is attached, so only break-glass can give ${bg_user} a TOTP device or an access key, and it needs both to assume break-glass. Lift the SCP and run this again (docs/decisions/0007-break-glass-mfa.md)."
  fi
  if [ -z "$bg_status" ] && [ -z "$devices" ]; then
    add_totp && devices="$serial" || true
  elif [ -z "$bg_status" ]; then
    say "${bg_user} already has TOTP device $(printf '%s' "$devices" | head -n 1). Skipped."
  fi
  if [ -z "$bg_status" ] && [ -z "$keys" ]; then
    add_key || true
  elif [ -z "$bg_status" ]; then
    say "${bg_user} already has access key ${keys}, held in profile ${bg_user_profile}. Skipped."
  fi
  if [ -z "$bg_status" ]; then
    # The device named by this script, or the first one listed, is the one the profile asks a code for.
    printf '%s\n' "$devices" | grep -qxF -- "$serial" || serial="$(printf '%s\n' "$devices" | head -n 1)"
    # A failed write must not stop the run before infra/org attaches the SCP (SPEC-001-R217).
    if aws configure set region "$region" --profile "$bg_user_profile" &&
      aws configure set role_arn "$bg_role" --profile "$bg_profile" &&
      aws configure set source_profile "$bg_user_profile" --profile "$bg_profile" &&
      aws configure set mfa_serial "$serial" --profile "$bg_profile" &&
      aws configure set region "$region" --profile "$bg_profile" &&
      aws configure set duration_seconds 3600 --profile "$bg_profile"; then
      say "Profile ${bg_profile} assumes ${bg_role} as ${bg_user}, asking for a code from ${serial}, in ${region}."
    else
      bg_status="Could not write profiles ${bg_user_profile} and ${bg_profile} in your AWS config. Fix that file's permissions and run this again."
      say "$bg_status"
    fi
  else
    say "$bg_status"
  fi
fi

if [ -n "$bg_status" ]; then
  summary_break_glass="not usable yet: ${bg_status}"
else
  summary_break_glass="usable; check it once with aws sts get-caller-identity --profile ${bg_profile}"
fi

say "" "Step 6 of 7: management account ${management_id}: state bucket, by scripts/bootstrap/aws.sh --org-state, and infra/org."
management EXPECTED_ACCOUNT_ID="$management_id" bash scripts/bootstrap/aws.sh --org-state --yes </dev/null
init_backend management infra/org "$org_bucket"
summary_org="plan failed"
plan_and_apply management "$management_id" infra/org "$work/org.tfplan" -var "sandbox_account_id=${sandbox_id}"
summary_org="$plan_result"

say "" "Step 7 of 7: GitHub ${repo}, by scripts/bootstrap/github.sh --vars. Your confirm above answers its questions."
summary_github="github.sh --vars failed"
sandbox TRIAGE_MODEL="$model" bash scripts/bootstrap/github.sh --vars <<'ANSWERS'
y
y
ANSWERS
summary_github="set by github.sh --vars"

say "" "Done. To check the repository secrets and variables:" "gh secret list --repo ${repo}" "gh variable list --repo ${repo}"
if [ -n "$bg_status" ]; then
  say "" "Break-glass is not usable yet. ${bg_status}"
else
  say "" "Check break-glass once. It asks for a code from your YubiKey, and ${email} gets an alert email:" \
    "aws sts get-caller-identity --profile ${bg_profile} --region ${region}"
fi
if [ -n "$email_reminder" ]; then
  say "" "If you have not yet, click Confirm subscription in the email AWS sent to ${email}."
fi
say "" "Next, approve the sandbox deploy in main's tip run, for ${head:0:12}, in GitHub." \
  "Never approve the deploy of an older run: it would deploy an older commit. To find main's tip run:" \
  "gh run list --workflow pipeline.yml --branch main --commit ${head} --limit 1" \
  "If that run's deploy already failed, because it ran before this setup, rerun its failed jobs, then approve:" \
  "gh run rerun <run ID> --failed"
