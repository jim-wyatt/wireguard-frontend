from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone, timedelta
import logging

from app.db.database import get_db
from app.db.models import Client
from app.core.auth import require_writer_role
from app.core.config import settings
from app.core.rate_limit import per_ip_limit
from app.schemas.client import (
    ClientCreate,
    ClientResponse,
    ClientConfig,
    ClientConnected,
    ClientStats
)
from app.services.wireguard import wireguard_service
from app.services.qrcode_service import generate_qr_code

router = APIRouter()
logger = logging.getLogger(__name__)

writer_rate_limit = per_ip_limit(settings.WRITER_RATE_LIMIT_PER_MINUTE)
dashboard_rate_limit = per_ip_limit(settings.DASHBOARD_RATE_LIMIT_PER_MINUTE)

@router.post("/clients", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
async def create_client(
    client: ClientCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_writer_role),
    __: None = Depends(writer_rate_limit),
):
    """Create a new WireGuard client"""
    
    # Check if email already exists
    existing_client = db.query(Client).filter(Client.email == client.email).first()
    if existing_client:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Generate WireGuard keys
    try:
        private_key, public_key = wireguard_service.generate_keys()
        preshared_key = wireguard_service.generate_preshared_key()
    except Exception as e:
        logger.exception("WireGuard key generation failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate client credentials"
        )
    
    # Get used IPs
    used_ips = [c.ip_address for c in db.query(Client).all()]
    
    # Get next available IP
    try:
        ip_address = wireguard_service.get_next_available_ip(used_ips)
    except Exception as e:
        logger.exception("IP allocation failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to allocate client IP"
        )
    
    # Create client in database
    db_client = Client(
        email=client.email,
        name=client.name,
        public_key=public_key,
        private_key=private_key,
        ip_address=ip_address,
        preshared_key=preshared_key,
        dns=wireguard_service.dns
    )
    
    try:
        db.add(db_client)
        db.flush()

        if not wireguard_service.add_peer(public_key, ip_address):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Failed to apply WireGuard peer configuration"
            )

        db.commit()
        db.refresh(db_client)

        return db_client
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.exception("Client creation failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create client"
        )

@router.get("/clients", response_model=List[ClientResponse])
async def list_clients(
    skip: int = 0,
    limit: int = 100,
    active_only: bool = False,
    db: Session = Depends(get_db),
    _: None = Depends(require_writer_role),
    __: None = Depends(writer_rate_limit),
):
    """List all clients"""
    query = db.query(Client)
    
    if active_only:
        query = query.filter(Client.is_active == True)
    
    clients = query.offset(skip).limit(limit).all()
    return clients

@router.get("/clients/stats", response_model=ClientStats)
async def get_stats(
    db: Session = Depends(get_db),
    _: None = Depends(dashboard_rate_limit),
):
    """Get client statistics"""
    total_clients = db.query(Client).count()
    active_clients = db.query(Client).filter(Client.is_active == True).count()
    
    # Get connected clients from WireGuard with timeout check
    connected_peers = wireguard_service.get_connected_peers()
    
    # Calculate connection timeout threshold (consistent with get_connected_clients)
    now = datetime.now(timezone.utc)
    timeout_threshold = now - timedelta(seconds=settings.WG_CONNECTED_TIMEOUT_SECONDS)
    
    # Count only peers with recent handshakes
    connected_clients = sum(
        1 for peer in connected_peers.values()
        if peer.get("last_handshake") and peer["last_handshake"] > timeout_threshold
    )
    
    return ClientStats(
        total_clients=total_clients,
        active_clients=active_clients,
        connected_clients=connected_clients
    )

@router.get("/clients/connected", response_model=List[ClientConnected])
async def get_connected_clients(
    db: Session = Depends(get_db),
    _: None = Depends(dashboard_rate_limit),
):
    """Get list of currently connected clients"""
    # Get connected peers from WireGuard
    connected_peers = wireguard_service.get_connected_peers()
    
    # Get clients from database
    clients = db.query(Client).filter(Client.is_active == True).all()
    
    # Calculate connection timeout threshold
    now = datetime.now(timezone.utc)
    timeout_threshold = now - timedelta(seconds=settings.WG_CONNECTED_TIMEOUT_SECONDS)
    
    connected_clients = []
    for client in clients:
        peer_info = connected_peers.get(client.public_key)
        if peer_info and peer_info["last_handshake"] and peer_info["last_handshake"] > timeout_threshold:
            # Update last handshake in database
            client.last_handshake = peer_info["last_handshake"]
            db.commit()
            
            connected_clients.append(
                ClientConnected(
                    id=client.id,
                    email=client.email,
                    name=client.name,
                    ip_address=client.ip_address,
                    last_handshake=peer_info["last_handshake"],
                    transfer_rx=peer_info["transfer_rx"],
                    transfer_tx=peer_info["transfer_tx"]
                )
            )
    
    return connected_clients

@router.get("/clients/{client_id}", response_model=ClientResponse)
async def get_client(
    client_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_writer_role),
    __: None = Depends(writer_rate_limit),
):
    """Get client details"""
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )
    return client

@router.get("/clients/{client_id}/config", response_model=ClientConfig)
async def get_client_config(
    client_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_writer_role),
    __: None = Depends(writer_rate_limit),
):
    """Get client configuration with QR code"""
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )
    
    # Generate configuration
    config = wireguard_service.generate_client_config(
        private_key=client.private_key,
        ip_address=client.ip_address,
        dns=client.dns
    )
    
    # Generate QR code
    qr_code = generate_qr_code(config)
    
    # Mark as downloaded
    if not client.config_downloaded:
        client.config_downloaded = True
        db.commit()
    
    return ClientConfig(config=config, qr_code=qr_code)

@router.delete("/clients/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_writer_role),
    __: None = Depends(writer_rate_limit),
):
    """Delete a client"""
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )
    
    # Remove from WireGuard for active clients before deleting from DB.
    if client.is_active and not wireguard_service.remove_peer(client.public_key):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to remove WireGuard peer"
        )
    
    # Delete from database
    db.delete(client)
    db.commit()
    
    return None

@router.patch("/clients/{client_id}/toggle", response_model=ClientResponse)
async def toggle_client_status(
    client_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_writer_role),
    __: None = Depends(writer_rate_limit),
):
    """Toggle client active status"""
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )
    
    target_active = not client.is_active

    if target_active:
        if not wireguard_service.add_peer(client.public_key, client.ip_address):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Failed to add WireGuard peer"
            )
    else:
        if not wireguard_service.remove_peer(client.public_key):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Failed to remove WireGuard peer"
            )

    client.is_active = target_active
    
    db.commit()
    db.refresh(client)
    
    return client
