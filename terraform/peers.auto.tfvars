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
  {
    name       = "TestUser",
    public_key = "iHl70qglIVTXKQS397RlABKoaKADjWGb1rffWmQ2TlA=",
    ip         = "10.0.0.3"
  },
  {
    name       = "Popo",
    public_key = "12PSt7lqq9cUKCSybPf5R/MybJCpZXCV2d/wfBM7Zwo=",
    ip         = "10.0.0.4"
  },
  {
    name       = "James",
    public_key = "uey9QG2EdMRTF+WTZzGn61UvfZ6N7dfJNnNmKzdwlQs=",
    ip         = "10.0.0.5"
  },
]
