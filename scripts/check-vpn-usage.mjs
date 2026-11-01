#!/usr/bin/env node
/**
 * WoW Private VPN Usage & AWS Cost Reporter (Node.js 版)
 */
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runJitSshCommand } from "./lib/jit-ssh.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseDir = path.dirname(__dirname);

function runAws(args) {
    try {
        const out = execFileSync("aws", args, {
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "ignore"],
        });
        return JSON.parse(out);
    } catch {
        return null;
    }
}

// 登録メンバーの公開鍵マップを読み込み
const peerNames = new Map([
    ["JScRhMN4INdPmBiTuNmozlAafV9rknPI2XnqXSpbNSA=", "Oregon Relay (オレゴン中継)"],
    ["UCHCm4aSdxgCfm/Ge2/vUJNWf/KlRjGL9fgP11cq6xQ=", "Tokyo Gateway (東京GW)"]
]);

const peersFile = path.join(baseDir, "terraform", "peers.auto.tfvars");
if (fs.existsSync(peersFile)) {
    const content = fs.readFileSync(peersFile, "utf-8");
    const regex = /name\s*=\s*"([^"]+)",\s*public_key\s*=\s*"([^"]+)"/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        peerNames.set(match[2], match[1]);
    }
}

const now = new Date();
console.log("=".repeat(64));
console.log(`  WoW Private VPN 稼働実績 & コスト月額レポート`);
console.log(`  集計日時: ${now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} (JST)`);
console.log("=".repeat(64));

// 1. WireGuard 通信実績 (JIT-SSH経由)
const skipSsh = process.argv.includes("--no-ssh") || process.argv.includes("--quick");
if (!skipSsh) {
    console.log("\n[1. WireGuard 転送量実績 (最新実測値)]");

    const servers = [
        { name: "wow-vpn-tokyo", region: "ap-northeast-1", label: "東京ゲートウェイ (入口)" },
        { name: "wow-vpn-uswest2", region: "us-west-2", label: "オレゴンサーバー (出口)" }
    ];

    for (const s of servers) {
        console.log(`\n --- ${s.label} [${s.name} / ${s.region}] ---`);
        try {
            const rawWg = runJitSshCommand(s.name, s.region, "sudo wg show");
            const lines = rawWg.split("\n");
            let currentPeer = "";
            let currentPeerName = "";

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith("interface:")) {
                    console.log(`  Interface: ${trimmed.split(":")[1].trim()}`);
                } else if (trimmed.startsWith("peer:")) {
                    currentPeer = trimmed.split(":")[1].trim();
                    currentPeerName = peerNames.get(currentPeer) || "Unknown Peer";
                    console.log(`\n  * ピア: ${currentPeerName} (${currentPeer})`);
                } else if (trimmed.startsWith("endpoint:")) {
                    console.log(`    - 接続元: ${trimmed.split(":")[1].trim()}`);
                } else if (trimmed.startsWith("latest handshake:")) {
                    console.log(`    - 最新通信: ${trimmed.split(":")[1].trim()}`);
                } else if (trimmed.startsWith("transfer:")) {
                    console.log(`    - 転送量実績: ${trimmed.split(":")[1].trim()}`);
                }
            }
        } catch (e) {
            console.warn(`  ⚠️ JIT-SSH 通信取得スキップ (${e.message})`);
        }
    }
}

// 2. AWS Lightsail 稼働状況
console.log("\n[2. AWS Lightsail インスタンス稼働状態]");
const targets = [
    { name: "wow-vpn-tokyo", region: "ap-northeast-1" },
    { name: "wow-vpn-uswest2", region: "us-west-2" },
];

for (const t of targets) {
    const data = runAws([
        "lightsail", "get-instance-state",
        "--instance-name", t.name,
        "--region", t.region,
        "--output", "json",
    ]);
    const state = data?.state?.name || "unknown";
    const statusIcon = state === "running" ? "🟢" : "🔴";
    console.log(`   ${statusIcon} ${t.name} (${t.region}): ${state}`);
}

// 3. AWS Cost Explorer API (Actual & Forecast Cost)
console.log("\n[3. AWS Cost Explorer コスト集計 & 月末予測 (API)]");

const year = now.getFullYear();
const month = now.getMonth() + 1;
const pad = (n) => String(n).padStart(2, "0");

const firstDay = `${year}-${pad(month)}-01`;
const tomorrow = new Date(now);
tomorrow.setDate(now.getDate() + 1);
const nextDayStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;

const nextMonth = month === 12 ? 1 : month + 1;
const nextYear = month === 12 ? year + 1 : year;
const endOfMonthStr = `${nextYear}-${pad(nextMonth)}-01`;

// A. 当月の実績費用
const actualData = runAws([
    "ce", "get-cost-and-usage",
    "--time-period", `Start=${firstDay},End=${nextDayStr}`,
    "--granularity", "MONTHLY",
    "--metrics", "UnblendedCost",
    "--region", "us-east-1",
    "--output", "json",
]);

if (actualData?.ResultsByTime?.length > 0) {
    const total = actualData.ResultsByTime[0]?.Total?.UnblendedCost;
    const amount = parseFloat(total?.Amount || "0").toFixed(2);
    console.log(`   * 当月これまでの実績費用: $${amount} ${total?.Unit || "USD"}`);
} else {
    console.log("   * 当月実績費用: 収集・集計中 (初回有効化から最大24時間程度要します)");
}

// B. 月末着地予測
const forecastData = runAws([
    "ce", "get-cost-forecast",
    "--time-period", `Start=${nextDayStr},End=${endOfMonthStr}`,
    "--metric", "UNBLENDED_COST",
    "--granularity", "MONTHLY",
    "--region", "us-east-1",
    "--output", "json",
]);

if (forecastData?.Total?.Amount) {
    const famount = parseFloat(forecastData.Total.Amount).toFixed(2);
    console.log(`   * 月末までの着地予測費用 (Forecast): $${famount} ${forecastData.Total.Unit || "USD"}`);
} else {
    console.log("   * 月末予測 (Forecast): データ蓄積中 (数日間の履歴データ蓄積後に自動反映されます)");
}

console.log("\n[4. 想定月額コスト試算と内訳 (定常)]");
console.log("   * 東京インスタンス (nano/micro): $0.00 (初回3か月無料枠適用)");
console.log("   * オレゴンインスタンス (micro) : $5.00 / 月 (約 780 円)");
console.log("   * データ転送量 (各1TB付属)   : $0.00 (1TB以内は完全無料)");
console.log("   * 静的IPアドレス (2個)        : $0.00 (インスタンス紐付け中無料)");
console.log("   " + "-".repeat(50));
console.log("   * 現在（開設後3か月間）の請求想定: 約 $5.00 / 月 (約 780 円)");
console.log("   * 4か月目以降（定常運用時）の請求: 約 $10.00 / 月 (約 1,560 円)");

console.log("\n" + "=".repeat(64));
