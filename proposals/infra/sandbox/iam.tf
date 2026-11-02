# The GitHub OIDC provider is account-wide and may already serve other repositories, so this stack reads it by ARN
# instead of owning it; scripts/bootstrap/aws.sh creates it when an account has none. Reading by ARN needs only
# iam:GetOpenIDConnectProvider on that ARN, which the deploy role's ReadIdentities statement grants.
data "aws_iam_openid_connect_provider" "github" {
  arn = "arn:aws:iam::${local.account_id}:oidc-provider/token.actions.githubusercontent.com"
}

locals {
  oidc = "token.actions.githubusercontent.com"
  workflow_ref = {
    pipeline  = "${var.github_repository}/.github/workflows/pipeline.yml@refs/heads/main"
    triage    = "${var.github_repository}/.github/workflows/issue-triage.yml@refs/heads/main"
    scenarios = "${var.github_repository}/.github/workflows/scenarios.yml@refs/heads/main"
  }
}

# One trust policy per OIDC role: exact StringEquals on aud, sub and job_workflow_ref.
data "aws_iam_policy_document" "github_trust" {
  for_each = {
    deploy = { sub = "${var.github_subject_prefix}:environment:sandbox", workflow = local.workflow_ref.pipeline }
    triage = { sub = "${var.github_subject_prefix}:ref:refs/heads/main", workflow = local.workflow_ref.triage }
    probe  = { sub = "${var.github_subject_prefix}:environment:probe", workflow = local.workflow_ref.scenarios }
  }

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc}:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc}:sub"
      values   = [each.value.sub]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc}:job_workflow_ref"
      values   = [each.value.workflow]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = "who-gets-the-keys-deploy"
  path                 = local.role_path
  assume_role_policy   = data.aws_iam_policy_document.github_trust["deploy"].json
  max_session_duration = 3600
}

# The deploy role applies the workload: the export Lambda, its table, its log group, and the Lambda role's policies
# inside a permissions boundary. Identities, the KMS key and the break-glass alarm are applied by a person with the
# break-glass role (scripts/bootstrap/aws.sh). This role can only read them, so a plan that changes them fails at apply.
locals {
  workload = {
    function  = "arn:aws:lambda:${var.region}:${local.account_id}:function:${local.function_name}"
    table     = "arn:aws:dynamodb:${var.region}:${local.account_id}:table/export_jobs"
    log_group = "arn:aws:logs:${var.region}:${local.account_id}:log-group:/aws/lambda/${local.function_name}*"
  }
  identity_writes = [
    "iam:Add*", "iam:Attach*", "iam:Create*", "iam:Delete*", "iam:Detach*", "iam:PassRole", "iam:Put*", "iam:Remove*",
    "iam:Set*", "iam:Tag*", "iam:Untag*", "iam:Update*",
  ]
}

data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "State"
    actions   = ["s3:ListBucket", "s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::${local.state_bucket}", "arn:aws:s3:::${local.state_bucket}/sandbox/*"]
  }
  statement {
    sid = "ReadWorkload"
    actions = [
      "lambda:Get*", "lambda:List*", "dynamodb:Describe*", "dynamodb:ListTagsOfResource", "dynamodb:GetResourcePolicy",
      "logs:Describe*", "logs:List*",
    ]
    resources = [local.workload.function, local.workload.table, local.workload.log_group]
  }
  statement {
    sid       = "ReadKeyAndAlarm"
    actions   = ["kms:Describe*", "kms:Get*", "kms:List*", "sns:Get*", "sns:List*", "events:Describe*", "events:List*"]
    resources = [aws_kms_key.sandbox.arn, aws_sns_topic.break_glass.arn, aws_cloudwatch_event_rule.break_glass_used.arn]
  }
  statement {
    sid     = "ReadIdentities"
    actions = ["iam:Get*", "iam:List*"]
    resources = [
      "arn:aws:iam::${local.account_id}:role${local.role_path}*",
      "arn:aws:iam::${local.account_id}:policy${local.role_path}*",
      data.aws_iam_openid_connect_provider.github.arn,
    ]
  }
  statement {
    sid       = "ReadAccountWide"
    actions   = ["logs:DescribeLogGroups", "kms:ListAliases", "sts:GetCallerIdentity"]
    resources = ["*"]
  }
  statement {
    sid = "Lambda"
    actions = [
      "lambda:CreateFunction", "lambda:DeleteFunction", "lambda:UpdateFunctionCode", "lambda:UpdateFunctionConfiguration",
      "lambda:TagResource", "lambda:UntagResource",
    ]
    resources = [local.workload.function]
  }
  statement {
    sid       = "PassLambdaRole"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.export_lambda.arn]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }
  statement {
    sid       = "LambdaRolePoliciesInsideBoundary"
    actions   = ["iam:AttachRolePolicy", "iam:DeleteRolePolicy", "iam:DetachRolePolicy", "iam:PutRolePolicy"]
    resources = [aws_iam_role.export_lambda.arn]
    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [aws_iam_policy.export_lambda_boundary.arn]
    }
  }
  statement {
    sid = "Table"
    actions = [
      "dynamodb:CreateTable", "dynamodb:DeleteTable", "dynamodb:UpdateTable", "dynamodb:UpdateContinuousBackups",
      "dynamodb:UpdateTimeToLive", "dynamodb:TagResource", "dynamodb:UntagResource",
    ]
    resources = [local.workload.table]
  }
  statement {
    sid       = "TableKeyThroughDynamoDB"
    actions   = ["kms:CreateGrant", "kms:Decrypt", "kms:DescribeKey", "kms:Encrypt", "kms:GenerateDataKey*", "kms:ReEncrypt*"]
    resources = [aws_kms_key.sandbox.arn]
    condition {
      test     = "StringLike"
      variable = "kms:ViaService"
      values   = ["dynamodb.*.amazonaws.com"]
    }
  }
  statement {
    sid = "LogGroup"
    actions = [
      "logs:AssociateKmsKey", "logs:CreateLogGroup", "logs:DeleteLogGroup", "logs:DeleteRetentionPolicy",
      "logs:DisassociateKmsKey", "logs:PutRetentionPolicy", "logs:TagLogGroup", "logs:TagResource", "logs:UntagLogGroup",
      "logs:UntagResource",
    ]
    resources = [local.workload.log_group]
  }
  # Explicit denies keep these out even if an allow above is widened later.
  statement {
    sid     = "NoIdentityWrites"
    effect  = "Deny"
    actions = local.identity_writes
    resources = [
      aws_iam_role.deploy.arn, aws_iam_role.triage.arn, aws_iam_role.probe.arn, aws_iam_role.break_glass.arn,
      data.aws_iam_openid_connect_provider.github.arn, aws_iam_policy.export_lambda_boundary.arn,
    ]
  }
  statement {
    sid    = "KeepTheLambdaBoundary"
    effect = "Deny"
    actions = [
      "iam:CreatePolicyVersion", "iam:DeletePolicyVersion", "iam:DeleteRolePermissionsBoundary",
      "iam:PutRolePermissionsBoundary", "iam:SetDefaultPolicyVersion",
    ]
    resources = ["*"]
  }
  statement {
    sid    = "NoKeyAdministration"
    effect = "Deny"
    actions = [
      "kms:CreateAlias", "kms:CreateKey", "kms:DeleteAlias", "kms:DisableKey", "kms:DisableKeyRotation", "kms:PutKeyPolicy",
      "kms:ScheduleKeyDeletion", "kms:TagResource", "kms:UntagResource", "kms:UpdateAlias", "kms:UpdateKeyDescription",
    ]
    resources = ["*"]
  }
  statement {
    sid       = "NoPublicLambda"
    effect    = "Deny"
    actions   = ["lambda:AddPermission", "lambda:CreateFunctionUrlConfig", "lambda:UpdateFunctionUrlConfig"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}

resource "aws_iam_role" "triage" {
  name                 = "who-gets-the-keys-triage-bedrock"
  path                 = local.role_path
  assume_role_policy   = data.aws_iam_policy_document.github_trust["triage"].json
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "triage" {
  name = "bedrock-invoke"
  role = aws_iam_role.triage.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
      Resource = [
        "arn:aws:bedrock:*::foundation-model/anthropic.*",
        "arn:aws:bedrock:${var.region}:${local.account_id}:inference-profile/us.anthropic.*",
      ]
    }]
  })
}

resource "aws_iam_role" "probe" {
  name                 = "who-gets-the-keys-scenario-probe"
  path                 = local.role_path
  assume_role_policy   = data.aws_iam_policy_document.github_trust["probe"].json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "probe_read" {
  role       = aws_iam_role.probe.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# Allows the Lambda write on purpose: B11 must observe the SCP's explicit deny, not this policy's.
resource "aws_iam_role_policy" "probe" {
  name = "b11-write"
  role = aws_iam_role.probe.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["lambda:UpdateFunctionConfiguration", "lambda:TagResource"]
      Resource = aws_lambda_function.export.arn
    }]
  })
}

resource "aws_iam_role" "break_glass" {
  name                 = "who-gets-the-keys-break-glass"
  path                 = local.role_path
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = "arn:aws:iam::${local.account_id}:root" }
      Action    = "sts:AssumeRole"
      Condition = { Bool = { "aws:MultiFactorAuthPresent" = "true" } }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "break_glass" {
  role       = aws_iam_role.break_glass.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

# Identity changes after the SCP is attached go through this role, with MFA, which fires the break-glass alarm.
# PowerUserAccess grants no IAM, so this adds IAM for this workload's roles and policies and the account's GitHub OIDC provider only.
# Changing roles and their policies is this role's purpose, so Semgrep's privilege-escalation and resource-exposure
# rules are suppressed for this one statement; no user, access-key or login-profile action is granted.
resource "aws_iam_role_policy" "break_glass_identity" {
  name = "identity"
  role = aws_iam_role.break_glass.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "WorkloadIdentities"
      Effect = "Allow"
      # nosemgrep: terraform.lang.security.iam.no-iam-priv-esc-funcs.no-iam-priv-esc-funcs, terraform.lang.security.iam.no-iam-resource-exposure.no-iam-resource-exposure
      Action = [
        "iam:GetRole", "iam:GetRolePolicy", "iam:GetPolicy", "iam:GetPolicyVersion", "iam:GetOpenIDConnectProvider",
        "iam:ListRolePolicies", "iam:ListAttachedRolePolicies", "iam:ListPolicyVersions", "iam:ListRoleTags",
        "iam:ListPolicyTags", "iam:ListOpenIDConnectProviderTags",
        "iam:CreateRole", "iam:DeleteRole", "iam:UpdateRole", "iam:UpdateRoleDescription", "iam:UpdateAssumeRolePolicy",
        "iam:TagRole", "iam:UntagRole", "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:AttachRolePolicy",
        "iam:DetachRolePolicy", "iam:PutRolePermissionsBoundary", "iam:DeleteRolePermissionsBoundary", "iam:PassRole",
        "iam:CreatePolicy", "iam:DeletePolicy", "iam:CreatePolicyVersion", "iam:DeletePolicyVersion",
        "iam:SetDefaultPolicyVersion", "iam:TagPolicy", "iam:UntagPolicy",
        "iam:CreateOpenIDConnectProvider", "iam:DeleteOpenIDConnectProvider", "iam:UpdateOpenIDConnectProviderThumbprint",
        "iam:AddClientIDToOpenIDConnectProvider", "iam:RemoveClientIDFromOpenIDConnectProvider",
        "iam:TagOpenIDConnectProvider", "iam:UntagOpenIDConnectProvider",
      ]
      Resource = [
        "arn:aws:iam::${local.account_id}:role${local.role_path}*",
        "arn:aws:iam::${local.account_id}:policy${local.role_path}*",
        data.aws_iam_openid_connect_provider.github.arn,
      ]
    }]
  })
}

# Ceiling for the export Lambda's role. The deploy role may change that role's policies only while this boundary is
# attached, and can neither edit the boundary nor remove it.
resource "aws_iam_policy" "export_lambda_boundary" {
  name = "who-gets-the-keys-export-lambda-boundary"
  path = local.role_path
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.export.arn}:*"
      },
      {
        Sid    = "Tracing"
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments", "xray:PutTelemetryRecords", "xray:GetSamplingRules", "xray:GetSamplingTargets",
          "xray:GetSamplingStatisticSummaries",
        ]
        Resource = "*"
      },
      {
        Sid    = "Table"
        Effect = "Allow"
        Action = [
          "dynamodb:BatchGetItem", "dynamodb:BatchWriteItem", "dynamodb:ConditionCheckItem", "dynamodb:DeleteItem",
          "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query", "dynamodb:UpdateItem",
        ]
        Resource = aws_dynamodb_table.export_jobs.arn
      },
      {
        Sid       = "TableKey"
        Effect    = "Allow"
        Action    = ["kms:Decrypt", "kms:DescribeKey", "kms:Encrypt", "kms:GenerateDataKey*"]
        Resource  = aws_kms_key.sandbox.arn
        Condition = { StringLike = { "kms:ViaService" = "dynamodb.*.amazonaws.com" } }
      },
    ]
  })
}
