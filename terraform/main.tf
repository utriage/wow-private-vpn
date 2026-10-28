# -------------------------------------------------------------------
# AWS プロバイダー設定
# プロファイルは .envrc (AWS_PROFILE=wow-vpn) より自動解決されます
# -------------------------------------------------------------------
provider "aws" {
  region = var.primary_region
}

provider "aws" {
  alias  = "oregon"
  region = var.oregon_region
}

# ===================================================================
# 1. 東京サーバー (入口ノード - ユーザー接続用)
# ===================================================================
resource "aws_lightsail_instance" "tokyo" {
  name              = "wow-vpn-tokyo"
  availability_zone = var.primary_az
  blueprint_id      = var.blueprint_id
  bundle_id         = var.bundle_id
  ip_address_type   = "dualstack"
  tags              = var.tags
}

resource "aws_lightsail_static_ip" "tokyo_ip" {
  name = "wow-vpn-ip"
}

resource "aws_lightsail_static_ip_attachment" "tokyo_attach" {
  static_ip_name = aws_lightsail_static_ip.tokyo_ip.id
  instance_name  = aws_lightsail_instance.tokyo.id
}

resource "aws_lightsail_instance_public_ports" "tokyo_ports" {
  instance_name = aws_lightsail_instance.tokyo.name

  # WireGuard 通信用 UDP ポート
  port_info {
    protocol   = "udp"
    from_port  = 51820
    to_port    = 51820
    cidrs      = ["0.0.0.0/0"]
    ipv6_cidrs = ["::/0"]
  }

  # SSH 管理用 TCP ポート
  port_info {
    protocol   = "tcp"
    from_port  = 22
    to_port    = 22
    cidrs      = var.allowed_ssh_cidrs
    ipv6_cidrs = ["::/0"]
  }

  # Lightsail デフォルト開放 HTTP ポート
  port_info {
    protocol   = "tcp"
    from_port  = 80
    to_port    = 80
    cidrs      = ["0.0.0.0/0"]
    ipv6_cidrs = ["::/0"]
  }
}

# ===================================================================
# 2. オレゴンサーバー (出口ノード - Blizzard US 向け)
# ===================================================================
resource "aws_lightsail_instance" "oregon" {
  count             = var.enable_oregon ? 1 : 0
  provider          = aws.oregon
  name              = "wow-vpn-uswest2"
  availability_zone = var.oregon_az
  blueprint_id      = var.blueprint_id
  bundle_id         = var.bundle_id
  ip_address_type   = "dualstack"
  tags              = var.tags
}

resource "aws_lightsail_static_ip" "oregon_ip" {
  count    = var.enable_oregon ? 1 : 0
  provider = aws.oregon
  name     = "wow-vpn-uswest2-ip"
}

resource "aws_lightsail_static_ip_attachment" "oregon_attach" {
  count          = var.enable_oregon ? 1 : 0
  provider       = aws.oregon
  static_ip_name = aws_lightsail_static_ip.oregon_ip[0].id
  instance_name  = aws_lightsail_instance.oregon[0].id
}

resource "aws_lightsail_instance_public_ports" "oregon_ports" {
  count         = var.enable_oregon ? 1 : 0
  provider      = aws.oregon
  instance_name = aws_lightsail_instance.oregon[0].name

  # WireGuard トンネル通信用 UDP ポート
  port_info {
    protocol   = "udp"
    from_port  = 51820
    to_port    = 51820
    cidrs      = ["0.0.0.0/0"]
    ipv6_cidrs = ["::/0"]
  }

  # SSH 管理用 TCP ポート
  port_info {
    protocol   = "tcp"
    from_port  = 22
    to_port    = 22
    cidrs      = var.allowed_ssh_cidrs
    ipv6_cidrs = ["::/0"]
  }

  # Lightsail デフォルト開放 HTTP ポート
  port_info {
    protocol   = "tcp"
    from_port  = 80
    to_port    = 80
    cidrs      = ["0.0.0.0/0"]
    ipv6_cidrs = ["::/0"]
  }
}
