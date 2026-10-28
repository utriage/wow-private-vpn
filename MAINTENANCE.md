# WoW Private VPN 運用保守・更新手順書 (MAINTENANCE.md)

本ドキュメントでは、AWS Lightsail 上で稼働する WireGuard VPN サーバーの定期的な OS 更新、WireGuard サーバー更新、障害復旧、および日常監視手順を定めます。

---

## 1. 本格運用の基本方針 (イミュータブル保守)

本環境では、サーバー内に手動ログインしてパッチを当てる従来型運用ではなく、**「常に新品のインスタンスへ短時間で入れ替える」イミュータブル運用（Immutable Infrastructure）** を標準とします。

- **SSH不要の更新**: 起動スクリプト（`user_data`）が起動時に最新の OS セキュリティアップデート、WireGuard、iptables、および全登録 Peer の設定を完全自動で適用します。
- **設定・鍵の不変性**: サーバー固定秘密鍵および静的IP（Static IP）が Terraform で維持されるため、インスタンスが再作成されてもクライアント側の再設定は一切不要です。
- **短時間メンテナンス**: インスタンス再作成にかかる所要時間は約 40〜60 秒です。レイドや Mythic+ などのゲームプレイ時間外に実施します。

---

## 2. 定期 OS・WireGuard 更新手順 (推奨: 再作成による一括最新化)

セキュリティパッチの適用やパッケージの最新化は、Terraform の `-replace` オプションで実施します。

### ステップ 1: ギルドメンバーへの事前アナウンス
Discord 等でメンテナンス予告を送信します：
> **【メンテナンス連絡】**
> 本日 XX:XX より、VPN サーバーのセキュリティ更新・再起動を実施します（所要時間: 約 1〜2分）。
> 作業中は一時的にゲーム通信が切断されますのでご注意ください。

### ステップ 2: 東京サーバーの強制最新化
プロジェクトルートで以下を実行します：
```bash
cd terraform
mise exec -- terraform apply -replace="aws_lightsail_instance.tokyo"
```
- プロンプトが表示されたら内容（インスタンスの再作成）を確認し `yes` を入力します。
- 約 40 秒で新しい Ubuntu 24.04 インスタンスが起動し、静的IPが自動アタッチされ、`user_data` により最新パッケージと全 Peer 設定が復元されます。

### ステップ 3: 完了確認
- 設定済みの Discord Webhook（東京GW）に **「🚀 WoW Tokyo Entry Gateway が起動完了しました」** の Embed 通知が届くことを確認します。
- クライアント側（WoW）が数分以内に自動再接続されることを確認します。

---

## 3. 緊急調査・トラブルシューティング時の手順 (SSH 一時開放)

通常時はポート 22（SSH）がファイアウォールで閉鎖されています。万が一サーバー内部を直接調査する必要が生じた場合のみ、一時的に開放します。

### ステップ 1: SSH ポートの一時開放
`terraform/terraform.tfvars`（ローカルファイル）に以下を記述します：
```hcl
enable_ssh = true
# allowed_ssh_cidrs = ["<管理者のグローバルIP>/32"] # 管理者IPに限定することを推奨
```
変更を適用します：
```bash
cd terraform
mise exec -- terraform apply
```
- ※ インスタンスの再作成は発生せず、約 10 秒でファイアウォールルールのみが更新されます。

### ステップ 2: サーバーへ接続 & 調査
```bash
# Lightsail コンソールからブラウザ SSH を起動するか、SSH クライアントで接続
ssh -i <秘密鍵> ubuntu@<SERVER_PUBLIC_IP>

# ログ確認
sudo journalctl -u wg-quick@wg0 -n 50 --no-pager
sudo wg show
cat /proc/sys/net/ipv4/ip_forward
```

### ステップ 3: SSH ポートの再閉鎖 (重要)
調査完了後、必ずポート 22 を閉鎖します：
`terraform/terraform.tfvars` で以下に戻します：
```hcl
enable_ssh = false
```
変更を適用します：
```bash
mise exec -- terraform apply
```

---

## 4. 日常の運用監視とコスト管理

### 1. 通信実績・コスト予測の確認
プロジェクト管理者のローカル端末で、監視スクリプトを実行します：
```bash
node scripts/check-vpn-usage.mjs
```
- 各インスタンスの稼働状態
- 当月の実績費用および月末着地予測（AWS Cost Explorer）
- 料金プランの内訳確認

### 2. Discord Webhook による定期自動レポート
- 設定された Webhook チャンネルへ、12時間おき（JST 09:00, 21:00）に各メンバーの接続ステータスおよび送受信バイト数が自動投稿されます。
- 不通や長期間未接続のメンバーの把握に活用できます。

### 3. AWS Settings での利用費上限（Spend Limit）の確認
- 本プロジェクトが有料プランで運用されている場合、設定された利用費上限（Spend limit）を超過するとリソースが自動停止します。
- 突発的なアクセス拒否（Access Denied）が発生した場合は、[AWS Settings](https://settings.aws.com/) > **Billing** を開き、上限ステータスおよび請求状況を確認してください。
