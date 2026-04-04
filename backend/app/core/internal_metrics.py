from __future__ import annotations

import threading
import time
from dataclasses import dataclass


_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000]


@dataclass
class InternalMetricsSnapshot:
    started_at: float
    uptime_seconds: float
    active_requests: int
    requests_total: int
    status_2xx: int
    status_4xx: int
    status_5xx: int
    avg_latency_ms: float
    p95_latency_ms: float


class InternalMetrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._started_at = time.time()
        self._active_requests = 0
        self._requests_total = 0
        self._status_2xx = 0
        self._status_4xx = 0
        self._status_5xx = 0
        self._latency_total_ms = 0.0
        self._histogram_counts = {bucket: 0 for bucket in _BUCKETS_MS}
        self._histogram_overflow = 0

    def request_started(self) -> None:
        with self._lock:
            self._active_requests += 1

    def request_finished(self, *, status_code: int, latency_ms: float) -> None:
        with self._lock:
            self._active_requests = max(0, self._active_requests - 1)
            self._requests_total += 1
            self._latency_total_ms += max(0.0, latency_ms)

            if 200 <= status_code < 300:
                self._status_2xx += 1
            elif 400 <= status_code < 500:
                self._status_4xx += 1
            elif status_code >= 500:
                self._status_5xx += 1

            placed = False
            for bucket in _BUCKETS_MS:
                if latency_ms <= bucket:
                    self._histogram_counts[bucket] += 1
                    placed = True
                    break
            if not placed:
                self._histogram_overflow += 1

    def snapshot(self) -> InternalMetricsSnapshot:
        with self._lock:
            requests_total = self._requests_total
            avg = self._latency_total_ms / requests_total if requests_total else 0.0
            p95 = self._estimate_p95(requests_total)

            return InternalMetricsSnapshot(
                started_at=self._started_at,
                uptime_seconds=max(0.0, time.time() - self._started_at),
                active_requests=self._active_requests,
                requests_total=requests_total,
                status_2xx=self._status_2xx,
                status_4xx=self._status_4xx,
                status_5xx=self._status_5xx,
                avg_latency_ms=avg,
                p95_latency_ms=p95,
            )

    def _estimate_p95(self, requests_total: int) -> float:
        if requests_total == 0:
            return 0.0

        threshold = requests_total * 0.95
        cumulative = 0
        for bucket in _BUCKETS_MS:
            cumulative += self._histogram_counts[bucket]
            if cumulative >= threshold:
                return float(bucket)
        return float(_BUCKETS_MS[-1])


internal_metrics = InternalMetrics()
