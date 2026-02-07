output "ecr_repository_url" {
  description = "ECR repository URL for backend image"
  value       = aws_ecr_repository.backend.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "k6_task_definition" {
  description = "K6 task definition ARN"
  value       = aws_ecs_task_definition.k6.arn
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "subnet_id" {
  description = "Public subnet ID"
  value       = aws_subnet.public.id
}

output "security_group_id" {
  description = "Security group ID"
  value       = aws_security_group.internal.id
}

output "cloudwatch_log_groups" {
  description = "CloudWatch log group names"
  value = {
    postgres        = aws_cloudwatch_log_group.postgres.name
    backend_with_hud = aws_cloudwatch_log_group.backend_with_hud.name
    backend_no_hud   = aws_cloudwatch_log_group.backend_no_hud.name
    k6              = aws_cloudwatch_log_group.k6.name
  }
}

output "run_k6_command" {
  description = "Command to run K6 stress test"
  value       = <<-EOT
    aws ecs run-task \
      --cluster ${aws_ecs_cluster.main.name} \
      --task-definition ${aws_ecs_task_definition.k6.family} \
      --launch-type FARGATE \
      --network-configuration "awsvpcConfiguration={subnets=[${aws_subnet.public.id}],securityGroups=[${aws_security_group.internal.id}],assignPublicIp=ENABLED}"
  EOT
}

output "view_logs_commands" {
  description = "Commands to view CloudWatch logs"
  value       = <<-EOT
    # K6 results:
    aws logs tail /ecs/magician-props-store-demo-stress-test/k6 --follow

    # Backend with Hud:
    aws logs tail /ecs/magician-props-store-demo-stress-test/backend-with-hud --follow

    # Backend without Hud:
    aws logs tail /ecs/magician-props-store-demo-stress-test/backend-no-hud --follow
  EOT
}
