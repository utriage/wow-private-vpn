#!/bin/bash
# ===================================================================
# AWS Lightsail (Ubuntu 22.04 / 24.04) 向け WireGuard 高速セットアップスクリプト
# ===================================================================
set -e

echo "=== 1. パッケージ更新 & WireGuard インストール ==="
sudo apt-get update
sudo apt-get install -y wireguard qrencode iptables

echo "=== 2. IPフォワーディング (パケット転送) の有効化 ==="
sudo sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf

echo "=== 3. 鍵ペアの生成 ==="
cd /etc/wireguard
umask 077
wg genkey | tee server_private.key | wg pubkey > server_public.key
wg genkey | tee client_private.key | wg pubkey > client_public.key

SERVER_PRIV=$(cat server_private.key)
SERVER_PUB=$(cat server_public.key)
CLIENT_PRIV=$(cat client_private.key)
CLIENT_PUB=$(cat client_public.key)

# デフォルトのネットワークインターフェース名を取得 (eth0, ens5 等)
NET_IF=$(ip route get 8.8.8.8 | awk -- '{print $5}')
SERVER_IP=$(curl -s https://checkip.amazonaws.com)

echo "=== 4. サーバー側設定 (/etc/wireguard/wg0.conf) の作成 ==="
cat <<EOF | sudo tee /etc/wireguard/wg0.conf
[Interface]
Address = 10.0.0.1/24
ListenPort = 51820
PrivateKey = ${SERVER_PRIV}

# 起動・停止時のiptables NAT設定
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o ${NET_IF} -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o ${NET_IF} -j MASQUERADE

[Peer]
# クライアント (PoC用 1台目)
PublicKey = ${CLIENT_PUB}
AllowedIPs = 10.0.0.2/32
EOF

echo "=== 5. WireGuard サービスの起動 & 自動起動有効化 ==="
sudo systemctl enable wg-quick@wg0
sudo systemctl restart wg-quick@wg0

echo ""
echo "==================================================================="
echo " ★ セットアップが完了しました！"
echo " 以下の値をローカルの wow-poc.conf に反映してください："
echo "==================================================================="
echo "SERVER_PUBLIC_IP  : ${SERVER_IP}"
echo "SERVER_PUBLIC_KEY : ${SERVER_PUB}"
echo "CLIENT_PRIVATE_KEY: ${CLIENT_PRIV}"
echo "==================================================================="
