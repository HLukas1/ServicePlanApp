# ServicePlan

ServicePlan ist eine selbst gehostete Web-App/PWA zur Verwaltung von Fahrzeugen, Wartungen, Notizen sowie Bildern und Dokumenten.

Die Anwendung läuft auf einem Debian-/Ubuntu-Server und kann von PC, Smartphone und Tablet über den Browser verwendet werden.

## Funktionen

* mehrere Fahrzeuge verwalten
* Fahrzeugdaten und Kilometerstand
* Wartungs- und Serviceeinträge
* frei definierbare Serviceinformationen
* Notizen
* Fahrzeug-Titelbild
* Bilder und Dokumente als Anhänge
* Anhänge können Fahrzeugen, Wartungen oder Notizen zugeordnet werden
* Bilder und Dokumente direkt in der Anwendung anzeigen
* Offline-Nutzung als PWA
* lokale Speicherung über IndexedDB
* Synchronisation zwischen Geräten
* SQLite-Datenbank
* ZIP-Export der ServicePlan-Daten
* ZIP-Import zur Wiederherstellung
* API-Authentifizierung über `SERVICEPLAN_API_TOKEN`
* Gunicorn als Webserver
* systemd-Service für automatischen Start

---

# Voraussetzungen

Für die Serverinstallation wird benötigt:

* Debian oder Ubuntu
* Root-/sudo-Zugriff
* Netzwerkzugriff
* Git

Python, pip, Virtualenv und die benötigten Python-Pakete werden vom Installationsskript automatisch eingerichtet.

---

# Installation auf einem neuen Debian-System

## 1. System aktualisieren

```bash
sudo apt update
sudo apt upgrade -y
```

## 2. Git installieren

```bash
sudo apt install -y git
```

## 3. ServicePlan herunterladen

Zum Beispiel in das Home-Verzeichnis:

```bash
cd ~
git clone https://github.com/HLukas1/ServicePlanApp.git
```

Danach in das Projektverzeichnis wechseln:

```bash
cd ServicePlanApp
```

## 4. Installation starten

```bash
sudo ./setup.sh
```

Das Installationsskript übernimmt anschließend die komplette Einrichtung.

Es:

1. installiert die benötigten Python-Pakete
2. erstellt den Systembenutzer `serviceplan`
3. erstellt `/opt/serviceplan`
4. kopiert die Anwendung nach `/opt/serviceplan`
5. erstellt die Python-Virtualenv
6. installiert die Abhängigkeiten aus `requirements.txt`
7. erzeugt beim ersten Setup automatisch ein zufälliges API-Token
8. speichert das Token in `/etc/serviceplan.env`
9. installiert den systemd-Service
10. aktiviert den automatischen Start
11. startet ServicePlan

Nach erfolgreicher Installation sollte am Ende ungefähr Folgendes angezeigt werden:

```text
ServicePlan wurde erfolgreich installiert.

App:     http://<SERVER-IP>:5000
Service: systemctl status serviceplan
Logs:    journalctl -u serviceplan -f
Token:   /etc/serviceplan.env
```

---

# ServicePlan öffnen

Die Anwendung läuft standardmäßig auf Port `5000`.

Die IP-Adresse des Servers kann beispielsweise mit folgendem Befehl ermittelt werden:

```bash
hostname -I
```

Danach im Browser:

```text
http://SERVER-IP:5000
```

Beispiel:

```text
http://192.168.1.100:5000
```

---

# Service verwalten

## Status anzeigen

```bash
sudo systemctl status serviceplan
```

## Service starten

```bash
sudo systemctl start serviceplan
```

## Service stoppen

```bash
sudo systemctl stop serviceplan
```

## Service neu starten

```bash
sudo systemctl restart serviceplan
```

## Service automatisch beim Systemstart starten

Das wird bereits bei der Installation aktiviert.

Manuell:

```bash
sudo systemctl enable serviceplan
```

## Logs anzeigen

Live:

```bash
sudo journalctl -u serviceplan -f
```

Die letzten Einträge:

```bash
sudo journalctl -u serviceplan -n 100 --no-pager
```

---

# Verzeichnisstruktur auf dem Server

Nach der Installation befinden sich die Programmdateien unter:

```text
/opt/serviceplan/
```

Wichtige Dateien und Verzeichnisse:

```text
/opt/serviceplan/
├── app.py
├── requirements.txt
├── static/
├── templates/
├── scripts/
├── systemd/
├── setup.sh
├── update.sh
├── instance/
│   └── ...
└── venv/
```

## Programmdaten

Die persönlichen ServicePlan-Daten liegen unter:

```text
/opt/serviceplan/instance/
```

Dort befinden sich unter anderem die lokale SQLite-Datenbank und hochgeladene Dateien.

Diese Daten werden bei Updates nicht gelöscht.

## Python Virtualenv

Die Python-Umgebung befindet sich unter:

```text
/opt/serviceplan/venv/
```

Diese wird ebenfalls bei Updates erhalten.

## API-Token

Das API-Token befindet sich unter:

```text
/etc/serviceplan.env
```

Die Datei sollte nicht veröffentlicht oder in Git eingecheckt werden.

---

# API-Token

ServicePlan verwendet zur Authentifizierung der API die Umgebungsvariable:

```text
SERVICEPLAN_API_TOKEN
```

Beim ersten Ausführen von `setup.sh` wird automatisch ein zufälliges Token erzeugt.

Es wird gespeichert unter:

```text
/etc/serviceplan.env
```

Datei anzeigen:

```bash
sudo cat /etc/serviceplan.env
```

Das Token niemals öffentlich auf GitHub veröffentlichen.

Nach einer Änderung des Tokens muss der Service neu gestartet werden:

```bash
sudo systemctl restart serviceplan
```

---

# Updates

Neue Versionen werden über GitHub bereitgestellt.

Auf dem Server zunächst in das lokale Repository wechseln:

```bash
cd ~/ServicePlanApp
```

Neue Version herunterladen:

```bash
git pull
```

Danach das Update installieren:

```bash
sudo ./update.sh
```

Das Update-Skript:

* aktualisiert die Programmdateien
* aktualisiert Python-Abhängigkeiten
* behält die Datenbank
* behält hochgeladene Bilder und Dokumente
* behält das API-Token
* behält die Virtualenv
* startet den Service anschließend neu

Die persönlichen Daten unter:

```text
/opt/serviceplan/instance/
```

werden vom Update ausdrücklich ausgeschlossen.

---

# Manuelles Update

Der normale Ablauf ist:

```bash
cd ~/ServicePlanApp
git pull
sudo ./update.sh
```

Danach Status prüfen:

```bash
sudo systemctl status serviceplan
```

---

# Daten sichern

ServicePlan besitzt einen eigenen ZIP-Export.

Der Export sollte regelmäßig durchgeführt und zusätzlich auf einem anderen Gerät gespeichert werden.

Der ZIP-Export enthält die ServicePlan-Daten einschließlich:

* Fahrzeuge
* Wartungen
* Notizen
* Anhänge
* Bilder
* Dokumente
* Fahrzeugbilder
* Zuordnungen der Anhänge

Das Backup sollte **nicht** in das GitHub-Repository gespeichert werden.

---

# Wiederherstellung auf einem neuen Server

Für einen neuen Server wird zunächst ServicePlan normal installiert:

```bash
sudo apt update
sudo apt install -y git

cd ~
git clone https://github.com/HLukas1/ServicePlanApp.git
cd ServicePlanApp

sudo ./setup.sh
```

Danach ServicePlan im Browser öffnen:

```text
http://SERVER-IP:5000
```

Anschließend das zuvor erstellte ServicePlan-ZIP-Backup über die Import-Funktion der Anwendung einspielen.

Damit werden die persönlichen ServicePlan-Daten wiederhergestellt.

---

# GitHub

Das offizielle Repository befindet sich unter:

https://github.com/HLukas1/ServicePlanApp

Das Repository enthält den Programmcode.

Persönliche Daten wie Datenbank, Bilder, Dokumente, API-Token und lokale Backups gehören nicht in das Repository.

---

# Entwicklung

## Repository klonen

```bash
git clone https://github.com/HLukas1/ServicePlanApp.git
cd ServicePlanApp
```

## Änderungen prüfen

```bash
git status
```

## Änderungen testen

Falls vorhanden:

```bash
./scripts/check.sh
```

## Änderungen übernehmen

```bash
git add .
git commit -m "Beschreibung der Änderung"
```

## Änderungen zu GitHub übertragen

```bash
git push
```

---

# Sicherheit

Folgende Daten dürfen nicht in GitHub veröffentlicht werden:

```text
.env
/etc/serviceplan.env
SERVICEPLAN_API_TOKEN
*.db
*.sqlite
*.sqlite3
instance/
uploads/
Backups
```

Das Repository enthält nur den Programmcode und die für die Installation benötigten Dateien.

API-Tokens, Passwörter und persönliche Fahrzeugdaten müssen außerhalb des Git-Repositories gespeichert werden.

---

# Technischer Aufbau

ServicePlan verwendet:

* Python
* Flask
* Flask-SQLAlchemy
* SQLite
* Gunicorn
* systemd
* JavaScript
* IndexedDB
* Service Worker
* PWA

Die Python-Abhängigkeiten befinden sich in:

```text
requirements.txt
```

Aktuell werden dort Flask, Flask-SQLAlchemy und Gunicorn verwendet.

---

# Lizenz

ServicePlan wird unter der im Repository enthaltenen Lizenz veröffentlicht.

Siehe:

```text
LICENSE
```
