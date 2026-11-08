variable "region" {
  description = "AWS region for the sandbox workload"
  type        = string
  default     = "us-east-1"
}

variable "github_subject_prefix" {
  description = "Immutable OIDC subject prefix: repo:OWNER@OWNER_ID/REPO@REPO_ID"
  type        = string
  default     = "repo:PaulDuvall@1619259/who-gets-the-keys@1443586681"
}

variable "github_repository" {
  description = "OWNER/REPO, used in job_workflow_ref conditions"
  type        = string
  default     = "PaulDuvall/who-gets-the-keys"
}

variable "artifact_path" {
  description = "Path to the Lambda zip built and attested by pipeline.yml"
  type        = string
  default     = "../../dist/function.zip"
}

variable "artifact_sha256" {
  description = "Base64 SHA-256 of the Lambda zip, passed by pipeline.yml"
  type        = string
  default     = ""
}

variable "producer_inference_profile" {
  # Sonnet 4.6, not 5.5: on 2026-11-07 the sandbox account had a cross-region quota of 0 tokens per minute for every
  # Claude 4.7 and 5.x model, Sonnet 5.5 included, and 6,000,000 for Sonnet 4.6 (docs/verification.md, "Bedrock quota").
  description = "The one us. inference profile the runner producer's role may invoke (SPEC-001-R86), set as PRODUCER_MODEL"
  type        = string
  default     = "us.anthropic.claude-sonnet-4-6"

  validation {
    condition     = can(regex("^us\\.anthropic\\.[a-z0-9.:-]+$", var.producer_inference_profile))
    error_message = "The producer_inference_profile value must be a us.anthropic. inference profile ID."
  }
}
