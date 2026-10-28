variable "primary_region" {
  type        = string
  description = "東京 (入口) サーバーのデプロイ先リージョン (選択されたリージョン)"
  default     = "ap-northeast-1"
}

variable "primary_az" {
  type        = string
  description = "東京サーバーのアベイラビリティゾーン"
  default     = "ap-northeast-1a"
}

variable "enable_oregon" {
  type        = bool
  description = "オレゴン (出口) サーバーをデプロイするかどうか (true / false)"
  default     = true
}

variable "oregon_region" {
  type        = string
  description = "オレゴン (出口) サーバーのデプロイ先リージョン"
  default     = "us-west-2"
}

variable "oregon_az" {
  type        = string
  description = "オレゴンサーバーのアベイラビリティゾーン"
  default     = "us-west-2a"
}

variable "blueprint_id" {
  type        = string
  description = "Lightsail OSブループリントID (Ubuntu 24.04 LTS)"
  default     = "ubuntu_24_04"
}

variable "bundle_id" {
  type        = string
  description = "Lightsail インスタンスプラン (nano_3_0: $3.50/月 512MB RAM, micro_3_0: $5.00/月 1GB RAM)"
  default     = "nano_3_0"
}

variable "enable_ssh" {
  type        = bool
  description = "SSH接続 (ポート22) を許可するかどうか (通常運用時は false で完全閉鎖)"
  default     = false
}

variable "allowed_ssh_cidrs" {
  type        = list(string)
  description = "enable_ssh=true 時に SSH接続を許可するCIDRリスト"
  default     = ["0.0.0.0/0"]
}

variable "tokyo_server_private_key" {
  type        = string
  description = "東京 (入口) サーバーの固定 WireGuard 秘密鍵"
  default     = ""
  sensitive   = true
}

variable "oregon_server_private_key" {
  type        = string
  description = "オレゴン (出口) サーバーの固定 WireGuard 秘密鍵"
  default     = ""
  sensitive   = true
}

variable "tokyo_discord_webhook_url" {
  type        = string
  description = "東京GWのログ・稼働通知用 Discord Webhook URL"
  default     = ""
  sensitive   = true
}

variable "oregon_discord_webhook_url" {
  type        = string
  description = "オレゴンGWのログ・稼働通知用 Discord Webhook URL"
  default     = ""
  sensitive   = true
}

variable "wireguard_peers" {
  type = list(object({
    name       = string
    public_key = string
    ip         = string
  }))
  description = "登録ギルドメンバー (Peer) の公開鍵・IPリスト"
  default     = []
}

variable "tags" {
  type        = map(string)
  description = "リソースに付与する共通タグ"
  default     = {}
}
