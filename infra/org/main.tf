terraform {
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.69"
    }
  }

  # Partial backend: the bucket lives in the management account and is passed at init (-backend-config=bucket=...).
  backend "s3" {
    key          = "who-gets-the-keys/org/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = "us-east-1"
}

variable "sandbox_account_id" {
  description = "Account that holds the sandbox workload; the SCP attaches here"
  type        = string
}

locals {
  account  = var.sandbox_account_id
  role_arn = "arn:aws:iam::${var.sandbox_account_id}:role/who-gets-the-keys/"
}

# Denies control-plane writes to the sandbox workload to every principal except the deploy and break-glass roles.
# SCPs do not apply to service-linked roles; the aws-service-role exclusion is explicit anyway.
resource "aws_organizations_policy" "sandbox_writes" {
  name        = "who-gets-the-keys-sandbox-writes"
  description = "Only the deploy and break-glass roles write the sandbox workload"
  type        = "SERVICE_CONTROL_POLICY"
  content = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "DenySandboxWritesExceptDeploy"
      Effect = "Deny"
      Action = [
        "lambda:Create*", "lambda:Update*", "lambda:Delete*", "lambda:Put*", "lambda:Add*", "lambda:Remove*",
        "lambda:Publish*", "lambda:TagResource", "lambda:UntagResource",
        "dynamodb:CreateTable", "dynamodb:UpdateTable", "dynamodb:DeleteTable", "dynamodb:UpdateContinuousBackups",
        "dynamodb:TagResource", "dynamodb:UntagResource",
        "logs:DeleteLogGroup", "logs:PutRetentionPolicy", "logs:DeleteRetentionPolicy",
        "iam:Update*", "iam:Put*", "iam:Delete*", "iam:Attach*", "iam:Detach*", "iam:Create*",
      ]
      Resource = [
        "arn:aws:lambda:*:${local.account}:function:who-gets-the-keys-*",
        "arn:aws:dynamodb:*:${local.account}:table/export_jobs",
        "arn:aws:logs:*:${local.account}:log-group:/aws/lambda/who-gets-the-keys-*",
        "${local.role_arn}*",
      ]
      Condition = {
        ArnNotLike = {
          "aws:PrincipalArn" = [
            "${local.role_arn}who-gets-the-keys-deploy",
            "${local.role_arn}who-gets-the-keys-break-glass",
            "arn:aws:iam::*:role/aws-service-role/*",
          ]
        }
      }
    }]
  })
}

resource "aws_organizations_policy_attachment" "sandbox" {
  policy_id = aws_organizations_policy.sandbox_writes.id
  target_id = var.sandbox_account_id
}
