def test_attestation_summary_requires_authentication(unauthenticated_client):
    response = unauthenticated_client.get("/api/attestation/summary")
    assert response.status_code == 401


def test_attestation_summary_returns_security_totals(client, monkeypatch, tmp_path):
    reports_dir = tmp_path / "security"
    reports_dir.mkdir(parents=True, exist_ok=True)

    (reports_dir / "trivy-backend.txt").write_text(
        "Total: 10 (HIGH: 8, CRITICAL: 2)\n",
        encoding="utf-8",
    )
    (reports_dir / "trivy-caddy.txt").write_text(
        "Total: 4 (HIGH: 3, CRITICAL: 1)\n",
        encoding="utf-8",
    )
    (reports_dir / "trivy-postgres.txt").write_text(
        "Total: 2 (HIGH: 2, CRITICAL: 0)\n",
        encoding="utf-8",
    )

    sbom_stub = '{"specVersion":"1.6","metadata":{"timestamp":"2026-04-04T00:00:00Z"},"components":[{"name":"x"}]}'
    (reports_dir / "sbom-backend.cdx.json").write_text(sbom_stub, encoding="utf-8")
    (reports_dir / "sbom-caddy.cdx.json").write_text(sbom_stub, encoding="utf-8")
    (reports_dir / "sbom-postgres.cdx.json").write_text(sbom_stub, encoding="utf-8")

    monkeypatch.setenv("GIT_COMMIT", "abc123")
    monkeypatch.setattr("app.api.attestation.settings.SECURITY_REPORTS_DIR", str(reports_dir))
    monkeypatch.setattr(
        "app.api.attestation._runtime_context",
        lambda: {
            "hostname": "wg-host",
            "python_version": "3.12.0",
            "python_implementation": "CPython",
            "platform": "Linux-6.8.0-x86_64",
            "kernel": "6.8.0",
            "architecture": "x86_64",
            "cpu_count": 4,
            "memory_total_mb": 8192,
            "uptime_seconds": 3600,
            "containerized": True,
            "container_runtime": "podman",
            "os": {
                "name": "Ubuntu",
                "version": "24.04",
                "id": "ubuntu",
                "pretty_name": "Ubuntu 24.04 LTS",
            },
        },
    )
    monkeypatch.setattr(
        "app.api.attestation._cloud_context",
        lambda: {
            "provider": "aws",
            "detected": True,
            "region": "us-east-1",
            "availability_zone": "us-east-1a",
            "instance_id": "i-1234567890",
            "instance_type": "t3.small",
            "account_id": "123456789012",
            "execution_env": "AWS_EC2",
            "ecs_metadata": False,
            "lambda_function": None,
        },
    )
    monkeypatch.setattr(
        "app.api.attestation._wireguard_context",
        lambda: {
            "interface": "wg0",
            "is_up": True,
            "listen_port": 443,
            "public_key": "server-pub",
            "network": "10.8.0.0/24",
            "server_ip": "10.8.0.1",
            "server_endpoint": "vpn.example.com:443",
            "dns": "1.1.1.1,8.8.8.8",
            "configured_peers": 8,
            "connected_peers": 3,
            "latest_handshake": "2026-04-04T00:00:00+00:00",
            "transfer_rx": 4096,
            "transfer_tx": 8192,
        },
    )

    response = client.get("/api/attestation/summary")
    assert response.status_code == 200

    payload = response.json()
    assert payload["service"]["git_commit"] == "abc123"
    assert payload["security"]["totals"] == {
        "vulnerabilities": 16,
        "high": 13,
        "critical": 3,
        "remediated": 0,
    }
    assert len(payload["security"]["trivy"]) == 3
    assert len(payload["security"]["sbom"]) == 3
    assert payload["evidence"]["combined"] == {
        "available": 6,
        "total": 6,
        "percent": 100,
    }
    assert payload["runtime"]["container_runtime"] == "podman"
    assert payload["cloud"]["provider"] == "aws"
    assert payload["wireguard"]["interface"] == "wg0"
    assert payload["wireguard"]["connected_peers"] == 3
    assert payload["security"]["assets"][0]["name"] == "backend"
    assert payload["security"]["assets"][0]["sbom_components"] == 1
    assert payload["security"]["assets"][0]["posture"] == "critical"
    assert payload["insights"]
