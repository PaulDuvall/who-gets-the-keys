#!/usr/bin/env bash
# On-demand scenarios against the sandbox account (SPEC-001-R28, R30, R33), run by scenarios.yml
# under the probe role. Never applies anything.
set -uo pipefail

status=0
held() { echo "BOUNDARY HELD: $1"; }

token="$(curl -sS -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=sts.amazonaws.com" | jq -r .value)"
if AWS_ACCESS_KEY_ID= AWS_SECRET_ACCESS_KEY= AWS_SESSION_TOKEN= aws sts assume-role-with-web-identity \
    --role-arn "${DEPLOY_ROLE_ARN:?DEPLOY_ROLE_ARN}" --role-session-name b9-probe --web-identity-token "$token" >/dev/null 2>&1; then
  echo "BOUNDARY BROKEN: assume the deploy role from a workflow other than pipeline.yml"; status=1
else
  held "assume the deploy role from a workflow other than pipeline.yml"
fi

arn="$(aws lambda get-function --function-name who-gets-the-keys-export --query Configuration.FunctionArn --output text)"
err="$(aws lambda tag-resource --resource "$arn" --tags b11=probe 2>&1 >/dev/null)"
if grep -q "with an explicit deny in a service control policy" <<<"$err"; then
  held "with an explicit deny in a service control policy"
else
  echo "BOUNDARY BROKEN: B11 write was not denied by the SCP: $err"; status=1
fi

git apply scenarios/B14-irreversible-table-rename.patch
git -c user.name=b14 -c user.email=b14@example.com -c commit.gpgsign=false commit -qam "B14 probe"
mkdir -p dist && printf 'placeholder' > dist/placeholder && (cd dist && zip -q function.zip placeholder)
state="who-gets-the-keys-tfstate-$(aws sts get-caller-identity --query Account --output text)-us-east-1-an"
(cd infra/sandbox && terraform init -input=false -backend-config="bucket=${state}" >/dev/null && terraform plan -input=false -lock=false -out=plan.out >/dev/null && terraform show -json plan.out > plan.json)
node scripts/gates.ts irreversible infra/sandbox/plan.json || true
exit "$status"
