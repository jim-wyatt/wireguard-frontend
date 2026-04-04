#!/usr/bin/env python3

import json
import os
import sys
import urllib.error
import urllib.request


BASE_URL = os.environ.get("E2E_BASE_URL", "https://feynman.wyatt.ltd").rstrip("/")
API_TOKEN = (os.environ.get("API_AUTH_TOKEN") or "").strip()


def request(path: str, method: str = "GET", token: str | None = None):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(
        url=f"{BASE_URL}{path}",
        method=method,
        headers=headers,
    )

    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            body = response.read().decode("utf-8", errors="replace")
            return response.status, body
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return exc.code, body


def assert_status(name: str, actual: int, expected: int):
    if actual != expected:
        raise AssertionError(f"{name}: expected {expected}, got {actual}")


def main():
    checks = []

    status, body = request("/", "GET")
    assert_status("frontend root", status, 200)
    checks.append("frontend root 200")

    status, body = request("/api/clients/stats", "GET")
    assert_status("public stats", status, 200)
    json.loads(body)
    checks.append("public stats 200")

    status, body = request("/api/clients/connected", "GET")
    assert_status("public connected", status, 200)
    json.loads(body)
    checks.append("public connected 200")

    status, _ = request("/api/clients", "GET")
    assert_status("protected clients list without auth", status, 401)
    checks.append("protected list rejects unauthenticated")

    if not API_TOKEN:
        print("API_AUTH_TOKEN not set; skipping authenticated smoke checks")
    else:
        status, body = request("/api/clients", "GET", token=API_TOKEN)
        assert_status("protected clients list with auth", status, 200)
        json.loads(body)
        checks.append("protected list accepts operator token")

    print("SMOKE TESTS PASSED")
    for item in checks:
        print(f"- {item}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"SMOKE TEST FAILED: {exc}")
        sys.exit(1)
