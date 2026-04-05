from datetime import datetime, timezone

from app.api import clients as clients_api
from app.db.models import Client


def _mock_wireguard(monkeypatch):
    monkeypatch.setattr(clients_api.wireguard_service, "generate_keys", lambda: ("private-key", "public-key"))
    monkeypatch.setattr(clients_api.wireguard_service, "generate_preshared_key", lambda: "preshared-key")
    monkeypatch.setattr(clients_api.wireguard_service, "get_next_available_ip", lambda _used_ips: "10.0.0.2")
    monkeypatch.setattr(clients_api.wireguard_service, "add_peer", lambda _public_key, _ip: True)
    monkeypatch.setattr(clients_api.wireguard_service, "remove_peer", lambda _public_key: True)


def test_create_client_requires_authentication(unauthenticated_client):
    response = unauthenticated_client.post(
        "/api/nodes",
        json={"email": "noauth@example.com", "name": "NoAuth"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required"


def test_management_reads_require_authentication(unauthenticated_client, db_session):
    db_client = Client(
        email="reader@example.com",
        name="Reader",
        public_key="pub-reader",
        private_key="priv-reader",
        ip_address="10.0.0.20",
        preshared_key="psk-reader",
        is_active=True,
    )
    db_session.add(db_client)
    db_session.commit()
    db_session.refresh(db_client)

    list_response = unauthenticated_client.get("/api/nodes")
    assert list_response.status_code == 401

    detail_response = unauthenticated_client.get(f"/api/nodes/{db_client.id}")
    assert detail_response.status_code == 401


def test_dashboard_reads_are_public(unauthenticated_client, monkeypatch):
    monkeypatch.setattr(clients_api.wireguard_service, "get_connected_peers", lambda: {})

    stats = unauthenticated_client.get("/api/nodes/stats")
    assert stats.status_code == 200

    connected = unauthenticated_client.get("/api/nodes/connected")
    assert connected.status_code == 401


def test_create_client_and_reject_duplicate_email(client, monkeypatch):
    _mock_wireguard(monkeypatch)

    payload = {
        "email": "alice@example.com",
        "name": "Alice",
    }

    response = client.post("/api/nodes", json=payload)
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "alice@example.com"
    assert body["name"] == "Alice"
    assert body["ip_address"] == "10.0.0.2"
    assert body["is_active"] is True

    duplicate = client.post("/api/nodes", json=payload)
    assert duplicate.status_code == 400
    assert duplicate.json()["detail"] == "Email already registered"


def test_stats_and_connected_clients(client, db_session, monkeypatch):
    _mock_wireguard(monkeypatch)

    now = datetime.now(timezone.utc)
    db_session.add_all(
        [
            Client(
                email="active@example.com",
                name="Active",
                public_key="pub-active",
                private_key="priv-active",
                ip_address="10.0.0.10",
                preshared_key="psk-active",
                is_active=True,
            ),
            Client(
                email="inactive@example.com",
                name="Inactive",
                public_key="pub-inactive",
                private_key="priv-inactive",
                ip_address="10.0.0.11",
                preshared_key="psk-inactive",
                is_active=False,
            ),
        ]
    )
    db_session.commit()

    monkeypatch.setattr(
        clients_api.wireguard_service,
        "get_connected_peers",
        lambda: {
            "pub-active": {
                "last_handshake": now,
                "transfer_rx": 1024,
                "transfer_tx": 2048,
            }
        },
    )

    stats = client.get("/api/nodes/stats")
    assert stats.status_code == 200
    stats_body = stats.json()
    assert stats_body["total_clients"] == 2
    assert stats_body["active_clients"] == 1
    assert stats_body["connected_clients"] == 1
    assert "last_updated" in stats_body

    connected = client.get("/api/nodes/connected")
    assert connected.status_code == 200
    body = connected.json()
    assert len(body) == 1
    assert body[0]["email"] == "active@example.com"
    assert body[0]["transfer_rx"] == 1024
    assert body[0]["transfer_tx"] == 2048


def test_toggle_and_delete_client(client, db_session, monkeypatch):
    _mock_wireguard(monkeypatch)

    toggled = {"added": 0, "removed": 0}

    def add_peer(_public_key, _ip):
        toggled["added"] += 1
        return True

    def remove_peer(_public_key):
        toggled["removed"] += 1
        return True

    monkeypatch.setattr(clients_api.wireguard_service, "add_peer", add_peer)
    monkeypatch.setattr(clients_api.wireguard_service, "remove_peer", remove_peer)

    db_client = Client(
        email="toggle@example.com",
        name="Toggle",
        public_key="pub-toggle",
        private_key="priv-toggle",
        ip_address="10.0.0.12",
        preshared_key="psk-toggle",
        is_active=True,
    )
    db_session.add(db_client)
    db_session.commit()
    db_session.refresh(db_client)

    deactivate = client.patch(f"/api/nodes/{db_client.id}/toggle")
    assert deactivate.status_code == 200
    assert deactivate.json()["is_active"] is False
    assert toggled["removed"] == 1

    activate = client.patch(f"/api/nodes/{db_client.id}/toggle")
    assert activate.status_code == 200
    assert activate.json()["is_active"] is True
    assert toggled["added"] == 1

    deleted = client.delete(f"/api/nodes/{db_client.id}")
    assert deleted.status_code == 204
