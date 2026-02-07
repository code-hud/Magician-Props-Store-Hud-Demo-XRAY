# Hud SDK Performance Benchmark

Deploys two identical NestJS backends on AWS ECS Fargate—one with Hud SDK instrumentation, one without—to measure performance overhead under identical load.

## Quick Start

### Prerequisites

- AWS CLI configured with credentials
- Terraform >= 1.0
- Docker

### Deploy

```bash
# Set your configuration
export AWS_REGION="us-east-2"
export HUD_API_KEY="your_hud_api_key"

# Initialize Terraform
terraform init

# Deploy infrastructure
terraform apply -var "hud_api_key=$HUD_API_KEY" -var "aws_region=$AWS_REGION"

# Build and push Docker images
./deploy.sh build

# Force redeploy services to pick up new images
aws ecs update-service --cluster magician-props-store-demo-stress-test --service postgres --force-new-deployment --region $AWS_REGION
aws ecs update-service --cluster magician-props-store-demo-stress-test --service backend-with-hud --force-new-deployment --region $AWS_REGION
aws ecs update-service --cluster magician-props-store-demo-stress-test --service backend-no-hud --force-new-deployment --region $AWS_REGION
aws ecs update-service --cluster magician-props-store-demo-stress-test --service load-generator --force-new-deployment --region $AWS_REGION
```

### Monitor

```bash
# View load generator comparison logs
aws logs tail /ecs/magician-props-store-demo-stress-test/load-generator --follow --region $AWS_REGION

# View CloudWatch metrics
# Go to: CloudWatch > Metrics > ECS > ClusterName, ServiceName
# Compare: backend-with-hud vs backend-no-hud
```

### Destroy

```bash
terraform destroy -var "hud_api_key=$HUD_API_KEY" -var "aws_region=$AWS_REGION"
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `hud_api_key` | (required) | Your Hud API key |
| `aws_region` | `us-east-2` | AWS region |
| `backend_cpu` | `512` | CPU units (0.5 vCPU) |
| `backend_memory` | `1024` | Memory in MB |
| `load_generator_rps` | `5` | Requests per second |

## Benchmark Results

See [BENCHMARK_RESULTS.md](./BENCHMARK_RESULTS.md) for detailed performance metrics and findings.
