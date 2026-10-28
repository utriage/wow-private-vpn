# WoW Private VPN (World of Warcraft US 専用プライベートVPN)

AWS Lightsail 上で稼働する、**World of Warcraft (WoW) US サーバー専用スプリットトンネル WireGuard VPN** の管理リポジトリです。

Mudfish 等のルーティング定義（Blizzard 主要 68 帯域）をベースに、ゲーム通信のみを安全かつ低遅延に AWS（東京 / オレゴン）経由でルーティングします。Discord、ブラウザ、YouTube、大型パッチDL 等の通常通信はローカル回線をそのまま利用します。

---

## 主な特徴とアーキテクチャ

```mermaid
graph LR
    subgraph Client["クライアント端末 (ギルドメンバー)"]
        WoW["World of Warcraft (ゲーム通信)"]
        Other["Discord / ブラウザ / 動画 / パッチ"]
    end

    subgraph AWS["AWS Lightsail (東京リージョン)"]
        WG["WireGuard Gateway (51820/UDP)"]
    end

    subgraph Internet["インターネット"]
        Blizzard["Blizzard US ゲームサーバー"]
        PublicNet["通常のインターネット"]
    end

    subgraph Monitoring["通知・管理"]
        Discord["Discord チャンネル (Webhook)"]
    end

    WoW -->|スプリットトンネル (暗号化)| WG
    WG --> Blizzard
    Other --> PublicNet
    WG -.->|起動通知 / 12h定期レポート| Discord
```

- **イミュータブル・ゼロアタックサーフェス運用**:
  - ポート 22（SSH）はファイアウォールで常時完全閉鎖。
  - サーバーの構築・WireGuard 設定・Peer 登録は Lightsail 起動スクリプト（`user_data`）で完全自動化。
- **宣言的インフラ管理 (Terraform & mise)**:
  - インスタンススペック、ファイアウォール、静的IP、登録メンバー（Peer）の公開鍵がすべて Git でコードレビュー可能。
- **ゼロ・トラストなメンバー設定発行**:
  - 管理者の手元で [`scripts/add-peer.mjs`](file:///c:/Users/yumatsuzawa/workspace/wow-private-vpn/scripts/add-peer.mjs) を 1 コマンド実行するだけで、一意な鍵ペア・仮想IPを生成し、配布用設定（`wow-<member>.conf`）を出力。
  - 秘密鍵はメンバー端末にのみ保存され、管理者の手元や Git には残りません。
- **完全無料の稼働通知 & レポート (Discord Webhook)**:
  - 東京GW・オレゴンGWそれぞれの Discord Webhook 連携により、サーバー起動通知および 12 時間ごとの通信量サマリーを自動受信。

---

## ディレクトリ構成

```text
wow-private-vpn/
├── .envrc                         # direnv 設定 (AWS_PROFILE=wow-vpn, use mise)
├── .gitignore                     # 秘密鍵、ステートファイル、クライアント設定の除外
├── mise.toml                      # ツールバージョン管理 (terraform 等)
├── README.md                      # プロジェクト概要・総合ガイド (本ドキュメント)
├── DEPLOY.md                      # 初期構築・デプロイ・メンバー追加手順書
├── MAINTENANCE.md                 # 運用保守・更新・再作成・トラブルシュート手順書
│
├── terraform/                     # 宣言的インフラコード
│   ├── main.tf                    # Lightsail インスタンス・静的IP・ファイアウォール定義
│   ├── variables.tf               # 変数定義 (リージョン、スペック、Webhook等)
│   ├── outputs.tf                 # エンドポイントIP、静的IPの出力
│   ├── versions.tf                # プロバイダー要件 (hashicorp/aws)
│   ├── peers.auto.tfvars          # 登録メンバー (Peer) の公開鍵・IPリスト (Git管理)
│   ├── terraform.tfvars.example   # 設定値カスタマイズ用サンプル
│   └── templates/
│       └── user_data.sh.tftpl     # 起動時オプション (WireGuard自動構築 & Discord通知)
│
├── scripts/                       # 運用自動化スクリプト (Node.js / Shell)
│   ├── add-peer.mjs               # ギルドメンバー個別設定生成 & Terraform登録ツール
│   └── check-vpn-usage.mjs        # 稼働状況・AWS費用集計 & 月末着地予測ツール
│
└── templates/
    └── wow-client.template.conf   # クライアント配布用設定テンプレート
```

---

## クイックリファレンス

### 1. 新規メンバーの追加・配布 (ワンストップ)
```bash
# 1. メンバー用設定を生成 (例: userA)
node scripts/add-peer.mjs userA

# 2. サーバーへ設定を反映
cd terraform
mise exec -- terraform apply

# 3. 生成された generated/wow-userA.conf を本人に Discord DM で送付
# 4. 手元の秘密鍵ファイルを安全に削除
Remove-Item ../generated/wow-userA.conf
```

### 2. 稼働状況 & AWS利用費用の確認
```bash
node scripts/check-vpn-usage.mjs
```

### 3. OS・パッケージの一括最新化 (イミュータブル再作成)
```bash
cd terraform
mise exec -- terraform apply -replace="aws_lightsail_instance.tokyo"
```
※ 静的IPおよび全クライアントの接続設定を維持したまま、約 40 秒で最新状態へ切り替わります。

---

## 詳細ドキュメントリンク
- 🚀 **構築とデプロイ**: [DEPLOY.md](DEPLOY.md)
- 🛠️ **運用・保守・更新**: [MAINTENANCE.md](MAINTENANCE.md)
