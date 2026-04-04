import json
from datetime import datetime, timedelta, timezone

from app.core.config import settings


def _set_tokens(monkeypatch, entries):
    monkeypatch.setattr(settings, "API_AUTH_TOKEN", "")
    monkeypatch.setattr(settings, "API_AUTH_TOKENS_JSON", json.dumps(entries))


def test_writer_role_token_can_access_writer_routes(client, monkeypatch):
    _set_tokens(
        monkeypatch,
        [{"token": "writer-token", "role": "writer"}],
    )

    response = client.get(
        "/api/clients",
        headers={"Authorization": "Bearer writer-token"},
    )
    assert response.status_code == 200


def test_public_role_token_can_access_read_routes(client, monkeypatch):
    _set_tokens(
        monkeypatch,
        [{"token": "public-token", "role": "public"}],
    )

    response = client.get(
        "/api/clients",
        headers={"Authorization": "Bearer public-token"},
    )
    assert response.status_code == 200


def test_public_role_token_cannot_access_writer_routes(client, monkeypatch):
    _set_tokens(
        monkeypatch,
        [{"token": "public-token", "role": "public"}],
    )

    response = client.post(
        "/api/clients",
        headers={"Authorization": "Bearer public-token"},
        json={"email": "blocked@example.com", "name": "Blocked"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Writer role required"


def test_expired_token_is_rejected(client, monkeypatch):
    expired = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    _set_tokens(
        monkeypatch,
        [{"token": "expired-token", "role": "writer", "expires_at": expired}],
    )

    response = client.get(
        "/api/clients",
        headers={"Authorization": "Bearer expired-token"},
    )
    assert response.status_code == 401
