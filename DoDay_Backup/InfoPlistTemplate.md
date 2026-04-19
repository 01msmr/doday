# Info.plist Einträge für Do Day

Folgende Einträge müssen in die Info.plist eingefügt werden (Phase 3):

## Kalender-Berechtigungen

```xml
<key>NSCalendarsUsageDescription</key>
<string>Do Day benötigt Zugriff auf deinen Kalender, um Termine anzuzeigen.</string>

<key>NSCalendarsFullAccessUsageDescription</key>
<string>Do Day benötigt vollen Zugriff auf deinen Kalender, um Termine anzuzeigen und zu erstellen.</string>
```

## Erinnerungs-Berechtigungen

```xml
<key>NSRemindersUsageDescription</key>
<string>Do Day benötigt Zugriff auf deine Erinnerungen, um Aufgaben anzuzeigen.</string>

<key>NSRemindersFullAccessUsageDescription</key>
<string>Do Day benötigt vollen Zugriff auf deine Erinnerungen, um Aufgaben anzuzeigen und zu erstellen.</string>
```

## HINWEIS

UserNotifications benötigt **keinen** Info.plist-Eintrag.
Die Berechtigung wird zur Laufzeit via `requestAuthorization()` angefordert.

---

## Wie einfügen?

1. In Xcode: Projekt auswählen
2. Target "Do Day" auswählen
3. Tab "Info" öffnen
4. Auf "Custom iOS Target Properties" klicken
5. Rechtsklick → "Add Row"
6. Keys wie oben einfügen
7. Values (die Strings) entsprechend anpassen

**Alternativ**: Info.plist als XML öffnen und direkt einfügen.
