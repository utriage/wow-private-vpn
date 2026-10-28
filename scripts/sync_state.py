import json
import os

STATE_FILE = "terraform/terraform.tfstate"

with open(STATE_FILE, "r", encoding="utf-8") as f:
    state = json.load(f)

# 既存の static_ip や ports リソースを重複追加しないようにフィルタリング
existing_names = {r["type"] + "." + r["name"] for r in state["resources"]}

new_resources = []

# 1. 東京 Static IP
if "aws_lightsail_static_ip.tokyo_ip" not in existing_names:
    new_resources.append({
        "mode": "managed",
        "type": "aws_lightsail_static_ip",
        "name": "tokyo_ip",
        "provider": 'provider["registry.terraform.io/hashicorp/aws"]',
        "instances": [
            {
                "schema_version": 0,
                "attributes": {
                    "arn": "arn:aws:lightsail:ap-northeast-1:052477895822:StaticIp/2a377dbb-4a9c-49f7-bb35-c11db245b4ed",
                    "id": "wow-vpn-ip",
                    "ip_address": "52.196.243.126",
                    "name": "wow-vpn-ip",
                    "support_code": "218201720635/52.196.243.126"
                },
                "sensitive_attributes": []
            }
        ]
    })

# 2. 東京 Static IP Attachment
if "aws_lightsail_static_ip_attachment.tokyo_attach" not in existing_names:
    new_resources.append({
        "mode": "managed",
        "type": "aws_lightsail_static_ip_attachment",
        "name": "tokyo_attach",
        "provider": 'provider["registry.terraform.io/hashicorp/aws"]',
        "instances": [
            {
                "schema_version": 0,
                "attributes": {
                    "id": "wow-vpn-ip",
                    "instance_name": "wow-vpn-tokyo",
                    "ip_address": "52.196.243.126",
                    "static_ip_name": "wow-vpn-ip"
                },
                "sensitive_attributes": [],
                "dependencies": [
                    "aws_lightsail_instance.tokyo",
                    "aws_lightsail_static_ip.tokyo_ip"
                ]
            }
        ]
    })

# 3. 東京 Ports
if "aws_lightsail_instance_public_ports.tokyo_ports" not in existing_names:
    new_resources.append({
        "mode": "managed",
        "type": "aws_lightsail_instance_public_ports",
        "name": "tokyo_ports",
        "provider": 'provider["registry.terraform.io/hashicorp/aws"]',
        "instances": [
            {
                "schema_version": 0,
                "attributes": {
                    "id": "wow-vpn-tokyo",
                    "instance_name": "wow-vpn-tokyo",
                    "port_info": [
                        {
                            "cidr_list_aliases": [],
                            "cidrs": ["0.0.0.0/0"],
                            "from_port": 22,
                            "ipv6_cidrs": ["::/0"],
                            "protocol": "tcp",
                            "to_port": 22
                        },
                        {
                            "cidr_list_aliases": [],
                            "cidrs": ["0.0.0.0/0"],
                            "from_port": 80,
                            "ipv6_cidrs": ["::/0"],
                            "protocol": "tcp",
                            "to_port": 80
                        },
                        {
                            "cidr_list_aliases": [],
                            "cidrs": ["0.0.0.0/0"],
                            "from_port": 51820,
                            "ipv6_cidrs": ["::/0"],
                            "protocol": "udp",
                            "to_port": 51820
                        }
                    ]
                },
                "sensitive_attributes": [],
                "dependencies": [
                    "aws_lightsail_instance.tokyo"
                ]
            }
        ]
    })

# 4. オレゴン Static IP
if "aws_lightsail_static_ip.oregon_ip" not in existing_names:
    new_resources.append({
        "mode": "managed",
        "type": "aws_lightsail_static_ip",
        "name": "oregon_ip",
        "provider": 'provider["registry.terraform.io/hashicorp/aws"].oregon',
        "instances": [
            {
                "index_key": 0,
                "schema_version": 0,
                "attributes": {
                    "arn": "arn:aws:lightsail:us-west-2:052477895822:StaticIp/7896d207-5896-460c-bce1-dcb6d962029c",
                    "id": "wow-vpn-uswest2-ip",
                    "ip_address": "44.224.114.80",
                    "name": "wow-vpn-uswest2-ip",
                    "support_code": "218201720635/44.224.114.80"
                },
                "sensitive_attributes": []
            }
        ]
    })

# 5. オレゴン Static IP Attachment
if "aws_lightsail_static_ip_attachment.oregon_attach" not in existing_names:
    new_resources.append({
        "mode": "managed",
        "type": "aws_lightsail_static_ip_attachment",
        "name": "oregon_attach",
        "provider": 'provider["registry.terraform.io/hashicorp/aws"].oregon',
        "instances": [
            {
                "index_key": 0,
                "schema_version": 0,
                "attributes": {
                    "id": "wow-vpn-uswest2-ip",
                    "instance_name": "wow-vpn-uswest2",
                    "ip_address": "44.224.114.80",
                    "static_ip_name": "wow-vpn-uswest2-ip"
                },
                "sensitive_attributes": [],
                "dependencies": [
                    "aws_lightsail_instance.oregon",
                    "aws_lightsail_static_ip.oregon_ip"
                ]
            }
        ]
    })

# 6. オレゴン Ports
if "aws_lightsail_instance_public_ports.oregon_ports" not in existing_names:
    new_resources.append({
        "mode": "managed",
        "type": "aws_lightsail_instance_public_ports",
        "name": "oregon_ports",
        "provider": 'provider["registry.terraform.io/hashicorp/aws"].oregon',
        "instances": [
            {
                "index_key": 0,
                "schema_version": 0,
                "attributes": {
                    "id": "wow-vpn-uswest2",
                    "instance_name": "wow-vpn-uswest2",
                    "port_info": [
                        {
                            "cidr_list_aliases": [],
                            "cidrs": ["0.0.0.0/0"],
                            "from_port": 22,
                            "ipv6_cidrs": ["::/0"],
                            "protocol": "tcp",
                            "to_port": 22
                        },
                        {
                            "cidr_list_aliases": [],
                            "cidrs": ["0.0.0.0/0"],
                            "from_port": 80,
                            "ipv6_cidrs": ["::/0"],
                            "protocol": "tcp",
                            "to_port": 80
                        },
                        {
                            "cidr_list_aliases": [],
                            "cidrs": ["0.0.0.0/0"],
                            "from_port": 51820,
                            "ipv6_cidrs": ["::/0"],
                            "protocol": "udp",
                            "to_port": 51820
                        }
                    ]
                },
                "sensitive_attributes": [],
                "dependencies": [
                    "aws_lightsail_instance.oregon"
                ]
            }
        ]
    })

state["resources"].extend(new_resources)

with open(STATE_FILE, "w", encoding="utf-8") as f:
    json.dump(state, f, indent=2)

print(f"Successfully synced {len(new_resources)} resources into {STATE_FILE}")
