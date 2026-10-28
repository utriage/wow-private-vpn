# WoW Private VPN デプロイメントガイド (DEPLOY.md)

World of Warcraft (WoW) 専用スプリットトンネル VPN の初期インフラ構築およびメンバー配布手順書です。

---

## 1. 前提条件と環境準備

- **ツール**: direnv, mise, AWS CLI v2, OpenSSH
- `mise.toml` により、指定バージョンの Terraform が自動適用されます。

### AWS 認証セッションの開始
```bash
aws login --profile wow-vpn
```
※ `.envrc` により `AWS_PROFILE=wow-vpn` が自動設定されます。

---

## 2. インフラ構築手順 (Terraform)

### ステップ 1: 設定ファイルの準備
```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```
※ `terraform.tfvars` は `.gitignore` 対象です。必要に応じて Webhook URL 等を設定します。

### ステップ 2: 初期化と適用
```bash
terraform init
terraform apply
```
プロンプトに `yes` を入力すると、約 40 秒で東京・オレゴンのインフラ（Lightsail、静的IP、初期設定、ファイアウォール）が自動構築されます。手動の SSH ログインは不要です。

---

## 3. メンバーの追加と配布手順 (ワンストップ)

管理者の手元で 1 コマンド実行するだけで、鍵ペア生成・IP割当・稼働中サーバーへのホット反映・設定ファイル出力が完了します。

```bash
# 1. メンバー用設定の生成 & ホット反映
node scripts/add-peer.mjs playerA

# 2. 生成された設定ファイルを本人へ送付
#    generated/wow-playerA.conf を Discord 個人DM 等で送付

# 3. 送付完了後、手元のファイルを削除
Remove-Item generated/wow-playerA.conf

# 4. (任意) Git に公開鍵リストをコミット
git add terraform/peers.auto.tfvars
git commit -m "feat(vpn): register playerA peer"
```

- クライアント秘密鍵はメンバー本人にのみ渡り、Git やサーバーには残りません。
- サーバー再起動は不要（無停止で即座に接続可能になります）。

---

## 4. インフラの破棄・クリーンアップ

検証終了時や運用を停止する場合は以下を実行します：
```bash
cd terraform
terraform destroy
```
Lightsail インスタンスおよび静的IPが削除され、課金が停止します。
