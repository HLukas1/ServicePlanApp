#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/serviceplan"
SERVICE_USER="serviceplan"
ENV_FILE="/etc/serviceplan.env"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Bitte mit sudo ausführen: sudo ./setup.sh"
  exit 1
fi

echo "=== ServicePlan Setup ==="
echo

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 fehlt. Installiere benötigte Pakete..."
  apt-get update
  apt-get install -y python3 python3-venv python3-pip rsync
else
  apt-get update
  apt-get install -y python3-venv python3-pip rsync
fi

if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  echo "Erstelle Systembenutzer $SERVICE_USER ..."
  useradd --system --home /opt/serviceplan --shell /usr/sbin/nologin "$SERVICE_USER"
fi

mkdir -p "$APP_DIR"

# Bestehende Nutzdaten ausdrücklich erhalten.
mkdir -p "$APP_DIR/instance/uploads"

# Nur Projektdateien synchronisieren. instance/, venv/ und Git-Daten bleiben unangetastet.
echo "Kopiere Programmdateien nach $APP_DIR ..."
rsync -a --delete \
  --exclude 'instance/' \
  --exclude 'venv/' \
  --exclude '.git/' \
  --exclude '__pycache__/' \
  "$SCRIPT_DIR/" "$APP_DIR/"

# Virtuelle Python-Umgebung anlegen / wiederverwenden.
if [[ ! -x "$APP_DIR/venv/bin/python" ]]; then
  echo "Erstelle Python-Virtualenv ..."
  python3 -m venv "$APP_DIR/venv"
fi

"$APP_DIR/venv/bin/pip" install --upgrade pip
"$APP_DIR/venv/bin/pip" install -r "$APP_DIR/requirements.txt"

# API-Token nur beim ersten Setup erzeugen.
if [[ ! -f "$ENV_FILE" ]] || ! grep -q '^SERVICEPLAN_API_TOKEN=' "$ENV_FILE"; then
  TOKEN="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  printf 'SERVICEPLAN_API_TOKEN=%s\n' "$TOKEN" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Neues API-Token wurde in $ENV_FILE erzeugt."
else
  echo "Vorhandenes API-Token bleibt erhalten."
fi

# Laufzeitverzeichnisse und Berechtigungen.
mkdir -p "$APP_DIR/instance/uploads"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/instance"
chmod 750 "$APP_DIR/instance" "$APP_DIR/instance/uploads"

# systemd Service installieren.
install -m 0644 "$APP_DIR/systemd/serviceplan.service" /etc/systemd/system/serviceplan.service
systemctl daemon-reload
systemctl enable serviceplan.service
systemctl restart serviceplan.service

sleep 2
if systemctl is-active --quiet serviceplan.service; then
  echo
  echo "=========================================="
  echo "ServicePlan wurde erfolgreich installiert."
  echo "=========================================="
  echo "App:     http://<SERVER-IP>:5000"
  echo "Service: systemctl status serviceplan"
  echo "Logs:    journalctl -u serviceplan -f"
  echo "Token:   $ENV_FILE"
  echo
else
  echo "ServicePlan konnte nicht gestartet werden."
  systemctl status serviceplan.service --no-pager || true
  exit 1
fi
