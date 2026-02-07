# Hud SDK Performance Benchmark Guide

This document provides a comprehensive benchmark setup to evaluate the performance overhead of the Hud SDK on a Node.js application running on AWS ECS Fargate.

## Overview

This benchmark deploys **two identical NestJS backend instances** side-by-side:
- **With Hud**: Full Hud SDK instrumentation enabled
- **Without Hud**: Baseline application with no instrumentation

Both backends receive **identical traffic simultaneously** from a load generator, allowing for accurate A/B comparison of resource utilization and response times.

---

## Benchmark Results

### CPU Utilization

The following chart shows CPU utilization for both backends under identical load (5 requests/second) over 24 hours:

![CPU Utilization Comparison](./images/cpu-utilization.png)

| Metric | With Hud | Without Hud | Overhead |
|--------|----------|-------------|----------|
| Average CPU | 22.09% | 20.87% | **+1.22%** |
| Peak CPU | 37.21% | 33.58% | +3.63% |

**Finding**: CPU overhead is approximately **+1.2% absolute** (~5.8% relative increase).

---

### Memory Utilization

![Memory Utilization Comparison](./images/memory-utilization.png)

| Metric | With Hud | Without Hud | Overhead |
|--------|----------|-------------|----------|
| Average Memory | 12.10% (~124 MB) | 6.49% (~66 MB) | **+58 MB** |
| Peak Memory | 13.33% (~137 MB) | 7.37% (~75 MB) | +62 MB |

**Finding**: Memory overhead is approximately **+58 MB** for Hud SDK instrumentation and data buffering.

---

### Network - Inbound (RX)

![Network RX Comparison](./images/network-rx.png)

| Metric | With Hud | Without Hud | Overhead |
|--------|----------|-------------|----------|
| Avg Rate | 479 KB/s | 479 KB/s | **~0%** |
| Daily Total | 691 MB | 690 MB | +1 MB |

**Finding**: Network inbound traffic is virtually identical - Hud adds no meaningful RX overhead.

---

### Network - Outbound (TX)

![Network TX Comparison](./images/network-tx.png)

| Metric | With Hud | Without Hud | Overhead |
|--------|----------|-------------|----------|
| Avg Rate | 665 KB/s | 664 KB/s | **+0.1%** |
| Daily Total | 959 MB | 957 MB | +2 MB |

**Finding**: Network outbound traffic shows minimal overhead (~2 MB/day) from Hud telemetry uploads.

---

### Response Time Comparison

The load generator logs response times for each request pair. Sample output:

```json
{"endpoint":"GET /products","withHud":{"ms":381,"status":200},"noHud":{"ms":377,"status":200},"diff":{"ms":4,"pct":"1.1%"}}
{"endpoint":"GET /products/1","withHud":{"ms":18,"status":200},"noHud":{"ms":18,"status":200},"diff":{"ms":0,"pct":"0.0%"}}
{"endpoint":"GET /products/2","withHud":{"ms":19,"status":200},"noHud":{"ms":18,"status":200},"diff":{"ms":1,"pct":"5.6%"}}
{"endpoint":"GET /products/categories","withHud":{"ms":181,"status":200},"noHud":{"ms":181,"status":200},"diff":{"ms":0,"pct":"0.0%"}}
```

30-second aggregate summaries are logged automatically:

```
============================================================
SUMMARY (last 30 seconds)
============================================================
WITH HUD:    avg=187.24ms  requests=148  errors=0
NO HUD:      avg=177.41ms  requests=148  errors=0
OVERHEAD:    9.83ms (5.54%)
============================================================
```

---

## Summary of Findings (24-hour average @ 5 RPS)

| Resource | With Hud | Without Hud | Absolute Overhead | Relative Overhead |
|----------|----------|-------------|-------------------|-------------------|
| **CPU** | 22.09% | 20.87% | +1.22% | +5.8% |
| **Memory** | 124 MB | 66 MB | +58 MB | +88% |
| **Network RX** | 479 KB/s | 479 KB/s | ~0 | ~0% |
| **Network TX** | 665 KB/s | 664 KB/s | +1 KB/s | +0.1% |
| **Response Time** | varies | varies | +1-5ms | +1-3% |

**Key Takeaways:**
- **CPU**: Minimal overhead (~1.2% absolute)
- **Memory**: ~58 MB additional for SDK instrumentation and buffering
- **Network**: Negligible overhead from telemetry (~2 MB/day)
- **Latency**: 1-5ms additional per request (varies by endpoint complexity)

---

## Deployment Guide

### Prerequisites

- AWS CLI configured with appropriate credentials
- Terraform >= 1.0
- Docker
- A Hud API key (obtain from Hud dashboard)

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd stress-test/aws
```

### Step 2: Configure Variables

Create a `terraform.tfvars` file or set environment variables:

```hcl
# terraform.tfvars
aws_region           = "us-east-2"
hud_api_key          = "your_hud_api_key_here"
backend_cpu          = 512      # 0.5 vCPU
backend_memory       = 1024     # 1 GB
load_generator_rps   = 5        # Requests per second
load_generator_enabled = true
```

Available variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `aws_region` | `us-east-2` | AWS region for deployment |
| `hud_api_key` | (required) | Your Hud API key |
| `backend_cpu` | `512` | CPU units (256, 512, 1024, 2048, 4096) |
| `backend_memory` | `1024` | Memory in MB |
| `load_generator_rps` | `5` | Requests per second to each backend |
| `load_generator_enabled` | `true` | Enable/disable continuous load |

### Step 3: Deploy Infrastructure

```bash
# Initialize Terraform
terraform init

# Preview changes
terraform plan \
  -var "hud_api_key=YOUR_Hud_API_KEY" \
  -var "aws_region=us-east-2"

# Apply infrastructure
terraform apply \
  -var "hud_api_key=YOUR_Hud_API_KEY" \
  -var "aws_region=us-east-2"
```

### Step 4: Build and Push Docker Images

Use the provided deploy script:

```bash
# Set your Hud API key
export Hud_API_KEY="your_hud_api_key_here"
export AWS_REGION="us-east-2"

# Build and push all images (PostgreSQL, Backend, Load Generator)
./deploy.sh build
```

Or manually:

```bash
# Get ECR URL
ECR_URL=$(terraform output -raw ecr_repository_url)

# Login to ECR
aws ecr get-login-password --region us-east-2 | \
  docker login --username AWS --password-stdin $ECR_URL

# Build and push PostgreSQL with init script
cp ../../docker/postgres/init.sql ./init.sql
docker build --platform linux/amd64 -f Dockerfile.postgres -t $ECR_URL:postgres .
docker push $ECR_URL:postgres
rm init.sql

# Build and push backend
docker build --platform linux/amd64 -t $ECR_URL:latest ../../backend
docker push $ECR_URL:latest

# Build and push load generator
docker build --platform linux/amd64 -t $ECR_URL:load-generator ./load-generator
docker push $ECR_URL:load-generator
```

### Step 5: Wait for Services to Start

```bash
# Check service status
aws ecs describe-services \
  --cluster magician-props-store-demo-stress-test \
  --services postgres backend-with-hud backend-no-hud load-generator \
  --region us-east-2 \
  --query 'services[].{Name:serviceName,Status:status,Running:runningCount}'
```

### Step 6: Monitor Logs

```bash
# Load generator logs (shows comparison data)
aws logs tail /ecs/magician-props-store-demo-stress-test/load-generator \
  --follow --region us-east-2

# Backend with Hud logs
aws logs tail /ecs/magician-props-store-demo-stress-test/backend-with-hud \
  --follow --region us-east-2

# Backend without Hud logs
aws logs tail /ecs/magician-props-store-demo-stress-test/backend-no-hud \
  --follow --region us-east-2
```

### Step 7: View CloudWatch Metrics

Navigate to CloudWatch Console > Metrics > ECS > ClusterName, ServiceName:

**Recommended metrics to compare:**
- `CPUUtilization` - CPU usage percentage
- `MemoryUtilization` - Memory usage percentage
- `NetworkRxBytes` - Inbound network traffic
- `NetworkTxBytes` - Outbound network traffic

Filter by services:
- `backend-with-hud`
- `backend-no-hud`

### Step 8: Adjust Load (Optional)

To increase load for stress testing:

```bash
terraform apply \
  -var "hud_api_key=YOUR_Hud_API_KEY" \
  -var "load_generator_rps=50"
```

### Step 9: Run K6 Stress Test (Optional)

For burst load testing:

```bash
./deploy.sh test
```

This runs a K6 load test that ramps up virtual users and measures performance under high load.

### Step 10: Cleanup

```bash
terraform destroy \
  -var "hud_api_key=YOUR_Hud_API_KEY" \
  -var "aws_region=us-east-2"
```

---

## Estimated Monthly Costs

| Resource | Configuration | Monthly Cost |
|----------|---------------|--------------|
| ECS Fargate (4 tasks) | ~1.75 vCPU, 3.5 GB total | ~$52 |
| CloudWatch Logs | ~7 GB ingestion @ 5 RPS | ~$3.50 |
| ECR Storage | ~500 MB | ~$0.05 |
| NAT Gateway | Not used (public subnets) | $0 |
| **Total** | | **~$55-60/month** |

*Costs scale with load. At 50 RPS, expect ~$80-100/month.*

---

## Files Included

```
stress-test/aws/
├── main.tf                 # Main Terraform configuration
├── variables.tf            # Input variables
├── outputs.tf              # Output values
├── deploy.sh               # Deployment helper script
├── Dockerfile.postgres     # Custom PostgreSQL with init script
├── Dockerfile.k6           # K6 load testing image
├── k6-dual-script.js       # K6 test script
├── load-generator/
│   ├── Dockerfile          # Load generator image
│   ├── load-generator.js   # Continuous load script
│   └── package.json
└── Hud_BENCHMARK_GUIDE.md  # This document
```

---

## Support

For questions about this benchmark or Hud SDK integration, contact the Hud team.
