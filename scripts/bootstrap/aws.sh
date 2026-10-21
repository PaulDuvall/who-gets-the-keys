#!/usr/bin/env bash
set -euo pipefail

bucket="pduvall-who-gets-the-keys-tfstate"
region="us-east-1"

usage() {
  echo "usage: EXPECTED_ACCOUNT_ID=<sandbox account> scripts/bootstrap/aws.sh [--bedrock-form <form.json>]"
  echo "  creates the Terraform state bucket in the sandbox account, optionally submits the Anthropic"
  echo "  first-time-use form for Bedrock, then prints the apply commands for you to run"
}

confirm() { read -r -p "$1 [y/N] " answer; [ "$answer" = "y" ]; }

form=""
case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  --bedrock-form) form="${2:?form file}"; [ -f "$form" ] || { echo "no ${form}"; exit 1; } ;;
  "") ;;
  *) usage; exit 2 ;;
esac

expected="${EXPECTED_ACCOUNT_ID:?set EXPECTED_ACCOUNT_ID to the sandbox account ID}"
actual="$(aws sts get-caller-identity --query Account --output text)"
caller="$(aws sts get-caller-identity --query Arn --output text)"
echo "Caller: ${caller}"
[ "$actual" = "$expected" ] || { echo "Credentials are for account ${actual}, expected ${expected}. Nothing changed."; exit 1; }

if aws s3api head-bucket --bucket "$bucket" 2>/dev/null; then
  echo "State bucket ${bucket} exists; versioning, encryption and public access block will be re-applied."
else
  echo "State bucket ${bucket} will be created in ${region}."
fi
echo "Settings: versioning Enabled, SSE-S3 default encryption with bucket key, all public access blocked, TLS-only bucket policy."
confirm "Apply to ${bucket}?" || { echo "Nothing changed."; exit 1; }

aws s3api head-bucket --bucket "$bucket" 2>/dev/null || aws s3api create-bucket --bucket "$bucket" --region "$region"
aws s3api put-bucket-versioning --bucket "$bucket" --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$bucket" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
aws s3api put-public-access-block --bucket "$bucket" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-policy --bucket "$bucket" --policy "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"TlsOnly\",\"Effect\":\"Deny\",\"Principal\":\"*\",\"Action\":\"s3:*\",\"Resource\":[\"arn:aws:s3:::${bucket}\",\"arn:aws:s3:::${bucket}/*\"],\"Condition\":{\"Bool\":{\"aws:SecureTransport\":\"false\"}}}]}"
echo "State bucket ready."

if [ -n "$form" ]; then
  echo
  echo "Will submit ${form} as the Anthropic first-time-use form for Bedrock in account ${actual}."
  if confirm "Submit it?"; then
    aws bedrock put-use-case-for-model-access --region "$region" --form-data "fileb://${form}"
    echo "Submitted."
  fi
fi

echo
echo "Run these yourself, in order."
echo
echo "1. First sandbox apply, with credentials for account ${expected}. This creates the deploy and break-glass roles the SCP exempts:"
echo "npm ci --ignore-scripts"
echo "npm run build"
echo "mkdir -p dist/function && cp dist/src/*.js dist/function/ && echo '{\"type\":\"module\"}' > dist/function/package.json"
echo "(cd dist/function && zip -X -q ../function.zip ./*)"
echo "terraform -chdir=infra/sandbox init"
echo "terraform -chdir=infra/sandbox apply -var artifact_sha256=\$(openssl dgst -sha256 -binary dist/function.zip | base64)"
echo
echo "2. SCP, with credentials for the management account and a state bucket in that account:"
echo "terraform -chdir=infra/org init -backend-config=bucket=<state bucket in the management account>"
echo "terraform -chdir=infra/org apply -var sandbox_account_id=${expected}"
echo
echo "3. Repository variables from the outputs:"
echo "TRIAGE_MODEL=<bedrock model or inference profile ID> scripts/bootstrap/github.sh --vars"
