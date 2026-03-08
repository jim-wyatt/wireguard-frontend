import subprocess
import ipaddress
from typing import List, Dict, Optional
from datetime import datetime
from app.core.config import settings

class WireGuardService:
    def __init__(self):
        self.interface = settings.WG_INTERFACE
        self.server_ip = settings.WG_SERVER_IP
        self.server_port = settings.WG_SERVER_PORT
        self.server_public_key = settings.WG_SERVER_PUBLIC_KEY
        self.server_endpoint = settings.WG_SERVER_ENDPOINT
        self.network = settings.WG_NETWORK
        self.dns = settings.WG_DNS
    
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
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
"""
        return config
    
    def add_peer(self, public_key: str, ip_address: str) -> bool:
        """Add peer to WireGuard interface"""
        try:
            subprocess.run(
                [
                    "wg", "set", self.interface,
                    "peer", public_key,
                    "allowed-ips", f"{ip_address}/32"
                ],
                check=True,
                capture_output=True
            )
            
            # Save configuration
            subprocess.run(
                ["wg-quick", "save", self.interface],
                check=True,
                capture_output=True
            )
            
            return True
        except subprocess.CalledProcessError as e:
            print(f"Failed to add peer: {e}")
            return False
    
    def remove_peer(self, public_key: str) -> bool:
        """Remove peer from WireGuard interface"""
        try:
            subprocess.run(
                ["wg", "set", self.interface, "peer", public_key, "remove"],
                check=True,
                capture_output=True
            )
            
            # Save configuration
            subprocess.run(
                ["wg-quick", "save", self.interface],
                check=True,
                capture_output=True
            )
            
            return True
        except subprocess.CalledProcessError as e:
            print(f"Failed to remove peer: {e}")
            return False
    
    def get_connected_peers(self) -> Dict[str, Dict]:
        """Get list of connected peers with their statistics"""
        try:
            result = subprocess.run(
                ["wg", "show", self.interface, "dump"],
                capture_output=True,
                text=True,
                check=True
            )
            
            peers = {}
            lines = result.stdout.strip().split('\n')
            
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
                        "last_handshake": datetime.fromtimestamp(last_handshake) if last_handshake else None,
                        "transfer_rx": transfer_rx,
                        "transfer_tx": transfer_tx
                    }
            
            return peers
        except subprocess.CalledProcessError as e:
            print(f"Failed to get connected peers: {e}")
            return {}

# Singleton instance
wireguard_service = WireGuardService()
