import json
import os
import platform
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from importlib import metadata
from pathlib import Path

from fastapi import APIRouter, Depends, Request

from app.core.auth import Role, optional_api_auth
from app.core.config import settings
from app.services.wireguard import wireguard_service

router = APIRouter()
PROCESS_STARTED_AT = time.time()
_PROM_LINE_RE = re.compile(
    r"^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)"
)
_PROM_LABEL_RE = re.compile(r'(\w+)="((?:\\.|[^"])*)"')


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
        with urllib.request.urlopen(request, timeout=1.0) as response:
            return response.read().decode("utf-8").strip() or None
    except Exception:
        return None


def _aws_metadata(path: str, token: str | None) -> str | None:
    request = urllib.request.Request(f"http://169.254.169.254/latest/{path}")
    if token:
        request.add_header("X-aws-ec2-metadata-token", token)
    try:
        with urllib.request.urlopen(request, timeout=1.0) as response:
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

    # Probe IMDS directly so EC2 can be detected even when AWS env hints are absent.
    token = _aws_metadata_token()
    token_instance_id = _aws_metadata("meta-data/instance-id", token) if token else None
    unauth_instance_id = _aws_metadata("meta-data/instance-id", None)
    identity_document = None
    if token:
        identity_raw = _aws_metadata("dynamic/instance-identity/document", token)
        if identity_raw:
            try:
                identity_document = json.loads(identity_raw)
            except json.JSONDecodeError:
                identity_document = None

    metadata_token = token

    ami_id = _aws_metadata("meta-data/ami-id", metadata_token) if metadata_token else None
    private_ipv4 = _aws_metadata("meta-data/local-ipv4", metadata_token) if metadata_token else None
    role_listing = _aws_metadata("meta-data/iam/security-credentials/", metadata_token) if metadata_token else None
    iam_role_name = role_listing.splitlines()[0].strip() if role_listing else None

    iam_profile_arn = None
    if metadata_token:
        iam_info_raw = _aws_metadata("meta-data/iam/info", metadata_token)
        if iam_info_raw:
            try:
                iam_profile_arn = json.loads(iam_info_raw).get("InstanceProfileArn")
            except json.JSONDecodeError:
                iam_profile_arn = None

    vpc_id = None
    subnet_id = None
    if metadata_token:
        macs_raw = _aws_metadata("meta-data/network/interfaces/macs/", metadata_token)
        if macs_raw:
            first_mac = macs_raw.splitlines()[0].strip()
            if first_mac:
                if not first_mac.endswith("/"):
                    first_mac = f"{first_mac}/"
                vpc_id = _aws_metadata(f"meta-data/network/interfaces/macs/{first_mac}vpc-id", metadata_token)
                subnet_id = _aws_metadata(f"meta-data/network/interfaces/macs/{first_mac}subnet-id", metadata_token)

    region_from_imds = _aws_metadata("meta-data/placement/region", metadata_token) if metadata_token else None
    az_from_imds = _aws_metadata("meta-data/placement/availability-zone", metadata_token) if metadata_token else None
    instance_type_from_imds = _aws_metadata("meta-data/instance-type", metadata_token) if metadata_token else None

    provider = "aws" if any([looks_like_aws, identity_document, token_instance_id, unauth_instance_id]) else None
    region = aws_region or (identity_document or {}).get("region") or region_from_imds
    availability_zone = (identity_document or {}).get("availabilityZone") or az_from_imds
    instance_id = (identity_document or {}).get("instanceId") or token_instance_id or unauth_instance_id
    instance_type = (identity_document or {}).get("instanceType") or instance_type_from_imds
    account_id = (identity_document or {}).get("accountId")

    return {
        "provider": provider,
        "detected": bool(provider),
        "metadata_reachable": bool(token_instance_id or unauth_instance_id),
        "imdsv2_required": bool(token and token_instance_id and not unauth_instance_id),
        "region": region,
        "availability_zone": availability_zone,
        "instance_id": instance_id,
        "instance_type": instance_type,
        "ami_id": ami_id,
        "private_ipv4": private_ipv4,
        "vpc_id": vpc_id,
        "subnet_id": subnet_id,
        "account_id": account_id,
        "iam_role_attached": bool(iam_role_name),
        "iam_role_name": iam_role_name,
        "iam_instance_profile_arn": iam_profile_arn,
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


def _insights(*, totals: dict, remediation: dict, auth: dict, log_sources: dict, runtime: dict, cloud: dict, evidence: dict) -> list[str]:
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
    if remediation["upgradeable"]["total"] > 0:
        insights.append(
            f"{remediation['upgradeable']['total']} open-source findings have an upgrade path with fixed versions available."
        )
    if remediation["actionable"]["total"] > 0:
        insights.append(
            f"{remediation['actionable']['total']} findings are still actionable after accounting for fixed-status advisories."
        )

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


def _mask_value(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value)
    if len(text) <= 6:
        return "*" * len(text)
    return f"{text[:3]}{'*' * (len(text) - 5)}{text[-2:]}"


def _is_authenticated(request: Request) -> bool:
    role = getattr(request.state, "auth_role", None)
    return role in {Role.PUBLIC.value, Role.WRITER.value}


def _redact_cloud_context(cloud: dict) -> dict:
    redacted = dict(cloud)
    # Hide cloud identifiers in public mode, similar to PII handling.
    for key in (
        "account_id",
        "instance_id",
        "vpc_id",
        "subnet_id",
        "iam_role_name",
        "iam_instance_profile_arn",
    ):
        redacted[key] = _mask_value(redacted.get(key))
    return redacted


def _parse_host_port(address: str | None) -> tuple[str | None, int | None]:
    value = (address or "").strip()
    if not value:
        return None, None
    if "://" in value:
        parsed = urllib.parse.urlparse(value)
        return parsed.hostname, parsed.port
    if ":" not in value:
        return None, None
    host, raw_port = value.rsplit(":", 1)
    try:
        port = int(raw_port)
    except ValueError:
        return None, None
    if not host or port <= 0 or port > 65535:
        return None, None
    return host, port


def _tcp_reachable(host: str | None, port: int | None, timeout_seconds: float = 1.5) -> bool:
    if not host or not port:
        return False
    try:
        with socket.create_connection((host, port), timeout=timeout_seconds):
            return True
    except OSError:
        return False


def _process_cmdline_contains(needle: str) -> bool:
    target = needle.strip().lower()
    if not target:
        return False
    proc = Path("/proc")
    if not proc.exists():
        return False

    for entry in proc.iterdir():
        if not entry.is_dir() or not entry.name.isdigit():
            continue
        try:
            cmdline = (entry / "cmdline").read_bytes().replace(b"\x00", b" ").decode("utf-8", errors="ignore").lower()
        except OSError:
            continue
        if target in cmdline:
            return True
    return False


def _probe_http(endpoint: str, timeout_seconds: float = 2.0) -> dict:
    request = urllib.request.Request(endpoint)
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            return {
                "available": 200 <= response.status < 400,
                "status_code": response.status,
                "error": None,
                "mode": "http",
            }
    except urllib.error.HTTPError as exc:
        return {
            "available": False,
            "status_code": exc.code,
            "error": f"http {exc.code}",
            "mode": "http",
        }
    except Exception as exc:
        return {
            "available": False,
            "status_code": None,
            "error": str(exc),
            "mode": "http",
        }


def _fetch_text(endpoint: str, timeout_seconds: float = 3.0) -> str | None:
    request = urllib.request.Request(endpoint)
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            return response.read().decode("utf-8", errors="replace")
    except Exception:
        return None


def _fetch_json(endpoint: str, timeout_seconds: float = 3.0) -> dict | None:
    payload = _fetch_text(endpoint, timeout_seconds=timeout_seconds)
    if not payload:
        return None
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return None


def _parse_prom_labels(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}
    labels: dict[str, str] = {}
    for key, value in _PROM_LABEL_RE.findall(raw):
        labels[key] = value.replace(r'\"', '"').replace(r"\\", "\\")
    return labels


def _prom_samples(text: str, metric_name: str) -> list[dict]:
    samples: list[dict] = []
    for line in text.splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#"):
            continue
        match = _PROM_LINE_RE.match(raw)
        if not match:
            continue
        name, raw_labels, raw_value = match.groups()
        if name != metric_name:
            continue
        try:
            value = float(raw_value)
        except ValueError:
            continue
        samples.append({"labels": _parse_prom_labels(raw_labels), "value": value})
    return samples


def _prom_first(text: str, metric_name: str, labels: dict[str, str] | None = None) -> float | None:
    for sample in _prom_samples(text, metric_name):
        if labels and any(sample["labels"].get(k) != v for k, v in labels.items()):
            continue
        return sample["value"]
    return None


def _sidecar_attestation() -> dict:
    sidecars: dict[str, dict] = {}

    node_text = _fetch_text(settings.NODE_EXPORTER_ENDPOINT_URL)
    if node_text:
        mem_total = _prom_first(node_text, "node_memory_MemTotal_bytes")
        mem_available = _prom_first(node_text, "node_memory_MemAvailable_bytes")
        mem_used_percent = None
        if mem_total and mem_total > 0 and mem_available is not None:
            mem_used_percent = ((mem_total - mem_available) / mem_total) * 100.0
        sidecars["node_exporter"] = {
            "available": True,
            "healthy": True,
            "load1": _prom_first(node_text, "node_load1"),
            "memory_used_percent": mem_used_percent,
        }
    else:
        sidecars["node_exporter"] = {"available": False, "healthy": False}

    podman_text = _fetch_text(settings.PODMAN_EXPORTER_ENDPOINT_URL)
    if podman_text:
        states = _prom_samples(podman_text, "podman_container_state")
        running = sum(1 for s in states if int(s["value"]) == 2)
        exited = sum(1 for s in states if int(s["value"]) == 5)
        sidecars["podman_exporter"] = {
            "available": True,
            "healthy": running > 0,
            "containers_running": running,
            "containers_exited": exited,
        }
    else:
        sidecars["podman_exporter"] = {"available": False, "healthy": False}

    pg_text = _fetch_text(settings.POSTGRES_EXPORTER_ENDPOINT_URL)
    if pg_text:
        pg_up = _prom_first(pg_text, "pg_up")
        num_backends = _prom_first(pg_text, "pg_stat_database_numbackends", labels={"datname": settings.POSTGRES_DB})
        db_size = _prom_first(pg_text, "pg_database_size_bytes", labels={"datname": settings.POSTGRES_DB})
        sidecars["postgres_exporter"] = {
            "available": True,
            "healthy": bool(pg_up and pg_up >= 1.0),
            "up": pg_up,
            "num_backends": num_backends,
            "database_size_bytes": db_size,
        }
    else:
        sidecars["postgres_exporter"] = {"available": False, "healthy": False}

    falco_text = _fetch_text(settings.FALCOSIDEKICK_ENDPOINT_URL)
    if falco_text:
        inputs_total = sum(s["value"] for s in _prom_samples(falco_text, "falcosidekick_inputs"))
        rejected = sum(
            s["value"]
            for s in _prom_samples(falco_text, "falcosidekick_inputs")
            if s["labels"].get("status") == "rejected"
        )
        sidecars["falcosidekick"] = {
            "available": True,
            "healthy": True,
            "inputs_total": inputs_total,
            "inputs_rejected": rejected,
            "go_goroutines": _prom_first(falco_text, "go_goroutines"),
        }
    else:
        sidecars["falcosidekick"] = {"available": False, "healthy": False}

    crowdsec_health = _fetch_json(settings.CROWDSEC_ENDPOINT_URL)
    if crowdsec_health:
        status = str(crowdsec_health.get("status") or "unknown").lower()
        sidecars["crowdsec"] = {
            "available": True,
            "healthy": status == "up",
            "status": status,
        }
    else:
        sidecars["crowdsec"] = {"available": False, "healthy": False}

    trivy_version = _fetch_json(settings.TRIVY_SERVER_ENDPOINT_URL)
    if trivy_version:
        db = trivy_version.get("VulnerabilityDB") or {}
        updated_at = db.get("UpdatedAt")
        age_hours = None
        try:
            if updated_at:
                updated_dt = datetime.fromisoformat(str(updated_at).replace("Z", "+00:00"))
                age_hours = max(0.0, (datetime.now(timezone.utc) - updated_dt).total_seconds() / 3600.0)
        except Exception:
            age_hours = None
        sidecars["trivy_server"] = {
            "available": True,
            "healthy": bool(trivy_version.get("Version")),
            "version": trivy_version.get("Version"),
            "db_updated_at": updated_at,
            "db_next_update": db.get("NextUpdate"),
            "db_age_hours": age_hours,
        }
    else:
        sidecars["trivy_server"] = {"available": False, "healthy": False}

    parca_root = _fetch_text(settings.PARCA_SERVER_ENDPOINT_URL)
    parca_metrics = _fetch_text(f"{settings.PARCA_SERVER_ENDPOINT_URL.rstrip('/')}/metrics")
    parca_version = None
    if parca_root:
        match = re.search(r"window\.APP_VERSION\s*=\s*'([^']+)'", parca_root)
        if match:
            parca_version = match.group(1)
    if parca_metrics:
        sidecars["parca"] = {
            "available": True,
            "healthy": True,
            "ui_version": parca_version,
            "go_goroutines": _prom_first(parca_metrics, "go_goroutines"),
            "frostdb_lsm_size_bytes": sum(s["value"] for s in _prom_samples(parca_metrics, "frostdb_lsm_level_size_bytes")),
        }
    else:
        sidecars["parca"] = {"available": False, "healthy": False, "ui_version": parca_version}

    ebpf_text = _fetch_text(settings.EBPF_EXPORTER_ENDPOINT_URL)
    if ebpf_text:
        version = None
        for sample in _prom_samples(ebpf_text, "go_build_info"):
            candidate = sample["labels"].get("version")
            if candidate:
                version = candidate
                break
        sidecars["ebpf_agent"] = {
            "available": True,
            "healthy": True,
            "version": version,
            "go_goroutines": _prom_first(ebpf_text, "go_goroutines"),
            "debuginfo_upload_request_bytes": _prom_first(ebpf_text, "debuginfo_upload_request_bytes"),
        }
    else:
        sidecars["ebpf_agent"] = {"available": False, "healthy": False}

    available = sum(1 for sidecar in sidecars.values() if sidecar.get("available"))
    healthy = sum(1 for sidecar in sidecars.values() if sidecar.get("healthy"))
    total = len(sidecars)
    return {
        "services": sidecars,
        "summary": {
            "available": available,
            "healthy": healthy,
            "total": total,
            "percent_healthy": int((healthy / total) * 100) if total else 0,
        },
    }


def _source_attestation() -> dict:
    configured = [
        ("node-exporter", "telemetry", settings.NODE_EXPORTER_ENDPOINT_URL),
        ("podman-exporter", "telemetry", settings.PODMAN_EXPORTER_ENDPOINT_URL),
        ("postgres-exporter", "telemetry", settings.POSTGRES_EXPORTER_ENDPOINT_URL),
        ("parca-server", "profiling", settings.PARCA_SERVER_ENDPOINT_URL),
        ("ebpf", "profiling", settings.EBPF_EXPORTER_ENDPOINT_URL),
        ("falcosidekick", "security", settings.FALCOSIDEKICK_ENDPOINT_URL),
        ("crowdsec", "security", settings.CROWDSEC_ENDPOINT_URL),
        ("trivy-server", "security", settings.TRIVY_SERVER_ENDPOINT_URL),
    ]

    probes = []
    for source_id, category, endpoint in configured:
        url = (endpoint or "").strip()
        if not url:
            continue

        if source_id == "ebpf":
            probe = _probe_http(url)
            if not probe["available"]:
                remote_host, remote_port = _parse_host_port(settings.PARCA_REMOTE_STORE_ADDRESS)
                remote_reachable = _tcp_reachable(remote_host, remote_port)
                agent_running = _process_cmdline_contains("parca-agent")
                delivery_ok = remote_reachable and agent_running
                probe = {
                    "available": delivery_ok,
                    "status_code": probe["status_code"],
                    "error": None if delivery_ok else (
                        f"{probe.get('error')}; delivery agent_running={agent_running} remote_reachable={remote_reachable}"
                    ),
                    "mode": "delivery",
                    "agent_running": agent_running,
                    "remote_store": settings.PARCA_REMOTE_STORE_ADDRESS,
                    "remote_reachable": remote_reachable,
                }
        else:
            probe = _probe_http(url)

        probes.append(
            {
                "id": source_id,
                "category": category,
                "configured": True,
                "url": url,
                **probe,
            }
        )

    available = sum(1 for probe in probes if probe.get("available"))
    total = len(probes)
    by_category: dict[str, dict[str, int]] = {}
    for probe in probes:
        category = probe["category"]
        bucket = by_category.setdefault(category, {"total": 0, "available": 0})
        bucket["total"] += 1
        if probe.get("available"):
            bucket["available"] += 1

    percent = int((available / total) * 100) if total else 0

    return {
        "probes": probes,
        "summary": {
            "available": available,
            "total": total,
            "percent": percent,
            "by_category": by_category,
        },
    }


def _parse_trivy_summary(path: Path) -> dict:
    if not path.is_file():
        return {
            "file": path.name,
            "exists": False,
            "total": 0,
            "high": 0,
            "critical": 0,
            "status": {"affected": 0, "fixed": 0, "other": 0},
            "actionable": {"total": 0, "high": 0, "critical": 0},
            "upgradeable": {"total": 0, "high": 0, "critical": 0},
            "patch_available_unpatched": {"total": 0, "high": 0, "critical": 0},
            "no_patch_available": {"total": 0, "high": 0, "critical": 0},
        }

    text = path.read_text(encoding="utf-8", errors="replace")

    findings: list[dict] = []
    for line in text.splitlines():
        match = re.search(
            r"│\s*[^│]+\s*│\s*(CVE-[^│]+)\s*│\s*(UNKNOWN|LOW|MEDIUM|HIGH|CRITICAL)\s*│\s*([a-z_]+)\s*│\s*[^│]*│\s*([^│]*)\s*│",
            line,
            re.IGNORECASE,
        )
        if not match:
            continue
        _, severity, status, fixed_version = match.groups()
        findings.append(
            {
                "severity": severity.upper(),
                "status": status.lower(),
                "fixed_version": fixed_version.strip(),
            }
        )

    status_counts = {
        "affected": sum(1 for finding in findings if finding["status"] == "affected"),
        "fixed": sum(1 for finding in findings if finding["status"] == "fixed"),
        "other": sum(1 for finding in findings if finding["status"] not in {"affected", "fixed"}),
    }

    actionable_findings = [finding for finding in findings if finding["status"] != "fixed"]
    upgradeable_findings = [finding for finding in findings if bool(finding["fixed_version"])]
    patch_available_unpatched_findings = [
        finding
        for finding in findings
        if finding["status"] != "fixed" and bool(finding["fixed_version"])
    ]
    no_patch_available_findings = [
        finding
        for finding in findings
        if finding["status"] != "fixed" and not bool(finding["fixed_version"])
    ]

    actionable = {
        "total": len(actionable_findings),
        "high": sum(1 for finding in actionable_findings if finding["severity"] == "HIGH"),
        "critical": sum(1 for finding in actionable_findings if finding["severity"] == "CRITICAL"),
    }
    upgradeable = {
        "total": len(upgradeable_findings),
        "high": sum(1 for finding in upgradeable_findings if finding["severity"] == "HIGH"),
        "critical": sum(1 for finding in upgradeable_findings if finding["severity"] == "CRITICAL"),
    }
    patch_available_unpatched = {
        "total": len(patch_available_unpatched_findings),
        "high": sum(1 for finding in patch_available_unpatched_findings if finding["severity"] == "HIGH"),
        "critical": sum(1 for finding in patch_available_unpatched_findings if finding["severity"] == "CRITICAL"),
    }
    no_patch_available = {
        "total": len(no_patch_available_findings),
        "high": sum(1 for finding in no_patch_available_findings if finding["severity"] == "HIGH"),
        "critical": sum(1 for finding in no_patch_available_findings if finding["severity"] == "CRITICAL"),
    }

    total_match = re.search(r"Total:\s*(\d+)\s*\(HIGH:\s*(\d+),\s*CRITICAL:\s*(\d+)\)", text)
    if total_match:
        total, high, critical = total_match.groups()
        return {
            "file": path.name,
            "exists": True,
            "total": int(total),
            "high": int(high),
            "critical": int(critical),
            "status": status_counts,
            "actionable": actionable,
            "upgradeable": upgradeable,
            "patch_available_unpatched": patch_available_unpatched,
            "no_patch_available": no_patch_available,
        }

    return {
        "file": path.name,
        "exists": True,
        "total": 0,
        "high": 0,
        "critical": 0,
        "status": status_counts,
        "actionable": actionable,
        "upgradeable": upgradeable,
        "patch_available_unpatched": patch_available_unpatched,
        "no_patch_available": no_patch_available,
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
async def attestation_summary(
    request: Request,
    _: None = Depends(optional_api_auth),
):
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
        "remediated": sum(report["status"]["fixed"] for report in trivy_reports),
    }
    remediation = {
        "status": {
            "affected": sum(report["status"]["affected"] for report in trivy_reports),
            "fixed": sum(report["status"]["fixed"] for report in trivy_reports),
            "other": sum(report["status"]["other"] for report in trivy_reports),
        },
        "actionable": {
            "total": sum(report["actionable"]["total"] for report in trivy_reports),
            "high": sum(report["actionable"]["high"] for report in trivy_reports),
            "critical": sum(report["actionable"]["critical"] for report in trivy_reports),
        },
        "upgradeable": {
            "total": sum(report["upgradeable"]["total"] for report in trivy_reports),
            "high": sum(report["upgradeable"]["high"] for report in trivy_reports),
            "critical": sum(report["upgradeable"]["critical"] for report in trivy_reports),
        },
        "patch_available_unpatched": {
            "total": sum(report["patch_available_unpatched"]["total"] for report in trivy_reports),
            "high": sum(report["patch_available_unpatched"]["high"] for report in trivy_reports),
            "critical": sum(report["patch_available_unpatched"]["critical"] for report in trivy_reports),
        },
        "no_patch_available": {
            "total": sum(report["no_patch_available"]["total"] for report in trivy_reports),
            "high": sum(report["no_patch_available"]["high"] for report in trivy_reports),
            "critical": sum(report["no_patch_available"]["critical"] for report in trivy_reports),
        },
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
    if not _is_authenticated(request):
        cloud = _redact_cloud_context(cloud)
    evidence = _evidence_coverage(trivy_reports, sbom_reports)
    assets = _security_assets(trivy_reports, sbom_reports)
    wireguard = _wireguard_context()
    sources = _source_attestation()
    sidecars = _sidecar_attestation()

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "service": {
            "name": "wireguard-management-api",
            "version": settings.APP_VERSION,
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
        "sources": sources,
        "sidecars": sidecars,
        "evidence": evidence,
        "security": {
            "reports_dir": settings.SECURITY_REPORTS_DIR,
            "trivy": trivy_reports,
            "sbom": sbom_reports,
            "assets": assets,
            "totals": totals,
            "remediation": remediation,
        },
        "insights": _insights(
            totals=totals,
            remediation=remediation,
            auth=auth,
            log_sources=log_sources,
            runtime=runtime,
            cloud=cloud,
            evidence=evidence,
        ) + ([
            f"Runtime source coverage is {sources['summary']['available']}/{sources['summary']['total']} probes available ({sources['summary']['percent']}%)."
        ] if sources["summary"]["total"] > 0 else []) + ([
            f"Sidecar health is {sidecars['summary']['healthy']}/{sidecars['summary']['total']} healthy services ({sidecars['summary']['percent_healthy']}%)."
        ] if sidecars["summary"]["total"] > 0 else []) + ([
            f"WireGuard interface {wireguard['interface']} is up with {wireguard['connected_peers']} live peers out of {wireguard['configured_peers']} configured."
        ] if wireguard["is_up"] else [
            f"WireGuard interface {wireguard['interface']} is not currently up from the API container view."
        ]),
    }
