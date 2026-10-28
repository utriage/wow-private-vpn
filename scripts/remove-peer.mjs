#!/usr/bin/env node
/**
 * WoW Private VPN - ギルドメンバー (Peer) 無停止削除・アクセス権剥奪スクリプト
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runJitSshCommand } from "./lib/jit-ssh.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseDir = path.dirname(__dirname);

const terraformDir = path.join(baseDir, "terraform");
const peersFile = path.join(terraformDir, "peers.auto.tfvars");
const outputDir = path.join(baseDir, "generated");

function parseExistingPeers() {
    const peers = [];
    if (!fs.existsSync(peersFile)) return peers;
    const content = fs.readFileSync(peersFile, "utf-8");
    const regex = /name\s*=\s*"([^"]+)",\s*public_key\s*=\s*"([^"]+)",\s*ip\s*=\s*"([^"]+)"/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        peers.push({
            name: match[1],
            publicKey: match[2],
            ip: match[3],
        });
    }
    return peers;
}

function main() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.log("使い方: node scripts/remove-peer.mjs <メンバー名>");
        console.log("例:     node scripts/remove-peer.mjs TestUser");
        process.exit(1);
    }

    const memberName = args[0].trim();
    const existingPeers = parseExistingPeers();
    const targetPeer = existingPeers.find((p) => p.name === memberName);

    if (!targetPeer) {
        console.error(`エラー: メンバー '${memberName}' は登録リストに見つかりません。`);
        process.exit(1);
    }

    console.log("=".repeat(66));
    console.log(` 🗑️  メンバー [${memberName}] (IP: ${targetPeer.ip}) の削除を開始します`);
    console.log("=".repeat(66));

    // 1. 稼働中の東京サーバーからホット削除
    console.log("[1. 稼働中サーバーからの無停止ホット切断]");
    let hotRemoved = false;
    try {
        const remoteCmd = [
            `sudo wg set wg0 peer ${targetPeer.publicKey} remove`,
            `sudo sed -i '/# --- Peer: ${memberName} ---/,/AllowedIPs =/d' /etc/wireguard/wg0.conf`
        ].join(" && ");

        runJitSshCommand("wow-vpn-tokyo", "ap-northeast-1", remoteCmd);
        hotRemoved = true;
        console.log(`   ★ サーバーから即座にアクセス権が剥奪されました (再起動不要・切断ゼロ)`);
    } catch (e) {
        console.warn(`   ⚠️ リモートホット削除をスキップしました (${e.message})。`);
    }

    // 2. peers.auto.tfvars から削除
    console.log("");
    console.log("[2. terraform/peers.auto.tfvars からの削除]");
    const remainingPeers = existingPeers.filter((p) => p.name !== memberName);

    let tfvarsOutput = "# ===================================================================\n";
    tfvarsOutput += "# 登録ギルドメンバー (WireGuard Peer) 定義リスト\n";
    tfvarsOutput += "# scripts/add-peer.mjs により自動追記・更新されます。\n";
    tfvarsOutput += "# 公開鍵・仮想IPのみが含まれるため、Git コミット対象として安全に管理可能です。\n";
    tfvarsOutput += "# ===================================================================\n";
    tfvarsOutput += "wireguard_peers = [\n";
    for (const p of remainingPeers) {
        tfvarsOutput += "  {\n";
        tfvarsOutput += `    name       = "${p.name}",\n`;
        tfvarsOutput += `    public_key = "${p.publicKey}",\n`;
        tfvarsOutput += `    ip         = "${p.ip}"\n`;
        tfvarsOutput += "  },\n";
    }
    tfvarsOutput += "]\n";

    fs.writeFileSync(peersFile, tfvarsOutput, "utf-8");
    console.log("   ★ peers.auto.tfvars を更新しました。");

    // 3. ローカルの conf ファイルがあれば削除
    const confFile = path.join(outputDir, `wow-${memberName}.conf`);
    if (fs.existsSync(confFile)) {
        try {
            fs.unlinkSync(confFile);
            console.log(`   ★ generated/wow-${memberName}.conf を手元から削除しました。`);
        } catch {}
    }

    console.log("");
    console.log("=".repeat(66));
    console.log(` ★ メンバー [${memberName}] の削除が完了しました！`);
    console.log("=".repeat(66));
    console.log(` 1. ホット遮断   : ${hotRemoved ? "🟢 完了 (即座に通信不可)" : "未完了"}`);
    console.log(` 2. リスト更新   : terraform/peers.auto.tfvars (削除完了)`);
    console.log("-".repeat(66));
    console.log("【管理者の次の作業手順】");
    console.log(" ① Gitコミット (構成管理):");
    console.log(`    git add terraform/peers.auto.tfvars && git commit -m "feat(vpn): remove peer ${memberName}"`);
    console.log("=".repeat(66));
}

main();
