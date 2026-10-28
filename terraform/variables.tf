variable "aws_profile" {
  type        = string
  description = "AWS CLIプロファイル名 (認証情報のコード露出を防ぎ、ローカルセッションを利用します)"
  default     = "wow-vpn"
}

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

variable "allowed_ssh_cidrs" {
  type        = list(string)
  description = "SSH接続 (ポート22) を許可するCIDRリスト (運用時は管理者のIPに絞ることを推奨)"
  default     = ["0.0.0.0/0"]
}

variable "tags" {
  type        = map(string)
  description = "リソースに付与する共通タグ"
  default = {
    Project     = "wow-private-vpn"
    Environment = "trial"
  }
}
