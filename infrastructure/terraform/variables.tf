variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "eu-west-1"
}

variable "environment" {
  description = "Deployment environment (staging, production)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be 'staging' or 'production'."
  }
}

variable "project_name" {
  description = "Project name used in resource naming"
  type        = string
  default     = "workforce-scheduler"
}

variable "domain_name" {
  description = "Primary domain name"
  type        = string
  default     = "shavtzak.site"
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "shavtzak"
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "PostgreSQL master password"
  type        = string
  sensitive   = true
}

variable "secret_key" {
  description = "Application secret key for JWT signing"
  type        = string
  sensitive   = true
}

variable "redis_auth_token" {
  description = "Redis AUTH token"
  type        = string
  sensitive   = true
  default     = ""
}

variable "certificate_arn" {
  description = "ACM certificate ARN for HTTPS"
  type        = string
}

variable "api_image_tag" {
  description = "Docker image tag for the API service"
  type        = string
  default     = "latest"
}

variable "frontend_image_tag" {
  description = "Docker image tag for the frontend"
  type        = string
  default     = "latest"
}

variable "api_cpu" {
  description = "CPU units for API task (1024 = 1 vCPU)"
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Memory (MiB) for API task"
  type        = number
  default     = 1024
}

variable "worker_cpu" {
  description = "CPU units for Celery worker task"
  type        = number
  default     = 512
}

variable "worker_memory" {
  description = "Memory (MiB) for Celery worker task"
  type        = number
  default     = 1024
}

variable "beat_cpu" {
  description = "CPU units for Celery beat task"
  type        = number
  default     = 256
}

variable "beat_memory" {
  description = "Memory (MiB) for Celery beat task"
  type        = number
  default     = 512
}
