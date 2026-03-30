################################################################################
# Observability — Prometheus & Grafana on ECS
################################################################################

# CloudWatch Log Group for monitoring stack
resource "aws_cloudwatch_log_group" "monitoring" {
  name              = "/ecs/${var.project_name}-${var.environment}-monitoring"
  retention_in_days = 14
}

################################################################################
# Security Group — Monitoring
################################################################################

resource "aws_security_group" "monitoring" {
  name_prefix = "${var.project_name}-${var.environment}-monitoring-"
  description = "Security group for Prometheus & Grafana"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Grafana from ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description = "Prometheus from internal"
    from_port   = 9090
    to_port     = 9090
    protocol    = "tcp"
    self        = true
  }

  ingress {
    description     = "Prometheus scrape from ECS tasks"
    from_port       = 9090
    to_port         = 9090
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle {
    create_before_destroy = true
  }
}

################################################################################
# Task Definition — Prometheus
################################################################################

resource "aws_ecs_task_definition" "prometheus" {
  family                   = "${var.project_name}-${var.environment}-prometheus"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "prometheus"
    image = "prom/prometheus:v2.51.0"

    portMappings = [{
      containerPort = 9090
      protocol      = "tcp"
    }]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.monitoring.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "prometheus"
      }
    }
  }])
}

################################################################################
# Service — Prometheus
################################################################################

resource "aws_ecs_service" "prometheus" {
  name            = "${var.project_name}-${var.environment}-prometheus"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.prometheus.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.monitoring.id]
    assign_public_ip = false
  }
}

################################################################################
# Task Definition — Grafana
################################################################################

resource "aws_ecs_task_definition" "grafana" {
  family                   = "${var.project_name}-${var.environment}-grafana"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "grafana"
    image = "grafana/grafana:10.4.0"

    portMappings = [{
      containerPort = 3000
      protocol      = "tcp"
    }]

    environment = [
      { name = "GF_SECURITY_ADMIN_PASSWORD", value = "CHANGE_ME" },
      { name = "GF_SERVER_ROOT_URL", value = "https://grafana.${var.domain_name}" },
      { name = "GF_INSTALL_PLUGINS", value = "" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.monitoring.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "grafana"
      }
    }
  }])
}

################################################################################
# Service — Grafana
################################################################################

resource "aws_ecs_service" "grafana" {
  name            = "${var.project_name}-${var.environment}-grafana"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.grafana.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.monitoring.id]
    assign_public_ip = false
  }
}
