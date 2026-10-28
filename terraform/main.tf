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

  # 起動時オプション (Immutable 自動セットアップ & ログ通知)
  user_data = templatefile("${path.module}/templates/user_data.sh.tftpl", {
    gateway_name        = "WoW Tokyo Entry Gateway"
    server_private_key  = var.tokyo_server_private_key
    vpn_ip_cidr         = "10.0.0.1/24"
    peers               = var.wireguard_peers
    discord_webhook_url = var.tokyo_discord_webhook_url
  })
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

  # インスタンス再作成時にポート設定が確実に連動適用されるよう保証
  lifecycle {
    replace_triggered_by = [aws_lightsail_instance.tokyo]
  }

  # WireGuard 通信用 UDP ポート (唯一の常時開放ポート)
  port_info {
    protocol   = "udp"
    from_port  = 51820
    to_port    = 51820
    cidrs      = ["0.0.0.0/0"]
    ipv6_cidrs = ["::/0"]
  }

  # 緊急メンテナンス時のみ開放可能な SSH ポート (通常時は閉鎖)
  dynamic "port_info" {
    for_each = var.enable_ssh ? [1] : []
    content {
      protocol   = "tcp"
      from_port  = 22
      to_port    = 22
      cidrs      = var.allowed_ssh_cidrs
      ipv6_cidrs = ["::/0"]
    }
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

  # 起動時オプション (Immutable 自動セットアップ & ログ通知)
  user_data = templatefile("${path.module}/templates/user_data.sh.tftpl", {
    gateway_name        = "WoW Oregon Exit Gateway"
    server_private_key  = var.oregon_server_private_key
    vpn_ip_cidr         = "10.0.1.1/24"
    peers               = []
    discord_webhook_url = var.oregon_discord_webhook_url
  })
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

  # インスタンス再作成時にポート設定が確実に連動適用されるよう保証
  lifecycle {
    replace_triggered_by = [aws_lightsail_instance.oregon[0]]
  }

  # WireGuard トンネル通信用 UDP ポート
  port_info {
    protocol   = "udp"
    from_port  = 51820
    to_port    = 51820
    cidrs      = ["0.0.0.0/0"]
    ipv6_cidrs = ["::/0"]
  }

  # 緊急メンテナンス時のみ開放可能な SSH ポート (通常時は閉鎖)
  dynamic "port_info" {
    for_each = var.enable_ssh ? [1] : []
    content {
      protocol   = "tcp"
      from_port  = 22
      to_port    = 22
      cidrs      = var.allowed_ssh_cidrs
      ipv6_cidrs = ["::/0"]
    }
  }
}
