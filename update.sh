#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/serviceplan"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Bitte mit sudo ausführen: sudo ./update.sh"
  exit 1
fi

if [[ ! -d "$APP_DIR" ]]; then
  echo "$APP_DIR existiert nicht. Bitte zuerst ./setup.sh ausführen."
  exit 1
fi

# Nutzdaten erhalten: instance/ und venv/ werden niemals gelöscht.
rsync -a --delete \
  --exclude 'instance/' \
  --exclude 'venv/' \
  --exclude '.git/' \
  --exclude '__pycache__/' \
  "$SCRIPT_DIR/" "$APP_DIR/"

"$APP_DIR/venv/bin/pip" install -r "$APP_DIR/requirements.txt"
chown -R serviceplan:serviceplan "$APP_DIR/instance"
systemctl daemon-reload
systemctl restart serviceplan.service

echo "ServicePlan wurde aktualisiert."
systemctl --no-pager --full status serviceplan.service
