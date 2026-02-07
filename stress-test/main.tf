terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  name = "magician-props-store-demo-stress-test"
  tags = {
    Project     = "magician-props-store-demo-stress-test"
    Environment = "test"
    ManagedBy   = "terraform"
  }
}

# -----------------------------------------------------------------------------
# VPC - Minimal setup with public subnet
# -----------------------------------------------------------------------------

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.tags, { Name = "${local.name}-vpc" })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = merge(local.tags, { Name = "${local.name}-igw" })
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true

  tags = merge(local.tags, { Name = "${local.name}-public" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(local.tags, { Name = "${local.name}-public-rt" })
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# -----------------------------------------------------------------------------
# Security Groups
# -----------------------------------------------------------------------------

resource "aws_security_group" "internal" {
  name        = "${local.name}-internal"
  description = "Allow internal traffic only"
  vpc_id      = aws_vpc.main.id

  # Allow all internal traffic
  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    self        = true
  }

  # Allow outbound (for pulling images)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, { Name = "${local.name}-internal-sg" })
}

# -----------------------------------------------------------------------------
# ECR Repository
# -----------------------------------------------------------------------------

resource "aws_ecr_repository" "backend" {
  name                 = "${local.name}-backend"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = false
  }

  tags = local.tags
}

# -----------------------------------------------------------------------------
# ECS Cluster
# -----------------------------------------------------------------------------

resource "aws_ecs_cluster" "main" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = local.tags
}

# -----------------------------------------------------------------------------
# Cloud Map Service Discovery
# -----------------------------------------------------------------------------

resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "stress-test.local"
  description = "Service discovery for stress test"
  vpc         = aws_vpc.main.id

  tags = local.tags
}

resource "aws_service_discovery_service" "postgres" {
  name = "postgres"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}

resource "aws_service_discovery_service" "backend_with_hud" {
  name = "with-hud"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}

resource "aws_service_discovery_service" "backend_no_hud" {
  name = "no-hud"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}

# -----------------------------------------------------------------------------
# IAM Roles
# -----------------------------------------------------------------------------

resource "aws_iam_role" "ecs_task_execution" {
  name = "${local.name}-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task" {
  name = "${local.name}-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = local.tags
}


# -----------------------------------------------------------------------------
# CloudWatch Log Groups
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "postgres" {
  name              = "/ecs/${local.name}/postgres"
  retention_in_days = 1
  tags              = local.tags
}

resource "aws_cloudwatch_log_group" "backend_with_hud" {
  name              = "/ecs/${local.name}/backend-with-hud"
  retention_in_days = 1
  tags              = local.tags
}

resource "aws_cloudwatch_log_group" "backend_no_hud" {
  name              = "/ecs/${local.name}/backend-no-hud"
  retention_in_days = 1
  tags              = local.tags
}

resource "aws_cloudwatch_log_group" "k6" {
  name              = "/ecs/${local.name}/k6"
  retention_in_days = 1
  tags              = local.tags
}

# -----------------------------------------------------------------------------
# Task Definitions
# -----------------------------------------------------------------------------

# Postgres
resource "aws_ecs_task_definition" "postgres" {
  family                   = "${local.name}-postgres"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "postgres"
    image = "${aws_ecr_repository.backend.repository_url}:postgres"

    essential = true

    portMappings = [{
      containerPort = 5432
      protocol      = "tcp"
    }]

    environment = [
      { name = "POSTGRES_USER", value = "postgres" },
      { name = "POSTGRES_PASSWORD", value = "postgres" },
      { name = "POSTGRES_DB", value = "magician_props_store" }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.postgres.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "postgres"
      }
    }
  }])

  tags = local.tags
}

# Backend WITH Hud
resource "aws_ecs_task_definition" "backend_with_hud" {
  family                   = "${local.name}-backend-with-hud"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.backend_cpu
  memory                   = var.backend_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "backend"
    image = "${aws_ecr_repository.backend.repository_url}:latest"

    essential = true

    portMappings = [{
      containerPort = 3001
      protocol      = "tcp"
    }]

    command = ["npm", "run", "start:prod"]

    environment = [
      { name = "NODE_ENV", value = "development" },
      { name = "PORT", value = "3001" },
      { name = "DB_HOST", value = "postgres.stress-test.local" },
      { name = "DB_PORT", value = "5432" },
      { name = "DB_NAME", value = "magician_props_store" },
      { name = "DB_USER", value = "postgres" },
      { name = "DB_PASSWORD", value = "postgres" },
      { name = "CHECKOUT_SERVICE_URL", value = "https://red-art-630d.omer-b78.workers.dev" },
      { name = "HUD_API_KEY", value = var.hud_api_key },
      { name = "HUD_ENABLED", value = "true" }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.backend_with_hud.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "backend"
      }
    }
  }])

  tags = local.tags
}

# Backend WITHOUT Hud
resource "aws_ecs_task_definition" "backend_no_hud" {
  family                   = "${local.name}-backend-no-hud"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.backend_cpu
  memory                   = var.backend_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "backend"
    image = "${aws_ecr_repository.backend.repository_url}:latest"

    essential = true

    portMappings = [{
      containerPort = 3001
      protocol      = "tcp"
    }]

    command = ["node", "dist/main.js"]

    environment = [
      { name = "NODE_ENV", value = "development" },
      { name = "PORT", value = "3001" },
      { name = "DB_HOST", value = "postgres.stress-test.local" },
      { name = "DB_PORT", value = "5432" },
      { name = "DB_NAME", value = "magician_props_store" },
      { name = "DB_USER", value = "postgres" },
      { name = "DB_PASSWORD", value = "postgres" },
      { name = "CHECKOUT_SERVICE_URL", value = "https://red-art-630d.omer-b78.workers.dev" },
      { name = "HUD_ENABLED", value = "false" }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.backend_no_hud.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "backend"
      }
    }
  }])

  tags = local.tags
}

# K6 Runner
resource "aws_ecs_task_definition" "k6" {
  family                   = "${local.name}-k6"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "k6"
    image = "${aws_ecr_repository.backend.repository_url}:k6"

    essential = true

    environment = [
      { name = "WITH_HUD_URL", value = "http://with-hud.stress-test.local:3001" },
      { name = "NO_HUD_URL", value = "http://no-hud.stress-test.local:3001" },
      { name = "K6_DURATION", value = var.k6_duration },
      { name = "K6_VUS", value = tostring(var.k6_vus) }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.k6.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "k6"
      }
    }
  }])

  tags = local.tags
}

# -----------------------------------------------------------------------------
# ECS Services
# -----------------------------------------------------------------------------

resource "aws_ecs_service" "postgres" {
  name            = "postgres"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.postgres.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [aws_subnet.public.id]
    security_groups  = [aws_security_group.internal.id]
    assign_public_ip = true
  }

  service_registries {
    registry_arn = aws_service_discovery_service.postgres.arn
  }

  tags = local.tags
}

resource "aws_ecs_service" "backend_with_hud" {
  name            = "backend-with-hud"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend_with_hud.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [aws_subnet.public.id]
    security_groups  = [aws_security_group.internal.id]
    assign_public_ip = true
  }

  service_registries {
    registry_arn = aws_service_discovery_service.backend_with_hud.arn
  }

  depends_on = [aws_ecs_service.postgres]

  tags = local.tags
}

resource "aws_ecs_service" "backend_no_hud" {
  name            = "backend-no-hud"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend_no_hud.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [aws_subnet.public.id]
    security_groups  = [aws_security_group.internal.id]
    assign_public_ip = true
  }

  service_registries {
    registry_arn = aws_service_discovery_service.backend_no_hud.arn
  }

  depends_on = [aws_ecs_service.postgres]

  tags = local.tags
}

# -----------------------------------------------------------------------------
# Continuous Load Generator
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "load_generator" {
  name              = "/ecs/${local.name}/load-generator"
  retention_in_days = 1
  tags              = local.tags
}

resource "aws_ecs_task_definition" "load_generator" {
  family                   = "${local.name}-load-generator"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "load-generator"
    image = "${aws_ecr_repository.backend.repository_url}:load-generator"

    essential = true

    environment = [
      { name = "WITH_HUD_URL", value = "http://with-hud.stress-test.local:3001" },
      { name = "NO_HUD_URL", value = "http://no-hud.stress-test.local:3001" },
      { name = "REQUESTS_PER_SECOND", value = tostring(var.load_generator_rps) }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.load_generator.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "load-gen"
      }
    }
  }])

  tags = local.tags
}

resource "aws_ecs_service" "load_generator" {
  name            = "load-generator"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.load_generator.arn
  desired_count   = var.load_generator_enabled ? 1 : 0
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [aws_subnet.public.id]
    security_groups  = [aws_security_group.internal.id]
    assign_public_ip = true
  }

  depends_on = [aws_ecs_service.backend_with_hud, aws_ecs_service.backend_no_hud]

  tags = local.tags
}
