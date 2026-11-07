#!/usr/bin/env bash
# One-time setup of the Poultry Planner API on an Oracle Cloud Always Free Ampere (ARM) VM running Ubuntu 24.04.
# Run as the default "ubuntu" user, which has sudo. See docs/deploy.md for the whole walk-through.
#
#   DOMAIN=my-poultry-api.duckdns.org bash setup.sh
#
# It installs Node.js 20, git and Caddy (HTTPS with an automatic certificate), opens ports 80 and 443, clones the
# repository, installs the backend, downloads the AI models (about 3.2 GB) and installs the service. It does not
# start the API: fill in backend/.env first (the script prints what is left).
set -euo pipefail

: "${DOMAIN:?Set DOMAIN to the address of the API, for example DOMAIN=my-poultry-api.duckdns.org}"
REPO="${REPO:-https://github.com/devkaranpatil/Poultry-App-Dev.git}"
APP_DIR="${APP_DIR:-/opt/poultry}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== Packages: Node.js 20, git, Caddy"
sudo apt-get update
sudo apt-get install -y curl git gnupg debian-keyring debian-archive-keyring apt-transport-https netfilter-persistent
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y caddy
fi

echo "== Firewall: open HTTP and HTTPS"
# Oracle's Ubuntu images allow only SSH in iptables. The VCN security list must allow 80 and 443 as well (docs/deploy.md).
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null ||
    sudo iptables -I INPUT 6 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
done
sudo netfilter-persistent save

echo "== Code and dependencies in $APP_DIR"
sudo mkdir -p "$APP_DIR"
sudo chown "$USER":"$USER" "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO" "$APP_DIR"
fi
mkdir -p "$APP_DIR/backend/.data" "$APP_DIR/datasets/knowledge"
cd "$APP_DIR/backend"
npm ci --omit=dev

echo "== AI models (about 3.2 GB, once)"
npm run models:download

echo "== Service and HTTPS"
sed -e "s|__USER__|$USER|g" -e "s|__APP_DIR__|$APP_DIR|g" "$HERE/poultry-api.service" | sudo tee /etc/systemd/system/poultry-api.service >/dev/null
sed -e "s|__DOMAIN__|$DOMAIN|g" "$HERE/Caddyfile" | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable poultry-api
sudo systemctl reload caddy || sudo systemctl restart caddy

if [ ! -f "$APP_DIR/backend/.env" ]; then
  cp "$APP_DIR/backend/.env.example" "$APP_DIR/backend/.env"
  chmod 600 "$APP_DIR/backend/.env"
fi

cat <<EOF

Done. Left to do (docs/deploy.md, step 4):
  1. Copy the document text and the search cache from your laptop:
       scp -r datasets/knowledge/text ubuntu@<server-ip>:$APP_DIR/datasets/knowledge/
       scp backend/.data/rag-embeddings.json ubuntu@<server-ip>:$APP_DIR/backend/.data/
  2. Fill in $APP_DIR/backend/.env (nano $APP_DIR/backend/.env).
  3. sudo systemctl start poultry-api && curl https://$DOMAIN/api/health
EOF
