#!/usr/bin/env node
/**
 * WoW Private VPN - ギルドメンバー (Peer) 設定ファイル生成 & Terraform 登録スクリプト (Node.js版)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseDir = path.dirname(__dirname);

const terraformDir = path.join(baseDir, "terraform");
const peersFile = path.join(terraformDir, "peers.auto.tfvars");
const tfvarsFile = path.join(terraformDir, "terraform.tfvars");
const stateFile = path.join(terraformDir, "terraform.tfstate");
const templateFile = path.join(baseDir, "templates", "wow-client.template.conf");
const outputDir = path.join(baseDir, "generated");

function findWgExe() {
    try {
        execFileSync("wg", ["--version"], { stdio: "ignore" });
        return "wg";
    } catch {}
    const defaultPath = "C:\\Program Files\\WireGuard\\wg.exe";
    if (fs.existsSync(defaultPath)) {
        return defaultPath;
    }
    console.error("エラー: wg.exe が見つかりません。WireGuard をインストールするか PATH を通してください。");
    process.exit(1);
}

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
        console.log("使い方: node scripts/add-peer.mjs <メンバー名> [IP末尾番号 (2〜254)]");
        console.log("例:     node scripts/add-peer.mjs playerA");
        console.log("        node scripts/add-peer.mjs playerB 5");
        process.exit(1);
    }

    const memberName = args[0].trim();
    if (!/^[a-zA-Z0-9_\-]+$/.test(memberName)) {
        console.error("エラー: メンバー名には半角英数字、ハイフン、アンダースコアのみ使用できます。");
        process.exit(1);
    }

    const wgExe = findWgExe();
    const existingPeers = parseExistingPeers();

    for (const p of existingPeers) {
        if (p.name === memberName) {
            console.error(`エラー: メンバー '${memberName}' は既に登録されています (IP: ${p.ip})。`);
            process.exit(1);
        }
    }

    const usedIps = new Set(existingPeers.map((p) => p.ip));
    let clientIp = "";

    if (args.length >= 2) {
        const suffix = parseInt(args[1], 10);
        if (isNaN(suffix) || suffix < 2 || suffix > 254) {
            console.error("エラー: IP末尾番号は 2 から 254 の整数で指定してください。");
            process.exit(1);
        }
        clientIp = `10.0.0.${suffix}`;
        if (usedIps.has(clientIp)) {
            console.error(`エラー: IP '${clientIp}' は既に使用されています。`);
            process.exit(1);
        }
    } else {
        for (let i = 2; i <= 254; i++) {
            const candidate = `10.0.0.${i}`;
            if (!usedIps.has(candidate)) {
                clientIp = candidate;
                break;
            }
        }
        if (!clientIp) {
            console.error("エラー: 割り当て可能な IP アドレスが枯渇しています。");
            process.exit(1);
        }
    }

    // 1. クライアント鍵ペア生成
    const clientPriv = execFileSync(wgExe, ["genkey"], { encoding: "utf-8" }).trim();
    const clientPub = execFileSync(wgExe, ["pubkey"], { input: clientPriv, encoding: "utf-8" }).trim();

    // 2. サーバー情報の取得 (公開鍵 & パブリックIP)
    let serverPub = "";
    if (fs.existsSync(tfvarsFile)) {
        const tfvarsContent = fs.readFileSync(tfvarsFile, "utf-8");
        const m = tfvarsContent.match(/tokyo_server_private_key\s*=\s*"([^"]+)"/);
        if (m && m[1]) {
            serverPub = execFileSync(wgExe, ["pubkey"], { input: m[1].trim(), encoding: "utf-8" }).trim();
        }
    }

    let serverIp = "52.196.243.126"; // 静的IPフォールバック
    if (fs.existsSync(stateFile)) {
        try {
            const stateJson = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
            if (stateJson?.outputs?.tokyo_static_ip?.value) {
                serverIp = stateJson.outputs.tokyo_static_ip.value;
            }
        } catch {}
    }

    if (!serverPub) {
        serverPub = "<SERVER_PUBLIC_KEY>";
    }

    // 3. 配布用クライアント設定ファイルの作成
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outConf = path.join(outputDir, `wow-${memberName}.conf`);
    const tmpl = fs.readFileSync(templateFile, "utf-8");

    const confContent = tmpl
        .replace("<CLIENT_VPN_IP>", `${clientIp}/32`)
        .replace("<CLIENT_PRIVATE_KEY>", clientPriv)
        .replace("<SERVER_PUBLIC_KEY>", serverPub)
        .replace("<SERVER_PUBLIC_IP>", serverIp);

    fs.writeFileSync(outConf, confContent, "utf-8");

    // 4. terraform/peers.auto.tfvars への追記・更新
    existingPeers.push({
        name: memberName,
        publicKey: clientPub,
        ip: clientIp,
    });

    let tfvarsOutput = "# ===================================================================\n";
    tfvarsOutput += "# 登録ギルドメンバー (WireGuard Peer) 定義リスト\n";
    tfvarsOutput += "# scripts/add-peer.mjs により自動追記・更新されます。\n";
    tfvarsOutput += "# 公開鍵・仮想IPのみが含まれるため、Git コミット対象として安全に管理可能です。\n";
    tfvarsOutput += "# ===================================================================\n";
    tfvarsOutput += "wireguard_peers = [\n";
    for (const p of existingPeers) {
        tfvarsOutput += "  {\n";
        tfvarsOutput += `    name       = "${p.name}",\n`;
        tfvarsOutput += `    public_key = "${p.publicKey}",\n`;
        tfvarsOutput += `    ip         = "${p.ip}"\n`;
        tfvarsOutput += "  },\n";
    }
    tfvarsOutput += "]\n";

    fs.writeFileSync(peersFile, tfvarsOutput, "utf-8");

    console.log("");
    console.log("=".repeat(66));
    console.log(` ★ メンバー [${memberName}] の設定ファイル生成が完了しました！`);
    console.log("=".repeat(66));
    console.log(` 1. 生成ファイル   : generated/wow-${memberName}.conf`);
    console.log(` 2. 割り当て仮想IP : ${clientIp}/32`);
    console.log(` 3. 公開鍵登録先   : terraform/peers.auto.tfvars (追記完了)`);
    console.log("-".repeat(66));
    console.log("【管理者の次の作業手順】");
    console.log(" ① サーバー設定の反映 (デプロイ):");
    console.log("    mise exec -- terraform apply");
    console.log("    (※ サーバーに新しいPeerが反映され、通信可能になります)");
    console.log("");
    console.log(" ② メンバーへの個別配布:");
    console.log(`    generated/wow-${memberName}.conf を対象メンバーに Discord DM 等で送信`);
    console.log("");
    console.log(" ③ 手元ファイルの安全な削除:");
    console.log(`    Remove-Item generated/wow-${memberName}.conf`);
    console.log("=".repeat(66));
}

main();
