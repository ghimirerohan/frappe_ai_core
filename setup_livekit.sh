#!/usr/bin/env bash
# Reference: install LiveKit server on Ubuntu (bare metal) + systemd.
# For Docker, prefer the `livekit` service in compose.yaml and resources/livekit.yaml.

set -euo pipefail

LIVEKIT_USER="${LIVEKIT_USER:-livekit}"
INSTALL_DIR="${INSTALL_DIR:-/opt/livekit}"
VERSION="${LIVEKIT_VERSION:-latest}"

echo "==> Creating user $LIVEKIT_USER (if missing)"
id -u "$LIVEKIT_USER" &>/dev/null || sudo useradd -r -s /bin/false "$LIVEKIT_USER"

echo "==> Downloading LiveKit server ($VERSION)"
sudo mkdir -p "$INSTALL_DIR"
TMP="$(mktemp)"
curl -sSL "https://github.com/livekit/livekit/releases/${VERSION}/download/livekit-server-linux-amd64.tar.gz" -o "$TMP" \
  || curl -sSL "https://github.com/livekit/livekit/releases/latest/download/livekit-server-linux-amd64.tar.gz" -o "$TMP"
sudo tar -xzf "$TMP" -C "$INSTALL_DIR"
rm -f "$TMP"
sudo chmod +x "$INSTALL_DIR/livekit-server"

echo "==> Installing config (edit Redis + keys!)"
sudo mkdir -p /etc/livekit
if [[ ! -f /etc/livekit/livekit.yaml ]]; then
	echo "    Copy your repo's resources/livekit.yaml to /etc/livekit/livekit.yaml (adjust redis address for localhost)."
fi

echo "==> systemd unit"
sudo tee /etc/systemd/system/livekit.service >/dev/null <<'UNIT'
[Unit]
Description=LiveKit Server
After=network.target redis-server.service
Wants=network-online.target

[Service]
User=livekit
Group=livekit
ExecStart=/opt/livekit/livekit-server --config /etc/livekit/livekit.yaml
Restart=on-failure
RestartSec=5
LimitNOFILE=500000

[Install]
WantedBy=multi-user.target
UNIT

echo "==> Done. Edit /etc/livekit/livekit.yaml (Redis address, API keys), then:"
echo "    sudo systemctl daemon-reload && sudo systemctl enable --now livekit"
