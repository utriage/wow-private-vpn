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
# ローカル変数: 東京 ⇆ オレゴン間 Site-to-Site 中継 & ピア定義
# ===================================================================
locals {
  # 1. ギルドメンバー (クライアント) を peers オブジェクトリストに正規化
  client_peers = [
    for p in var.wireguard_peers : {
      name                 = p.name
      public_key           = p.public_key
      allowed_ips          = "${p.ip}/32"
      endpoint             = ""
      persistent_keepalive = 0
    }
  ]

  # 2. オレゴン出口ノード (東京の Peer として登録)
  #    WoWの全宛先 (local.wow_ip_ranges) をオレゴンへ AWS バックボーン経由で中継
  oregon_gateway_peer = var.enable_oregon ? [
    {
      name                 = "Oregon-Exit-Gateway"
      public_key           = var.oregon_server_public_key
      allowed_ips          = join(", ", concat(["10.0.1.0/24"], local.wow_ip_ranges))
      endpoint             = "${aws_lightsail_static_ip.oregon_ip[0].ip_address}:51820"
      persistent_keepalive = 25
    }
  ] : []

  # 3. 東京入口ノード (オレゴンの Peer として登録)
  #    東京および全メンバーの仮想IP帯 (10.0.0.0/24) からの受信を許可
  tokyo_gateway_peer = [
    {
      name                 = "Tokyo-Entry-Gateway"
      public_key           = var.tokyo_server_public_key
      allowed_ips          = "10.0.0.0/24"
      endpoint             = "${aws_lightsail_static_ip.tokyo_ip.ip_address}:51820"
      persistent_keepalive = 25
    }
  ]

  tokyo_all_peers  = concat(local.client_peers, local.oregon_gateway_peer)
  oregon_all_peers = local.tokyo_gateway_peer
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

  # 日々のピア追加・更新によるインスタンス再作成（切断）を抑止
  lifecycle {
    ignore_changes = [user_data]
  }

  # 起動時オプション (Immutable 自動セットアップ & ログ通知)
  user_data = templatefile("${path.module}/templates/user_data.sh.tftpl", {
    gateway_name        = "WoW Tokyo Entry Gateway"
    server_private_key  = var.tokyo_server_private_key
    vpn_ip_cidr         = "10.0.0.1/24"
    peers               = local.tokyo_all_peers
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

  # 日々のピア追加・更新によるインスタンス再作成（切断）を抑止
  lifecycle {
    ignore_changes = [user_data]
  }

  # 起動時オプション (Immutable 自動セットアップ & ログ通知)
  user_data = templatefile("${path.module}/templates/user_data.sh.tftpl", {
    gateway_name        = "WoW Oregon Exit Gateway"
    server_private_key  = var.oregon_server_private_key
    vpn_ip_cidr         = "10.0.1.1/24"
    peers               = local.oregon_all_peers
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
