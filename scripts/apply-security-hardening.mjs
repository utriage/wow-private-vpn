#!/usr/bin/env node
/**
 * WoW Private VPN - セキュリティ強化ホット適用ツール (無停止適用)
 * 
 * 稼働中の東京・オレゴンサーバーに対し、JIT-SSH を用いて
 * 1. クライアント間アイソレーション (Client Isolation)
 * 2. サーバー側エグレスフィルタリング (Egress Filtering via ipset)
 * を即座に適用します。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runJitSshCommand } from "./lib/jit-ssh.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseDir = path.dirname(__dirname);

// wow_routes.tf から CIDR リストをパース
const wowRoutesFile = path.join(baseDir, "terraform", "wow_routes.tf");
const content = fs.readFileSync(wowRoutesFile, "utf-8");
const cidrMatches = [...content.matchAll(/"(\d+\.\d+\.\d+\.\d+\/\d+)"/g)];
const cidrs = cidrMatches.map((m) => m[1]);

console.log(`[情報] WoW 宛先帯域 (${cidrs.length} 件) を検出しました。`);

// リモートで実行する完全なシェルスクリプト
const remoteScript = `#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

echo "==> 1. ipset パッケージのインストール確認..."
which ipset >/dev/null 2>&1 || sudo apt-get install -y -qq ipset

echo "==> 2. ipset (wow_targets) を構築中..."
sudo ipset create wow_targets hash:net -exist
${cidrs.map((c) => `sudo ipset add wow_targets ${c} -exist`).join("\n")}

sudo mkdir -p /etc/iptables
sudo ipset save -file /etc/iptables/ipsets

echo "==> 3. /etc/wireguard/post-up.sh & post-down.sh の配置..."
cat << 'POSTUP_EOF' | sudo tee /etc/wireguard/post-up.sh > /dev/null
#!/bin/bash
NET_IF=$(ip route get 8.8.8.8 | awk -- '{print $5}')

if ! ipset list wow_targets >/dev/null 2>&1; then
    if [ -f /etc/iptables/ipsets ]; then
        ipset restore < /etc/iptables/ipsets
    fi
fi

# 1. 接続追跡 (戻りパケット) の最優先許可 (Site-to-Site 中継戻りパケットの保護)
iptables -A FORWARD -m state --state RELATED,ESTABLISHED -j ACCEPT

# 2. TCP MSS 最適化 (MTU不一致によるパケット詰まり防止)
iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu

# 3. クライアント間アイソレーション (Client Isolation)
#    メンバーPC宛て (10.0.0.0/24) への wg0 内パケット中継を即時 DROP (仲間PCの保護)
iptables -A FORWARD -i wg0 -o wg0 -d 10.0.0.0/24 -j DROP

# 4. サーバー側エグレスフィルタリング (Egress Filtering / 踏み台化・不正プロキシ化防止)
#    wg0 から外部インターネット ($NET_IF) への通信のうち、
#    宛先が Blizzard / WoW (wow_targets) 以外は即時 DROP (DNS は例外許可)
iptables -A FORWARD -i wg0 -o $NET_IF -p udp --dport 53 -j ACCEPT
iptables -A FORWARD -i wg0 -o $NET_IF -p tcp --dport 53 -j ACCEPT
iptables -A FORWARD -i wg0 -o $NET_IF -m set ! --match-set wow_targets dst -j DROP

# 5. 許可されたパケットのフォワーディング & NAT (MASQUERADE)
iptables -A FORWARD -i wg0 -j ACCEPT
iptables -t nat -A POSTROUTING -o $NET_IF -j MASQUERADE
POSTUP_EOF
sudo chmod 700 /etc/wireguard/post-up.sh

cat << 'POSTDOWN_EOF' | sudo tee /etc/wireguard/post-down.sh > /dev/null
#!/bin/bash
NET_IF=$(ip route get 8.8.8.8 | awk -- '{print $5}')

iptables -t mangle -D FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu || true
iptables -D FORWARD -i wg0 -o wg0 -d 10.0.0.0/24 -j DROP || true
iptables -D FORWARD -i wg0 -o $NET_IF -p udp --dport 53 -j ACCEPT || true
iptables -D FORWARD -i wg0 -o $NET_IF -p tcp --dport 53 -j ACCEPT || true
iptables -D FORWARD -i wg0 -o $NET_IF -m set ! --match-set wow_targets dst -j DROP || true
iptables -D FORWARD -i wg0 -j ACCEPT || true
iptables -D FORWARD -o wg0 -m state --state RELATED,ESTABLISHED -j ACCEPT || true
iptables -t nat -D POSTROUTING -o $NET_IF -j MASQUERADE || true
POSTDOWN_EOF
sudo chmod 700 /etc/wireguard/post-down.sh

echo "==> 4. /etc/wireguard/wg0.conf の更新..."
sudo sed -i 's|^PostUp = .*|PostUp = /etc/wireguard/post-up.sh|' /etc/wireguard/wg0.conf
sudo sed -i 's|^PostDown = .*|PostDown = /etc/wireguard/post-down.sh|' /etc/wireguard/wg0.conf

echo "==> 5. FORWARD チェーンを整理し、新ルールを即時適用..."
sudo iptables -F FORWARD
sudo /etc/wireguard/post-up.sh

echo "==> 6. 適用結果 (iptables FORWARD ルール):"
sudo iptables -L FORWARD -v -n --line-numbers
`;

console.log("============================================================");
console.log(" 🚀 1. 東京サーバー (wow-vpn-tokyo) へのセキュリティホット適用");
console.log("============================================================");

try {
    const output = runJitSshCommand("wow-vpn-tokyo", "ap-northeast-1", remoteScript);
    console.log(output);
    console.log("✅ 東京サーバーへの適用完了！");
} catch (err) {
    console.error("❌ 東京サーバーへの適用エラー:", err.message);
    process.exit(1);
}

console.log("");
console.log("============================================================");
console.log(" 🚀 2. オレゴンサーバー (wow-vpn-uswest2) へのセキュリティホット適用");
console.log("============================================================");

try {
    const outputOregon = runJitSshCommand("wow-vpn-uswest2", "us-west-2", remoteScript);
    console.log(outputOregon);
    console.log("✅ オレゴンサーバーへの適用完了！");
} catch (err) {
    console.warn("⚠️ オレゴンサーバーへの適用スキップ/警告:", err.message);
}
