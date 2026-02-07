#!/bin/bash
set -e

# Configuration
AWS_REGION="${AWS_REGION:-us-east-2}"
PROJECT_NAME="magician-props-store-demo-stress-test"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    command -v aws >/dev/null 2>&1 || error "AWS CLI not found. Install: brew install awscli"
    command -v terraform >/dev/null 2>&1 || error "Terraform not found. Install: brew install terraform"
    command -v docker >/dev/null 2>&1 || error "Docker not found"

    # Check AWS credentials
    aws sts get-caller-identity >/dev/null 2>&1 || error "AWS credentials not configured. Run: aws configure"
    log "Prerequisites OK"
}

# Initialize and apply Terraform
setup_infrastructure() {
    log "Setting up AWS infrastructure..."
    cd "$SCRIPT_DIR"

    terraform init
    terraform apply -auto-approve \
        -var "hud_api_key=${HUD_API_KEY:-}" \
        -var "aws_region=$AWS_REGION"

    # Get outputs
    ECR_URL=$(terraform output -raw ecr_repository_url)
    CLUSTER_NAME=$(terraform output -raw ecs_cluster_name)
    SUBNET_ID=$(terraform output -raw subnet_id)
    SG_ID=$(terraform output -raw security_group_id)

    log "Infrastructure created"
}

# Build and push Docker images
build_and_push() {
    log "Building and pushing Docker images..."

    # Login to ECR
    aws ecr get-login-password --region "$AWS_REGION" | \
        docker login --username AWS --password-stdin "$ECR_URL"

    # Build Postgres image with init script (linux/amd64 for Fargate)
    log "Building Postgres image with init script for linux/amd64..."
    cp "$ROOT_DIR/docker/postgres/init.sql" "$SCRIPT_DIR/init.sql"
    docker build \
        --platform linux/amd64 \
        -f "$SCRIPT_DIR/Dockerfile.postgres" \
        -t "$ECR_URL:postgres" \
        "$SCRIPT_DIR"
    rm "$SCRIPT_DIR/init.sql"

    # Push Postgres image
    log "Pushing Postgres image..."
    docker push "$ECR_URL:postgres"

    # Build backend image (linux/amd64 for Fargate)
    log "Building backend image for linux/amd64..."
    docker build \
        --platform linux/amd64 \
        --build-arg GIT_COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown") \
        -t "$ECR_URL:latest" \
        "$ROOT_DIR/backend"

    # Push backend image
    log "Pushing backend image..."
    docker push "$ECR_URL:latest"

    # Build K6 image (linux/amd64 for Fargate)
    log "Building K6 image for linux/amd64..."
    docker build \
        --platform linux/amd64 \
        -f "$SCRIPT_DIR/Dockerfile.k6" \
        -t "$ECR_URL:k6" \
        "$SCRIPT_DIR"

    # Build load generator image (linux/amd64 for Fargate)
    log "Building load generator image for linux/amd64..."
    docker build \
        --platform linux/amd64 \
        -t "$ECR_URL:load-generator" \
        "$SCRIPT_DIR/load-generator"

    # Push load generator image
    log "Pushing load generator image..."
    docker push "$ECR_URL:load-generator"

    # Push K6 image
    log "Pushing K6 image..."
    docker push "$ECR_URL:k6"

    log "Images pushed to ECR"
}

# Wait for services to be healthy
wait_for_services() {
    log "Waiting for services to be healthy..."

    for service in postgres backend-with-hud backend-no-hud; do
        log "Waiting for $service..."
        aws ecs wait services-stable \
            --cluster "$CLUSTER_NAME" \
            --services "$service" \
            --region "$AWS_REGION" || warn "Service $service may not be stable"
    done

    log "All services running"
}

# Run the stress test
run_stress_test() {
    log "Starting K6 stress test..."

    TASK_ARN=$(aws ecs run-task \
        --cluster "$CLUSTER_NAME" \
        --task-definition "${PROJECT_NAME}-k6" \
        --launch-type FARGATE \
        --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_ID],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
        --region "$AWS_REGION" \
        --query 'tasks[0].taskArn' \
        --output text)

    log "K6 task started: $TASK_ARN"
    log "View logs: aws logs tail /ecs/${PROJECT_NAME}/k6 --follow --region $AWS_REGION"

    # Wait for task to complete
    log "Waiting for stress test to complete..."
    aws ecs wait tasks-stopped \
        --cluster "$CLUSTER_NAME" \
        --tasks "$TASK_ARN" \
        --region "$AWS_REGION"

    log "Stress test completed!"
    log "View results in CloudWatch logs"
}

# Destroy infrastructure
destroy() {
    log "Destroying infrastructure..."
    cd "$SCRIPT_DIR"
    terraform destroy -auto-approve \
        -var "hud_api_key=${HUD_API_KEY:-}" \
        -var "aws_region=$AWS_REGION"
    log "Infrastructure destroyed"
}

# Show help
show_help() {
    cat << EOF
Usage: $0 <command>

Commands:
  setup       Create AWS infrastructure (VPC, ECS, ECR)
  build       Build and push Docker images to ECR
  deploy      Setup + build + wait for services
  test        Run the K6 stress test
  all         Deploy + test (full workflow)
  logs        Tail K6 logs
  status      Show ECS service status
  destroy     Tear down all AWS resources

Environment Variables:
  HUD_API_KEY     Hud API key (required for with-hud backend)
  AWS_REGION      AWS region (default: eu-west-1)

Examples:
  HUD_API_KEY=xxx ./deploy.sh all      # Full deployment and test
  ./deploy.sh test                      # Run stress test only
  ./deploy.sh destroy                   # Clean up everything
EOF
}

# Show status
show_status() {
    cd "$SCRIPT_DIR"
    CLUSTER_NAME=$(terraform output -raw ecs_cluster_name 2>/dev/null) || error "Infrastructure not deployed"

    log "ECS Services Status:"
    aws ecs describe-services \
        --cluster "$CLUSTER_NAME" \
        --services postgres backend-with-hud backend-no-hud \
        --region "$AWS_REGION" \
        --query 'services[].{Name:serviceName,Status:status,Running:runningCount,Desired:desiredCount}' \
        --output table
}

# Tail logs
tail_logs() {
    log "Tailing K6 logs (Ctrl+C to stop)..."
    aws logs tail "/ecs/${PROJECT_NAME}/k6" --follow --region "$AWS_REGION"
}

# Main
case "${1:-help}" in
    setup)
        check_prerequisites
        setup_infrastructure
        ;;
    build)
        check_prerequisites
        cd "$SCRIPT_DIR"
        ECR_URL=$(terraform output -raw ecr_repository_url)
        build_and_push
        ;;
    deploy)
        check_prerequisites
        setup_infrastructure
        build_and_push
        wait_for_services
        log "Deployment complete! Run: $0 test"
        ;;
    test)
        check_prerequisites
        cd "$SCRIPT_DIR"
        CLUSTER_NAME=$(terraform output -raw ecs_cluster_name)
        SUBNET_ID=$(terraform output -raw subnet_id)
        SG_ID=$(terraform output -raw security_group_id)
        run_stress_test
        ;;
    all)
        check_prerequisites
        setup_infrastructure
        build_and_push
        wait_for_services
        sleep 30  # Give services time to fully initialize
        run_stress_test
        ;;
    logs)
        tail_logs
        ;;
    status)
        show_status
        ;;
    destroy)
        destroy
        ;;
    help|*)
        show_help
        ;;
esac
