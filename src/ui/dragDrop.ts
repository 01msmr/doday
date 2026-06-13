// Kleine Drag-&-Drop-Engine auf Basis von Pointer Events.
//
// Warum nicht die native HTML-Drag-API? Auf iOS-Safari ist sie unzuverlässig.
// Pointer Events behandeln Maus UND Finger gleich – ein Code-Weg für beide.
//
// Die Engine kennt KEINE Aufgaben oder Bereiche. Sie erkennt Greifer
// (`data-drag`) und Ablageziele (`data-drop`), zeigt während des Ziehens einen
// Geist-Klon und meldet beim Loslassen über einem gültigen Ziel per onDrop:
//   { dragKind, id, from, dropKind, path }
// Was damit geschieht, entscheidet der Aufrufer (main.ts).

/** Fakten, die beim Loslassen über einem gültigen Ziel an den Aufrufer gehen */
export interface DropInfo {
  /** Wert von data-drag am Greifer, z. B. "task" oder "area" */
  dragKind: string;
  /** data-id am Greifer (z. B. Aufgaben-ID) */
  id?: string;
  /** data-from am Greifer (z. B. Quell-Bereichspfad einer Aufgabe) */
  from?: string;
  /** Wert von data-drop am Ziel, z. B. "area" */
  dropKind: string;
  /** data-path am Ziel (z. B. Ziel-Bereichspfad) */
  path?: string;
}

/** Welche Greifer-Art darf auf welche Ablage-Art? Alles andere wird ignoriert. */
const ACCEPTS: Record<string, string[]> = {
  task: ['area'], // Aufgabe → Bereich
  area: ['area'], // Bereich → anderer Bereich (umsortieren)
};

/** Maus: ab so vielen Pixeln Bewegung beginnt das Ziehen */
const MOUSE_THRESHOLD = 8;
/** Touch: so lange gedrückt halten, bis das Ziehen startet (kurzes Wischen scrollt) */
const TOUCH_LONGPRESS_MS = 250;
/** Touch: bewegt sich der Finger vorher weiter, war es kein Greifen → abbrechen */
const TOUCH_CANCEL_MOVE = 10;

export function initDragDrop(root: HTMLElement, onDrop: (info: DropInfo) => void): void {
  // Zustand eines laufenden bzw. sich anbahnenden Ziehens
  let dragEl: HTMLElement | null = null; // das Greifer-Element (data-drag)
  let sourceBox: HTMLElement | null = null; // geklonte/gedimmte Zeile bzw. Kopf
  let ghost: HTMLElement | null = null; // der schwebende Klon
  let dropTarget: HTMLElement | null = null; // aktuell hervorgehobenes Ziel
  let pointerId = -1;
  let startX = 0;
  let startY = 0;
  let offsetX = 0; // Abstand Zeiger → linke obere Ecke des Klons
  let offsetY = 0;
  let isTouch = false;
  let started = false; // läuft das Ziehen schon (nach Schwelle/Long-Press)?
  let longPressTimer = 0;
  let kindClass = ''; // z. B. "drag-area" – steuert die Ziel-Optik im CSS

  /** Akzeptiert die aktuelle Greifer-Art dieses Ablageziel? (und ist es nicht der Ursprung) */
  function isValidTarget(el: Element | null): el is HTMLElement {
    if (!(el instanceof HTMLElement) || !dragEl) {
      return false;
    }
    const dropKind = el.dataset.drop;
    if (!dropKind || !ACCEPTS[dragEl.dataset.drag ?? '']?.includes(dropKind)) {
      return false;
    }
    // Der eigene Kopf (Bereich auf sich selbst) ist kein Ziel
    return el !== sourceBox;
  }

  /** Das beste Ablageziel unter dem Zeiger finden (Geist blockiert nicht, pointer-events:none) */
  function targetAt(x: number, y: number): HTMLElement | null {
    const el = document.elementFromPoint(x, y)?.closest('[data-drop]') ?? null;
    return isValidTarget(el) ? el : null;
  }

  function highlight(next: HTMLElement | null): void {
    if (next === dropTarget) {
      return;
    }
    dropTarget?.classList.remove('drop-target');
    next?.classList.add('drop-target');
    dropTarget = next;
  }

  /** Geist erzeugen, Original dimmen – ab hier zieht der Nutzer sichtbar */
  function beginDrag(x: number, y: number): void {
    const handle = dragEl;
    if (!handle) {
      return;
    }
    started = true;
    // Schöner Geist: nicht den Mini-Greifer klonen, sondern die ganze Zeile/den Kopf
    const box = (handle.closest('li, summary') as HTMLElement | null) ?? handle;
    sourceBox = box;
    const rect = box.getBoundingClientRect();
    offsetX = x - rect.left;
    offsetY = y - rect.top;

    ghost = box.cloneNode(true) as HTMLElement;
    ghost.classList.add('drag-ghost');
    ghost.style.width = `${rect.width}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    document.body.append(ghost);

    box.classList.add('drag-source');
    document.body.classList.add('dragging'); // sperrt Textauswahl global
    // Zieh-Art an den Body: erlaubt unterschiedliche Ziel-Optik je Art
    // (Aufgabe = Ziel hervorheben, Bereich = Einfügelinie darüber).
    kindClass = handle.dataset.drag ? `drag-${handle.dataset.drag}` : '';
    if (kindClass) {
      document.body.classList.add(kindClass);
    }
  }

  function moveGhost(x: number, y: number): void {
    if (ghost) {
      ghost.style.left = `${x - offsetX}px`;
      ghost.style.top = `${y - offsetY}px`;
    }
  }

  /** Alles zurücksetzen – egal ob nach Drop, Snap-back oder Abbruch */
  function cleanup(): void {
    window.clearTimeout(longPressTimer);
    ghost?.remove();
    sourceBox?.classList.remove('drag-source');
    highlight(null);
    document.body.classList.remove('dragging');
    if (kindClass) {
      document.body.classList.remove(kindClass);
      kindClass = '';
    }
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey);
    dragEl = sourceBox = ghost = null;
    pointerId = -1;
    started = false;
  }

  function onMove(event: PointerEvent): void {
    if (event.pointerId !== pointerId) {
      return;
    }
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (!started) {
      const dist = Math.hypot(dx, dy);
      if (isTouch) {
        // Vor dem Long-Press zu weit gewischt → es war Scrollen, nicht Greifen
        if (dist > TOUCH_CANCEL_MOVE) {
          cleanup();
        }
        return; // Touch startet ausschließlich über den Timer
      }
      if (dist >= MOUSE_THRESHOLD) {
        beginDrag(event.clientX, event.clientY);
      } else {
        return;
      }
    }

    event.preventDefault();
    moveGhost(event.clientX, event.clientY);
    highlight(targetAt(event.clientX, event.clientY));
  }

  function onUp(event: PointerEvent): void {
    if (event.pointerId !== pointerId) {
      return;
    }
    const target = started ? targetAt(event.clientX, event.clientY) : null;
    if (started && target && dragEl) {
      suppressNextClick(); // ein Drop auf einem Bereichskopf soll ihn nicht auf-/zuklappen
      onDrop({
        dragKind: dragEl.dataset.drag!,
        id: dragEl.dataset.id,
        from: dragEl.dataset.from,
        dropKind: target.dataset.drop!,
        path: target.dataset.path,
      });
    }
    cleanup();
  }

  function onCancel(event: PointerEvent): void {
    if (event.pointerId === pointerId) {
      cleanup();
    }
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      cleanup();
    }
  }

  /** Den unmittelbar folgenden Klick einmal schlucken (sonst toggelt das <details>) */
  function suppressNextClick(): void {
    const swallow = (e: Event): void => {
      e.stopPropagation();
      e.preventDefault();
      window.removeEventListener('click', swallow, true);
    };
    window.addEventListener('click', swallow, true);
    // Sicherheitsnetz: feuert kein Klick, hängt der Listener nicht ewig
    window.setTimeout(() => window.removeEventListener('click', swallow, true), 400);
  }

  root.addEventListener('pointerdown', (event) => {
    const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-drag]');
    if (!handle || event.button !== 0) {
      return;
    }
    dragEl = handle;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    isTouch = event.pointerType === 'touch';
    started = false;

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);

    if (isTouch) {
      // Long-Press: erst nach dem Halten wird gezogen
      longPressTimer = window.setTimeout(() => beginDrag(startX, startY), TOUCH_LONGPRESS_MS);
    }
  });
}
