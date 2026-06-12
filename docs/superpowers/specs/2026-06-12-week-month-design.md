# Design: Do Week & Do Month als Cockpit

Datum: 2026-06-12 · Status: von Uli freigegeben

## Ziel

Die beiden Platzhalter-Tabs **Do Week** und **Do Month** werden echte Ansichten.
Beide folgen demselben Prinzip („Cockpit"): Habits-Fortschritt, Ziele,
Aufgaben und Termine des Zeitraums auf einen Blick – voll interaktiv
(abhaken und anlegen), wie die Day-Ansicht.

## Entscheidungen (aus dem Brainstorming)

| Frage | Entscheidung |
|---|---|
| Inhalt Do Week | Wochen-Cockpit: Habits-Wochenfortschritt, Ziele, Wochen-Aufgaben; Termine schmal pro Tag |
| Inhalt Do Month | Monats-Cockpit, gleiches Prinzip mit Monatszeitraum |
| Interaktivität | Voll: Aufgaben/Habits abhaken und Aufgaben/Termine anlegen |
| Zeitnavigation | Standard = aktueller Zeitraum; `‹ ›` springt zu Vorwoche/Vormonat (mehrfach), nie in die Zukunft; Tab-Wechsel setzt auf „jetzt" zurück |
| Bauweise | Eine gemeinsame Cockpit-Ansicht (`cockpitView.ts`), Zeitraum als Parameter |

## Aufbau der Ansicht

Kopf: `‹  DIESE WOCHE · 8.–14. Juni  ›` (bzw. „Vorwoche"/„KW n"; Monat: „Juni"/„Mai").

Sektionen, von oben nach unten:

1. **Habits**
   - Woche: pro Habit eine Zeile mit Farbe + Name, 7 Punkte (Mo–So,
     gefüllt = Tag steht im `log`), rechts Zähler „erledigt/Ziel" (`target`).
   - Monat: Balken mit Zahl – täglich: „12 von 30 Tagen";
     wöchentlich: „Ziel 3×/Woche: 11 von 12" (Soll = target × Kalenderwochen im Monat).
   - Abhaken für **heute** direkt am Habit, nur im aktuellen Zeitraum.
     In Vorzeiträumen kein Habit-Abhaken (Vergangenheit bleibt unverändert).
2. **Ziele**: vorhandene Pillen-Balken-Sektion wiederverwendet.
   Ziele haben keine Historie → immer aktueller Stand, auch in Vorzeiträumen.
3. **Aufgaben**: nach Tagen gruppiert; Gruppe „Überfällig" zuoberst
   (fällig vor dem Zeitraum, unerledigt). Aufgaben ohne Fälligkeit gelten
   als „heute dran" (gleiche Regel wie `tasksDueOn` der Day-Ansicht) und
   erscheinen nur, wenn der Zeitraum heute enthält. Abhaken per ☐ immer
   möglich (auch in Vorzeiträumen – überfällige Altlasten!). Anlegen per ＋
   mit dem bekannten Formular **plus Datumsfeld** (vorbelegt: heute).
4. **Termine**: eine schmale Zeile pro Tag, nur Tage mit Terminen
   (`Mo  9:00 Zahnarzt · 14:00 SPD`). Anlegen per ＋ mit Datumsfeld.

Leere Gruppen verschwinden; ganz leerer Zeitraum → Hinweistext
(„Nichts fällig diese Woche").

## Technik

- **Neue Datei `src/ui/cockpitView.ts`**: rendert das Cockpit für einen
  übergebenen Zeitraum. Week/Month unterscheiden sich nur in Zeitraum und
  Beschriftung. `dayView.ts` (~660 Zeilen) wächst dadurch nicht weiter;
  die Week/Month-Platzhalterzweige dort werden durch Aufrufe ersetzt.
- **Rechenlogik in `src/services/selectors.ts`** (pure Funktionen, TDD):
  - `weekRange(offset)` / `monthRange(offset)` → `{ start, end }` (Mo–So bzw. 1.–Letzter)
  - `habitDoneInRange(habit, range)` → erledigte Tage im Zeitraum
  - `tasksByDay(tasks, range, today)` → Gruppen inkl. „Überfällig"
  - `eventsByDay(events, range)` → Tage mit Terminen
- **State**: neues Feld `periodOffset: number` (0 = aktuell, −1 = davor …,
  nie > 0). Tab-Wechsel setzt es auf 0.
- **Datenfluss**: `agendaRange()` in `main.ts` liefert je nach `state.view`
  + `periodOffset` den Zeitraum; Umschalten/Springen ruft `reloadAgenda()`.
  Der Server-Endpunkt `/api/v1/agenda` kann bereits beliebige Zeiträume –
  **keine Server-Änderung**. (Termine filtert der Server nach Zeitraum;
  Aufgaben liefert er komplett – daher ist die Überfällig-Gruppe ohne
  Zusatzabfrage möglich.) Habits/Ziele kommen wie bisher aus
  `achievements.json` (liegt schon im State, kein Nachladen).
- **Events/Interaktionen**: bestehende Event-Delegation in `main.ts`
  (abhaken, anlegen, Zahnrad) wird um `switch-period` (‹ ›) und die
  Datumsfelder der ＋-Formulare erweitert.

## Fehlerfälle

- Agenda-Laden schlägt fehl → vorhandene sync-note-Mechanik.
- Zeitzonen: Tageszuordnung über vorhandenes `localDateOf` (UTC → lokal).

## Tests

Alle neuen selectors-Funktionen TDD (Wochengrenzen über Monats-/Jahreswechsel,
Offset-Grenzfall „nie in die Zukunft", Habit-Zählung daily vs. weekly,
Überfällig-Gruppe, Aufgaben ohne Datum nur bei „Zeitraum enthält heute").
UI wie bisher: Logik ausgelagert, Rendering schlank.

## Nicht in diesem Schritt (YAGNI)

- Kein Blättern in die Zukunft, kein Datums-Picker.
- Kein Drag & Drop (separates Konzept: docs/verschieben-konzept.md).
- Keine Ziel-Historie (Ziele zeigen immer den aktuellen Stand).
