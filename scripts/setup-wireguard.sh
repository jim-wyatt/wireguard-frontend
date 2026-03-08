#!/bin/bash

# WireGuard Setup Script
# This script helps set up WireGuard server on the host

set -e

echo "======================================="
echo "WireGuard Server Setup"
echo "======================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Install WireGuard
echo "Installing WireGuard..."
apt-get update
apt-get install -y wireguard wireguard-tools

# Generate server keys
echo "Generating server keys..."
cd /etc/wireguard
wg genkey | tee server_private.key | wg pubkey > server_public.key
chmod 600 server_private.key

SERVER_PRIVATE_KEY=$(cat server_private.key)
SERVER_PUBLIC_KEY=$(cat server_public.key)

echo ""
echo "Server keys generated!"
echo "Public Key: $SERVER_PUBLIC_KEY"
echo "Private Key: $SERVER_PRIVATE_KEY"
echo ""

# Get server IP and interface
echo "What is your server's public IP or domain?"
read -p "Server endpoint: " SERVER_ENDPOINT

echo "What network interface is connected to the internet? (e.g., eth0)"
read -p "Interface: " INET_INTERFACE

# Create WireGuard configuration
echo "Creating WireGuard configuration..."
cat > /etc/wireguard/wg0.conf << EOF
[Interface]
Address = 10.0.0.1/24
ListenPort = 443
PrivateKey = $SERVER_PRIVATE_KEY

# Enable IP forwarding
PostUp = sysctl -w net.ipv4.ip_forward=1
PostUp = iptables -A FORWARD -i %i -j ACCEPT
PostUp = iptables -A FORWARD -o %i -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o $INET_INTERFACE -j MASQUERADE

# Disable IP forwarding on shutdown
PostDown = iptables -D FORWARD -i %i -j ACCEPT
PostDown = iptables -D FORWARD -o %i -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o $INET_INTERFACE -j MASQUERADE

# Peers will be added here automatically by the application
EOF

chmod 600 /etc/wireguard/wg0.conf

# Enable IP forwarding
echo "Enabling IP forwarding..."
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
sysctl -p

# Start WireGuard
echo "Starting WireGuard..."
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0

# Configure firewall
echo "Configuring firewall..."
ufw allow 443/udp comment 'WireGuard'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'

echo ""
echo "======================================="
echo "WireGuard Setup Complete!"
echo "======================================="
echo ""
echo "Add these values to your .env file:"
echo ""
echo "WG_SERVER_PUBLIC_KEY=$SERVER_PUBLIC_KEY"
echo "WG_SERVER_PRIVATE_KEY=$SERVER_PRIVATE_KEY"
echo "WG_SERVER_ENDPOINT=$SERVER_ENDPOINT:443"
echo ""
echo "To check WireGuard status:"
echo "  sudo wg show"
echo "  sudo systemctl status wg-quick@wg0"
echo ""
