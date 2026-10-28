# WoW Private VPN 運用保守・更新手順書 (MAINTENANCE.md)

本ドキュメントでは、AWS Lightsail 上で稼働する WireGuard VPN サーバーの定期的な OS 更新、カーネルアップデート、WireGuard サーバー更新、およびトラブルシューティング手順を定めます。

---

## 1. メンテナンス方針と推奨運用

- **作業時間帯**: ギルドメンバーのプレイ時間帯（レイド、Mythic+、夕方〜深夜）を避け、事前に Discord 等で告知の上で実施します。
- **無停止更新の優先**: 単純な設定変更や Peer 追加時はサービス再起動を行わず、稼働中インターフェースへ動的反映（Hot-reload）します。
- **ロールバック準備**: OS 更新で深刻な不具合が発生した場合は、設定ファイルのバックアップまたは Terraform による迅速な再作成を行います。

---

## 2. 定期 OS パッケージ更新手順

Ubuntu サーバーのセキュリティパッチおよびパッケージを最新化します。

### ステップ 1: サーバーへ SSH 接続
```bash
# Lightsail ブラウザコンソールまたは SSH クライアントからログイン
ssh -i <秘密鍵> ubuntu@<SERVER_IP>
```

### ステップ 2: パッケージリスト更新 & アップグレード
```bash
sudo apt-get update
sudo apt-get upgrade -y
```

> [!TIP]
> **自動セキュリティ更新（unattended-upgrades）について**
> セキュリティパッチの自動適用を有効化する場合、`unattended-upgrades` パッケージが利用できます。ただし、意図しないタイミングでのカーネル再起動を避けるため、自動再起動（`Automatic-Reboot`）は `false` に設定し、再起動は管理者が計画的に実施することを推奨します。

---

## 3. カーネルアップデートに伴う再起動手順

Linux カーネルの更新（`linux-image-generic` 等のアップデート）が含まれていた場合、新カーネルの適用と WireGuard カーネルモジュールの整合性維持のため、サーバーの再起動が必要です。

### ステップ 1: 再起動要否の確認
更新完了後、以下のファイルが存在する場合は再起動が推奨されます：
```bash
if [ -f /var/run/reboot-required ]; then
    echo "★ カーネルまたは重要ライブラリが更新されたため再起動が必要です"
fi
```

### ステップ 2: ギルドメンバーへの事前アナウンス
Discord 等でメンテ予告を送信します：
> **【メンテナンス連絡】**
> 本日 XX:XX より、VPN サーバーのセキュリティ更新に伴う再起動を実施します（所要時間: 約 2〜3分）。
> 作業中は一時的にゲーム接続が切断されますのでご注意ください。

### ステップ 3: サーバー再起動の実行
```bash
sudo reboot
```

### ステップ 4: 再起動後の復旧確認チェックリスト
約 1〜2 分後に再度 SSH 接続し、以下を順に確認します：

1. **WireGuard サービスが自動起動しているか**:
   ```bash
   sudo systemctl status wg-quick@wg0
   # active (running) と表示されていることを確認
   ```
2. **WireGuard インターフェースと Peer の通信状態**:
   ```bash
   sudo wg show
   # interface: wg0, 各Peerの latest handshake と transfer を確認
   ```
3. **IP フォワーディング（パケット転送）が有効か**:
   ```bash
   cat /proc/sys/net/ipv4/ip_forward
   # 出力が "1" であることを確認
   ```
4. **NAT（マスカレード）設定が適用されているか**:
   ```bash
   sudo iptables -t nat -L POSTROUTING -v -n
   # MASQUERADE ルールが存在することを確認
   ```

---

## 4. WireGuard 設定の更新手順

### A. 接続を切断せずに設定を反映する場合 (推奨: ホットリロード)
設定ファイル `/etc/wireguard/wg0.conf` を編集した後、稼働中のセッションを切断せずに反映します：
```bash
sudo wg syncconf wg0 <(wg-quick strip wg0)
```

### B. サービス全体を再起動する場合
インターフェースの再作成が必要な場合（ListenPort や 仮想IPアドレス帯の変更など）：
```bash
sudo systemctl restart wg-quick@wg0
```

---

## 5. 運用監視とコスト管理

### 1. 通信実績・コスト予測の確認
プロジェクト管理者のローカル端末で、リポジトリ内の監視スクリプトを実行します：
```bash
python scripts/check_vpn_usage.py
```
- 各インスタンスの転送量（付属1TB内の利用状況）
- Lightsail 稼働ステータス
- 当月の実績費用および月末着地予測（AWS Cost Explorer）

### 2. AWS Settings での利用費上限（Spend Limit）の確認
- 本プロジェクトが有料プランで運用されている場合、設定された利用費上限（Spend limit）を超過するとリソースが自動停止します。
- 突発的なアクセス拒否（Access Denied）が発生した場合は、[AWS Settings](https://settings.aws.com/) > **Billing** を開き、上限ステータスおよび請求状況を確認してください。

---

## 6. 障害復旧（ディザスタリカバリ / 再構築）

万が一 OS アップデートの失敗や設定破損によりインスタンスが復旧不能となった場合、Terraform を利用して数分で新品のインスタンスへ再構築可能です。

```bash
cd terraform

# 東京インスタンスを新品へ強制再作成
terraform apply -replace="aws_lightsail_instance.tokyo"

# 完了後、出力された IP に server-setup.sh を再実行
```
> [!NOTE]
> 静的IP（`aws_lightsail_static_ip.tokyo_ip`）はそのまま保持されるため、クライアント側に配布済みの Endpoint IP を変更することなく再構築が完了します。
