#!/bin/bash
# ===================================================================
# AWS Lightsail (Ubuntu 22.04 / 24.04) 向け WireGuard 高速セットアップスクリプト
# ===================================================================
set -e

echo "=== 1. パッケージ更新 & 必須ツールインストール ==="
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update
sudo apt-get install -y wireguard qrencode iptables iptables-persistent

echo "=== 2. IPフォワーディング (パケット転送) の有効化 ==="
sudo sysctl -w net.ipv4.ip_forward=1
if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
    echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
fi

echo "=== 3. 鍵ペアの生成 ==="
sudo mkdir -p /etc/wireguard
cd /etc/wireguard
sudo umask 077

if [ ! -f "server_private.key" ]; then
    wg genkey | sudo tee server_private.key | wg pubkey | sudo tee server_public.key > /dev/null
fi

if [ ! -f "client_private.key" ]; then
    wg genkey | sudo tee client_private.key | wg pubkey | sudo tee client_public.key > /dev/null
fi

SERVER_PRIV=$(sudo cat server_private.key)
SERVER_PUB=$(sudo cat server_public.key)
CLIENT_PRIV=$(sudo cat client_private.key)
CLIENT_PUB=$(sudo cat client_public.key)

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

# --- 管理者 / PoC 1台目 ---
[Peer]
PublicKey = ${CLIENT_PUB}
AllowedIPs = 10.0.0.2/32
EOF

echo "=== 5. WireGuard サービスの起動 & 自動起動有効化 ==="
sudo systemctl enable wg-quick@wg0
sudo systemctl restart wg-quick@wg0

# 管理者用クライアント設定ファイルを出力
sudo mkdir -p /etc/wireguard/clients
sudo chmod 700 /etc/wireguard/clients

echo ""
echo "==================================================================="
echo " ★ WireGuard サーバーのセットアップが完了しました！"
echo "==================================================================="
echo "SERVER_PUBLIC_IP  : ${SERVER_IP}"
echo "SERVER_PUBLIC_KEY : ${SERVER_PUB}"
echo "ADMIN_CLIENT_KEY  : ${CLIENT_PRIV}"
echo "ADMIN_VPN_IP      : 10.0.0.2/32"
echo "==================================================================="
echo "【ギルドメンバーの追加方法】"
echo " 新規メンバーを追加する際は、以下のコマンドを実行してください："
echo "   sudo ./scripts/add_member.sh <メンバー名> <末尾IP (3〜254)>"
echo "==================================================================="
