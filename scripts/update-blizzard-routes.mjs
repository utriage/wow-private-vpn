#!/usr/bin/env node
/**
 * WoW Private VPN - Blizzard / WoW IP レンジ自動同期 & Supernetting 集約スクリプト
 * 
 * 1. RIPEstat API から Blizzard 公式 AS (AS57976, AS393278) の最新広報プレフィックスを取得
 * 2. 既存のルーティングリストとマージし、Supernetting (包含集約) を適用
 * 3. 以下を自動更新:
 *    - terraform/wow_routes.tf
 *    - templates/wow-client.template.conf
 *    - generated/ 配下のクライアント設定 (wow-Gada.conf, wow-TestUser.conf 等)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseDir = path.dirname(__dirname);

// Blizzard の主要コア AS 番号
const BLIZZARD_AS_LIST = ["AS57976", "AS393278"];

// 年単位で変更不要にするための Blizzard 主要包括ブロック (Supernet)
const BLIZZARD_SUPERNETS = [
    "5.42.160.0/19",     // Blizzard Datacenters (5.42.160.0 - 5.42.191.255)
    "24.105.0.0/18",     // Blizzard US West (Irvine / Las Vegas / California)
    "37.244.0.0/16",     // Blizzard Worldwide Infrastructure
    "66.40.176.0/20",    // Blizzard Datacenters
    "72.46.92.0/22",     // Blizzard AS393278
    "137.221.0.0/16",    // Blizzard Core Global Backbone
    "152.117.0.0/16",    // Blizzard AS393278
    "158.115.0.0/16",    // Blizzard Las Vegas Datacenter
    "185.60.112.0/22",   // Blizzard Europe / Global
    "198.74.32.0/20",    // Blizzard Datacenters
    "199.108.48.0/20",   // Blizzard Irvine HQ
    "208.79.112.0/22",   // Blizzard AS393278
];

function ipToInt(ip) {
    return ip.split(".").reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}

function parseCidr(cidr) {
    const [ip, bitsStr] = cidr.trim().split("/");
    const bits = parseInt(bitsStr, 10);
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    const start = (ipToInt(ip) & mask) >>> 0;
    const end = (start | ~mask) >>> 0;
    return { cidr: `${ip}/${bits}`, start, end, bits };
}

/**
 * 包含関係にある CIDR を集約 (小さなサブネットを大きな包括ブロックに吸収)
 */
function aggregateCidrs(cidrs) {
    const parsed = cidrs
        .filter((c) => c && c.includes(".") && c.includes("/"))
        .map(parseCidr)
        .sort((a, b) => a.start - b.start || a.bits - b.bits);

    const result = [];
    for (const item of parsed) {
        // 既に登録済みのより大きなブロックに含まれている場合はスキップ
        if (result.some((r) => r.start <= item.start && r.end >= item.end)) {
            continue;
        }
        result.push(item);
    }
    return result.map((r) => r.cidr);
}

async function fetchAsPrefixes(as) {
    const url = `https://stat.ripe.net/data/announced-prefixes/data.json?resource=${as}`;
    const res = await fetch(url, { headers: { "User-Agent": "WoW-Private-VPN-Updater/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} from RIPEstat for ${as}`);
    const json = await res.json();
    return json.data.prefixes
        .map((p) => p.prefix)
        .filter((p) => !p.includes(":")); // IPv4 のみ抽出
}

async function main() {
    console.log("============================================================");
    console.log(" 🌐 Blizzard / WoW IP レンジ自動同期 & 集約ツール");
    console.log("============================================================");

    // 1. RIPEstat API から Blizzard AS プレフィックスを取得
    const fetchedCidrs = [];
    for (const as of BLIZZARD_AS_LIST) {
        process.stdout.write(`* ${as} の広報プレフィックスを取得中... `);
        try {
            const prefixes = await fetchAsPrefixes(as);
            console.log(`${prefixes.length} 件取得`);
            fetchedCidrs.push(...prefixes);
        } catch (err) {
            console.log(`失敗 (${err.message})`);
        }
    }

    // 2. 外部CDN (Akamai/Cloudflare等) の細切れプレフィックスを除外し、
    //    純粋な Blizzard 自社 AS (AS57976, AS393278) のプレフィックスと Supernet のみから集約
    console.log(`* 外部CDN混入を排除し、純粋な Blizzard 自社ゲーム帯域のみを対象とします。`);

    // 3. 全プレフィックスを結合して集約 (Supernetting)
    const combined = [...BLIZZARD_SUPERNETS, ...fetchedCidrs];
    const consolidated = aggregateCidrs(combined);

    console.log(`* 集約後の有効 CIDR 数: ${consolidated.length} 件 (純粋な Blizzard ゲーム帯域に凝縮)`);

    // 4. terraform/wow_routes.tf の更新
    const wowRoutesFile = path.join(baseDir, "terraform", "wow_routes.tf");
    let newTfContent = `# ===================================================================\n`;
    newTfContent += `# World of Warcraft / Blizzard 主要ネットワーク帯域 (CIDR リスト)\n`;
    newTfContent += `# scripts/update-blizzard-routes.mjs により BGP 広報データから自動同期・集約\n`;
    newTfContent += `# ===================================================================\n`;
    newTfContent += `locals {\n  wow_ip_ranges = [\n`;
    for (const cidr of consolidated) {
        newTfContent += `    "${cidr}",\n`;
    }
    newTfContent += `  ]\n}\n`;
    fs.writeFileSync(wowRoutesFile, newTfContent, "utf-8");
    console.log(`✅ [更新完了] terraform/wow_routes.tf`);

    // 5. templates/wow-client.template.conf の更新
    const templateFile = path.join(baseDir, "templates", "wow-client.template.conf");
    if (fs.existsSync(templateFile)) {
        let tpl = fs.readFileSync(templateFile, "utf-8");
        const allowedIpsLine = `AllowedIPs = ${consolidated.join(", ")}`;
        tpl = tpl.replace(/^AllowedIPs = .*$/m, allowedIpsLine);
        fs.writeFileSync(templateFile, tpl, "utf-8");
        console.log(`✅ [更新完了] templates/wow-client.template.conf`);
    }

    // 6. generated/ 配下の既存 .conf を一括更新
    const generatedDir = path.join(baseDir, "generated");
    if (fs.existsSync(generatedDir)) {
        const confFiles = fs.readdirSync(generatedDir).filter((f) => f.endsWith(".conf"));
        for (const file of confFiles) {
            const filePath = path.join(generatedDir, file);
            let conf = fs.readFileSync(filePath, "utf-8");
            const allowedIpsLine = `AllowedIPs = ${consolidated.join(", ")}`;
            conf = conf.replace(/^AllowedIPs = .*$/m, allowedIpsLine);
            fs.writeFileSync(filePath, conf, "utf-8");
            console.log(`✅ [更新完了] generated/${file}`);
        }
    }

    console.log("============================================================");
    console.log(" 🎉 全設定ファイルが集約 CIDR 形式に更新されました！");
    console.log("============================================================");
}

main().catch((err) => {
    console.error("エラー:", err);
    process.exit(1);
});
