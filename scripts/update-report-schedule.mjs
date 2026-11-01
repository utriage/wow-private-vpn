#!/usr/bin/env node
/**
 * WoW Private VPN - 定期レポート送信スケジュール更新ツール (無停止適用)
 * 
 * 稼働中の東京・オレゴンサーバーの crontab を更新し、
 * 定期レポート送信スケジュールを「毎日 JST 00:30 (UTC 15:30)」に変更します。
 */

import { runJitSshCommand } from "./lib/jit-ssh.mjs";

const servers = [
    { name: "wow-vpn-tokyo", region: "ap-northeast-1", label: "東京ゲートウェイ (入口)" },
    { name: "wow-vpn-uswest2", region: "us-west-2", label: "オレゴンサーバー (出口)" }
];

// リモートで root の crontab を更新するスクリプト (既存の vpn-reporter 行を置換)
const remoteScript = `#!/bin/bash
set -e
sudo crontab -l 2>/dev/null | grep -v 'vpn-reporter.sh' > /tmp/crontab.tmp || true
ORIGINAL_LINE=$(sudo crontab -l 2>/dev/null | grep 'vpn-reporter.sh' || true)
if [ -n "$ORIGINAL_LINE" ]; then
    CMD=$(echo "$ORIGINAL_LINE" | sed -E 's|^[0-9* ,/]+ /usr/local/bin/vpn-reporter.sh|/usr/local/bin/vpn-reporter.sh|')
    echo "30 15 * * * $CMD" >> /tmp/crontab.tmp
    sudo crontab /tmp/crontab.tmp
    rm -f /tmp/crontab.tmp
    echo "root crontab updated successfully:"
    sudo crontab -l
else
    echo "vpn-reporter.sh line not found in root crontab"
fi
`;

console.log("=== 定期レポートスケジュール更新 (毎日 JST 00:30 / UTC 15:30) ===");

for (const s of servers) {
    console.log(`\n==> ${s.label} [${s.name} / ${s.region}] のスケジュールを更新中...`);
    try {
        const out = runJitSshCommand(s.name, s.region, remoteScript);
        console.log(out);
    } catch (err) {
        console.error(`❌ ${s.name} の更新に失敗しました:`, err.message);
    }
}
