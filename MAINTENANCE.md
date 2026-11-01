# WoW Private VPN 運用保守手順書 (MAINTENANCE.md)

日常のメンバー管理、稼働監視、定期アップデート（イミュータブル再作成）、およびトラブルシューティングの手順書です。

---

## 1. 日常運用コマンド (クイックリファレンス)

### メンバーの追加（無停止ホット反映）
```bash
node scripts/add-peer.mjs <メンバー名>
# 生成された generated/wow-<メンバー名>.conf を本人に DM 送付後、手元のファイルを削除
Remove-Item generated/wow-<メンバー名>.conf
```

### メンバーの即時アクセス権剥奪（無停止ホット切断）
```bash
node scripts/remove-peer.mjs <メンバー名>
```
※ 稼働中のサーバーから即座にピアを削除し、通信を遮断します。

### 通信健全性 & レイテンシー測定 (Sanity Check)
```bash
node scripts/check-wow-route.mjs
# ホップ追跡付き: node scripts/check-wow-route.mjs --trace
```

### 稼働状況 & 利用費用の確認
```bash
node scripts/check-vpn-usage.mjs
```

### Blizzard IP レンジの最新同期 & 集約（大型パッチ時・年1回推奨）
Blizzard 公式 BGP（AS57976, AS393278）から最新プレフィックスを取得し、Supernetting（包括集約）を行って定義を更新します。
```bash
# 1. 最新プレフィックスの取得 & ルーティング自動集約
node scripts/update-blizzard-routes.mjs

# 2. 稼働中サーバー (東京・オレゴン) への無停止ホット適用
node scripts/apply-security-hardening.mjs

# 3. 健全性の確認 (130ms台・ロス0%の確認)
node scripts/check-wow-route.mjs

# 4. Git にルーティング更新をコミット
git add terraform/wow_routes.tf templates/wow-client.template.conf
git commit -m "feat(routes): sync and aggregate Blizzard IP ranges from BGP"
```
※ クライアント設定は大きな包括ブロック（`/16` や `/18` 等）で集約されているため、細かなサブネット変更に伴うメンバー側での設定再インポートは不要です。

---

## 2. 定期 OS・パッケージ更新 (イミュータブル再作成)

サーバー内部にログインしてパッチを当てるのではなく、**インスタンスを新品に入れ替える運用** を標準とします。静的IPおよび全メンバーの設定を維持したまま、約 40 秒で最新化されます。

```bash
# 1. デプロイ前の遅延を記録
node scripts/check-wow-route.mjs

# 2. 東京サーバーを最新 OS・パッケージで再作成
cd terraform
mise exec -- terraform apply -replace="aws_lightsail_instance.tokyo"

# 3. 復旧と遅延の確認 (前回比が自動計算されます)
node scripts/check-wow-route.mjs
```

---

## 3. 緊急調査時の SSH 一時開放手順

通常時はポート 22（SSH）が完全閉鎖されています。内部調査が必要な場合のみ一時的に開放します。

1. `terraform/terraform.tfvars` に `enable_ssh = true` を追記。
2. `terraform apply` でファイアウォールを更新（約 10 秒）。
3. Lightsail コンソールのブラウザ SSH または SSH クライアントで接続・調査：
   ```bash
   sudo wg show
   sudo journalctl -u wg-quick@wg0 -n 50 --no-pager
   ```
4. 調査終了後、`enable_ssh = false` に戻して `terraform apply` で再閉鎖。

---

## 4. 監視とコスト上限

- **定期レポート**: Discord Webhook 宛てに 1 日 1 回（JST 00:30 / UTC 15:30、週末Raid終了直後）に接続状況・転送量サマリーが自動投稿されます。
- **利用上限 (Spend limit)**: 急にアクセス不能（Access Denied 等）になった場合は、[AWS Settings](https://settings.aws.com/) > **Billing** で利用上限ステータスを確認してください。
