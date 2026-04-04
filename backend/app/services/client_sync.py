from __future__ import annotations

from ipaddress import ip_interface
from datetime import datetime, timedelta, timezone
from threading import Lock

from sqlalchemy.orm import Session

from app.db.models import Client
from app.services.wireguard import wireguard_service


UNMANAGED_PRIVATE_KEY_PLACEHOLDER = "unmanaged-import"

_sync_lock = Lock()
_last_sync_at = datetime.min.replace(tzinfo=timezone.utc)


def _extract_peer_ip(allowed_ips: str | None) -> str | None:
    if not allowed_ips:
        return None

    first = allowed_ips.split(",", 1)[0].strip()
    if not first:
        return None

    try:
        return str(ip_interface(first).ip)
    except ValueError:
        return None


def _generate_import_email(public_key: str, existing_emails: set[str]) -> str:
    base = f"imported-{public_key[:10].lower()}"
    candidate = f"{base}@wg.local"
    suffix = 1
    while candidate in existing_emails:
        candidate = f"{base}-{suffix}@wg.local"
        suffix += 1
    existing_emails.add(candidate)
    return candidate


def sync_clients_with_wireguard(db: Session) -> dict[str, int]:
    peers = wireguard_service.get_configured_peers()
    peer_by_key = {peer["public_key"]: peer for peer in peers}
    connected_peers = wireguard_service.get_connected_peers()

    existing_clients = db.query(Client).all()
    existing_by_key = {client.public_key: client for client in existing_clients}
    existing_emails = {client.email for client in existing_clients}

    created = 0
    updated = 0
    deactivated = 0
    handshake_updates = 0

    for public_key, peer in peer_by_key.items():
        client = existing_by_key.get(public_key)
        peer_ip = _extract_peer_ip(peer.get("allowed_ips"))

        if client:
            changed = False
            if peer_ip and client.ip_address != peer_ip:
                client.ip_address = peer_ip
                changed = True
            if not client.is_active:
                client.is_active = True
                changed = True

            peer_info = connected_peers.get(public_key)
            live_handshake = peer_info.get("last_handshake") if peer_info else None
            if client.last_handshake != live_handshake:
                client.last_handshake = live_handshake
                handshake_updates += 1
                changed = True

            if changed:
                updated += 1
            continue

        used_ips = [c.ip_address for c in db.query(Client).all()]
        ip_address = peer_ip or wireguard_service.get_next_available_ip(used_ips)

        imported = Client(
            email=_generate_import_email(public_key, existing_emails),
            name="Imported client",
            public_key=public_key,
            private_key=UNMANAGED_PRIVATE_KEY_PLACEHOLDER,
            ip_address=ip_address,
            preshared_key=peer.get("preshared_key"),
            allowed_ips=peer.get("allowed_ips") or "0.0.0.0/0, ::/0",
            dns=wireguard_service.dns,
            last_handshake=(connected_peers.get(public_key) or {}).get("last_handshake"),
            is_active=True,
            config_downloaded=True,
        )
        db.add(imported)
        created += 1

    configured_keys = set(peer_by_key.keys())
    for client in existing_clients:
        if client.is_active and client.public_key not in configured_keys:
            client.is_active = False
            if client.last_handshake is not None:
                client.last_handshake = None
                handshake_updates += 1
            deactivated += 1

    db.commit()

    return {
        "configured_peers": len(peers),
        "created": created,
        "updated": updated,
        "deactivated": deactivated,
        "handshake_updates": handshake_updates,
    }


def sync_clients_with_wireguard_if_stale(
    db: Session,
    min_interval_seconds: int = 2,
) -> dict[str, int] | None:
    global _last_sync_at

    now = datetime.now(timezone.utc)
    with _sync_lock:
        if now - _last_sync_at < timedelta(seconds=min_interval_seconds):
            return None
        _last_sync_at = now

    return sync_clients_with_wireguard(db)