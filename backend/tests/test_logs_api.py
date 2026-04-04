from app.core.config import settings


def test_log_stream_requires_authentication(unauthenticated_client):
    response = unauthenticated_client.get("/api/logs/caddy/access/stream")
    assert response.status_code == 401


def test_log_stream_returns_404_when_file_missing(client, monkeypatch):
    monkeypatch.setattr(settings, "CADDY_ACCESS_LOG_PATH", "/tmp/does-not-exist-access.log")

    response = client.get("/api/logs/caddy/access/stream")
    assert response.status_code == 404
    assert response.json()["detail"] == "Caddy access log file not found"


def test_log_stream_returns_tail_lines(client, monkeypatch, tmp_path):
    log_path = tmp_path / "access.log"
    log_path.write_text('{"first":1}\n{"second":2}\n{"third":3}\n', encoding="utf-8")

    monkeypatch.setattr(settings, "CADDY_ACCESS_LOG_PATH", str(log_path))

    with client.stream("GET", "/api/logs/caddy/access/stream?tail=2") as response:
        assert response.status_code == 200
        lines = response.iter_lines()
        first = next(lines)
        second = next(lines)

    assert first == '{"second":2}'
    assert second == '{"third":3}'
