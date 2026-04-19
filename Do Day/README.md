# Do Day – Minimalistische iOS To-Do/Journal App

## ✅ Phase 1 – ABGESCHLOSSEN

### Projektstruktur erstellt

```
Do Day/
├── Models/
│   ├── TimeScope.swift              ✅ Enum: today, week, monthYear
│   ├── JournalEntry.swift           ✅ Journal-Einträge mit Frontmatter
│   └── HabitEntry.swift             ✅ Habits + Completions (max. 5-7)
│
├── Views/
│   ├── HomebarView.swift            ✅ 3 Buttons (50/25/25%)
│   ├── TodayView.swift              ✅ Heute-Ansicht (Platzhalter)
│   ├── WeekView.swift               ✅ Wochenansicht mit Swipe
│   ├── MonthYearView.swift          ✅ Monat/Jahr-Toggle
│   └── ActionBarView.swift          ✅ 4 feste Button-Positionen
│
├── Components/
│   └── FocusLineTextEditor.swift    ✅ Custom UITextView (17pt/11pt)
│
├── Services/
│   ├── CalendarService.swift        ✅ EventKit Kalender-Integration
│   ├── ReminderService.swift        ✅ EventKit Reminders-Integration
│   ├── HabitService.swift           ✅ Habit-Verwaltung (lokal)
│   ├── NotificationService.swift    ✅ UserNotifications
│   ├── MarkdownService.swift        ✅ .md-Generierung (Obsidian)
│   └── WebDAVService.swift          ✅ Nextcloud-Sync
│
├── Config/
│   └── NextcloudConfig.swift        ✅ Keychain-Integration
│
└── App/
    ├── Do_DayApp.swift              ✅ App Entry Point
    └── ContentView.swift            ✅ Haupt-UI (alle Views integriert)
```

---

## 📋 Features-Übersicht

### ✅ Implementiert (Grundgerüst)

1. **TimeScope-Enum**
   - Drei Modi: Heute, Woche, Monat/Jahr
   - Display- und Kurznamen

2. **Models**
   - `JournalEntry`: Markdown mit YAML Frontmatter
   - `Habit`: Name, Icon, Farbe, Sortierung
   - `HabitCompletion`: Tägliches Tracking

3. **UI-Komponenten**
   - `HomebarView`: 3 Buttons mit korrekten Proportionen (50/25/25%)
   - `ActionBarView`: 4 kontextabhängige Button-Positionen
   - `TodayView`, `WeekView`, `MonthYearView`: Content-Views mit Platzhaltern
   - `FocusLineTextEditor`: Custom UITextView mit Fokus-Schriftgröße

4. **Services**
   - `CalendarService`: EventKit-Wrapper für Kalender (CalDAV)
   - `ReminderService`: EventKit-Wrapper für Erinnerungen
   - `HabitService`: Lokales Habit-Tracking (habits.json)
   - `NotificationService`: Morgen/Abend/Wochen-Reminder
   - `MarkdownService`: Obsidian-kompatible .md-Generierung
   - `WebDAVService`: Nextcloud Upload/Download

5. **Config**
   - `NextcloudConfig`: Keychain-Integration für Credentials

---

## 🔜 Nächste Schritte

### Phase 2 – Custom Texteditor verfeinern
- [ ] FocusLineTextEditor testen auf iPhone X, 17, 17 Pro Max
- [ ] Rahmen im "Display-Ausschnitt"-Stil optimieren
- [ ] Touch-Kompatibilität sicherstellen (Schriftgröße 17pt)

### Phase 3 – Kalender & Erinnerungen
- [ ] Info.plist Einträge hinzufügen:
  - `NSCalendarsUsageDescription`
  - `NSCalendarsFullAccessUsageDescription`
  - `NSRemindersUsageDescription`
  - `NSRemindersFullAccessUsageDescription`
- [ ] TodayView: Echte Events anzeigen
- [ ] WeekView: Echte Events anzeigen
- [ ] Text-Parsing: "Arzt 14:00" → Event erstellen
- [ ] Erinnerungen aus Textfeld erstellen

### Phase 4 – Journal (Markdown/Nextcloud)
- [ ] Nextcloud-Login-Screen
- [ ] Markdown-Dateien lokal speichern (FileManager)
- [ ] WebDAV-Sync beim App-Start (Download)
- [ ] WebDAV-Sync beim App-Verlassen (Upload)
- [ ] Jahr-Ordner automatisch erstellen

### Phase 5 – Habit Tracker
- [ ] TodayView: Habit-Liste anzeigen (aus HabitService)
- [ ] Habit abhaken (Button 4)
- [ ] Habit-Konfigurations-Screen (Hinzufügen/Löschen/Bearbeiten)
- [ ] Max. 5-7 Habits Limit enforced

### Phase 6 – Benachrichtigungen & Polish
- [ ] Morgen-Reminder aktivieren (8:00 Uhr)
- [ ] Abend-Reminder aktivieren (20:00 Uhr)
- [ ] Wochen-Review-Reminder (Sonntag 19:00 Uhr)
- [ ] MonthYearView: Monat/Jahr Toggle funktional
- [ ] WeekView: Swipe-Geste perfektionieren
- [ ] Do Day-Button Styling (Keyboard-Taste-Look)

---

## 🎨 UI-Regeln

### Textfeld
- **Aktive Zeile**: 17pt (Touch-kompatibel)
- **Inaktive Zeilen**: 11pt (~66%)
- **Mindesthöhe**: 120pt (3-4 Zeilen)
- **Rahmen**: "Display-Ausschnitt"-Stil

### ActionBar
- 4 **feste** Positionen (immer gleich)
- Leere Positionen = komplett leer (kein Icon/Button)

| Position | Heute | Woche | Monat/Jahr |
|---|---|---|---|
| 1 | 📅 Termin | 📅 Termin | _(leer)_ |
| 2 | ✓ Aufgabe | ✓ Aufgabe | _(leer)_ |
| 3 | 📓 Journal | 📓 Review | 📓 Review |
| 4 | ● Habit | _(leer)_ | _(leer)_ |

### Homebar
- Heute: **50%** Breite
- Woche: **25%** Breite
- Monat/Jahr: **25%** Breite

---

## 🗂 Dateistruktur (Nextcloud/Obsidian)

```
/Notes/Journal/
├── 2026/
│   ├── 2026-04-19.md       ← Tagesnotiz
│   ├── 2026-W16.md         ← Wochennotiz (ISO-Woche)
│   ├── 2026-04.md          ← Monatsnotiz
│   └── 2026.md             ← Jahresnotiz
└── habits.json             ← Habit-Daten
```

### Markdown-Format
```markdown
---
date: 2026-04-19
scope: day
tags: [journal]
---

# Sonntag, 19. April 2026

## Heute Morgen
...
```

---

## 🔐 Sicherheit

- **Credentials**: Keychain (NextcloudConfig)
- **Keine Klartext-Passwörter**: Nur in-memory
- **WebDAV**: Basic Auth über HTTPS

---

## 🚀 Build & Run

1. Xcode öffnen
2. Target: iPhone 17 Pro Max / iPhone X
3. Berechtigungen erlauben (Kalender, Erinnerungen, Notifications)
4. Testen auf verschiedenen Bildschirmgrößen

---

## 🌍 Zukunft: Windows & Android

### Windows
- **Framework**: .NET MAUI oder Flutter
- **WebDAV**: HttpClient
- **Kalender**: Microsoft Graph API (Outlook/CalDAV)

### Android
- **Framework**: Jetpack Compose oder Flutter
- **WebDAV**: OkHttp / Sardine (WebDAV-Library)
- **Kalender**: CalendarContract API

### Shared Logic
- Markdown-Service (plattformübergreifend)
- WebDAV-Service (plattformübergreifend)
- Habit-Logik (plattformübergreifend)

---

## 📝 Notizen

- **EventKit**: Liest CalDAV-Kalender automatisch (keine eigene Sync-Logik!)
- **Konfliktlösung**: Server gewinnt (einfach halten)
- **Habit-Limit**: Max. 5-7 aktive Habits
- **Sprache**: Deutsch (Kommentare + UI)

---

**Status**: ✅ Phase 1 abgeschlossen
**Nächster Schritt**: Phase 2 – FocusLineTextEditor testen & verfeinern
