#!/usr/bin/env bash
set -euo pipefail

region="us-east-1"

usage() {
  echo "usage: EXPECTED_ACCOUNT_ID=<sandbox account> scripts/bootstrap/aws.sh [--bedrock-form <form.json>] [--yes]"
  echo "       EXPECTED_ACCOUNT_ID=<management account> scripts/bootstrap/aws.sh --org-state [--yes]"
  echo "  creates the Terraform state bucket in the sandbox account's S3 account regional namespace and, if the"
  echo "  account has none, the GitHub OIDC provider"
  echo "  (needs an AWS CLI with create-bucket --bucket-namespace), optionally submits the Anthropic"
  echo "  first-time-use form for Bedrock, then prints the apply commands for you to run"
  echo "  --org-state  creates only infra/org's state bucket, who-gets-the-keys-orgstate-<account>-${region}-an,"
  echo "               with the same settings, for credentials of the management account"
  echo "  --yes        answers yes to every question and prints no next steps. scripts/bootstrap/aws-setup.sh"
  echo "               passes it after its own single confirm, which covers these changes"
  echo "  scripts/bootstrap/aws-setup.sh runs this script, the applies and github.sh --vars as one command."
}

yes=""
confirm() {
  if [ -n "$yes" ]; then
    echo "$1 yes (--yes)"
    return 0
  fi
  read -r -p "$1 [y/N] " answer
  [ "$answer" = "y" ]
}

form=""
org_state=""
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --bedrock-form) form="${2:?form file}"; [ -f "$form" ] || { echo "no ${form}"; exit 1; }; shift ;;
    --org-state) org_state="yes" ;;
    --yes) yes="yes" ;;
    *) usage; exit 2 ;;
  esac
  shift
done
if [ -n "$org_state" ] && [ -n "$form" ]; then usage; exit 2; fi

expected="${EXPECTED_ACCOUNT_ID:?set EXPECTED_ACCOUNT_ID to the sandbox account ID}"
actual="$(aws sts get-caller-identity --query Account --output text)"
caller="$(aws sts get-caller-identity --query Arn --output text)"
echo "Caller: ${caller}"
[ "$actual" = "$expected" ] || { echo "Credentials are for account ${actual}, expected ${expected}. Nothing changed."; exit 1; }

bucket="who-gets-the-keys-tfstate-${expected}-${region}-an"
[ -z "$org_state" ] || bucket="who-gets-the-keys-orgstate-${expected}-${region}-an"
owned() { aws s3api "$@" --expected-bucket-owner "$expected"; }

if owned head-bucket --bucket "$bucket" 2>/dev/null; then
  echo "State bucket ${bucket} exists; versioning, encryption and public access block will be re-applied."
else
  echo "State bucket ${bucket} will be created in ${region}, in the account regional namespace (only account ${expected} can create this name)."
fi
echo "Settings: versioning Enabled, SSE-S3 default encryption with bucket key, all public access blocked, TLS-only bucket policy."
confirm "Apply to ${bucket}?" || { echo "Nothing changed."; exit 1; }

owned head-bucket --bucket "$bucket" 2>/dev/null || aws s3api create-bucket --bucket "$bucket" --bucket-namespace account-regional --region "$region"
owned put-bucket-versioning --bucket "$bucket" --versioning-configuration Status=Enabled
owned put-bucket-encryption --bucket "$bucket" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
owned put-public-access-block --bucket "$bucket" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
owned put-bucket-policy --bucket "$bucket" --policy "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"TlsOnly\",\"Effect\":\"Deny\",\"Principal\":\"*\",\"Action\":\"s3:*\",\"Resource\":[\"arn:aws:s3:::${bucket}\",\"arn:aws:s3:::${bucket}/*\"],\"Condition\":{\"Bool\":{\"aws:SecureTransport\":\"false\"}}}]}"
echo "State bucket ready."

if [ -n "$org_state" ]; then
  if [ -z "$yes" ]; then
    echo
    echo "Then, with credentials for this account:"
    echo "terraform -chdir=infra/org init -backend-config=bucket=${bucket}"
    echo "terraform -chdir=infra/org apply -var sandbox_account_id=<sandbox account>"
  fi
  exit 0
fi

provider_arn="arn:aws:iam::${expected}:oidc-provider/token.actions.githubusercontent.com"
echo
if clients=$(aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$provider_arn" \
    --query ClientIDList --output text 2>/dev/null); then
  echo "GitHub OIDC provider exists; infra/sandbox reads it and does not manage it."
  case " ${clients} " in
    *[[:space:]]sts.amazonaws.com[[:space:]]*) echo "It lists client ID sts.amazonaws.com, which the role trust policies require." ;;
    *)
      echo "It does not list client ID sts.amazonaws.com, which the role trust policies require. Client IDs: ${clients}"
      if confirm "Add sts.amazonaws.com to it? Other repositories using the provider are not affected."; then
        aws iam add-client-id-to-open-id-connect-provider --open-id-connect-provider-arn "$provider_arn" \
          --client-id sts.amazonaws.com
        echo "Client ID added."
      else
        echo "Not added. The pipeline cannot assume its roles until it is."
      fi
      ;;
  esac
else
  echo "Account ${expected} has no GitHub OIDC provider. infra/sandbox reads it, so it must exist before the first apply."
  if confirm "Create it, with client ID sts.amazonaws.com?"; then
    aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com >/dev/null
    echo "GitHub OIDC provider created."
  else
    echo "Not created. The sandbox apply fails until it exists."
  fi
fi

if [ -n "$form" ]; then
  echo
  echo "Will submit ${form} as the Anthropic first-time-use form for Bedrock in account ${actual}."
  if confirm "Submit it?"; then
    aws bedrock put-use-case-for-model-access --region "$region" --form-data "fileb://${form}"
    echo "Submitted."
  fi
fi

[ -z "$yes" ] || exit 0

echo
echo "Run these yourself, in order, or run scripts/bootstrap/aws-setup.sh, which does all of them."
echo
echo "1. First sandbox apply, with credentials for account ${expected}. This creates the deploy and break-glass roles the SCP exempts:"
echo "npm ci --ignore-scripts"
echo "npm run build"
echo "mkdir -p dist/function && cp dist/src/*.js dist/function/ && echo '{\"type\":\"module\"}' > dist/function/package.json"
echo "(cd dist/function && TZ=UTC touch -t 198001010000 ./* && zip -X -q ../function.zip ./*)"
echo "terraform -chdir=infra/sandbox init -backend-config=bucket=${bucket}"
echo "terraform -chdir=infra/sandbox apply -var artifact_sha256=\$(openssl dgst -sha256 -binary dist/function.zip | base64)"
echo
echo "2. SCP, with credentials for the management account and a state bucket in that account:"
echo "EXPECTED_ACCOUNT_ID=<management account> scripts/bootstrap/aws.sh --org-state"
echo "terraform -chdir=infra/org init -backend-config=bucket=who-gets-the-keys-orgstate-<management account>-${region}-an"
echo "terraform -chdir=infra/org apply -var sandbox_account_id=${expected}"
echo
echo "3. Repository variables from the outputs:"
echo "TRIAGE_MODEL=<bedrock model or inference profile ID> scripts/bootstrap/github.sh --vars"
echo
echo "4. After the SCP, the pipeline applies only the export Lambda, its table, its log group and its role's policies."
echo "   Changes to the other roles, the Lambda role boundary, the KMS key or the break-glass alarm"
echo "   fail in the deploy job. Apply them yourself as who-gets-the-keys-break-glass, with MFA; this fires the alarm:"
echo "terraform -chdir=infra/sandbox plan -out=plan.out -var artifact_sha256=\$(openssl dgst -sha256 -binary dist/function.zip | base64)"
echo "terraform -chdir=infra/sandbox apply plan.out"
