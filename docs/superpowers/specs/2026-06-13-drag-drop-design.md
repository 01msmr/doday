# Design: Drag & Drop (Aufgabe → Bereich, Bereiche umsortieren)

Datum: 2026-06-13 · Status: von Uli freigegeben

## Ziel & Umfang

Per Ziehen verschieben — auf **Desktop und Mobile**:
1. **Aufgabe → anderer Bereich:** Klartext-Tag im `rawText` tauschen, sofort
   sichtbar, nach Nextcloud geschrieben (`updateTask`).
2. **Top-Level-Bereiche umsortieren:** `order` in der Tag-Registry ändern,
   nach Nextcloud geschrieben (`persistTags`).

**Nicht dabei (bewusst):** Datum-Drop (Day/Morrow), Unterbereiche umsortieren,
Tastatur-/Screenreader-Fallback-Menü, Rückgängig-Snackbar. Grundregel bleibt:
**`rawText` ist die Wahrheit.**

## Technik

**Pointer Events** (nicht die native HTML-Drag-API – auf iOS-Safari
unzuverlässig). Eigene kleine Engine in `src/ui/dragDrop.ts`.

- Greifer-Elemente tragen `data-drag="<kind>"` (+ `data-id`/`data-path`/`data-from`),
  Ablageziele `data-drop="<kind>"` (+ `data-path`).
- **Start:** Touch = Long-Press ~250 ms (kurzes Wischen scrollt weiter);
  Maus = ab ~8 px Bewegung.
- **Während:** Geist-Element (Klon) folgt dem Zeiger, Original `opacity: .4`;
  `document.elementFromPoint` ermittelt das Ziel unter dem Zeiger; gültiges
  `[data-drop]` bekommt Klasse `drop-target` (Akzent-Umrandung).
- **Ende:** `pointerup` über gültigem Ziel → `onDrop({dragKind, id, from, dropKind, path})`;
  sonst Snap-back (Geist entfernen, Original zurück). `Escape`/`pointercancel`
  bricht ab. `touch-action: none` auf Greifern, damit der Browser nicht scrollt,
  sobald gezogen wird.

## Greifer & Ziele in der UI

- **Aufgabenzeile** (`renderTask`): zusätzlicher Greifer `⠿`
  (`data-drag="task" data-id data-from="<Quell-Bereichspfad>"`), links,
  getrennt vom Abhak-Button (Klick auf den Greifer hakt NICHT ab).
- **Bereichskopf** (`.area-head` in `renderArea`): bekommt
  `data-drop="area" data-path` (Ziel für Aufgaben) **und**
  `data-drag="area" data-path` (zum Umsortieren). Beim Umsortieren ist jeder
  andere Top-Level-Bereichskopf ein Ziel.

Day-, Morrow- und Cockpit-Aufgaben nutzen denselben `renderTask` → Greifer
überall verfügbar. (Cockpit-Bereiche existieren nicht als `details`-Gruppen;
dort gilt zunächst nur Aufgabe-Greifer ohne Bereich-Ziel – Bereich-Drop nur
in Day/Morrow, wo die Bereichsgruppen gerendert werden.)

## Pure Logik (TDD)

In `src/services/dragMove.ts`:

- `retagTask(rawText, fromPath, toPath, resolve): string`
  - Findet im `rawText` den Tag, dessen kanonischer Pfad `=== fromPath` ist,
    und ersetzt ihn durch `#toPath`. Kein Treffer (tag-lose Aufgabe) → `#toPath`
    anhängen. Danach `normalizeText` (Tags ans Ende, Whitespace normalisiert).
  - `resolve` = `(tag) => registry.resolve(tag)?.path` (Alias → kanonisch).
- `reorderTopAreas(orderedPaths, moved, target): {path, order}[]`
  - Aus der aktuellen Reihenfolge `moved` entfernen, **vor** `target` einfügen,
    neue `order`-Werte `index * 10` für alle vergeben.

Registry-Erweiterung: `setOrder(path: string, order: number): void`.

## Datenfluss (optimistic, bestehende Muster)

- **Aufgabe verschoben:** im Zustand `task.rawText` neu setzen, Tags neu parsen
  (`title`/`tags` aktualisieren), Ziel-Tag in Registry aufnehmen
  (`registerTitleTags`), rerender; im Hintergrund `updateTask(href, neuerTitel)`.
  Fehler → sync-note + `reloadAgenda`.
- **Bereiche umsortiert:** `registry.setOrder` für alle betroffenen Pfade,
  rerender; `queue(persistTags)`. Konflikt/Fehler → bestehende Logik in
  `persistTags`.

## Randfälle

- Drop auf denselben Bereich / dieselbe Position → No-Op.
- Aufgabe ohne `href` (sollte es real nicht geben) → nur lokal, kein Schreiben.
- Aufgabe ohne Tag → Tag anhängen.
- Umsortieren nur Top-Level (Bereichsköpfe mit Pfad ohne `.`); Drop eines
  Unterbereichs-Kopfes startet kein Reorder.

## Tests

- `retagTask`: Tag ersetzen (exakter Pfad, Alias, andere Schreibweise),
  Mehrfach-Tags (nur Quelltag tauschen), tag-lose Aufgabe (anhängen),
  Normalisierung am Ende.
- `reorderTopAreas`: nach oben/unten verschieben, an den Anfang, Ziel == bewegt
  (No-Op), Reihenfolge-Werte fortlaufend.
- Engine bleibt ungetestet (DOM/Pointer) – dünn halten, Logik ausgelagert.

## Phasen der Umsetzung

1. `retagTask` + `reorderTopAreas` + `setOrder` (TDD).
2. `dragDrop.ts`-Engine.
3. Greifer/Ziele in `renderTask`/`renderArea` + CSS (Geist, `drop-target`,
   gedimmtes Original).
4. Verdrahtung in `main.ts` (onDrop → Zustand + Persistenz).
