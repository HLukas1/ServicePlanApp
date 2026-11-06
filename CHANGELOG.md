# Changelog

## 7.1.0

- Neue Übersicht „Was ist fällig?“ auf der Startseite: überfällige und bald fällige Termine aller Fahrzeuge, farbig markiert.
- Fahrzeugkarten zeigen einen Status (Alles OK / bald fällig / überfällig).
- Neue Karte „Termine“ in der Fahrzeugansicht.
- Neues Feld „Nächste HU“ am Fahrzeug – nur Monat und Jahr wie auf der Plakette, gültig bis Monatsende (inkl. Backup, Import und PDF-Export).
- Wird eine Wartung vom Typ „TÜV“ mit Datum für die nächste Wartung gespeichert, wird der HU-Termin am Fahrzeug automatisch übernommen.
- Bestehende Datenbanken erhalten die neue Spalte beim Start automatisch.
- Schwellen für „bald fällig“ (Tage für Wartungen, km für Wartungen, Tage für HU/TÜV) sind in den Einstellungen anpassbar, werden auf dem Server gespeichert und gelten für alle Geräte. Standard: 30 Tage, 1.000 km, 60 Tage.
- Fehler behoben: Gelöschte Fahrzeuge, Wartungen und Notizen verschwinden sofort (auch offline). Veraltete Einträge in der Sync-Warteschlange (z.B. doppeltes Löschen) blockieren den Sync nicht mehr mit „Nicht gefunden“ und werden automatisch verworfen.
- Updates kommen auf Handy und Browser automatisch an, ohne Browserdaten zu löschen: Startseite wird immer zuerst vom Server geladen, `app.js`/`style.css` tragen eine Versionskennung.

## 7.0.0

- Fahrzeug-Titelbilder werden beim ZIP-Import über `photoAttachmentId` exakt wiederhergestellt.
- Bilder und Dokumente können Fahrzeugen, Wartungen und Notizen zugeordnet werden.
- ZIP-Backup enthält Daten und Anhänge.
- PWA mit Offline-Shell und Synchronisation.
- GitHub-/Deployment-Struktur ergänzt.
- Setup- und Update-Skripte ergänzt.
