output "tokyo_instance_name" {
  description = "東京 (入口) サーバーのインスタンス名"
  value       = aws_lightsail_instance.tokyo.name
}

output "tokyo_static_ip" {
  description = "東京 (入口) サーバーの静的パブリックIP"
  value       = aws_lightsail_static_ip.tokyo_ip.ip_address
}

output "tokyo_wireguard_endpoint" {
  description = "ギルドメンバー配布用クライアント設定のエンドポイント"
  value       = "${aws_lightsail_static_ip.tokyo_ip.ip_address}:51820"
}

output "oregon_instance_name" {
  description = "オレゴン (出口) サーバーのインスタンス名"
  value       = var.enable_oregon ? aws_lightsail_instance.oregon[0].name : "disabled"
}

output "oregon_static_ip" {
  description = "オレゴン (出口) サーバーの静的パブリックIP"
  value       = var.enable_oregon ? aws_lightsail_static_ip.oregon_ip[0].ip_address : "disabled"
}
