#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WoW Private VPN Usage & AWS Cost Reporter (with Cost Explorer Forecast)
"""
import subprocess
import json
import os
import tempfile
import sys
from datetime import datetime, timedelta

sys.stdout.reconfigure(encoding="utf-8")

env = os.environ.copy()
env["PYTHONIOENCODING"] = "utf-8"
env["PYTHONUTF8"] = "1"
env["Path"] = r"C:\Users\yumatsuzawa\AppData\Local\Programs\Amazon\AWSCLIV2;C:\Users\yumatsuzawa\.local\bin;" + env.get("Path", "")

def get_instance_details(inst_name, region):
    res = subprocess.run(
        ["aws", "lightsail", "get-instance-access-details", "--instance-name", inst_name, "--region", region, "--profile", "wow-vpn", "--output", "json"],
        capture_output=True, text=True, encoding="utf-8", env=env
    )
    if res.returncode == 0:
        return json.loads(res.stdout)["accessDetails"]
    return None

data_tokyo = get_instance_details("wow-vpn-tokyo", "ap-northeast-1")
data_oregon = get_instance_details("wow-vpn-uswest2", "us-west-2")

print("="*60)
print(f"  WoW VPN 定期レポート ({datetime.now().strftime('%Y-%m-%d %H:%M:%S')})")
print("="*60)

# 1. WireGuard Usage
tmpdir = tempfile.mkdtemp()
try:
    def ssh_cmd(data, cmd):
        if not data: return "Instance access unavailable"
        kp = os.path.join(tmpdir, f"id_{data['ipAddress']}")
        cp = os.path.join(tmpdir, f"id_{data['ipAddress']}-cert.pub")
        with open(kp, "w", encoding="utf-8") as f: f.write(data["privateKey"])
        with open(cp, "w", encoding="utf-8") as f: f.write(data["certKey"])
        subprocess.run(["icacls", kp, "/inheritance:r", "/grant:r", f"{os.environ['USERNAME']}:(R)"], capture_output=True)
        res = subprocess.run(
            ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "ConnectTimeout=10", "-i", kp, f"ubuntu@{data['ipAddress']}", cmd],
            capture_output=True, text=True, encoding="utf-8"
        )
        return res.stdout.strip()

    print("\n[1. 東京サーバー (入口) 通信実績]")
    tokyo_wg = ssh_cmd(data_tokyo, "sudo wg show")
    for line in tokyo_wg.splitlines():
        if any(k in line for k in ["interface", "peer", "latest handshake", "transfer", "endpoint"]):
            print("  ", line.strip())

    print("\n[2. オレゴンサーバー (出口) 通信実績]")
    oregon_wg = ssh_cmd(data_oregon, "sudo wg show")
    for line in oregon_wg.splitlines():
        if any(k in line for k in ["interface", "peer", "latest handshake", "transfer", "endpoint"]):
            print("  ", line.strip())

except Exception as e:
    print("Error querying servers:", e)
finally:
    try:
        for f in os.listdir(tmpdir): os.remove(os.path.join(tmpdir, f))
        os.rmdir(tmpdir)
    except:
        pass

# 2. AWS Lightsail Instances State
print("\n[3. AWS Lightsail 稼働状況]")
for name, reg in [("wow-vpn-tokyo", "ap-northeast-1"), ("wow-vpn-uswest2", "us-west-2")]:
    st = subprocess.run(
        ["aws", "lightsail", "get-instance-state", "--instance-name", name, "--region", reg, "--profile", "wow-vpn", "--output", "json"],
        capture_output=True, text=True, encoding="utf-8", env=env
    )
    state_name = json.loads(st.stdout).get("state", {}).get("name", "unknown") if st.returncode == 0 else "error"
    print(f"   - {name} ({reg}): 稼働状態 = {state_name}")

# 3. AWS Cost Explorer API (Actual & Forecast Cost)
print("\n[4. AWS Cost Explorer コスト集計 & 月末予測 (API)]")
today = datetime.now().date()
first_day_of_month = today.replace(day=1).strftime("%Y-%m-%d")
next_day = (today + timedelta(days=1)).strftime("%Y-%m-%d")

# A. Actual Cost so far this month
actual_cost_res = subprocess.run([
    "aws", "ce", "get-cost-and-usage",
    "--time-period", f"Start={first_day_of_month},End={next_day}",
    "--granularity", "MONTHLY",
    "--metrics", "UnblendedCost",
    "--region", "us-east-1",
    "--profile", "wow-vpn",
    "--output", "json"
], capture_output=True, text=True, encoding="utf-8", env=env)

if actual_cost_res.returncode == 0:
    try:
        data = json.loads(actual_cost_res.stdout)
        results = data.get("ResultsByTime", [])
        if results:
            amount = results[0]["Total"]["UnblendedCost"]["Amount"]
            unit = results[0]["Total"]["UnblendedCost"]["Unit"]
            print(f"   * 当月これまでの実績費用: ${float(amount):.2f} {unit}")
    except:
        print("   * 当月実績費用: 集計中")
else:
    print("   * 当月実績費用: 収集・集計中 (初回有効化から最大24時間程度要します)")

# B. Forecast Cost by end of month
if today.month == 12:
    end_of_month = f"{today.year+1}-01-01"
else:
    end_of_month = f"{today.year}-{today.month+1:02d}-01"

forecast_res = subprocess.run([
    "aws", "ce", "get-cost-forecast",
    "--time-period", f"Start={next_day},End={end_of_month}",
    "--metric", "UNBLENDED_COST",
    "--granularity", "MONTHLY",
    "--region", "us-east-1",
    "--profile", "wow-vpn",
    "--output", "json"
], capture_output=True, text=True, encoding="utf-8", env=env)

if forecast_res.returncode == 0:
    try:
        fdata = json.loads(forecast_res.stdout)
        total_amount = fdata.get("Total", {}).get("Amount", "0.0")
        unit = fdata.get("Total", {}).get("Unit", "USD")
        print(f"   * 月末までの着地予測費用 (Forecast): ${float(total_amount):.2f} {unit}")
    except:
        print("   * 月末予測 (Forecast): パース中")
else:
    print("   * 月末予測 (Forecast): データ蓄積中 (数日間の履歴データ蓄積後に自動反映されます)")

print("\n   [料金プラン内訳]")
print("   * 東京インスタンス: $0.00 (初回3か月無料枠適用)")
print("   * オレゴンインスタンス: $5.00 / 月 (約 780 円)")
print("   * データ転送量: 付属1TB内 (追加課金なし $0.00)")
print("   * 静的IP (2個): アタッチ中無料 ($0.00)")
print("   --------------------------------------------------")
print("   * 3か月間の想定請求額: 約 $5.00 / 月")
print("   * 4か月目以降 (定常)  : 約 $10.00 / 月")

print("\n" + "="*60)
