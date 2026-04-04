from app.core.config import settings


def test_log_stream_requires_authentication(unauthenticated_client):
    response = unauthenticated_client.get("/api/logs/caddy/access/stream")
    assert response.status_code == 401

    response = unauthenticated_client.get("/api/logs/stream")
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

    with client.stream("GET", "/api/logs/caddy/access/stream?tail=2&follow=false") as response:
        assert response.status_code == 200
        lines = response.iter_lines()
        first = next(lines)
        second = next(lines)

    assert first == '{"second":2}'
    assert second == '{"third":3}'


def test_generic_log_stream_supports_app_source(client, monkeypatch, tmp_path):
    app_log_path = tmp_path / "backend.log"
    app_log_path.write_text("line-1\nline-2\n", encoding="utf-8")

    monkeypatch.setattr(settings, "APP_LOG_PATH", str(app_log_path))

    with client.stream("GET", "/api/logs/stream?source=app&tail=1&follow=false") as response:
        assert response.status_code == 200
        lines = response.iter_lines()
        first = next(lines)

    assert first == "line-2"


def test_generic_log_stream_supports_system_source(client, monkeypatch, tmp_path):
    system_log_path = tmp_path / "syslog"
    system_log_path.write_text("sys-1\nsys-2\n", encoding="utf-8")

    monkeypatch.setattr(settings, "SYSTEM_LOG_PATH", str(system_log_path))

    with client.stream("GET", "/api/logs/stream?source=system&tail=1&follow=false") as response:
        assert response.status_code == 200
        lines = response.iter_lines()
        first = next(lines)

    assert first == "sys-2"
