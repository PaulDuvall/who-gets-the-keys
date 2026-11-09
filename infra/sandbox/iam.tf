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
    producer  = "${var.github_repository}/.github/workflows/producer.yml@refs/heads/main"
  }
}

# One trust policy per OIDC role: exact StringEquals on aud, sub and job_workflow_ref.
data "aws_iam_policy_document" "github_trust" {
  for_each = {
    deploy   = { sub = "${var.github_subject_prefix}:environment:sandbox", workflow = local.workflow_ref.pipeline }
    triage   = { sub = "${var.github_subject_prefix}:ref:refs/heads/main", workflow = local.workflow_ref.triage }
    probe    = { sub = "${var.github_subject_prefix}:environment:probe", workflow = local.workflow_ref.scenarios }
    producer = { sub = "${var.github_subject_prefix}:environment:producer", workflow = local.workflow_ref.producer }
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
  # Change, Deactivate, Enable, Reset, Resync and Upload cover a user's password, MFA devices and other credentials.
  identity_writes = [
    "iam:Add*", "iam:Attach*", "iam:Change*", "iam:Create*", "iam:Deactivate*", "iam:Delete*", "iam:Detach*",
    "iam:Enable*", "iam:PassRole", "iam:Put*", "iam:Remove*", "iam:Reset*", "iam:Resync*", "iam:Set*", "iam:Tag*",
    "iam:Untag*", "iam:Update*", "iam:Upload*",
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
  # The break-glass user and its policy, for the plan's refresh, and nothing about its access key or MFA device.
  statement {
    sid       = "ReadBreakGlassUser"
    actions   = ["iam:GetUser", "iam:GetUserPolicy", "iam:ListUserPolicies", "iam:ListUserTags"]
    resources = ["arn:aws:iam::${local.account_id}:user${local.role_path}*"]
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
      aws_iam_role.deploy.arn, aws_iam_role.triage.arn, aws_iam_role.probe.arn, aws_iam_role.producer.arn,
      aws_iam_role.break_glass.arn, aws_iam_user.break_glass.arn, data.aws_iam_openid_connect_provider.github.arn,
      aws_iam_policy.export_lambda_boundary.arn,
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

# The runner producer's model access and nothing else (SPEC-001-R86): one inference profile, and its foundation model only
# when the call goes through that profile. A us. profile routes to several US Regions, so the model ARN names any Region.
locals {
  producer_profile_arn = "arn:aws:bedrock:${var.region}:${local.account_id}:inference-profile/${var.producer_inference_profile}"
  producer_model       = trimprefix(var.producer_inference_profile, "us.")
}

resource "aws_iam_role" "producer" {
  name                 = "who-gets-the-keys-producer-bedrock"
  path                 = local.role_path
  assume_role_policy   = data.aws_iam_policy_document.github_trust["producer"].json
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "producer" {
  name = "bedrock-invoke-one-profile"
  role = aws_iam_role.producer.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Profile"
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
        Resource = local.producer_profile_arn
      },
      {
        Sid       = "ModelThroughProfile"
        Effect    = "Allow"
        Action    = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
        Resource  = "arn:aws:bedrock:*::foundation-model/${local.producer_model}"
        Condition = { StringEquals = { "bedrock:InferenceProfileArn" = local.producer_profile_arn } }
      },
    ]
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

# Who may become break-glass, and how (SPEC-001-R217): only the break-glass user below, with its MFA code in the same
# AssumeRole call, through the STS endpoint in var.region, where the break-glass rule sees the CloudTrail event.
# An Identity Center session is federated, so aws:MultiFactorAuthPresent is absent from it, and an AssumeRole session
# such as OrganizationAccountAccessRole's carries no MFA context, so no session the owner had could qualify. Trusting
# the account root instead would let any identity here that can make itself a virtual MFA device qualify.
locals {
  break_glass_conditions = {
    Bool         = { "aws:MultiFactorAuthPresent" = "true" }
    StringEquals = { "aws:RequestedRegion" = var.region }
  }
}

resource "aws_iam_role" "break_glass" {
  name                 = "who-gets-the-keys-break-glass"
  path                 = local.role_path
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = aws_iam_user.break_glass.arn }
      Action    = "sts:AssumeRole"
      Condition = local.break_glass_conditions
    }]
  })
}

# The owner's one way in to break-glass: no console password, group or managed policy, and one inline policy. Its
# TOTP device and its one access key are made by hand (scripts/bootstrap/aws-setup.sh, step 5), never here, so neither
# the TOTP seed nor the secret key is ever in Terraform state. force_destroy stays false, so Terraform cannot delete
# the user while it has a key or an MFA device. Deleting it would also break the trust above: a recreated user gets a
# new principal ID.
resource "aws_iam_user" "break_glass" {
  name = "who-gets-the-keys-break-glass-user"
  path = local.role_path
}

# The trust above names this user, so in this account it needs no Allow to assume the role; the Allow states the
# intent. The two Denies make the key good for that one call whatever any other policy grants it, a resource-based
# policy naming the user included. sts:GetCallerIdentity needs no permission and cannot be denied.
resource "aws_iam_user_policy" "break_glass" {
  name = "assume-break-glass-with-mfa"
  user = aws_iam_user.break_glass.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AssumeBreakGlassWithMfa"
        Effect    = "Allow"
        Action    = "sts:AssumeRole"
        Resource  = aws_iam_role.break_glass.arn
        Condition = local.break_glass_conditions
      },
      {
        Sid       = "NothingElse"
        Effect    = "Deny"
        NotAction = "sts:AssumeRole"
        Resource  = "*"
      },
      {
        Sid         = "NoOtherRole"
        Effect      = "Deny"
        Action      = "sts:AssumeRole"
        NotResource = aws_iam_role.break_glass.arn
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "break_glass" {
  role       = aws_iam_role.break_glass.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

# Identity changes after the SCP is attached go through this role, with MFA, which fires the break-glass alarm.
# PowerUserAccess grants no IAM, so this adds IAM for this workload's roles and policies and the account's GitHub OIDC
# provider, and, in a second statement, for the break-glass user, so a break-glass session can plan infra/sandbox,
# rotate the user's access key and replace its MFA device while the old one still works (docs/decisions/0007).
# Changing roles, policies and that user is this role's purpose, so Semgrep's privilege-escalation and resource-exposure
# rules are suppressed for these two statements, and its credential-exposure and other-user rules for the second: a
# break-glass session can already rewrite its own trust, so a key it makes for the user adds no power. No login-profile
# action is granted: the user never gets a password.
resource "aws_iam_role_policy" "break_glass_identity" {
  name = "identity"
  role = aws_iam_role.break_glass.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
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
      },
      {
        Sid    = "BreakGlassUser"
        Effect = "Allow"
        # nosemgrep: terraform.lang.security.iam.no-iam-creds-exposure.no-iam-creds-exposure, terraform.lang.security.iam.no-iam-priv-esc-other-users.no-iam-priv-esc-other-users, terraform.lang.security.iam.no-iam-priv-esc-funcs.no-iam-priv-esc-funcs, terraform.lang.security.iam.no-iam-resource-exposure.no-iam-resource-exposure
        Action = [
          "iam:GetUser", "iam:GetUserPolicy", "iam:ListUserPolicies", "iam:ListAttachedUserPolicies", "iam:ListUserTags",
          "iam:ListGroupsForUser", "iam:ListAccessKeys", "iam:GetAccessKeyLastUsed", "iam:ListMFADevices",
          "iam:CreateUser", "iam:DeleteUser", "iam:TagUser", "iam:UntagUser", "iam:PutUserPolicy", "iam:DeleteUserPolicy",
          "iam:CreateAccessKey", "iam:UpdateAccessKey", "iam:DeleteAccessKey",
          "iam:CreateVirtualMFADevice", "iam:DeleteVirtualMFADevice", "iam:EnableMFADevice", "iam:DeactivateMFADevice",
          "iam:ResyncMFADevice",
        ]
        Resource = [
          "arn:aws:iam::${local.account_id}:user${local.role_path}*",
          "arn:aws:iam::${local.account_id}:mfa${local.role_path}*",
        ]
      },
    ]
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
