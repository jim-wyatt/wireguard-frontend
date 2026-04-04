import re
import urllib.error
import urllib.request
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.core.config import settings

router = APIRouter()

_METRIC_LINE_RE = re.compile(
    r"^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|NaN|[+-]Inf)(?:\s+\d+)?$"
)
_LABEL_RE = re.compile(r'(\w+)="((?:\\.|[^"])*)"')


def _to_float(raw: str) -> float:
    if raw == "+Inf":
        return float("inf")
    if raw == "-Inf":
        return float("-inf")
    if raw == "NaN":
        return float("nan")
    return float(raw)


def _parse_labels(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}
    labels: dict[str, str] = {}
    for key, value in _LABEL_RE.findall(raw):
        labels[key] = value.replace(r'\"', '"').replace(r"\\", "\\")
    return labels


def _fetch_metrics_text() -> str:
    req = urllib.request.Request(settings.METRICS_ENDPOINT_URL)
    try:
        with urllib.request.urlopen(req, timeout=3.0) as response:
            return response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Metrics endpoint HTTP error: {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"Metrics endpoint unreachable: {exc.reason}") from exc
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Metrics endpoint timed out") from exc


def _parse_metrics(text: str) -> tuple[dict[str, list[dict]], int]:
    metrics: dict[str, list[dict]] = {}
    parsed_lines = 0

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        match = _METRIC_LINE_RE.match(stripped)
        if not match:
            continue

        name, raw_labels, raw_value = match.groups()
        sample = {
            "labels": _parse_labels(raw_labels),
            "value": _to_float(raw_value),
        }
        metrics.setdefault(name, []).append(sample)
        parsed_lines += 1

    return metrics, parsed_lines


def _first_metric(metrics: dict[str, list[dict]], names: list[str]) -> dict | None:
    for name in names:
        series = metrics.get(name)
        if series:
            return {"name": name, "value": series[0]["value"], "labels": series[0]["labels"]}
    return None


def _metric_samples(metrics: dict[str, list[dict]], name: str) -> list[dict]:
    return metrics.get(name, [])


def _metric_value(metrics: dict[str, list[dict]], name: str, *, labels: dict[str, str] | None = None) -> float | None:
    for sample in metrics.get(name, []):
        if labels and any(sample["labels"].get(k) != v for k, v in labels.items()):
            continue
        return float(sample["value"])
    return None


def _metric_sum(metrics: dict[str, list[dict]], name: str) -> float | None:
    samples = metrics.get(name, [])
    if not samples:
        return None
    return float(sum(float(sample["value"]) for sample in samples))


def _age_from_timestamp_seconds(timestamp: float | None) -> float | None:
    if timestamp is None:
        return None
    return max(0.0, datetime.now(timezone.utc).timestamp() - float(timestamp))


def _gc_quantiles(metrics: dict[str, list[dict]]) -> dict:
    quantiles: dict[str, float] = {}
    for sample in _metric_samples(metrics, "go_gc_duration_seconds"):
        q = sample["labels"].get("quantile")
        if q is None:
            continue
        quantiles[q] = float(sample["value"])

    return {
        "p50": quantiles.get("0.5"),
        "p75": quantiles.get("0.75"),
        "max": quantiles.get("1"),
        "count": _metric_value(metrics, "go_gc_duration_seconds_count"),
        "sum": _metric_value(metrics, "go_gc_duration_seconds_sum"),
    }


def _caddy_runtime(metrics: dict[str, list[dict]]) -> dict:
    upstream_samples = _metric_samples(metrics, "caddy_reverse_proxy_upstreams_healthy")
    healthy = sum(1 for sample in upstream_samples if float(sample["value"]) >= 1.0)
    total = len(upstream_samples)

    return {
        "config_last_reload_successful": _metric_value(metrics, "caddy_config_last_reload_successful"),
        "config_last_reload_timestamp_seconds": _metric_value(metrics, "caddy_config_last_reload_success_timestamp_seconds"),
        "config_last_reload_age_seconds": _age_from_timestamp_seconds(
            _metric_value(metrics, "caddy_config_last_reload_success_timestamp_seconds")
        ),
        "reverse_proxy_upstreams": {
            "total": total,
            "healthy": healthy,
            "unhealthy": max(0, total - healthy),
            "by_upstream": [
                {
                    "upstream": sample["labels"].get("upstream", "unknown"),
                    "healthy": float(sample["value"]) >= 1.0,
                }
                for sample in upstream_samples
            ],
        },
        "admin_http_requests_total": _metric_sum(metrics, "caddy_admin_http_requests_total"),
        "metrics_handler_requests_total": _metric_sum(metrics, "promhttp_metric_handler_requests_total"),
        "requests_in_flight": _metric_value(metrics, "promhttp_metric_handler_requests_in_flight"),
    }


def _go_runtime(metrics: dict[str, list[dict]]) -> dict:
    return {
        "goroutines": _metric_value(metrics, "go_goroutines"),
        "threads": _metric_value(metrics, "go_threads"),
        "gomaxprocs_threads": _metric_value(metrics, "go_sched_gomaxprocs_threads"),
        "gc_pause_seconds": _gc_quantiles(metrics),
        "heap": {
            "alloc_bytes": _metric_value(metrics, "go_memstats_heap_alloc_bytes"),
            "inuse_bytes": _metric_value(metrics, "go_memstats_heap_inuse_bytes"),
            "idle_bytes": _metric_value(metrics, "go_memstats_heap_idle_bytes"),
            "sys_bytes": _metric_value(metrics, "go_memstats_heap_sys_bytes"),
            "objects": _metric_value(metrics, "go_memstats_heap_objects"),
        },
        "alloc_bytes": _metric_value(metrics, "go_memstats_alloc_bytes"),
        "alloc_total_bytes": _metric_value(metrics, "go_memstats_alloc_bytes_total"),
        "mallocs_total": _metric_value(metrics, "go_memstats_mallocs_total"),
        "frees_total": _metric_value(metrics, "go_memstats_frees_total"),
        "next_gc_bytes": _metric_value(metrics, "go_memstats_next_gc_bytes"),
        "last_gc_age_seconds": _age_from_timestamp_seconds(_metric_value(metrics, "go_memstats_last_gc_time_seconds")),
    }


def _process_runtime(metrics: dict[str, list[dict]]) -> dict:
    open_fds = _metric_value(metrics, "process_open_fds")
    max_fds = _metric_value(metrics, "process_max_fds")
    fd_usage_percent = None
    if open_fds is not None and max_fds and max_fds > 0:
        fd_usage_percent = (open_fds / max_fds) * 100

    return {
        "cpu_seconds_total": _metric_value(metrics, "process_cpu_seconds_total"),
        "resident_memory_bytes": _metric_value(metrics, "process_resident_memory_bytes"),
        "virtual_memory_bytes": _metric_value(metrics, "process_virtual_memory_bytes"),
        "virtual_memory_max_bytes": _metric_value(metrics, "process_virtual_memory_max_bytes"),
        "open_fds": open_fds,
        "max_fds": max_fds,
        "fd_usage_percent": fd_usage_percent,
        "network_receive_bytes_total": _metric_value(metrics, "process_network_receive_bytes_total"),
        "network_transmit_bytes_total": _metric_value(metrics, "process_network_transmit_bytes_total"),
        "uptime_seconds": _uptime_seconds(metrics),
    }


def _uptime_seconds(metrics: dict[str, list[dict]]) -> float | None:
    start = _first_metric(metrics, ["process_start_time_seconds"])
    if not start:
        return None
    now = datetime.now(timezone.utc).timestamp()
    return max(0.0, now - float(start["value"]))


@router.get("/metrics/summary")
async def metrics_summary():
    text = _fetch_metrics_text()
    metrics, parsed_lines = _parse_metrics(text)

    highlights = {
        "up": _first_metric(metrics, ["up"]),
        "requests_in_flight": _first_metric(metrics, [
            "caddy_http_requests_in_flight",
            "promhttp_metric_handler_requests_in_flight",
        ]),
        "go_goroutines": _first_metric(metrics, ["go_goroutines"]),
        "go_threads": _first_metric(metrics, ["go_threads"]),
        "resident_memory_bytes": _first_metric(metrics, ["process_resident_memory_bytes"]),
        "open_fds": _first_metric(metrics, ["process_open_fds"]),
        "max_fds": _first_metric(metrics, ["process_max_fds"]),
        "uptime_seconds": {
            "name": "process_start_time_seconds",
            "value": _uptime_seconds(metrics),
            "labels": {},
        },
    }

    catalog = [
        {
            "id": name,
            "name": name,
            "series": len(series),
            "sample_value": series[0]["value"] if series else None,
        }
        for name, series in sorted(metrics.items())
    ]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "endpoint": settings.METRICS_ENDPOINT_URL,
        "summary": {
            "metric_names": len(metrics),
            "series": sum(len(series) for series in metrics.values()),
            "parsed_lines": parsed_lines,
        },
        "runtime": {
            "caddy": _caddy_runtime(metrics),
            "go": _go_runtime(metrics),
            "process": _process_runtime(metrics),
        },
        "highlights": highlights,
        "catalog": catalog,
    }
