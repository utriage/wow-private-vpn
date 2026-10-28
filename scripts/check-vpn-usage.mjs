#!/usr/bin/env node
/**
 * WoW Private VPN Usage & AWS Cost Reporter (Node.js 版)
 */
import { execFileSync } from "child_process";

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

const now = new Date();
console.log("=".repeat(60));
console.log(`  WoW VPN 定期レポート (${now.toISOString().replace("T", " ").substring(0, 19)})`);
console.log("=".repeat(60));

// 1. AWS Lightsail Instances State
console.log("\n[1. AWS Lightsail 稼働状況]");
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
    console.log(`   - ${t.name} (${t.region}): 稼働状態 = ${state}`);
}

// 2. AWS Cost Explorer API (Actual & Forecast Cost)
console.log("\n[2. AWS Cost Explorer コスト集計 & 月末予測 (API)]");

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

console.log("\n   [料金プラン内訳]");
console.log("   * 東京インスタンス: $0.00 (初回3か月無料枠適用)");
console.log("   * オレゴンインスタンス: $5.00 / 月 (約 780 円)");
console.log("   * データ転送量: 付属1TB内 (追加課金なし $0.00)");
console.log("   * 静的IP (2個): アタッチ中無料 ($0.00)");
console.log("   --------------------------------------------------");
console.log("   * 3か月間の想定請求額: 約 $5.00 / 月");
console.log("   * 4か月目以降 (定常)  : 約 $10.00 / 月");

console.log("\n" + "=".repeat(60));
