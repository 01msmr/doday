# Design: Manueller Reload per Doppeltipp auf den Header

Datum: 2026-07-04 · Status: von Uli freigegeben

## Ziel & Umfang

Pull-to-refresh ist bewusst deaktiviert (bleibt so), Schließen/Neuöffnen der
PWA ist zu langsam. Bedarf: ein schneller Weg, extern geänderte Inhalte (z. B.
nach einem manuellen Eingriff an `tags.json`/`achievements.json` direkt in
Nextcloud) in die laufende App zu holen, ohne die Seite komplett neu zu laden.

- **Auslöser:** Doppeltipp auf den Header (`renderMasthead`), der auf jeder
  Ansicht vorhanden ist (Day, Woche/Monat-Cockpit, UN:DONE).
- **Umfang:** lädt konsequent **alles** neu (Habits, Achievements, Tag-Registry,
  Agenda) – wie beim App-Start, nicht nur die Agenda.
- **Nicht dabei:** kein neues Icon/kein Button, keine Mobile-Beschränkung
  (Doppelklick auf Desktop funktioniert genauso).

## Auslösung

Gleiches Zeitfenster-Muster wie beim bestehenden Doppeltipp auf „DO DAY"
(`main.ts:1222`, dort per `lastDayTap` + 350 ms): neue Variable
`lastMastheadTap`, neuer Zweig im bestehenden
`root.addEventListener('click', …)` für `action === 'reload-all'`.

`data-action="reload-all"` kommt auf das `<header class="masthead">`-Element
in `renderMasthead()` (`src/ui/dayView.ts`) – ein einziger Änderungspunkt, gilt
automatisch für alle Views, die die Funktion nutzen (Day, Cockpit, UN:DONE).
Der Header hat aktuell keinen Klick-Handler, also kein Konflikt mit
bestehendem Verhalten.

## Neuer Zustand: `state.syncing`

`state.loading` bleibt exklusiv dem App-Start vorbehalten – es blendet aktuell
die **komplette Seite** aus (`dayView.ts:841`, `buildPageHtml`: früher Return
mit nur Header + „Lädt…"). Für einen Reload während der Nutzung wäre das zu
disruptiv (Aufgabenliste verschwindet kurz komplett).

Stattdessen: separates Flag `state.syncing`. Die bestehende
`busy`-Berechnung (`dayView.ts:851`: `state.loading || Boolean(state.syncError)`,
analog in `cockpitView.ts`) wird um `state.syncing` erweitert – zeigt den
vorhandenen Header-Spinner kurz an, ohne die Seite auszublenden.

## Ablauf (`main.ts`)

```ts
async function manualReload(): Promise<void> {
  state.syncing = true;
  rerender();
  await boot(false); // Habits/Achievements/Tags/Agenda neu; setzt state.syncError bei Fehlern
  state.syncing = false;
  rerender();
}
```

Nutzt die bestehende Fehlerbehandlung aus `boot()` (`state.syncError`,
bestehende Toast-Anzeige) – kein neuer Fehlermechanismus. `state.view` und
`state.periodOffset` bleiben unangetastet (kein Sprung zu „heute").

## CSS

`.masthead { user-select: none; }` – verhindert ein Textmarkierungs-Flackern
beim schnellen Doppeltipp/Doppelklick.

## Randfälle

- Doppeltipp während ein `manualReload()` noch läuft: bewusst **kein**
  Schutz/Queue. `boot()` liest nur (schreibt nichts), ein zweiter,
  überlappender Aufruf kann höchstens zu einer kurzen doppelten
  Netzwerk-Anfrage führen, keine Dateninkonsistenz – overkill, das extra
  abzufangen.
- Kein Mobile-Only-Filter wie bei der Gesten-Demo (dort bewusst
  `singleColumn.matches`) – hier soll es überall funktionieren.

## Tests

Reine DOM-Verdrahtung (Event-Delegation + Wiederverwendung von `boot()`),
analog zur bereits ungetesteten Doppeltipp-Demo-Verdrahtung. Kein
zusätzlicher automatisierter Test vorgesehen; manuelle Prüfung im Browser
(Doppeltipp auf Header → Spinner kurz sichtbar → Daten aktualisiert).

## Umsetzung (Phasen)

1. `state.syncing`-Feld + `manualReload()` in `main.ts`.
2. `busy`-Berechnung in `dayView.ts`/`cockpitView.ts` um `state.syncing`
   erweitern.
3. `data-action="reload-all"` auf den Header in `renderMasthead()` +
   Klick-Handler-Zweig (Doppeltipp-Timing wie „DO DAY").
4. CSS: `user-select: none` auf `.masthead`.
