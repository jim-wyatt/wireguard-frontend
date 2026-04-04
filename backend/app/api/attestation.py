import json
import os
import platform
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from importlib import metadata
from pathlib import Path

from fastapi import APIRouter, Depends

from app.core.auth import require_writer_role
from app.core.config import settings
from app.services.wireguard import wireguard_service

router = APIRouter()
PROCESS_STARTED_AT = time.time()


def _resolve_report_path(filename: str) -> Path:
    return Path(settings.SECURITY_REPORTS_DIR) / filename


def _safe_version(package_name: str) -> str | None:
    try:
        return metadata.version(package_name)
    except metadata.PackageNotFoundError:
        return None


def _read_os_release() -> dict:
    path = Path("/etc/os-release")
    if not path.is_file():
        return {
            "name": platform.system(),
            "version": platform.release(),
            "id": None,
            "pretty_name": platform.platform(),
        }

    parsed: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if "=" not in line or line.startswith("#"):
            continue
        key, value = line.split("=", 1)
        parsed[key] = value.strip().strip('"')

    return {
        "name": parsed.get("NAME") or platform.system(),
        "version": parsed.get("VERSION_ID") or platform.release(),
        "id": parsed.get("ID"),
        "pretty_name": parsed.get("PRETTY_NAME") or platform.platform(),
    }


def _read_uptime_seconds() -> int | None:
    try:
        raw = Path("/proc/uptime").read_text(encoding="utf-8", errors="replace").split()[0]
        return int(float(raw))
    except Exception:
        return None


def _read_memory_total_mb() -> int | None:
    try:
        for line in Path("/proc/meminfo").read_text(encoding="utf-8", errors="replace").splitlines():
            if line.startswith("MemTotal:"):
                parts = line.split()
                kilobytes = int(parts[1])
                return int(kilobytes / 1024)
    except Exception:
        return None
    return None


def _container_runtime_hint() -> str | None:
    env_runtime = (os.getenv("container") or "").strip().lower()
    if env_runtime:
        return env_runtime

    try:
        cgroup = Path("/proc/1/cgroup").read_text(encoding="utf-8", errors="replace").lower()
    except Exception:
        cgroup = ""

    for hint in ("podman", "docker", "containerd", "kubepods"):
        if hint in cgroup:
            return hint
    return None


def _is_containerized() -> bool:
    return Path("/.dockerenv").exists() or _container_runtime_hint() is not None


def _aws_metadata_token() -> str | None:
    request = urllib.request.Request(
        "http://169.254.169.254/latest/api/token",
        method="PUT",
        headers={"X-aws-ec2-metadata-token-ttl-seconds": "60"},
    )
    try:
        with urllib.request.urlopen(request, timeout=0.2) as response:
            return response.read().decode("utf-8").strip() or None
    except Exception:
        return None


def _aws_metadata(path: str, token: str | None) -> str | None:
    request = urllib.request.Request(f"http://169.254.169.254/latest/{path}")
    if token:
        request.add_header("X-aws-ec2-metadata-token", token)
    try:
        with urllib.request.urlopen(request, timeout=0.2) as response:
            return response.read().decode("utf-8").strip() or None
    except Exception:
        return None


def _cloud_context() -> dict:
    aws_region = (os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "").strip() or None
    execution_env = (os.getenv("AWS_EXECUTION_ENV") or "").strip() or None
    ecs_metadata = (os.getenv("ECS_CONTAINER_METADATA_URI_V4") or "").strip() or None
    lambda_name = (os.getenv("AWS_LAMBDA_FUNCTION_NAME") or "").strip() or None

    hypervisor_uuid = ""
    try:
        hypervisor_uuid = Path("/sys/hypervisor/uuid").read_text(encoding="utf-8", errors="replace").strip().lower()
    except Exception:
        pass

    looks_like_aws = any([aws_region, execution_env, ecs_metadata, lambda_name]) or hypervisor_uuid.startswith("ec2")
    token = _aws_metadata_token() if looks_like_aws else None
    identity_document = None
    if token:
        identity_raw = _aws_metadata("dynamic/instance-identity/document", token)
        if identity_raw:
            try:
                identity_document = json.loads(identity_raw)
            except json.JSONDecodeError:
                identity_document = None

    provider = "aws" if looks_like_aws or identity_document else None
    region = aws_region or (identity_document or {}).get("region")
    availability_zone = (identity_document or {}).get("availabilityZone")
    instance_id = (identity_document or {}).get("instanceId")
    instance_type = (identity_document or {}).get("instanceType")
    account_id = (identity_document or {}).get("accountId")

    return {
        "provider": provider,
        "detected": bool(provider),
        "region": region,
        "availability_zone": availability_zone,
        "instance_id": instance_id,
        "instance_type": instance_type,
        "account_id": account_id,
        "execution_env": execution_env,
        "ecs_metadata": bool(ecs_metadata),
        "lambda_function": lambda_name,
    }


def _runtime_context() -> dict:
    os_release = _read_os_release()
    return {
        "hostname": socket.gethostname(),
        "python_version": platform.python_version(),
        "python_implementation": platform.python_implementation(),
        "platform": platform.platform(),
        "kernel": platform.release(),
        "architecture": platform.machine(),
        "cpu_count": os.cpu_count(),
        "memory_total_mb": _read_memory_total_mb(),
        "uptime_seconds": _read_uptime_seconds(),
        "containerized": _is_containerized(),
        "container_runtime": _container_runtime_hint(),
        "os": os_release,
    }


def _asset_name_from_filename(filename: str) -> str:
    match = re.search(r"(?:trivy|sbom)-([^.]+)", filename)
    return match.group(1) if match else filename


def _security_assets(trivy_reports: list[dict], sbom_reports: list[dict]) -> list[dict]:
    assets: dict[str, dict] = {}

    for report in trivy_reports:
        name = _asset_name_from_filename(report["file"])
        assets.setdefault(
            name,
            {
                "id": name,
                "name": name,
                "vulnerabilities": 0,
                "high": 0,
                "critical": 0,
                "sbom_components": 0,
                "scan_present": False,
                "sbom_present": False,
            },
        )
        assets[name]["vulnerabilities"] = report["total"]
        assets[name]["high"] = report["high"]
        assets[name]["critical"] = report["critical"]
        assets[name]["scan_present"] = report["exists"]

    for report in sbom_reports:
        name = _asset_name_from_filename(report["file"])
        assets.setdefault(
            name,
            {
                "id": name,
                "name": name,
                "vulnerabilities": 0,
                "high": 0,
                "critical": 0,
                "sbom_components": 0,
                "scan_present": False,
                "sbom_present": False,
            },
        )
        assets[name]["sbom_components"] = report["component_count"]
        assets[name]["sbom_present"] = report["exists"]

    for asset in assets.values():
        if asset["critical"] > 0:
            asset["posture"] = "critical"
        elif asset["high"] > 0:
            asset["posture"] = "warning"
        elif asset["scan_present"] and asset["sbom_present"]:
            asset["posture"] = "healthy"
        else:
            asset["posture"] = "partial"

    return sorted(assets.values(), key=lambda item: item["name"])


def _evidence_coverage(trivy_reports: list[dict], sbom_reports: list[dict]) -> dict:
    trivy_available = sum(1 for report in trivy_reports if report["exists"])
    sbom_available = sum(1 for report in sbom_reports if report["exists"])
    trivy_total = len(trivy_reports)
    sbom_total = len(sbom_reports)
    combined_available = trivy_available + sbom_available
    combined_total = trivy_total + sbom_total

    return {
        "trivy": {
            "available": trivy_available,
            "total": trivy_total,
            "percent": int((trivy_available / trivy_total) * 100) if trivy_total else 0,
        },
        "sbom": {
            "available": sbom_available,
            "total": sbom_total,
            "percent": int((sbom_available / sbom_total) * 100) if sbom_total else 0,
        },
        "combined": {
            "available": combined_available,
            "total": combined_total,
            "percent": int((combined_available / combined_total) * 100) if combined_total else 0,
        },
    }


def _insights(*, totals: dict, auth: dict, log_sources: dict, runtime: dict, cloud: dict, evidence: dict) -> list[str]:
    insights: list[str] = []

    if totals["critical"] > 0:
        insights.append(f"Critical vulnerabilities remain in scanned assets: {totals['critical']} critical findings.")
    if auth["legacy_token_enabled"]:
        insights.append("Legacy API token path is still enabled; structured token grants are preferable for scoped access.")
    if auth["token_grants_configured"]:
        insights.append("Structured token grants are enabled, allowing role and expiry-based API access control.")
    if not all(log_sources.values()):
        missing = ", ".join(name for name, exists in log_sources.items() if not exists)
        insights.append(f"Some runtime log sources are unavailable from the API view: {missing}.")
    if runtime["containerized"]:
        runtime_name = runtime["container_runtime"] or "container runtime"
        insights.append(f"The API appears to run inside {runtime_name}, which keeps the deployment portable and isolated.")
    if cloud["provider"] == "aws":
        region = cloud["region"] or "unknown-region"
        insights.append(f"AWS environment detected with region context {region}.")
    if evidence["combined"]["percent"] == 100:
        insights.append("Security evidence coverage is complete for the tracked assets: scans and SBOMs are present for each one.")

    return insights


def _wireguard_context() -> dict:
    summary = wireguard_service.get_interface_summary()
    latest_handshake = summary.get("latest_handshake")
    return {
        "interface": summary.get("interface"),
        "is_up": bool(summary.get("is_up")),
        "listen_port": summary.get("listen_port"),
        "public_key": summary.get("public_key"),
        "network": summary.get("network"),
        "server_ip": summary.get("server_ip"),
        "server_endpoint": summary.get("server_endpoint"),
        "dns": summary.get("dns"),
        "configured_peers": summary.get("configured_peers", 0),
        "connected_peers": summary.get("connected_peers", 0),
        "latest_handshake": latest_handshake.isoformat() if latest_handshake else None,
        "transfer_rx": summary.get("transfer_rx", 0),
        "transfer_tx": summary.get("transfer_tx", 0),
    }


def _parse_trivy_summary(path: Path) -> dict:
    if not path.is_file():
        return {
            "file": path.name,
            "exists": False,
            "total": 0,
            "high": 0,
            "critical": 0,
        }

    text = path.read_text(encoding="utf-8", errors="replace")

    total_match = re.search(r"Total:\s*(\d+)\s*\(HIGH:\s*(\d+),\s*CRITICAL:\s*(\d+)\)", text)
    if total_match:
        total, high, critical = total_match.groups()
        return {
            "file": path.name,
            "exists": True,
            "total": int(total),
            "high": int(high),
            "critical": int(critical),
        }

    return {
        "file": path.name,
        "exists": True,
        "total": 0,
        "high": 0,
        "critical": 0,
    }


def _parse_sbom_metadata(path: Path) -> dict:
    if not path.is_file():
        return {
            "file": path.name,
            "exists": False,
            "spec_version": None,
            "timestamp": None,
            "component_count": 0,
        }

    try:
        payload = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    except json.JSONDecodeError:
        return {
            "file": path.name,
            "exists": True,
            "spec_version": None,
            "timestamp": None,
            "component_count": 0,
            "parse_error": True,
        }

    components = payload.get("components")
    return {
        "file": path.name,
        "exists": True,
        "spec_version": payload.get("specVersion"),
        "timestamp": payload.get("metadata", {}).get("timestamp"),
        "component_count": len(components) if isinstance(components, list) else 0,
    }


def _git_commit() -> str | None:
    commit_env = (os.getenv("GIT_COMMIT") or "").strip()
    if commit_env:
        return commit_env

    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
            timeout=2,
        )
        return result.stdout.strip() or None
    except Exception:
        return None


@router.get("/attestation/summary")
async def attestation_summary(_: None = Depends(require_writer_role)):
    trivy_reports = [
        _parse_trivy_summary(_resolve_report_path("trivy-backend.txt")),
        _parse_trivy_summary(_resolve_report_path("trivy-caddy.txt")),
        _parse_trivy_summary(_resolve_report_path("trivy-postgres.txt")),
    ]
    sbom_reports = [
        _parse_sbom_metadata(_resolve_report_path("sbom-backend.cdx.json")),
        _parse_sbom_metadata(_resolve_report_path("sbom-caddy.cdx.json")),
        _parse_sbom_metadata(_resolve_report_path("sbom-postgres.cdx.json")),
    ]

    total_vulns = sum(report["total"] for report in trivy_reports)
    total_high = sum(report["high"] for report in trivy_reports)
    total_critical = sum(report["critical"] for report in trivy_reports)
    totals = {
        "vulnerabilities": total_vulns,
        "high": total_high,
        "critical": total_critical,
        "remediated": 0,
    }
    auth = {
        "token_grants_configured": bool((settings.API_AUTH_TOKENS_JSON or "").strip()),
        "legacy_token_enabled": bool((settings.API_AUTH_TOKEN or "").strip()),
        "api_docs_enabled": settings.ENABLE_API_DOCS,
        "auth_fail_rate_limit_per_minute": settings.AUTH_FAIL_RATE_LIMIT_PER_MINUTE,
        "auth_fail_block_seconds": settings.AUTH_FAIL_BLOCK_SECONDS,
    }
    log_sources = {
        "caddy": os.path.isfile(settings.CADDY_ACCESS_LOG_PATH),
        "app": os.path.isfile(settings.APP_LOG_PATH),
        "system": os.path.isfile(settings.SYSTEM_LOG_PATH),
    }
    runtime = _runtime_context()
    cloud = _cloud_context()
    evidence = _evidence_coverage(trivy_reports, sbom_reports)
    assets = _security_assets(trivy_reports, sbom_reports)
    wireguard = _wireguard_context()

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "service": {
            "name": "wireguard-management-api",
            "version": "1.0.0",
            "git_commit": _git_commit(),
            "fastapi_version": _safe_version("fastapi"),
            "sqlalchemy_version": _safe_version("sqlalchemy"),
            "python_runtime": sys.version.split()[0],
        },
        "auth": auth,
        "log_sources": log_sources,
        "runtime": runtime,
        "cloud": cloud,
        "wireguard": wireguard,
        "evidence": evidence,
        "security": {
            "reports_dir": settings.SECURITY_REPORTS_DIR,
            "trivy": trivy_reports,
            "sbom": sbom_reports,
            "assets": assets,
            "totals": totals,
        },
        "insights": _insights(
            totals=totals,
            auth=auth,
            log_sources=log_sources,
            runtime=runtime,
            cloud=cloud,
            evidence=evidence,
        ) + ([
            f"WireGuard interface {wireguard['interface']} is up with {wireguard['connected_peers']} live peers out of {wireguard['configured_peers']} configured."
        ] if wireguard["is_up"] else [
            f"WireGuard interface {wireguard['interface']} is not currently up from the API container view."
        ]),
    }
