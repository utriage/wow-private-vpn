# ===================================================================
# 登録ギルドメンバー (WireGuard Peer) 定義リスト
# scripts/add-peer.mjs により自動追記・更新されます。
# 公開鍵・仮想IPのみが含まれるため、Git コミット対象として安全に管理可能です。
# ===================================================================
wireguard_peers = [
  {
    name       = "Gada",
    public_key = "ONbkIHgbgyw2Zr7orC4UNkZpVYnuv0k7kThdC4DcVwI=",
    ip         = "10.0.0.2"
  },
]
