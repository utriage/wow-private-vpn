/**
 * WoW Private VPN - JIT (Just-In-Time) エフェメラル SSH 実行モジュール
 * 
 * ポート 22 を常時閉鎖したまま、必要な処理の数秒間だけ管理者のグローバルIP宛てに開放し、
 * AWS 短期署名証明書でリモートコマンドを実行した直後に即座に閉鎖します。
 */

import { execSync, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

export function runJitSshCommand(instanceName, region = "ap-northeast-1", remoteBashCommands) {
    let myIp = "";
    try {
        myIp = execSync("curl -s https://checkip.amazonaws.com", { encoding: "utf-8" }).trim();
    } catch {
        myIp = execSync("curl -s https://ifconfig.me", { encoding: "utf-8" }).trim();
    }
    if (!myIp || !/^\d+\.\d+\.\d+\.\d+$/.test(myIp)) {
        throw new Error(`管理者のグローバルIP取得に失敗しました: ${myIp}`);
    }

    const regFlag = region ? `--region ${region}` : "";
    const profile = process.env.AWS_PROFILE || "wow-vpn";

    console.log(`   [JIT-SSH] 1. 管理者IP (${myIp}) 宛てに 22/TCP を一時開放中...`);
    execSync(`aws lightsail open-instance-public-ports --instance-name ${instanceName} ${regFlag} --port-info fromPort=22,toPort=22,protocol=tcp,cidrs=${myIp}/32 --profile ${profile}`);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wg-jit-"));
    const keyPath = path.join(tmpDir, "id_rsa");
    const certPath = path.join(tmpDir, "id_rsa-cert.pub");
    const pubPath = path.join(tmpDir, "id_rsa.pub");

    try {
        console.log("   [JIT-SSH] 2. 短期有効な SSH 署名証明書を発行中...");
        const accessJson = execSync(`aws lightsail get-instance-access-details --instance-name ${instanceName} ${regFlag} --profile ${profile}`, { encoding: "utf-8" });
        const details = JSON.parse(accessJson).accessDetails;

        fs.writeFileSync(keyPath, details.privateKey, { encoding: "utf-8" });
        fs.writeFileSync(certPath, details.certKey, { encoding: "utf-8" });

        // OpenSSH 用の公開鍵を自動生成
        const pub = execSync(`ssh-keygen -y -f "${keyPath}"`, { encoding: "utf-8" });
        fs.writeFileSync(pubPath, pub, { encoding: "utf-8" });

        // Windows icacls で秘密鍵パーミッション保護
        execSync(`icacls "${keyPath}" /inheritance:r /grant:r "${process.env.USERNAME}:(R)"`, { stdio: "ignore" });

        console.log("   [JIT-SSH] 3. サーバーへ接続し、コマンドを実行中...");
        const sshArgs = [
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "ConnectTimeout=8",
            "-i", keyPath,
            `${details.username}@${details.ipAddress}`,
            "bash"
        ];

        const res = spawnSync("ssh", sshArgs, {
            input: remoteBashCommands,
            encoding: "utf-8",
            timeout: 60000
        });
        if (res.status !== 0) {
            throw new Error(`リモートコマンドの実行に失敗しました:\n${res.stderr || res.stdout}`);
        }
        return res.stdout.trim();
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

        console.log("   [JIT-SSH] 4. 22/TCP を即時閉鎖中...");
        try {
            execSync(`aws lightsail close-instance-public-ports --instance-name ${instanceName} ${regFlag} --port-info fromPort=22,toPort=22,protocol=tcp --profile ${profile}`);
            console.log("   [JIT-SSH] 5. ポート閉鎖完了 (常時閉鎖を維持)");
        } catch (e) {
            console.error("警告: ポート閉鎖に失敗しました:", e.message);
        }
    }
}
