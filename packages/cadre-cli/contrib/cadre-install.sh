#!/bin/bash
# Sereus Cadre Node Installation Script
# Run as root or with sudo

set -e

INSTALL_DIR="/opt/cadre"
CONFIG_DIR="/etc/cadre"
DATA_DIR="/var/lib/cadre"
SERVICE_USER="cadre"

echo "Installing Sereus Cadre Node..."

# Create service user
if ! id "$SERVICE_USER" &>/dev/null; then
    echo "Creating service user: $SERVICE_USER"
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

# Create directories
echo "Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR"
mkdir -p "$DATA_DIR"

# Set ownership
chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR"
chown root:root "$CONFIG_DIR"
chmod 755 "$CONFIG_DIR"

# Install Node.js dependencies
echo "Installing Node.js packages..."
cd "$INSTALL_DIR"
npm init -y
npm install @serfab/cadre-cli @serfab/cadre-core

# Copy example config if none exists
if [ ! -f "$CONFIG_DIR/cadre.yaml" ]; then
    echo "Creating example configuration..."
    cp "$INSTALL_DIR/node_modules/@serfab/cadre-cli/example.cadre.yaml" "$CONFIG_DIR/cadre.yaml"
    
    # Update paths in config
    sed -i 's|path: ./data|path: /var/lib/cadre|g' "$CONFIG_DIR/cadre.yaml"
    sed -i 's|keyFile: ./cadre-peer.key|keyFile: /etc/cadre/cadre-peer.key|g' "$CONFIG_DIR/cadre.yaml"
    
    chmod 640 "$CONFIG_DIR/cadre.yaml"
    chown root:$SERVICE_USER "$CONFIG_DIR/cadre.yaml"
fi

# Install systemd service
echo "Installing systemd service..."
cp "$INSTALL_DIR/node_modules/@serfab/cadre-cli/contrib/cadre-node.service" /etc/systemd/system/
systemctl daemon-reload

echo ""
echo "Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Edit /etc/cadre/cadre.yaml with your configuration"
echo "  2. Generate a peer identity:"
echo "     sudo -u $SERVICE_USER cadre enroll create --output /etc/cadre --name cadre-peer"
echo "  3. Enable and start the service:"
echo "     systemctl enable cadre-node"
echo "     systemctl start cadre-node"
echo "  4. Check status:"
echo "     systemctl status cadre-node"
echo "     journalctl -u cadre-node -f"

