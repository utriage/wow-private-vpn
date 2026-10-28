#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseDir = path.dirname(__dirname);
const stateFile = path.join(baseDir, "terraform", "terraform.tfstate");

if (!fs.existsSync(stateFile)) {
    console.error("エラー: terraform.tfstate が見つかりません。");
    process.exit(1);
}

const state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
const existing = new Set((state.resources || []).map((r) => `${r.type}.${r.name}`));
const newResources = [];

if (!existing.has("aws_lightsail_static_ip.tokyo_ip")) {
    newResources.push({
        mode: "managed",
        type: "aws_lightsail_static_ip",
        name: "tokyo_ip",
        provider: 'provider["registry.terraform.io/hashicorp/aws"]',
        instances: [{
            schema_version: 0,
            attributes: {
                arn: "arn:aws:lightsail:ap-northeast-1:052477895822:StaticIp/2a377dbb-4a9c-49f7-bb35-c11db245b4ed",
                id: "wow-vpn-ip",
                ip_address: "52.196.243.126",
                name: "wow-vpn-ip",
                support_code: "218201720635/52.196.243.126"
            },
            sensitive_attributes: []
        }]
    });
}

if (!existing.has("aws_lightsail_static_ip_attachment.tokyo_attach")) {
    newResources.push({
        mode: "managed",
        type: "aws_lightsail_static_ip_attachment",
        name: "tokyo_attach",
        provider: 'provider["registry.terraform.io/hashicorp/aws"]',
        instances: [{
            schema_version: 0,
            attributes: {
                id: "wow-vpn-ip",
                instance_name: "wow-vpn-tokyo",
                ip_address: "52.196.243.126",
                static_ip_name: "wow-vpn-ip"
            },
            sensitive_attributes: [],
            dependencies: [
                "aws_lightsail_instance.tokyo",
                "aws_lightsail_static_ip.tokyo_ip"
            ]
        }]
    });
}

if (!existing.has("aws_lightsail_static_ip.oregon_ip")) {
    newResources.push({
        mode: "managed",
        type: "aws_lightsail_static_ip",
        name: "oregon_ip",
        provider: 'provider["registry.terraform.io/hashicorp/aws"].oregon',
        instances: [{
            index_key: 0,
            schema_version: 0,
            attributes: {
                arn: "arn:aws:lightsail:us-west-2:052477895822:StaticIp/7896d207-5896-460c-bce1-dcb6d962029c",
                id: "wow-vpn-uswest2-ip",
                ip_address: "44.224.114.80",
                name: "wow-vpn-uswest2-ip",
                support_code: "218201720635/44.224.114.80"
            },
            sensitive_attributes: []
        }]
    });
}

if (!existing.has("aws_lightsail_static_ip_attachment.oregon_attach")) {
    newResources.push({
        mode: "managed",
        type: "aws_lightsail_static_ip_attachment",
        name: "oregon_attach",
        provider: 'provider["registry.terraform.io/hashicorp/aws"].oregon',
        instances: [{
            index_key: 0,
            schema_version: 0,
            attributes: {
                id: "wow-vpn-uswest2-ip",
                instance_name: "wow-vpn-uswest2",
                ip_address: "44.224.114.80",
                static_ip_name: "wow-vpn-uswest2-ip"
            },
            sensitive_attributes: [],
            dependencies: [
                "aws_lightsail_instance.oregon",
                "aws_lightsail_static_ip.oregon_ip"
            ]
        }]
    });
}

state.resources.push(...newResources);
fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf-8");
console.log(`ステート同期完了: ${newResources.length} 件のリソースを補完しました。`);
