#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WoW Private VPN - ギルドメンバー (Peer) 設定ファイル生成 & Terraform 登録スクリプト
"""
import sys
import os
import re
import json
import shutil
import subprocess

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TERRAFORM_DIR = os.path.join(BASE_DIR, "terraform")
PEERS_FILE = os.path.join(TERRAFORM_DIR, "peers.auto.tfvars")
TFVARS_FILE = os.path.join(TERRAFORM_DIR, "terraform.tfvars")
STATE_FILE = os.path.join(TERRAFORM_DIR, "terraform.tfstate")
TEMPLATE_FILE = os.path.join(BASE_DIR, "templates", "wow-client.template.conf")
OUTPUT_DIR = os.path.join(BASE_DIR, "generated")

def find_wg_exe():
    if shutil.which("wg"):
        return "wg"
    default_path = r"C:\Program Files\WireGuard\wg.exe"
    if os.path.exists(default_path):
        return default_path
    print("エラー: wg.exe が見つかりません。WireGuard をインストールするか PATH を通してください。")
    sys.exit(1)

def run_cmd(cmd, input_text=None):
    res = subprocess.run(cmd, input=input_text, capture_output=True, text=True, encoding="utf-8")
    if res.returncode != 0:
        print(f"コマンドエラー: {' '.join(cmd)}\n{res.stderr}")
        sys.exit(1)
    return res.stdout.strip()

def get_server_info(wg_exe):
    # 1. サーバー公開鍵の取得
    server_pub = None
    if os.path.exists(TFVARS_FILE):
        with open(TFVARS_FILE, "r", encoding="utf-8") as f:
            for line in f:
                m = re.search(r'tokyo_server_private_key\s*=\s*"([^"]+)"', line)
                if m and m.group(1):
                    server_pub = run_cmd([wg_exe, "pubkey"], input_text=m.group(1))
                    break

    # 2. サーバーパブリックIPの取得
    server_ip = None
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                state = json.load(f)
                outputs = state.get("outputs", {})
                if "tokyo_static_ip" in outputs:
                    server_ip = outputs["tokyo_static_ip"].get("value")
                if not server_pub and "tokyo_server_public_key" in outputs:
                    server_pub = outputs["tokyo_server_public_key"].get("value")
        except Exception:
            pass

    if not server_ip:
        server_ip = "52.196.243.126" # 既存の静的IPフォールバック

    return server_ip, server_pub

def parse_existing_peers():
    peers = []
    if not os.path.exists(PEERS_FILE):
        return peers
    with open(PEERS_FILE, "r", encoding="utf-8") as f:
        content = f.read()

    # オブジェクトブロックを抽出
    pattern = re.compile(
        r'\{\s*name\s*=\s*"([^"]+)",\s*public_key\s*=\s*"([^"]+)",\s*ip\s*=\s*"([^"]+)"\s*\}'
    )
    for m in pattern.finditer(content):
        peers.append({
            "name": m.group(1),
            "public_key": m.group(2),
            "ip": m.group(3)
        })
    return peers

def main():
    if len(sys.argv) < 2:
        print("使い方: python scripts/add_peer.py <メンバー名> [IP末尾番号 (2〜254)]")
        print("例:     python scripts/add_peer.py userA")
        print("        python scripts/add_peer.py userB 5")
        sys.exit(1)

    member_name = sys.argv[1].strip()
    if not re.match(r'^[a-zA-Z0-9_\-]+$', member_name):
        print("エラー: メンバー名には半角英数字、ハイフン、アンダースコアのみ使用できます。")
        sys.exit(1)

    wg_exe = find_wg_exe()
    existing_peers = parse_existing_peers()

    for p in existing_peers:
        if p["name"] == member_name:
            print(f"エラー: メンバー '{member_name}' は既に登録されています (IP: {p['ip']})。")
            sys.exit(1)

    # 仮想IPの割り当て
    used_ips = {p["ip"] for p in existing_peers}
    if len(sys.argv) >= 3:
        try:
            suffix = int(sys.argv[2])
            client_ip = f"10.0.0.{suffix}"
            if suffix < 2 or suffix > 254:
                raise ValueError()
        except ValueError:
            print("エラー: IP末尾番号は 2 から 254 の整数で指定してください。")
            sys.exit(1)
        if client_ip in used_ips:
            print(f"エラー: IP '{client_ip}' は既に使用されています。")
            sys.exit(1)
    else:
        # 自動で空き番号を探す (2 から開始)
        assigned = None
        for i in range(2, 255):
            candidate = f"10.0.0.{i}"
            if candidate not in used_ips:
                assigned = candidate
                break
        if not assigned:
            print("エラー: 割り当て可能な IP アドレスが枯渇しています。")
            sys.exit(1)
        client_ip = assigned

    # 1. クライアント鍵ペア生成
    client_priv = run_cmd([wg_exe, "genkey"])
    client_pub = run_cmd([wg_exe, "pubkey"], input_text=client_priv)

    # 2. サーバー情報取得
    server_ip, server_pub = get_server_info(wg_exe)
    if not server_pub:
        print("警告: サーバー公開鍵が検出できませんでした。仮の値をセットします。")
        server_pub = "<SERVER_PUBLIC_KEY>"

    # 3. 配布用クライアント設定ファイルの作成
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_conf = os.path.join(OUTPUT_DIR, f"wow-{member_name}.conf")

    with open(TEMPLATE_FILE, "r", encoding="utf-8") as f:
        tmpl = f.read()

    conf_content = tmpl.replace("<CLIENT_VPN_IP>", f"{client_ip}/32") \
                       .replace("<CLIENT_PRIVATE_KEY>", client_priv) \
                       .replace("<SERVER_PUBLIC_KEY>", server_pub) \
                       .replace("<SERVER_PUBLIC_IP>", server_ip)

    with open(out_conf, "w", encoding="utf-8", newline="\n") as f:
        f.write(conf_content)

    # 4. terraform/peers.auto.tfvars への追記
    existing_peers.append({
        "name": member_name,
        "public_key": client_pub,
        "ip": client_ip
    })

    with open(PEERS_FILE, "w", encoding="utf-8", newline="\n") as f:
        f.write("# ===================================================================\n")
        f.write("# 登録ギルドメンバー (WireGuard Peer) 定義リスト\n")
        f.write("# scripts/add_peer.py により自動追記・更新されます。\n")
        f.write("# 公開鍵・仮想IPのみが含まれるため、Git コミット対象として安全に管理可能です。\n")
        f.write("# ===================================================================\n")
        f.write("wireguard_peers = [\n")
        for p in existing_peers:
            f.write(f'  {{\n    name       = "{p["name"]}",\n    public_key = "{p["public_key"]}",\n    ip         = "{p["ip"]}"\n  }},\n')
        f.write("]\n")

    print("")
    print("=" * 66)
    print(f" ★ メンバー [{member_name}] の設定ファイル生成が完了しました！")
    print("=" * 66)
    print(f" 1. 生成ファイル   : generated/wow-{member_name}.conf")
    print(f" 2. 割り当て仮想IP : {client_ip}/32")
    print(f" 3. 公開鍵登録先   : terraform/peers.auto.tfvars (追記完了)")
    print("-" * 66)
    print("【管理者の次の作業手順】")
    print(" ① サーバー設定の反映 (デプロイ):")
    print("    mise exec -- terraform apply")
    print("    (※ サーバーに新しいPeerが反映され、通信可能になります)")
    print("")
    print(f" ② メンバーへの個別配布:")
    print(f"    generated/wow-{member_name}.conf を対象メンバーに Discord DM 等で送信")
    print("")
    print(f" ③ 手元ファイルの安全な削除:")
    print(f"    Remove-Item generated/wow-{member_name}.conf")
    print("    (※ メンバー側でファイルを保持している限り、永続的に接続可能です)")
    print("=" * 66)

if __name__ == "__main__":
    main()
