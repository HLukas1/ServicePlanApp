# ServicePlan

**ServicePlan** ist eine selbst gehostete Web-App zur Verwaltung deiner Fahrzeuge und ihrer Wartungen.
Du installierst sie einmal auf einem eigenen Server und nutzt sie danach im Browser von Smartphone, Tablet und PC.
Alle Geräte greifen auf denselben Datenbestand zu.

Deine Daten bleiben bei dir: Es gibt keine Cloud, kein Konto bei einem Anbieter und kein Abo.

---

## Inhalt

1. [Funktionen](#funktionen)
2. [Warum ein Server?](#warum-ein-server)
3. [Voraussetzungen](#voraussetzungen)
4. [Installation Schritt für Schritt](#installation-schritt-für-schritt)
5. [Erste Schritte in der App](#erste-schritte-in-der-app)
6. [Updates](#updates)
7. [Datensicherung und Wiederherstellung](#datensicherung-und-wiederherstellung)
8. [Service verwalten und Fehlersuche](#service-verwalten-und-fehlersuche)
9. [Zugriff von unterwegs und Sicherheit](#zugriff-von-unterwegs-und-sicherheit)
10. [Technischer Aufbau](#technischer-aufbau)
11. [Lizenz](#lizenz)

---

## Funktionen

### Fahrzeuge
- Beliebig viele Fahrzeuge verwalten: Marke, Modell, Motor, Baujahr, Farbe, Kennzeichen, FIN und Kilometerstand.
- Ein Titelbild pro Fahrzeug, direkt mit der Handykamera aufgenommen oder aus der Galerie gewählt.
- Der Kilometerstand wird automatisch hochgesetzt, wenn du eine Wartung mit höherem Kilometerstand einträgst.

### Wartungen
- Wartungshistorie mit Datum, Kilometerstand, Wartungsart (Inspektion, Ölwechsel, Reparatur, Bremsen, Zahnriemen, TÜV, Sonstiges), Werkstatt, Kosten und Notizen.
- Durchgeführte Arbeiten zum Abhaken: Motoröl, Ölfilter, Zündkerzen, Luftfilter, Pollenfilter, Zahnriemen, Bremsflüssigkeit, Kühlmittel, Getriebeöl.
- Pro Wartung lässt sich die **nächste Wartung** festlegen, nach Kilometerstand, nach Datum oder nach beidem.

### „Was ist fällig?“ – Übersicht auf der Startseite
- Die Startseite zeigt alle Termine, die **überfällig** (rot) oder **bald fällig** (gelb) sind, über alle Fahrzeuge hinweg. Die dringendsten stehen oben.
- Jede Fahrzeugkarte zeigt ihren Status: *Alles OK*, *bald fällig* oder *überfällig*.
- In der Fahrzeugansicht listet die Karte **Termine** alle anstehenden Termine dieses Fahrzeugs.
- Pro Wartungsart zählt nur die jüngste Wartung. Ältere Vorgaben gelten damit als erledigt.

### HU / TÜV
- Die nächste Hauptuntersuchung trägst du wie auf der Plakette ein: **nur Monat und Jahr**.
- Die HU gilt bis zum Monatsende. Bei „11/2026“ ist sie ab dem 01.12.2026 überfällig.
- Speicherst du eine Wartung der Art „TÜV“ mit einem Datum für die nächste Wartung, wird dieser Termin automatisch als nächste HU übernommen.

### Einstellbare Vorwarnzeiten
Unter **Einstellungen → Fälligkeiten** legst du fest, ab wann ein Termin als „bald fällig“ gilt:

| Termin | Standardwert |
|---|---|
| Wartung nach Datum | 30 Tage vorher |
| Wartung nach Kilometerstand | 1.000 km vorher |
| HU / TÜV | 60 Tage vorher |

Die Werte werden auf dem Server gespeichert und gelten auf allen Geräten. Mit **„Standardwerte“** setzt du sie zurück.

### Kosten
- Pro Fahrzeug erfasst du Kaufpreis, Kaufdatum, Versicherung (jährlich oder monatlich, mit Fälligkeitsmonat) und Kfz-Steuer (mit Fälligkeitsmonat).
- Die Kostenübersicht zeigt jährliche Kosten und Gesamtkosten aus Wartungen, Versicherung, Steuer und Kaufpreis.

### Notizen, Bilder und Dokumente
- Freie Notizen pro Fahrzeug.
- Bilder und Dokumente (PDF, Word, Excel, Text) lassen sich hochladen und einem **Fahrzeug**, einer **Wartung** oder einer **Notiz** zuordnen, zum Beispiel Rechnungen oder Prüfberichte.
- Bilder und Dokumente öffnest du direkt in der App.

### PDF-Fahrzeugbericht
- Erstellt einen Wartungsbericht als PDF mit Fahrzeugdaten (ohne Kosten) und chronologischer Wartungshistorie. Ideal für den Verkauf eines Fahrzeugs.
- Zugeordnete Dokumente werden am Ende angehängt.

### Mehrere Geräte und Offline-Nutzung
- Jedes Gerät verbindet sich einmalig mit dem **Geräte-Token** des Servers.
- Änderungen werden automatisch mit dem Server abgeglichen und erscheinen auf allen Geräten.
- Ohne Verbindung (z. B. in der Werkstatt-Tiefgarage) speichert die App Änderungen auf dem Gerät und überträgt sie, sobald wieder Verbindung besteht.
- Die App lässt sich auf dem Handy wie eine normale App zum Startbildschirm hinzufügen (PWA).

### Sicherung
- ZIP-Backup mit allen Fahrzeugen, Wartungen, Notizen, Einstellungen sowie allen Bildern und Dokumenten.
- Wiederherstellung über die Import-Funktion, auf demselben oder einem neuen Server.

---

## Warum ein Server?

ServicePlan ist dafür gebaut, **dauerhaft auf einem Server** zu laufen, also auf einem Gerät, das rund um die Uhr eingeschaltet ist:

- **Ein Datenbestand für alle Geräte.** Handy, Tablet und PC zeigen immer denselben Stand, weil die Daten zentral auf dem Server liegen.
- **Immer erreichbar.** Läuft die App auf einem normalen PC, sind deine Daten nicht verfügbar, wenn er aus ist, und Geräte können nicht synchronisieren.
- **Sichere Datenhaltung.** Datenbank und Anhänge liegen an einem festen Ort und lassen sich zuverlässig sichern.
- **Automatischer Start.** Nach einem Stromausfall oder Neustart startet ServicePlan von selbst wieder.

**Gut geeignet sind zum Beispiel:**

| Gerät | Hinweis |
|---|---|
| Raspberry Pi (ab Modell 3, besser 4/5) | Sparsam, leise, ideal für zu Hause |
| Container oder VM auf Proxmox (LXC) | Wenn bereits ein Heimserver vorhanden ist |
| Mini-PC / NAS mit Debian- oder Ubuntu-VM | Viel Reserve für weitere Dienste |
| Gemieteter Linux-Server (VPS) | Wenn die App auch von unterwegs erreichbar sein soll (siehe [Sicherheit](#zugriff-von-unterwegs-und-sicherheit)) |

Der Ressourcenbedarf ist gering: Schon 512 MB RAM und wenige hundert MB Speicher reichen. Mehr Speicher brauchst du nur für viele Fotos und Dokumente.

---

## Voraussetzungen

- Ein Server mit **Debian** (empfohlen: Debian 12) oder **Ubuntu**
- Zugriff als `root` oder ein Benutzer mit `sudo`
- Internetverbindung während der Installation
- Der Server und deine Geräte sind im selben Netzwerk, oder du hast einen Zugang von außen eingerichtet (siehe unten)

Python, Virtualenv, `rsync` und alle Python-Pakete installiert das Installationsskript automatisch.

> **Hinweis:** Bist du als `root` angemeldet (z. B. in einem Proxmox-Container), kannst du in allen Befehlen das `sudo` weglassen.

---

## Installation Schritt für Schritt

### Schritt 1 – Am Server anmelden

Melde dich per SSH am Server an (oder öffne direkt die Konsole):

```bash
ssh benutzer@SERVER-IP
```

### Schritt 2 – System aktualisieren

```bash
sudo apt update && sudo apt upgrade -y
```

### Schritt 3 – Git installieren

```bash
sudo apt install -y git
```

### Schritt 4 – ServicePlan herunterladen

```bash
cd ~
git clone https://github.com/HLukas1/ServicePlanApp.git
cd ServicePlanApp
```

Damit liegt der Programmcode in `~/ServicePlanApp`. **Diesen Ordner nicht löschen.** Aus ihm werden später auch die Updates eingespielt.

### Schritt 5 – Installation starten

```bash
sudo ./setup.sh
```

Das Skript erledigt die komplette Einrichtung:

1. installiert Python, Virtualenv und `rsync`
2. legt den Systembenutzer `serviceplan` an
3. kopiert das Programm nach `/opt/serviceplan`
4. richtet die Python-Umgebung ein und installiert die Pakete aus `requirements.txt`
5. erzeugt ein zufälliges **Geräte-Token** und speichert es in `/etc/serviceplan.env`
6. richtet den Systemdienst `serviceplan` ein, der bei jedem Systemstart automatisch startet
7. startet ServicePlan

Am Ende erscheint:

```text
==========================================
ServicePlan wurde erfolgreich installiert.
==========================================
App:     http://<SERVER-IP>:5000
Service: systemctl status serviceplan
Logs:    journalctl -u serviceplan -f
Token:   /etc/serviceplan.env
```

### Schritt 6 – IP-Adresse und Geräte-Token ermitteln

IP-Adresse des Servers:

```bash
hostname -I
```

Geräte-Token anzeigen:

```bash
sudo cat /etc/serviceplan.env
```

Die Ausgabe sieht etwa so aus:

```text
SERVICEPLAN_API_TOKEN=3f9a1c...e72b
```

Das Token ist die lange Zeichenfolge **nach** dem `=`. Du brauchst es gleich in der App.

### Schritt 7 – App öffnen

Im Browser des Handys oder PCs aufrufen, zum Beispiel:

```text
http://192.168.1.100:5000
```

Gib beim ersten Öffnen das **Geräte-Token** ein und tippe auf **Verbinden**. Fertig.

---

## Erste Schritte in der App

1. **Zum Startbildschirm hinzufügen** (optional)
   - *Android / Chrome:* Menü ⋮ → „Zum Startbildschirm hinzufügen“ bzw. „App installieren“
   - *iPhone / Safari:* Teilen-Symbol → „Zum Home-Bildschirm“
2. **Fahrzeug anlegen:** „Fahrzeug hinzufügen“ antippen, Daten und optional Titelbild sowie nächste HU (Monat/Jahr) eintragen.
3. **Wartung eintragen:** Fahrzeug öffnen → „Wartung hinzufügen“. Unter **„Nächste Wartung“** km und/oder Datum eintragen, damit die Startseite rechtzeitig erinnert.
4. **Weitere Geräte verbinden:** Auf jedem Gerät die Adresse öffnen und dasselbe Geräte-Token eingeben.
5. **Vorwarnzeiten anpassen** (optional): ⚙️ Einstellungen → Fälligkeiten.

> **Bitte keine Browserdaten löschen.** Dabei gehen das gespeicherte Geräte-Token und noch nicht übertragene Offline-Änderungen verloren. Updates kommen auch ohne Löschen an (siehe unten).

---

## Updates

Neue Versionen werden über dieses GitHub-Repository bereitgestellt. Ein Update besteht aus zwei Schritten:
1. Mit `git pull` holst du den neuen Programmcode in den Ordner `~/ServicePlanApp`.
2. `update.sh` kopiert ihn nach `/opt/serviceplan` und startet den Dienst neu.

### Update einspielen

**1. (Empfohlen) Vorher die Daten sichern:**

```bash
sudo cp -a /opt/serviceplan/instance ~/serviceplan-backup-$(date +%F)
```

**2. Neue Version herunterladen und installieren:**

```bash
cd ~/ServicePlanApp
git pull
sudo ./update.sh
```

**3. Prüfen, ob alles läuft:** Am Ende zeigt das Skript den Status des Dienstes. Dort sollte `Active: active (running)` stehen.

### Was beim Update passiert

| Wird aktualisiert | Bleibt unverändert |
|---|---|
| Programmdateien (`app.py`, `static/`, `templates/`, …) | Datenbank `/opt/serviceplan/instance/serviceplan.db` |
| Python-Pakete aus `requirements.txt` | Bilder und Dokumente in `/opt/serviceplan/instance/uploads/` |
| | Geräte-Token in `/etc/serviceplan.env` |
| | Python-Umgebung `/opt/serviceplan/venv/` |

Bringt eine neue Version zusätzliche Datenbankfelder mit, werden sie beim Start **automatisch ergänzt**. Bestehende Daten bleiben erhalten.

### Update auf Handy und PC

Auf den Geräten musst du nichts tun. Die App erkennt neue Versionen beim nächsten Öffnen und lädt sie automatisch. Browserdaten zu löschen ist **nicht** nötig.

### Bestehende Installation ohne Git

Wurde ServicePlan ursprünglich ohne `git clone` installiert, z. B. durch Kopieren der Dateien, kannst du jederzeit auf Updates per Git umsteigen:

```bash
sudo apt install -y git rsync
cd ~
git clone https://github.com/HLukas1/ServicePlanApp.git
cd ServicePlanApp
sudo ./update.sh
```

`update.sh` erwartet, dass `/opt/serviceplan` mit der Python-Umgebung `venv/` und der Dienst `serviceplan` bereits existieren. Fehlt eines davon, führe stattdessen einmalig `sudo ./setup.sh` aus. Vorhandene Daten und ein vorhandenes Token bleiben dabei erhalten.

---

## Datensicherung und Wiederherstellung

### Backup in der App (empfohlen)

⚙️ **Einstellungen → Backup herunterladen** erzeugt eine ZIP-Datei mit allen Fahrzeugen, Wartungen, Notizen, Einstellungen, Bildern und Dokumenten.

Speichere das Backup regelmäßig **auf einem anderen Gerät**, z. B. auf dem PC oder einem USB-Stick, und **niemals** im GitHub-Repository.

### Backup auf dem Server

Alle Daten liegen im Ordner `/opt/serviceplan/instance/`. So sicherst du ihn als Archiv:

```bash
sudo tar czf ~/serviceplan-backup-$(date +%F).tar.gz -C /opt/serviceplan instance
```

### Wiederherstellung auf einem neuen Server

1. ServicePlan wie oben beschrieben installieren (Schritte 1–7).
2. Die App öffnen und mit dem neuen Geräte-Token verbinden.
3. ⚙️ **Einstellungen → Backup importieren**, ZIP-Datei auswählen und **Import starten**.

---

## Service verwalten und Fehlersuche

| Aktion | Befehl |
|---|---|
| Status anzeigen | `sudo systemctl status serviceplan` |
| Neu starten | `sudo systemctl restart serviceplan` |
| Stoppen | `sudo systemctl stop serviceplan` |
| Starten | `sudo systemctl start serviceplan` |
| Live-Logs | `sudo journalctl -u serviceplan -f` |
| Letzte 100 Log-Zeilen | `sudo journalctl -u serviceplan -n 100 --no-pager` |

**Häufige Probleme**

- **Die App ist im Browser nicht erreichbar:** Läuft der Dienst (`systemctl status serviceplan`)? Stimmt die IP-Adresse? Blockiert eine Firewall Port `5000`?
- **„Ungültiges oder fehlendes Token“:** Das Token erneut mit `sudo cat /etc/serviceplan.env` anzeigen und nur den Teil nach dem `=` eingeben.
- **Fehlermeldung beim Synchronisieren:** ⚙️ Einstellungen → „Jetzt synchronisieren“. Bleibt der Fehler, die Logs prüfen.
- **`rsync: command not found` beim Update:** `sudo apt install -y rsync` ausführen und das Update wiederholen.

### Verzeichnisse auf dem Server

```text
~/ServicePlanApp/            Programmcode aus GitHub (Quelle für Updates)
/opt/serviceplan/            installiertes Programm
├── instance/                ⚠️ deine Daten – bei Updates unangetastet
│   ├── serviceplan.db       Datenbank
│   └── uploads/             Bilder und Dokumente
└── venv/                    Python-Umgebung
/etc/serviceplan.env         Geräte-Token (geheim halten!)
```

### Geräte-Token ändern

Trage in `/etc/serviceplan.env` einen neuen Wert ein, zum Beispiel einen erzeugt mit:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Danach den Dienst neu starten (`sudo systemctl restart serviceplan`) und auf allen Geräten das neue Token eingeben.

---

## Zugriff von unterwegs und Sicherheit

ServicePlan ist zunächst für das **Heimnetz** eingerichtet und läuft dort unverschlüsselt über `http://…:5000`.

- **Port 5000 nicht direkt ins Internet freigeben** (keine Portweiterleitung am Router). Das Geräte-Token würde sonst unverschlüsselt übertragen.
- Für den Zugriff von unterwegs gibt es zwei sichere Wege:
  - **VPN** ins Heimnetz, z. B. WireGuard (in vielen Routern wie der FRITZ!Box eingebaut) oder Tailscale
  - ein **Reverse-Proxy mit HTTPS**, z. B. Caddy oder nginx, oder ein Cloudflare Tunnel
- Mit HTTPS funktionieren zusätzlich die Installation als App und der Offline-Modus auf allen Geräten vollständig. Viele Browser erlauben das nur über HTTPS.

Nicht in das GitHub-Repository gehören:

```text
/etc/serviceplan.env, .env, SERVICEPLAN_API_TOKEN
*.db, *.sqlite, instance/, uploads/
Backups
```

Die `.gitignore` des Projekts schließt diese Dateien bereits aus.

---

## Technischer Aufbau

| Bereich | Technik |
|---|---|
| Backend | Python, Flask, Flask-SQLAlchemy |
| Datenbank | SQLite (`instance/serviceplan.db`) |
| PDF-Bericht | ReportLab, pypdf |
| Webserver | Gunicorn als systemd-Dienst, Port 5000 |
| Frontend | JavaScript, Single-Page-App, PWA mit Service Worker |
| Offline-Speicher | IndexedDB mit Warteschlange für Änderungen |
| Authentifizierung | Bearer-Token (`SERVICEPLAN_API_TOKEN`) |

### Entwicklung

```bash
git clone https://github.com/HLukas1/ServicePlanApp.git
cd ServicePlanApp
./scripts/check.sh
```

Lokal starten (nur für Tests):

```bash
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
SERVICEPLAN_API_TOKEN=test ./venv/bin/python app.py
```

Danach ist die App unter `http://127.0.0.1:5000` erreichbar (Token: `test`).

Änderungen werden in [`CHANGELOG.md`](CHANGELOG.md) dokumentiert.

---

## Lizenz

ServicePlan steht unter der [MIT-Lizenz](LICENSE).
