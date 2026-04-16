import subprocess
import ipaddress
import logging
import re
from typing import List, Dict, Optional
from datetime import datetime, timezone
import httpx
from app.core.config import settings


logger = logging.getLogger(__name__)
WG_PUBLIC_KEY_PATTERN = re.compile(r"^[A-Za-z0-9+/]{43}=$")
WG_HELPER_TIMEOUT = 5.0


def _run_helper(endpoint: str, payload: Dict[str, str]) -> str:
    token = (settings.WG_HELPER_TOKEN or settings.API_SECRET_KEY).strip()
    try:
        response = httpx.post(
            f"{settings.WG_HELPER_URL}{endpoint}",
            json=payload,
            headers={"X-WG-Helper-Token": token},
            timeout=WG_HELPER_TIMEOUT,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error("WireGuard helper rejected request to %s: %s", endpoint, exc.response.text)
        raise subprocess.CalledProcessError(returncode=1, cmd=endpoint, stderr=exc.response.text) from exc
    except httpx.HTTPError as exc:
        logger.error("WireGuard helper unavailable for %s", endpoint, exc_info=True)
        raise FileNotFoundError(f"WireGuard helper unavailable at {settings.WG_HELPER_URL}") from exc

    data = response.json()
    return str(data.get("output", ""))

class WireGuardService:
    def __init__(self):
        self.interface = settings.WG_INTERFACE
        self.server_ip = settings.WG_SERVER_IP
        self.server_port = settings.WG_SERVER_PORT
        self.server_public_key = settings.WG_SERVER_PUBLIC_KEY
        self.server_endpoint = settings.WG_SERVER_ENDPOINT
        self.network = settings.WG_NETWORK
        self.dns = settings.WG_DNS
        self.allowed_ips = settings.WG_CLIENT_ALLOWED_IPS.strip() or self.network
    
    def generate_keys(self) -> tuple[str, str]:
        """Generate WireGuard private and public keys"""
        try:
            # Generate private key
            private_key = subprocess.run(
                ["wg", "genkey"],
                capture_output=True,
                text=True,
                check=True
            ).stdout.strip()
            
            # Generate public key from private key
            public_key = subprocess.run(
                ["wg", "pubkey"],
                input=private_key,
                capture_output=True,
                text=True,
                check=True
            ).stdout.strip()
            
            return private_key, public_key
        except subprocess.CalledProcessError as e:
            raise Exception(f"Failed to generate WireGuard keys: {e}")
    
    def generate_preshared_key(self) -> str:
        """Generate WireGuard preshared key"""
        try:
            psk = subprocess.run(
                ["wg", "genpsk"],
                capture_output=True,
                text=True,
                check=True
            ).stdout.strip()
            return psk
        except subprocess.CalledProcessError as e:
            raise Exception(f"Failed to generate preshared key: {e}")
    
    def get_next_available_ip(self, used_ips: List[str]) -> str:
        """Get next available IP address in the network"""
        network = ipaddress.ip_network(self.network)
        used_ip_set = set(used_ips)
        
        # Skip network address and server IP
        for ip in network.hosts():
            ip_str = str(ip)
            if ip_str != self.server_ip and ip_str not in used_ip_set:
                return ip_str
        
        raise Exception("No available IP addresses in the network")
    
    def generate_client_config(
        self,
        private_key: str,
        ip_address: str,
        dns: Optional[str] = None
    ) -> str:
        """Generate WireGuard client configuration"""
        dns_servers = dns or self.dns
        
        config = f"""[Interface]
PrivateKey = {private_key}
Address = {ip_address}/32
DNS = {dns_servers}

[Peer]
PublicKey = {self.server_public_key}
Endpoint = {self.server_endpoint}
AllowedIPs = {self.allowed_ips}
PersistentKeepalive = 25
"""
        return config
    
    def add_peer(self, public_key: str, ip_address: str) -> bool:
        """Add peer to WireGuard interface"""
        if not WG_PUBLIC_KEY_PATTERN.match(public_key):
            logger.warning("Rejected invalid WireGuard public key format")
            return False

        try:
            ipaddress.ip_address(ip_address)
        except ValueError:
            logger.warning("Rejected invalid client IP address: %s", ip_address)
            return False

        try:
            _run_helper("/add-peer", {"interface": self.interface, "public_key": public_key, "ip_address": ip_address})
            
            # Save configuration
            _run_helper("/save-config", {"interface": self.interface})
            
            return True
        except subprocess.CalledProcessError as e:
            logger.error("Failed to add peer", exc_info=True)
            return False
    
    def remove_peer(self, public_key: str) -> bool:
        """Remove peer from WireGuard interface"""
        if not WG_PUBLIC_KEY_PATTERN.match(public_key):
            logger.warning("Rejected invalid WireGuard public key format on remove")
            return False

        try:
            _run_helper("/remove-peer", {"interface": self.interface, "public_key": public_key})
            
            # Save configuration
            _run_helper("/save-config", {"interface": self.interface})
            
            return True
        except subprocess.CalledProcessError as e:
            logger.error("Failed to remove peer", exc_info=True)
            return False

    def get_configured_peers(self) -> List[Dict[str, Optional[str]]]:
        """Read peers configured on the WireGuard interface from `wg show ... dump`."""
        try:
            output = _run_helper("/show-dump", {"interface": self.interface})

            peers: List[Dict[str, Optional[str]]] = []
            lines = output.strip().split("\n")

            # Skip first line (interface metadata)
            for line in lines[1:]:
                parts = line.split("\t")
                if len(parts) < 4:
                    continue

                peers.append(
                    {
                        "public_key": parts[0],
                        "preshared_key": parts[1] if parts[1] != "(none)" else None,
                        "allowed_ips": parts[3],
                    }
                )

            return peers
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            logger.error("Failed to read configured peers", exc_info=True)
            return []
    
    def get_connected_peers(self) -> Dict[str, Dict]:
        """Get list of connected peers with their statistics"""
        try:
            output = _run_helper("/show-dump", {"interface": self.interface})
            
            peers = {}
            lines = output.strip().split('\n')
            
            # Skip first line (interface info)
            for line in lines[1:]:
                parts = line.split('\t')
                if len(parts) >= 5:
                    public_key = parts[0]
                    preshared_key = parts[1] if parts[1] != "(none)" else None
                    endpoint = parts[2] if parts[2] != "(none)" else None
                    allowed_ips = parts[3]
                    last_handshake = int(parts[4]) if parts[4] != "0" else None
                    transfer_rx = int(parts[5]) if len(parts) > 5 else 0
                    transfer_tx = int(parts[6]) if len(parts) > 6 else 0
                    
                    peers[public_key] = {
                        "endpoint": endpoint,
                        "allowed_ips": allowed_ips,
                        "last_handshake": datetime.fromtimestamp(last_handshake, tz=timezone.utc) if last_handshake else None,
                        "transfer_rx": transfer_rx,
                        "transfer_tx": transfer_tx
                    }
            
            return peers
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            logger.error("Failed to get connected peers", exc_info=True)
            return {}

    def get_interface_summary(self) -> Dict[str, Optional[object]]:
        """Return live interface state and peer counts for attestation and dashboards."""
        summary: Dict[str, Optional[object]] = {
            "interface": self.interface,
            "is_up": False,
            "listen_port": None,
            "public_key": None,
            "network": self.network,
            "server_ip": self.server_ip,
            "server_endpoint": self.server_endpoint,
            "dns": self.dns,
            "configured_peers": 0,
            "connected_peers": 0,
            "latest_handshake": None,
            "transfer_rx": 0,
            "transfer_tx": 0,
        }

        try:
            _run_helper("/ip-link-show", {"interface": self.interface})
            summary["is_up"] = True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return summary

        try:
            listen_value = _run_helper("/show-listen-port", {"interface": self.interface}).strip()
            if listen_value:
                summary["listen_port"] = int(listen_value)

            key_value = _run_helper("/show-public-key", {"interface": self.interface}).strip()
            if key_value:
                summary["public_key"] = key_value
        except (subprocess.CalledProcessError, FileNotFoundError, ValueError):
            logger.warning("Failed to read WireGuard interface metadata", exc_info=True)

        configured_peers = self.get_configured_peers()
        connected_peers = self.get_connected_peers()
        summary["configured_peers"] = len(configured_peers)
        summary["connected_peers"] = len(connected_peers)

        latest_handshake = None
        transfer_rx = 0
        transfer_tx = 0
        for peer in connected_peers.values():
            handshake = peer.get("last_handshake")
            if handshake and (latest_handshake is None or handshake > latest_handshake):
                latest_handshake = handshake
            transfer_rx += int(peer.get("transfer_rx") or 0)
            transfer_tx += int(peer.get("transfer_tx") or 0)

        summary["latest_handshake"] = latest_handshake
        summary["transfer_rx"] = transfer_rx
        summary["transfer_tx"] = transfer_tx
        return summary

# Singleton instance
wireguard_service = WireGuardService()
