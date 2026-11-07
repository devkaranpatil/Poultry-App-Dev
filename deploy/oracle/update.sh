#!/usr/bin/env bash
# Deploys the latest main on the Oracle VM: pull, install, restart. Run on the server:  bash /opt/poultry/deploy/oracle/update.sh
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/poultry}"
git -C "$APP_DIR" pull --ff-only
cd "$APP_DIR/backend"
npm ci --omit=dev
sudo systemctl restart poultry-api
sleep 5
curl -fsS http://127.0.0.1:5000/api/health && echo " API is up"
