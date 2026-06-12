# Konzept: Dinge verschieben (Drag & Drop)

Stand: 2026-06-12 · Status: Konzept, noch nicht umgesetzt

## Was soll sich verschieben lassen?

| Was                        | Wohin                          | Effekt im Datenmodell                              |
| -------------------------- | ------------------------------ | -------------------------------------------------- |
| Aufgabe                    | anderer Bereich (Bereichskopf) | Tag im `rawText` tauschen + `normalizeText`         |
| Aufgabe                    | Nav-Taste „Do Morrow"/„Do Day" | `due`-Datum ändern                                  |
| Bereich (Kopfzeile)        | über/unter anderen Bereich     | `order` in der Tag-Registry                         |
| Gewohnheit (Kreis)         | innerhalb der Reihe            | neue Reihenfolge in `achievements.json`             |

Grundregel bleibt: **`rawText` ist die Wahrheit.** Verschieben in einen
Bereich heißt Klartext-Tag ersetzen – sichtbar in Nextcloud, iOS, Obsidian.

## Technik-Entscheidung

**Pointer Events statt HTML-Drag&Drop-API.** Die native API ist auf
iOS-Safari/Touch unzuverlässig. Stattdessen:

1. `pointerdown` auf einem Greifer (⠿) startet die Beobachtung
2. ab ~8 px Bewegung (bzw. Long-Press auf Touch, um Scrollen nicht zu stören):
   Geist-Element unterm Finger, Original halbtransparent
3. `document.elementFromPoint()` findet das Drop-Ziel; gültige Ziele
   (`[data-drop]`) bekommen eine Akzent-Umrandung
4. `pointerup` über einem Ziel → Aktion ausführen, sonst zurückfedern

## Bedienbarkeit & Sicherheit

- **Fallback ohne Drag:** „⋯"-Menü je Aufgabe mit „Verschieben nach …"
  (auch für Tastatur/Screenreader)
- **Optimistic UI + Rückgängig:** Änderung sofort anzeigen, dezente
  Snackbar „Verschoben nach #Arbeit · Rückgängig"
- Während Phase 2/3 gilt: erst lokal, mit Persistenz sobald
  CalDAV-Schreiben (Aufgaben) bzw. Registry-Write-back (Reihenfolge) steht

## Phasierung

1. **M1:** Aufgabe → Bereich (lokal, Mock-Daten)
2. **M2:** Persistenz über CalDAV (Phase 3 nötig)
3. **M3:** Bereiche sortieren (Registry `order` + Write-back)
4. **M4:** Aufgabe → anderer Tag über Nav-Tasten
