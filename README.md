# ServicePlan

ServicePlan ist eine lokale Web-App/PWA zur Verwaltung von Fahrzeugen, Wartungen, Notizen sowie Bildern und Dokumenten.

## Funktionen

- mehrere Fahrzeuge
- Fahrzeugdaten und Kilometerstand
- Wartungs-/Serviceeinträge
- Notizen
- Fahrzeug-Titelbilder
- Bilder und Dokumente als Anhänge
- Anhänge können Fahrzeugen, Wartungen oder Notizen zugeordnet werden
- Offline-Nutzung über PWA + IndexedDB
- Synchronisation zwischen Geräten
- ZIP-Backup mit Daten **und** Anhängen
- ZIP-Import zur Wiederherstellung
- API-Authentifizierung über `SERVICEPLAN_API_TOKEN`
- SQLite-Datenbank
- Gunicorn + systemd

## Projektstruktur

```text
ServicePlan/
├── app.py
├── requirements.txt
├── setup.sh
├── update.sh
├── README.md
├── LICENSE
├── .gitignore
├── .env.example
├── systemd/
│   └── serviceplan.service
├── scripts/
│   └── check.sh
├── templates/
│   └── index.html
├── static/
│   ├── app.js
│   ├── style.css
│   ├── manifest.json
│   ├── serviceplan-logo.png
│   └── icons/
│       ├── icon-192.png
│       ├── icon-512.png
│       ├── icon-maskable-192.png
│       └── icon-maskable-512.png
└── service-worker.js
```

## Wichtig: Was NICHT in GitHub gehört

Diese Dateien enthalten deine persönlichen Daten bzw. Geheimnisse und werden deshalb durch `.gitignore` ausgeschlossen:

- `instance/` – SQLite-Datenbank und hochgeladene Dateien
- `venv/` – Python-Abhängigkeiten
- API-Token / `.env` / `serviceplan.env`
- lokale ZIP-Backups
- Python-Cache

**Das ist absichtlich so.** GitHub empfiehlt ausdrücklich, Passwörter, API-Keys und andere Geheimnisse nicht in ein Repository zu committen. citehttps://docs.github.com/de/get-started/learning-to-code/storing-your-secrets-safely

## Installation auf einem neuen Debian-/Ubuntu-System

Repository klonen und Setup starten:

```bash
git clone https://github.com/DEIN-NAME/ServicePlan.git
cd ServicePlan
sudo ./setup.sh
```

Das Setup-Skript:

1. installiert Python/Virtualenv und benötigte Pakete
2. legt den Systembenutzer `serviceplan` an
3. installiert ServicePlan nach `/opt/serviceplan`
4. erstellt die Python-Virtualenv
5. installiert `requirements.txt`
6. erzeugt beim ersten Setup automatisch ein zufälliges API-Token
7. speichert das Token geschützt in `/etc/serviceplan.env`
8. installiert den systemd-Service
9. startet ServicePlan automatisch

Danach ist die Anwendung normalerweise unter

```text
http://SERVER-IP:5000
```

erreichbar.

## Service verwalten

Status:

```bash
sudo systemctl status serviceplan
```

Neustart:

```bash
sudo systemctl restart serviceplan
```

Logs:

```bash
sudo journalctl -u serviceplan -f
```

## Update auf eine neue GitHub-Version

Auf dem Server:

```bash
cd ~/ServicePlan

git pull
sudo ./update.sh
```

`update.sh` überschreibt **nicht**:

- `/opt/serviceplan/instance/`
- `/opt/serviceplan/venv/`
- deine Datenbank
- deine hochgeladenen Bilder/Dokumente
- dein API-Token

Danach wird der Service automatisch neu gestartet.

## Daten sichern

Die Anwendung besitzt einen eigenen ZIP-Export.

Dieser sollte regelmäßig auf einem anderen Gerät gespeichert werden. Das ZIP enthält:

- Fahrzeuge
- Wartungen
- Notizen
- Anhänge
- Bilder/Dokumente
- Fahrzeug-Titelbilder und deren Zuordnung

Damit kann eine neue Installation wieder mit deinen persönlichen Daten befüllt werden.

## Wiederherstellung auf einem neuen Server

1. Repository klonen
2. `sudo ./setup.sh` ausführen
3. ServicePlan öffnen
4. dein vorher exportiertes ZIP-Backup importieren

Damit sind Programmcode und persönliche Daten sauber getrennt.

## GitHub einrichten

### 1. Repository auf GitHub erstellen

Empfohlen ist zunächst ein **privates Repository**, solange du das Projekt nur für dich sichern oder mit ausgewählten Personen teilen möchtest. Ein öffentliches Repository macht den gesamten Code für jeden sichtbar. citehttps://docs.github.com/en/repositories/creating-and-managing-repositories/about-repositories

Beim Erstellen des neuen Repositorys kannst du README, `.gitignore` und License leer lassen, weil diese Dateien bereits im Projekt vorhanden sind. citehttps://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github

### 2. Projekt lokal als Git-Repository initialisieren

Im Projektordner:

```bash
git init -b main
git add .
git status
git commit -m "Initial ServicePlan version"
```

Vor dem Commit unbedingt prüfen, dass **keine** `instance/`, `.env`, Datenbank oder echte Backup-Datei auftaucht.

### 3. GitHub als Remote hinzufügen

Beispiel:

```bash
git remote add origin https://github.com/DEIN-NAME/ServicePlan.git
git remote -v
git push -u origin main
```

Das entspricht dem von GitHub dokumentierten Ablauf für lokal vorhandenen Code. citehttps://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github

### Alternative: GitHub CLI

Wenn `gh` installiert und angemeldet ist:

```bash
gh repo create ServicePlan --private --source=. --remote=origin --push
```

Für ein öffentliches Repository wäre `--public` möglich.

## Entwicklungsablauf ab jetzt

Nach einer Änderung:

```bash
./scripts/check.sh
git status
git add .
git commit -m "Beschreibung der Änderung"
git push
```

Auf dem Server:

```bash
cd ~/ServicePlan
git pull
sudo ./update.sh
```

## Sicherheits-Hinweise

- API-Token niemals in `app.py` eintragen.
- `/etc/serviceplan.env` niemals nach GitHub kopieren.
- Fahrzeugbilder und Datenbank niemals committen.
- Bei einem versehentlich veröffentlichten Token dieses sofort ersetzen.
- Für einen öffentlich erreichbaren Server zusätzlich einen Reverse Proxy mit HTTPS verwenden.

GitHub bietet unter anderem Secret Scanning und Push Protection, um versehentliche Secret-Leaks zu erkennen bzw. zu verhindern. citehttps://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories

## Lizenz

Siehe `LICENSE`.
