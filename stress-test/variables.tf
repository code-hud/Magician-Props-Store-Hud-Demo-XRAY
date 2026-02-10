variable "project_name" {
  description = "Unique project name prefix for all resources"
  type        = string
  default     = "magician-props-store-demo"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-2"
}

variable "hud_api_key" {
  description = "Hud API key for the with-hud backend"
  type        = string
  sensitive   = true
}

variable "git_commit_hash" {
  description = "Git commit hash for tagging"
  type        = string
  default     = "unknown"
}

variable "backend_cpu" {
  description = "CPU units for backend tasks (256, 512, 1024, 2048, 4096)"
  type        = number
  default     = 512
}

variable "backend_memory" {
  description = "Memory (MB) for backend tasks"
  type        = number
  default     = 2048
}

variable "k6_duration" {
  description = "Duration of K6 test (e.g., '5m', '10m')"
  type        = string
  default     = "5m"
}

variable "k6_vus" {
  description = "Number of virtual users for K6"
  type        = number
  default     = 50
}

variable "load_generator_enabled" {
  description = "Enable continuous load generator service"
  type        = bool
  default     = true
}

variable "load_generator_rps" {
  description = "Requests per second for load generator"
  type        = number
  default     = 5
}
