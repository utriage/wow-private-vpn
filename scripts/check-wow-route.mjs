#!/usr/bin/env node
/**
 * WoW Private VPN - 通信経路 & レイテンシー Sanity Check スクリプト
 * 
 * 実際の WoW US West サーバー群への遅延・パケットロス・経路ホップを計測し、
 * AWS バックボーン (東京 ⇆ オレゴン) が正常に機能しているかを自動判定・比較します。
 */

import { execSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseDir = path.dirname(__dirname);
const historyFile = path.join(baseDir, ".route-sanity-history.json");

// 検証対象の主要 Blizzard / WoW サーバー群
const TARGET_SERVERS = [
    {
        name: "World Server (Las Vegas, NV)",
        ip: "158.115.221.110",
        description: "戦闘・フィールド・インスタンス通信 (最重要)",
    },
    {
        name: "Realm / Home Server",
        ip: "64.224.31.218",
        description: "チャット・オークション・ログイン通信",
    },
    {
        name: "US West Datacenter Edge",
        ip: "24.105.62.129",
        description: "Blizzard 米国西海岸コアゲートウェイ",
    },
];

function runPing(ip, count = 4) {
    try {
        const res = spawnSync("ping.exe", [ip, "-n", count.toString()], {
            encoding: "utf-8",
            timeout: 10000,
        });
        const out = res.stdout || "";

        // パケットロスの抽出
        const lossMatch = out.match(/(\d+)%\s*(loss|損失)/i);
        const loss = lossMatch ? parseInt(lossMatch[1], 10) : 100;

        // 平均・最小・最大遅延の抽出
        const avgMatch = out.match(/(Average|平均)\s*=\s*(\d+)ms/i);
        const minMatch = out.match(/(Minimum|最小)\s*=\s*(\d+)ms/i);
        const maxMatch = out.match(/(Maximum|最大)\s*=\s*(\d+)ms/i);

        return {
            success: loss < 100,
            loss,
            min: minMatch ? parseInt(minMatch[2], 10) : null,
            max: maxMatch ? parseInt(maxMatch[2], 10) : null,
            avg: avgMatch ? parseInt(avgMatch[2], 10) : null,
        };
    } catch {
        return { success: false, loss: 100, min: null, max: null, avg: null };
    }
}

function runFastTrace(ip, maxHops = 15) {
    try {
        const res = spawnSync("tracert.exe", ["-d", "-w", "800", "-h", maxHops.toString(), ip], {
            encoding: "utf-8",
            timeout: 25000,
        });
        const lines = (res.stdout || "").split("\n");
        const hops = [];
        for (const line of lines) {
            const m = line.trim().match(/^(\d+)\s+(.+)$/);
            if (m) {
                hops.push(m[0]);
            }
        }
        return hops;
    } catch {
        return [];
    }
}

function checkActiveWowProcess() {
    try {
        const tasklist = execSync("tasklist", { encoding: "utf-8" });
        const pids = [];
        for (const line of tasklist.split("\n")) {
            if (line.toLowerCase().includes("wow.exe")) {
                const parts = line.trim().split(/\s+/);
                pids.push(parts[1]);
            }
        }
        if (pids.length === 0) return null;

        const netstat = execSync("netstat -ano -p tcp", { encoding: "utf-8" });
        const activeConns = [];
        for (const line of netstat.split("\n")) {
            for (const pid of pids) {
                if (line.trim().endsWith(pid) && line.includes("ESTABLISHED")) {
                    const cols = line.trim().split(/\s+/);
                    activeConns.push({
                        local: cols[1],
                        remote: cols[2],
                    });
                }
            }
        }
        return { pids, activeConns };
    } catch {
        return null;
    }
}

function evaluateStatus(avgPing, loss) {
    if (loss > 0 || avgPing === null) {
        return {
            label: "🔴 DEGRADED (パケットロスまたは到達不能)",
            color: "\x1b[31m",
        };
    }
    if (avgPing <= 145) {
        return {
            label: "🟢 OPTIMAL (AWS東京 ⇆ オレゴン専用バックボーン経由)",
            color: "\x1b[32m",
        };
    }
    if (avgPing <= 180) {
        return {
            label: "🟡 SUB-OPTIMAL (商用一般海底ケーブル経由の疑い)",
            color: "\x1b[33m",
        };
    }
    return {
        label: "🔴 HIGH LATENCY (大幅な迂回または混雑)",
        color: "\x1b[31m",
    };
}

function main() {
    const isTrace = process.argv.includes("--trace");
    console.log("=".repeat(68));
    console.log("  🎮 WoW Private VPN - 経路健全性 & レイテンシー Sanity Check");
    console.log("=".repeat(68));

    // 前回履歴の読み込み
    let prevHistory = null;
    if (fs.existsSync(historyFile)) {
        try {
            prevHistory = JSON.parse(fs.readFileSync(historyFile, "utf-8"));
        } catch {}
    }

    // 1. Wow.exe のアクティブ通信チェック
    const wowStatus = checkActiveWowProcess();
    console.log("[1. WoW 稼働・スプリットトンネル判定]");
    if (wowStatus && wowStatus.activeConns.length > 0) {
        console.log(`   * Wow.exe (PID: ${wowStatus.pids.join(", ")}) が稼働中`);
        for (const conn of wowStatus.activeConns) {
            const isVpn = conn.local.startsWith("10.0.0.");
            const badge = isVpn ? "🟢 VPN経由 (10.0.0.x)" : "⚪ ローカル直通";
            console.log(`     - [${badge}] ${conn.local} -> ${conn.remote}`);
        }
    } else if (wowStatus) {
        console.log(`   * Wow.exe は起動していますが、アクティブなゲームセッションは検出されませんでした`);
    } else {
        console.log("   * Wow.exe は未起動です (VPN 単体の疎通・遅延を測定します)");
    }
    console.log("");

    // 2. 各サーバーへの Ping 測定
    console.log("[2. Blizzard 主要サーバーへのレイテンシー測定]");
    const currentResults = {};

    for (const server of TARGET_SERVERS) {
        process.stdout.write(`   * ${server.name} (${server.ip}) を測定中... `);
        const res = runPing(server.ip, 5);
        currentResults[server.ip] = res;

        if (res.success) {
            let diffStr = "";
            if (prevHistory && prevHistory.results && prevHistory.results[server.ip]?.avg) {
                const diff = res.avg - prevHistory.results[server.ip].avg;
                diffStr = diff > 0 ? ` (前回比: +${diff}ms)` : diff < 0 ? ` (前回比: ${diff}ms 改善!)` : " (前回と同じ)";
            }
            console.log(`完了! 平均: ${res.avg}ms [Min: ${res.min}ms / Max: ${res.max}ms / Loss: ${res.loss}%]${diffStr}`);
        } else {
            console.log(`失敗 (応答なし / タイムアウト)`);
        }
    }
    console.log("");

    // 3. 総合ステータス評価
    const primaryResult = currentResults["158.115.221.110"] || {};
    const evalStatus = evaluateStatus(primaryResult.avg, primaryResult.loss);

    console.log("[3. 経路ルーティング判定]");
    console.log(`   * 総合判定: ${evalStatus.label}`);
    if (primaryResult.avg) {
        console.log(`   * 実測 World 遅延: ${primaryResult.avg} ms`);
        if (primaryResult.avg <= 145) {
            console.log("   * 解説: 東京 ⇆ オレゴン間の AWS 専用光ファイバーが正常にパケットを中継しています。");
        } else {
            console.log("   * 注意: 遅延が 145ms を超えています。オレゴン中継設定または海底ケーブルの混雑をご確認ください。");
        }
    }
    console.log("");

    // 4. オプション: traceroute 詳細追跡
    if (isTrace) {
        console.log("[4. 詳細ホップ追跡 (tracert 158.115.221.110)]");
        const hops = runFastTrace("158.115.221.110", 15);
        for (const h of hops) {
            console.log(`   ${h}`);
        }
        console.log("");
    } else {
        console.log("💡 ヒント: 詳細なホップ追跡を見るには '--trace' を付けて実行してください:");
        console.log("   node scripts/check-wow-route.mjs --trace\n");
    }

    // 測定結果を次回比較用に保存
    const newHistory = {
        timestamp: new Date().toISOString(),
        results: currentResults,
    };
    try {
        fs.writeFileSync(historyFile, JSON.stringify(newHistory, null, 2), "utf-8");
    } catch {}

    console.log("=".repeat(68));
}

main();
