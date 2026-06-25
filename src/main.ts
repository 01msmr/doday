// Einstiegspunkt: Zustand aufbauen, Nextcloud-Daten laden, Interaktionen verdrahten.
//
// Datenfluss (optimistic UI):
//   Klick → Zustand sofort ändern + neu rendern → Speichern läuft im Hintergrund.
// Die Speicher-Warteschlange (queue) sorgt dafür, dass sich schnelle Klicks
// nicht gegenseitig überholen. Bei einem ETag-Konflikt (extern geändert)
// wird die eigene Änderung einmal erneut angewendet, danach ehrlich neu geladen.
import './style.css';
// Font Awesome (lokal gebündelt, kein CDN): liefert u. a. das Zahnrad
import '@fortawesome/fontawesome-free/css/fontawesome.css';
import '@fortawesome/fontawesome-free/css/solid.css';
import {
  ApiConflictError,
  createEvent,
  createTask,
  deleteTask,
  loadAchievements,
  loadAgenda,
  loadTagRegistry,
  saveAchievements,
  saveTagRegistry,
  toggleTask,
  updateEvent,
  updateTask,
} from './services/api';
import { normalizeText, parseTags, replaceTagPrefix } from './services/tagService';
import { applyTag, suggestTags, type TagSuggestion } from './services/tagSuggest';
import { monthRange, weekRange } from './services/selectors';
import { InMemoryTagRegistry } from './services/tagRegistry';
import { retagTask, untagTask, reorderTopAreas } from './services/dragMove';
import { buildEventIcs } from './services/ics';
import { renderApp, buildPageHtml, type AppState, type ViewId } from './ui/dayView';
import { initDragDrop, type DropInfo } from './ui/dragDrop';
import { isoDate, shiftDays } from './utils/dates';
import { t, toggleLang } from './i18n';
import { DEFAULT_HABIT_COLOR, type Habit } from './models/types';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('Element #app fehlt in index.html');
}

const state: AppState = {
  data: { events: [], tasks: [], habits: [], achievements: [] },
  registry: new InMemoryTagRegistry(),
  loading: true,
  syncError: null,
  view: 'day',
  periodOffset: 0,
  filterArea: null,
  editing: null,
  editingHabits: false,
  creatingEvent: false,
  creatingTask: false,
  editingTask: null,
  editingEvent: null,
  mobileColumn: 'main',
  collapsed: new Set(),
};

/** Mobile-Spalte wechseln (Knopf wie Wisch) – inkl. einmaliger Slide-Animation. */
function switchMobileColumn(next: 'main' | 'side'): void {
  if (state.mobileColumn === next) {
    return;
  }
  state.mobileColumn = next;
  state.columnAnim = next === 'side' ? 'to-side' : 'to-main';
  rerender();
  state.columnAnim = null; // Flag nur für diesen einen Render – danach wieder ruhig
}

/** Reihenfolge der Tabs für den Kanten-Wisch (mit Umlauf). */
const VIEW_ORDER: ViewId[] = ['day', 'morrow', 'week', 'month', 'undone'];

/** Tab wechseln (Klick wie Wisch): Zeitraum zurück auf jetzt, dann frische Daten. */
function goToView(next: ViewId): void {
  if (next === state.view) {
    return;
  }
  state.view = next;
  state.periodOffset = 0; // Tab-Wechsel landet immer im Jetzt
  rerender(); // sofort zeigen – die frischen Daten folgen gleich
  refreshAgenda(); // Zeitfenster hat sich geändert → passende Daten holen
}

/* ---------- Kanten-Wisch-Vorschau („billiges" Finger-Follow-Paging) ----------
   Die aktuelle Seite (Live-DOM) folgt per transform dem Finger; von der Gegenseite
   schiebt ein STATISCHER Snapshot der Zielansicht herein (einmal beim Wisch-Start
   gerendert, nicht interaktiv) – leicht verschwommen (liest sich als Inhalt UND als
   Bewegungs-Unschärfe; scharf wird er erst beim Ankommen). Beim Commit rendert
   goToView die echte Ansicht deckungsgleich → nahtlos. Kein zweites Live-Rendering. */
let previewEl: HTMLDivElement | null = null;
let previewPage: HTMLElement | null = null;
let previewChevron: HTMLDivElement | null = null;
let previewTarget: ViewId | null = null;
let previewDir = 0; // Animationsrichtung: 1 = von rechts herein, -1 = von links
let previewWrap = false; // am Reihen-Ende? dann „Rückspul"-Sprung ans andere Ende
let swipeResetTimer = 0;
let swipeNavTop = 0; // y-Oberkante der Navi beim Wisch-Start (= Inhalts-Unterkante)
let swipeDividerEl: HTMLDivElement | null = null;
let swipeDividerExitTimer = 0;
// Gesten-Demo (Doppeltipp auf „UN:DONE")
let demoActive = false;
let demoTimers: number[] = [];
let demoOverlayEl: HTMLDivElement | null = null;
let demoCaptionEl: HTMLDivElement | null = null;
let demoFingerEl: HTMLDivElement | null = null;
let demoHeroEl: HTMLDivElement | null = null;
let lastUndoneTap = 0;
let undoneTapTimer = 0;
// Zonengrenze bei 45 % der Inhaltshöhe (von oben) → obere Zone 45 %, untere 55 %.
const ZONE_SPLIT = 0.45;

/** y-Oberkante der Navi-Leiste (= Inhalts-Unterkante). */
function navTopY(): number {
  return (
    (root?.querySelector('.bottom-nav') as HTMLElement | null)?.getBoundingClientRect().top ??
    window.innerHeight
  );
}

/** y der Zonengrenze (oberhalb der Navi-Leiste). */
function zoneSplitY(): number {
  return navTopY() * ZONE_SPLIT;
}

/** Persistente Doppellinie an der Zonengrenze. PASSIV: nur die schwarzen End-
    Quadrate (3×3 px) als dezenter Hinweis; BEIM WISCH (`--active`): zusätzlich die
    zwei Linien dazwischen. Nur im Ein-Spalten-Layout sinnvoll. */
function ensureSwipeDivider(): void {
  if (!singleColumn.matches) {
    swipeDividerEl?.remove();
    swipeDividerEl = null;
    return;
  }
  if (!swipeDividerEl) {
    swipeDividerEl = document.createElement('div');
    swipeDividerEl.className = 'tab-swipe-divider';
    // Zwei eigene Linien-Spans (oben/unten) – getrennt, damit sie beim Ausblenden
    // gegenläufig herausgleiten können.
    swipeDividerEl.innerHTML =
      '<span class="tab-swipe-line tab-swipe-line--top"></span>' +
      '<span class="tab-swipe-line tab-swipe-line--bottom"></span>';
    document.body.appendChild(swipeDividerEl);
  }
  swipeDividerEl.style.top = `${zoneSplitY()}px`;
  updateDividerSurface();
}

/** Die Trennlinie liegt über der aktiven Spalte. In UN:DONE haben die Spalten
    FESTE Farben (col-main weiß, col-side dunkel) – unabhängig vom Theme. Damit die
    Marke dort sichtbar bleibt, richtet sie sich nach der aktiven Spalte statt nach
    Hell/Dunkel: weiße Aufgaben-Card → dunkle Marke, dunkle Erledigt-Card → helle. */
function updateDividerSurface(
  view: ViewId = state.view,
  column: 'main' | 'side' = state.mobileColumn,
): void {
  const el = swipeDividerEl;
  if (!el) {
    return;
  }
  el.classList.remove('tab-swipe-divider--on-light', 'tab-swipe-divider--on-dark');
  if (view === 'undone') {
    el.classList.add(
      column === 'main' ? 'tab-swipe-divider--on-light' : 'tab-swipe-divider--on-dark',
    );
  }
}

function showSwipeDivider(): void {
  ensureSwipeDivider();
  window.clearTimeout(swipeDividerExitTimer);
  swipeDividerEl?.classList.remove('tab-swipe-divider--exit');
  swipeDividerEl?.classList.add('tab-swipe-divider--active');
}

/** Linien NICHT hart ausschalten, sondern schnell herausschieben (oben→links,
    unten→rechts); danach die Exit-Klasse wieder entfernen (passiver Zustand). */
function hideSwipeDivider(): void {
  const el = swipeDividerEl;
  if (!el || !el.classList.contains('tab-swipe-divider--active')) {
    return;
  }
  el.classList.remove('tab-swipe-divider--active');
  el.classList.add('tab-swipe-divider--exit');
  window.clearTimeout(swipeDividerExitTimer);
  swipeDividerExitTimer = window.setTimeout(() => {
    el.classList.remove('tab-swipe-divider--exit');
  }, 290);
}

/**
 * Vorschau starten. Die Richtung ergibt sich aus Kante + vertikaler Hälfte:
 * UNTERE 50 % (Höhe ohne Navi) = „direkter" Wisch (links=zurück, rechts=vor),
 * OBERE 50 % = „inverser" Wisch (Gegenrichtung). Innen-Wische haben das nicht.
 */
function startEdgePreview(): void {
  const i = VIEW_ORDER.indexOf(state.view);
  if (i < 0) {
    return;
  }
  const navTop = swipeNavTop || window.innerHeight;
  const split = navTop * ZONE_SPLIT; // Zonengrenze bei 40 % der Inhaltshöhe (ohne Navi)
  const topHalf = swipeStartY < split; // obere Zone (40 %) → inverser Wisch
  const natural = swipeEdge; // links(-1)=zurück, rechts(+1)=vor
  const dir = topHalf ? -natural : natural; // gewünschte Tab-Richtung der Geste
  // Am Rand der Tab-Reihe KEIN Endlosband: ans andere Ende springen, aber die
  // ANIMATION umkehren (kommt von der Gegenseite, schneller) → „Rückspul"-Gefühl.
  const rawIndex = i + dir;
  previewWrap = rawIndex < 0 || rawIndex >= VIEW_ORDER.length;
  previewDir = previewWrap ? -dir : dir; // steuert nur die Animationsrichtung
  previewTarget = VIEW_ORDER[(rawIndex + VIEW_ORDER.length) % VIEW_ORDER.length]!;
  previewPage = root!.querySelector('.page');

  // Snapshot der Zielansicht – mobileColumn übernommen (BG-Tab ODER Termine-Karte).
  const snap: AppState = {
    ...state,
    view: previewTarget,
    periodOffset: 0,
    columnAnim: null,
    filterArea: null,
    creatingTask: false,
    creatingEvent: false,
    editingTask: null,
    editingEvent: null,
    editing: null,
    editingHabits: false,
  };
  const w = window.innerWidth;
  previewEl = document.createElement('div');
  previewEl.className = `tab-swipe-layer${previewTarget === 'undone' ? ' tab-swipe-layer--undone' : ''}`;
  previewEl.innerHTML = buildPageHtml(snap);
  previewEl.style.transform = `translateX(${previewDir > 0 ? w : -w}px)`; // wartet an der Gegenseite
  document.body.appendChild(previewEl);

  // Sehr großes Chevron, vertikal mittig in der AKTIVEN Hälfte; einfach = direkt,
  // doppelt = invers. Zeigt in Reise-Richtung (› vor, ‹ zurück), reitet mit dem Inhalt.
  const glyph = previewDir > 0 ? '›' : '‹'; // › / ‹
  const zoneCenter = topHalf ? split / 2 : split + (navTop - split) / 2;
  previewChevron = document.createElement('div');
  previewChevron.className = 'tab-swipe-chevron';
  previewChevron.textContent = topHalf ? glyph + glyph : glyph;
  previewChevron.style.top = `${zoneCenter}px`;
  previewChevron.style.transform = 'translate(0, -50%)';
  document.body.appendChild(previewChevron);
}

function moveEdgePreview(dx: number): void {
  if (!previewEl || !previewPage) {
    return;
  }
  const w = window.innerWidth;
  const progress = Math.min(w, Math.abs(dx)); // Finger zieht stets nach innen
  const offset = previewDir > 0 ? -progress : progress; // Inhalt-Versatz Richtung Ziel
  previewPage.style.transform = `translateX(${offset}px)`;
  previewEl.style.transform = `translateX(${(previewDir > 0 ? w : -w) + offset}px)`;
  if (previewChevron) {
    previewChevron.style.transform = `translate(${offset}px, -50%)`; // reitet mit dem Inhalt
    previewChevron.style.opacity = String(Math.min(1, progress / (w * 0.1)));
  }
}

function endEdgePreview(dx: number): void {
  if (!previewEl || !previewPage || previewTarget === null) {
    teardownEdgePreview();
    return;
  }
  const w = window.innerWidth;
  // genug gezogen? Bewusst kurz gehalten – eingeübte (knappe) Kanten-Wische
  // sollen sicher zünden, nicht abbrechen. ~12 % Breite, höchstens 48 px.
  const committed = Math.abs(dx) >= Math.min(48, w * 0.12);

  // Beim Tab-Wechsel die Trennlinien-Marke schon JETZT auf die ZIEL-Ansicht stellen,
  // damit sie während der (Wrap-)Animation zu den einfliegenden Tabs passt – nicht zur
  // Start-Ansicht. Sonst bleibt z. B. von UN:DONE (col-main) die dunkle Marke und
  // liegt falschrum auf den theme-gefärbten anderen Tabs (Dark wie Light Mode).
  if (committed) {
    updateDividerSurface(previewTarget!);
  }

  if (committed && previewWrap) {
    // „Flug über alle Tabs": die Zwischen-Ansichten fliegen – jede mit ihrem
    // eigenen Header – nacheinander durchs Bild, bis das Ziel als Letztes liegen
    // bleibt. Die Navi-Buttons bewegen sich dabei NICHT (nur Status-Wechsel am Ende).
    const enterX = previewDir > 0 ? w : -w; // von dieser Seite kommen die Blätter herein
    const curIdx = VIEW_ORDER.indexOf(state.view);
    const tgtIdx = VIEW_ORDER.indexOf(previewTarget!);
    // Pfad der zu durchquerenden Ansichten (Zwischenstationen + Ziel), in Reihenfolge.
    const path: ViewId[] = [];
    if (tgtIdx < curIdx) {
      for (let k = curIdx - 1; k >= tgtIdx; k--) path.push(VIEW_ORDER[k]!);
    } else {
      for (let k = curIdx + 1; k <= tgtIdx; k++) path.push(VIEW_ORDER[k]!);
    }

    const stagger = 130; // ms Versatz zwischen den durchfliegenden Blättern
    const slideSecs = 0.28;
    const ease = `transform ${slideSecs}s cubic-bezier(0.22, 1, 0.36, 1)`;

    // Einzel-Vorschau + Chevron weg – wir bauen die ganze Kette neu.
    previewChevron?.remove();
    previewChevron = null;
    previewEl.remove();
    previewEl = null;

    // Aktuelle Seite zur Gegenseite rausschieben (Header reist mit).
    previewPage.style.transition = ease;
    previewPage.style.transform = `translateX(${-enterX}px)`;

    const layers: HTMLDivElement[] = [];
    path.forEach((viewId, i) => {
      // Blatt erst im eigenen Zeitfenster bauen → Render-Last gestaffelt statt auf einmal.
      window.setTimeout(() => {
        const snap: AppState = {
          ...state,
          view: viewId,
          periodOffset: 0,
          columnAnim: null,
          filterArea: null,
          creatingTask: false,
          creatingEvent: false,
          editingTask: null,
          editingEvent: null,
          editing: null,
          editingHabits: false,
        };
        const layer = document.createElement('div');
        layer.className = `tab-swipe-layer${viewId === 'undone' ? ' tab-swipe-layer--undone' : ''}`;
        // späteres Blatt deckt das frühere (Ziel zuoberst); bewusst UNTER der
        // Trennlinie (z-index 6), damit diese während des Wrap-Flugs konsistent
        // oben stehen bleibt und nicht kurz überdeckt wird → erst am Ende ausgleitet.
        layer.style.zIndex = String(2 + i);
        layer.style.transform = `translateX(${enterX}px)`;
        layer.innerHTML = buildPageHtml(snap);
        document.body.appendChild(layer);
        void layer.offsetWidth; // Reflow, damit die Start-Position sitzt, bevor animiert wird
        layer.style.transition = ease;
        layer.style.transform = 'translateX(0)';
        layers.push(layer);
      }, i * stagger);
    });

    const total = (path.length - 1) * stagger + slideSecs * 1000 + 40;
    const target = previewTarget!;
    window.setTimeout(() => {
      goToView(target); // echtes Rendern – deckungsgleich zum letzten Blatt
      layers.forEach((l) => l.remove());
      teardownEdgePreview();
    }, total);

    return;
  }

  const secs = 0.22;
  const ease = `transform ${secs}s cubic-bezier(0.22, 1, 0.36, 1)`;
  previewEl.style.transition = ease;
  previewPage.style.transition = ease;
  if (previewChevron) {
    previewChevron.style.transition = `${ease}, opacity ${secs}s ease`;
  }
  if (committed) {
    const out = previewDir > 0 ? -w : w;
    previewPage.style.transform = `translateX(${out}px)`;
    previewEl.style.transform = 'translateX(0)';
    if (previewChevron) {
      previewChevron.style.transform = `translate(${out}px, -50%)`;
      previewChevron.style.opacity = '0';
    }
    const target = previewTarget;
    window.setTimeout(
      () => {
        goToView(target); // echtes Rendern an Position 0 – deckungsgleich zum Snapshot
        teardownEdgePreview();
      },
      secs * 1000 + 10,
    );
  } else {
    // Abgebrochen → zurückschnappen, und als Sicherheit nach 1,5 s sauber neu rendern.
    previewPage.style.transform = 'translateX(0)';
    previewEl.style.transform = `translateX(${previewDir > 0 ? w : -w}px)`;
    if (previewChevron) {
      previewChevron.style.transform = 'translate(0, -50%)';
      previewChevron.style.opacity = '0';
    }
    const page = previewPage;
    window.setTimeout(() => {
      page.style.transition = '';
      page.style.transform = '';
      teardownEdgePreview();
    }, 230);
    scheduleSwipeReset();
  }
}

function teardownEdgePreview(): void {
  previewEl?.remove();
  previewChevron?.remove();
  previewEl = null;
  previewPage = null;
  previewChevron = null;
  previewTarget = null;
  previewDir = 0;
  previewWrap = false;
  // Trennlinie erst JETZT (am Ende des Tab-Wechsels bzw. Zurückschnappens) ausblenden,
  // nicht schon beim touchend – die Linie begleitet die ganze Animation.
  hideSwipeDivider();
}

/** Sicherheits-Reset: nach einem abgebrochenen/gescheiterten Wisch die aktuelle
    Ansicht nach 1,5 s sauber neu rendern (klärt hängende Transforms/Reste). */
function scheduleSwipeReset(): void {
  window.clearTimeout(swipeResetTimer);
  swipeResetTimer = window.setTimeout(() => rerender(), 1500);
}

// Fehler erscheinen kurz als Overlay (Toast) statt dauerhaft inline. Der Toast lebt
// AUSSERHALB von #app, damit das ständige Neu-Rendern ihn nicht zerstört.
let toastEl: HTMLDivElement | null = null;
let toastTimer = 0;
let lastToastError: string | null = null;

// Zeitstempel des letzten „leeres Erstell-Formular verlassen"-Schließens –
// unterdrückt das sofortige Wieder-Öffnen durch denselben (+)-Pillen-Tipp.
let suppressCreateToggle = 0;

function showToast(message: string): void {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  // erst im nächsten Frame einblenden, damit die Einblend-Transition greift
  requestAnimationFrame(() => toastEl?.classList.add('show'));
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl?.classList.remove('show'), 3500);
}

/**
 * Statusleisten-/Browser-Chrome-Farbe an die ECHTE Seitenfarbe angleichen.
 * Wir lesen den berechneten Hintergrund der Seite (inkl. blauer Tönung) und
 * schreiben ihn ins <meta name="theme-color"> – so kann die iOS-Statusleiste
 * nie von der Seite abweichen. Fällt auf die Body-Farbe zurück (Desktop, wo die
 * Seite selbst transparent ist).
 */
function syncThemeColor(): void {
  const meta = document.querySelector('meta#theme-color');
  if (!meta) {
    return;
  }
  const page = root!.querySelector('.page');
  let color = page ? getComputedStyle(page).backgroundColor : '';
  if (!color || color === 'rgba(0, 0, 0, 0)' || color === 'transparent') {
    color = getComputedStyle(document.body).backgroundColor;
  }
  if (color) {
    meta.setAttribute('content', color);
  }
}

function rerender(): void {
  closeSuggest(); // ein Neuaufbau des DOM würde das Dropdown sonst verwaisen lassen
  renderApp(root!, state);
  syncThemeColor();
  updateDividerSurface(); // Marke an aktive Spalte/View anpassen (UN:DONE-Festfarben)
  // Nur beim NEUEN Auftreten eines Fehlers den Toast zeigen (nicht bei jedem Render)
  if (state.syncError && state.syncError !== lastToastError) {
    showToast(state.syncError);
  }
  lastToastError = state.syncError;
}

/* ---------- Tag-Vorschläge: Dropdown unter Titel-Feldern ---------- */

let suggestBox: HTMLUListElement | null = null;
let suggestFor: HTMLInputElement | null = null;
let suggestData: TagSuggestion | null = null;
let suggestIndex = 0;

function closeSuggest(): void {
  suggestBox?.remove();
  suggestBox = null;
  suggestFor = null;
  suggestData = null;
  suggestIndex = 0;
}

/** Aktiven Eintrag (Pfeiltasten) optisch markieren */
function markActiveSuggest(): void {
  suggestBox
    ?.querySelectorAll('.tag-suggest-item')
    .forEach((el, i) => el.classList.toggle('active', i === suggestIndex));
}

/**
 * Vorschlagsliste unter dem Eingabefeld auf- oder abbauen. Wird bei jedem
 * Tastendruck aufgerufen – jedes weitere Zeichen filtert die Treffer.
 * Die Knoten entstehen per createElement/textContent, nicht als HTML-String:
 * so können Bereichsnamen nichts einschleusen.
 */
function renderSuggest(input: HTMLInputElement): void {
  const caret = input.selectionStart ?? input.value.length;
  const paths = state.registry.all().map((entry) => entry.path);
  const suggestion = suggestTags(paths, input.value.slice(0, caret));
  if (!suggestion) {
    closeSuggest();
    return;
  }
  if (!suggestBox || suggestFor !== input) {
    closeSuggest();
    suggestBox = document.createElement('ul');
    suggestBox.className = 'tag-suggest';
    input.insertAdjacentElement('afterend', suggestBox);
    suggestFor = input;
  }
  suggestData = suggestion;
  suggestIndex = 0;
  suggestBox.replaceChildren(
    ...suggestion.matches.map((match, i) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `tag-suggest-item${i === 0 ? ' active' : ''}`;
      item.dataset.suggestIndex = String(i);
      // "›" signalisiert: hier geht es eine Ebene tiefer (vervollständigt bis ".")
      item.textContent = `#${match.value}${match.hasChildren ? ' ›' : ''}`;
      const li = document.createElement('li');
      li.append(item);
      return li;
    }),
  );
}

/** Gewählten Vorschlag ins Feld übernehmen – bei "." gleich weiterfiltern */
function pickSuggest(index: number): void {
  const match = suggestData?.matches[index];
  if (!suggestFor || !suggestData || !match) {
    return;
  }
  const input = suggestFor;
  const caret = input.selectionStart ?? input.value.length;
  const next = applyTag(input.value, caret, suggestData.at, match.value, match.hasChildren);
  input.value = next.text;
  input.setSelectionRange(next.caret, next.caret);
  input.focus();
  renderSuggest(input); // Ebene mit Unterbereichen zeigt sofort die nächste Stufe
}

/* ---------- Laden & Speichern (Nextcloud via Backend) ---------- */

let achievementsEtag: string | null = null;
let tagsEtag: string | null = null;

// Warteschlange: Speichervorgänge laufen nacheinander, nie parallel
let saveChain: Promise<void> = Promise.resolve();
function queue(task: () => Promise<void>): void {
  saveChain = saveChain.then(task).catch(() => {});
}

/** Zeitfenster der Agenda – Day/Morrow: heute + 2 Tage, Cockpits: ganze Woche/Monat */
function agendaRange(): { start: Date; end: Date } {
  if (state.view === 'week' || state.view === 'month') {
    const range =
      state.view === 'week' ? weekRange(state.periodOffset) : monthRange(state.periodOffset);
    return {
      start: new Date(`${range.start}T00:00:00`),
      // der letzte Tag zählt ganz mit – also bis 24 Uhr laden
      end: shiftDays(new Date(`${range.end}T00:00:00`), 1),
    };
  }
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return { start, end: shiftDays(start, 3) };
}

async function reloadAgenda(): Promise<void> {
  const range = agendaRange();
  const requested = `${state.view}:${state.periodOffset}`;
  const agenda = await loadAgenda(range.start, range.end);
  // Verspätete Antwort eines anderen Zeitraums? Dann nicht übernehmen.
  if (`${state.view}:${state.periodOffset}` !== requested) {
    return;
  }
  state.data.events = agenda.events;
  state.data.tasks = agenda.tasks;
}

/**
 * Agenda im Hintergrund neu laden – nach Tab- oder Zeitraumwechsel.
 * Wächter gegen Überholer: Klickt man schnell mehrfach ‹/›, laufen mehrere
 * Anfragen parallel – nur die Antwort zum NOCH aktuellen Zeitraum zählt,
 * verspätete Antworten älterer Zeiträume werden verworfen.
 */
function refreshAgenda(): void {
  const requested = `${state.view}:${state.periodOffset}`;
  const stillCurrent = (): boolean => `${state.view}:${state.periodOffset}` === requested;
  void reloadAgenda()
    .then(() => {
      if (stillCurrent()) {
        rerender();
      }
    })
    .catch(() => {
      if (stillCurrent()) {
        state.syncError = t('errorLoad');
        rerender();
      }
    });
}

async function boot(showLoading = true): Promise<void> {
  if (showLoading) {
    state.loading = true;
    rerender();
  }
  try {
    const [achievements, tags] = await Promise.all([loadAchievements(), loadTagRegistry()]);
    state.data.habits = achievements.data.habits ?? [];
    state.data.achievements = achievements.data.achievements ?? [];
    achievementsEtag = achievements.etag;
    state.registry = new InMemoryTagRegistry(tags.data);
    tagsEtag = tags.etag;
    state.syncError = null;
  } catch {
    state.syncError =
      t('errorBackend');
  }
  // Kalender getrennt laden: Fehler hier sollen Habits/Ziele nicht blockieren
  try {
    await reloadAgenda();
  } catch {
    state.syncError = t('errorLoad');
  }
  state.loading = false;
  rerender();
}

async function persistAchievements(): Promise<void> {
  // Stand zum Zeitpunkt des Klicks festhalten – das ist die Absicht des Nutzers
  const payload = { habits: state.data.habits, achievements: state.data.achievements };
  try {
    achievementsEtag = await saveAchievements(payload, achievementsEtag ?? undefined);
    if (state.syncError) {
      state.syncError = null;
      rerender();
    }
  } catch (error) {
    if (error instanceof ApiConflictError) {
      // Konzept: frisches ETag holen und die EIGENE Änderung erneut anwenden
      try {
        const fresh = await loadAchievements();
        achievementsEtag = await saveAchievements(payload, fresh.etag ?? undefined);
        return;
      } catch {
        // zweiter Konflikt in Folge → ehrlich neu laden
      }
      await boot(false);
      state.syncError = t('extChanged');
    } else {
      state.syncError = t('saveFailed');
    }
    rerender();
  }
}

async function persistTags(): Promise<void> {
  const payload = state.registry.toJSON();
  try {
    tagsEtag = await saveTagRegistry(payload, tagsEtag ?? undefined);
  } catch (error) {
    if (error instanceof ApiConflictError) {
      try {
        const fresh = await loadTagRegistry();
        tagsEtag = await saveTagRegistry(payload, fresh.etag ?? undefined);
        return;
      } catch {
        // zweiter Konflikt in Folge → ehrlich neu laden
      }
      await boot(false);
      state.syncError = t('areasExtChanged');
    } else {
      state.syncError = t('areasSaveFailed');
    }
    rerender();
  }
}

/* ---------- Aktionen ---------- */

/**
 * Bereich umbenennen – Herzstück der Registry-Idee:
 * Nur der Registry-Eintrag ändert sich (alter Name wird Alias), die
 * Objekttexte bleiben unangetastet und werden beim Anzeigen über den
 * Alias dem neuen Namen zugeordnet. Unterbereiche wandern atomar mit.
 */
function commitRename(oldPath: string, newSegment: string): void {
  state.editing = null;

  const oldSegment = oldPath.split('.').pop();
  const isValid = /^[\p{L}\p{M}\d_]+$/u.test(newSegment); // gleiche Zeichen wie im Tag-Muster
  if (!isValid || newSegment === oldSegment) {
    rerender(); // nichts zu tun bzw. ungültig → Abbruch ohne Änderung
    return;
  }

  const parent = oldPath.includes('.') ? oldPath.slice(0, oldPath.lastIndexOf('.')) : '';
  const newPath = parent ? `${parent}.${newSegment}` : newSegment;

  try {
    // Ad-hoc-Tags (nur in Objekten, noch nicht in der Registry) zuerst aufnehmen
    const entry = state.registry.resolve(oldPath) ?? state.registry.register(oldPath);
    state.registry.renameSubtree(entry.uid, newPath);

    // Sprung-Filter und Zuklapp-Zustände folgen der Umbenennung – auch in Unterpfaden
    if (state.filterArea) {
      state.filterArea = replaceTagPrefix(state.filterArea, oldPath, newPath);
    }
    state.collapsed = new Set(
      [...state.collapsed].map((path) => replaceTagPrefix(path, oldPath, newPath)),
    );
    queue(persistTags);
  } catch (error) {
    // z. B. "Der Pfad ist bereits vergeben"
    window.alert(error instanceof Error ? error.message : String(error));
  }
  rerender();
}

/** .ics-Datei zum Download anstoßen – das Gerät bietet den Kalender-Import an */
function downloadIcs(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Tags eines Titels in die Registry aufnehmen (Auto-Aufnahme) + speichern */
function registerTitleTags(title: string): void {
  const tags = parseTags(title).tags;
  for (const tag of tags) {
    state.registry.register(tag);
  }
  if (tags.length > 0) {
    queue(persistTags);
  }
}

/* ---------- Drag & Drop (optimistisch, bestehende Muster) ---------- */

/**
 * Aufgabe per Ziehen verschieben: in einen anderen Bereich (retagTask: Quell-Tag
 * durch Ziel-Tag ersetzen) oder in "Ohne Bereich" (untagTask: Quell-Tag entfernen).
 * Sofort sichtbar, dann im Hintergrund nach Nextcloud. Der rawText bleibt die
 * Wahrheit – title/tags leiten wir neu ab.
 */
function dropTask(info: DropInfo): void {
  const task = state.data.tasks.find((t) => t.id === info.id);
  if (!task) {
    return;
  }
  const resolve = (tag: string): string | undefined => state.registry.resolve(tag)?.path;
  let newRaw: string;
  if (info.dropKind === 'untag') {
    newRaw = untagTask(task.rawText, info.from ?? '', resolve);
  } else if (info.path !== undefined) {
    newRaw = retagTask(task.rawText, info.from ?? '', info.path, resolve);
  } else {
    return;
  }
  if (newRaw === task.rawText) {
    return; // No-Op: Drop auf denselben Bereich / kein passender Tag
  }

  // Optimistisch: Zustand + Anzeige sofort aktualisieren
  const parsed = parseTags(newRaw);
  task.rawText = newRaw;
  task.title = parsed.cleanText;
  task.tags = parsed.tags;
  registerTitleTags(newRaw); // Ziel-Tag in die Registry aufnehmen (+ queue persistTags)
  rerender();

  // Aufgabe ohne href (sollte real nicht vorkommen): nur lokal, kein Schreiben
  const href = task.href;
  if (!href) {
    return;
  }
  const due = task.due;
  queue(async () => {
    try {
      await updateTask(href, newRaw, due || undefined);
    } catch {
      // Konflikt/Fehler: ehrlichen Stand aus der Nextcloud holen
      try {
        await reloadAgenda();
      } catch {
        /* Agenda nicht erreichbar – Hinweis reicht */
      }
      state.syncError = t('moveSaveFailed');
      rerender();
    }
  });
}

/**
 * Top-Level-Bereiche umsortieren: gezogenen Bereich (info.from) vor das Ziel
 * (info.path) einfügen, neue order-Werte vergeben (reorderTopAreas), in die
 * Registry schreiben (setOrder) und persistieren.
 */
function moveArea(info: DropInfo): void {
  const moved = info.from;
  if (!moved || moved.includes('.')) {
    return; // nur oberste Ebene lässt sich umsortieren
  }
  // "area-end" = ans Ende anhängen (target null); sonst vor den Ziel-Bereich
  const target = info.dropKind === 'area-end' ? null : (info.path ?? null);
  if (target !== null && (target.includes('.') || target === moved)) {
    return; // Unterbereich als Ziel bzw. Drop auf sich selbst → No-Op
  }
  // Beteiligte sicher in der Registry (setOrder braucht einen Eintrag)
  state.registry.register(moved);
  if (target) {
    state.registry.register(target);
  }
  const orderedPaths = state.registry
    .all()
    .map((entry) => entry.path)
    .filter((path) => !path.includes('.'));
  const updates = reorderTopAreas(orderedPaths, moved, target);
  if (updates.length === 0) {
    return;
  }
  for (const update of updates) {
    state.registry.setOrder(update.path, update.order);
  }
  rerender();
  queue(persistTags);
}

/** Felder des Termin-Formulars auslesen */
function readForm(form: HTMLElement, names: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of names) {
    values[name] =
      form.querySelector<HTMLInputElement>(`[data-field="${name}"]`)?.value.trim() ?? '';
  }
  return values;
}

/** Termin in den Nextcloud-Kalender schreiben */
/** Start < Ende? Sonst native Validierungs-Blase am Ende-Feld und false.
    "HH:MM" ist zweistellig → lexikografischer Vergleich = chronologischer. */
function validEventTimes(form: HTMLElement): boolean {
  const startEl = form.querySelector<HTMLInputElement>('[data-field="start"]');
  const endEl = form.querySelector<HTMLInputElement>('[data-field="end"]');
  if (!startEl || !endEl || !startEl.value || !endEl.value) {
    return true; // ganztägig / Zeiten fehlen → hier nichts zu prüfen
  }
  const ok = startEl.value < endEl.value;
  endEl.setCustomValidity(ok ? '' : t('endBeforeStart'));
  if (!ok) {
    endEl.reportValidity();
  }
  return ok;
}

async function submitEventForm(form: HTMLElement): Promise<void> {
  const { date, start, end } = readForm(form, ['date', 'start', 'end']);
  const title = normalizeText(readForm(form, ['title']).title);
  // Enter/Speichern ohne Titel → Erstell-Modus schließen, nichts anlegen.
  if (!title) {
    state.creatingEvent = false;
    rerender();
    return;
  }
  if (!date || !start || !end) {
    return;
  }
  if (!validEventTimes(form)) {
    return;
  }
  registerTitleTags(title);
  try {
    const result = await createEvent(
      title,
      new Date(`${date}T${start}:00`).getTime(),
      new Date(`${date}T${end}:00`).getTime(),
    );
    state.data.events.push(result.event);
    state.data.events.sort((a, b) => a.start.localeCompare(b.start));
    state.creatingEvent = false;
    state.syncError = null;
  } catch {
    state.syncError = t('eventCreateFailed');
  }
  rerender();
}

/** Bearbeitete Aufgabe in die Nextcloud zurückschreiben (Titel + Fälligkeit) */
async function submitTaskEditForm(form: HTMLElement): Promise<void> {
  const task = state.data.tasks.find((t) => t.id === form.dataset.id);
  const title = normalizeText(readForm(form, ['title']).title);
  if (!task?.href || !title) {
    return;
  }
  const { due } = readForm(form, ['due']);
  registerTitleTags(title);
  try {
    const result = await updateTask(task.href, title, due || undefined);
    Object.assign(task, result.task);
    // Gelöschtes Datum kommt in der Antwort als FEHLENDES Feld an –
    // Object.assign würde das alte stehen lassen, deshalb explizit setzen
    task.due = result.task.due;
    state.editingTask = null;
    state.syncError = null;
  } catch (error) {
    state.syncError =
      error instanceof ApiConflictError
        ? t('taskExtChanged')
        : t('taskSaveFailed');
  }
  rerender();
}

/** Bearbeiteten Einzeltermin zurückschreiben (Titel + Datum/Zeiten) */
async function submitEventEditForm(form: HTMLElement): Promise<void> {
  const index = state.data.events.findIndex((e) => e.id === form.dataset.id);
  const event = state.data.events[index];
  const title = normalizeText(readForm(form, ['title']).title);
  const { date, start, end } = readForm(form, ['date', 'start', 'end']);
  if (!event?.href || !title || !date || (!event.allDay && (!start || !end))) {
    return;
  }
  if (!event.allDay && !validEventTimes(form)) {
    return;
  }
  registerTitleTags(title);
  try {
    // Ganztägige bleiben ganztägig (nur Datum), getimte bekommen neue Zeiten
    const times = event.allDay
      ? { date }
      : {
          start: new Date(`${date}T${start}:00`).getTime(),
          end: new Date(`${date}T${end}:00`).getTime(),
        };
    const result = await updateEvent(event.href, title, times);
    state.data.events[index] = result.event;
    state.data.events.sort((a, b) => a.start.localeCompare(b.start));
    state.editingEvent = null;
    state.syncError = null;
  } catch (error) {
    state.syncError =
      error instanceof ApiConflictError
        ? t('eventExtChanged')
        : t('eventSaveFailed');
  }
  rerender();
}

/** Aufgabe in Nextcloud Tasks anlegen */
async function submitTaskForm(form: HTMLElement): Promise<void> {
  const { due } = readForm(form, ['due']);
  const title = normalizeText(readForm(form, ['title']).title);
  // Enter/Anlegen ohne Titel → Erstell-Modus schließen, nichts anlegen
  // (schnellstes Abbrechen auf iOS: Return-Taste).
  if (!title) {
    state.creatingTask = false;
    rerender();
    return;
  }
  registerTitleTags(title);
  try {
    const result = await createTask(title, due || undefined);
    state.data.tasks.push(result.task);
    state.creatingTask = false;
    state.syncError = null;
  } catch {
    state.syncError = t('taskCreateFailed');
  }
  rerender();
}

/* ---------- Kompakte Gesten-Demo (Doppeltipp auf „UN:DONE") ---------- */

/** Halbtransparentes Overlay mit Beschriftungs-Karte; Tap bricht ab. */
function showDemoOverlay(): void {
  demoOverlayEl = document.createElement('div');
  demoOverlayEl.className = 'demo-overlay';
  demoCaptionEl = document.createElement('div');
  demoCaptionEl.className = 'demo-caption';
  demoOverlayEl.appendChild(demoCaptionEl);
  demoOverlayEl.addEventListener('pointerdown', endGestureDemo);
  document.body.appendChild(demoOverlayEl);
  // Finger-Kreis getrennt (über dem Backdrop), folgt den Gesten.
  demoFingerEl = document.createElement('div');
  demoFingerEl.className = 'demo-finger';
  document.body.appendChild(demoFingerEl);
  requestAnimationFrame(() => demoOverlayEl?.classList.add('show'));
}

/** Große Titelkarte (Intro/Schluss) im Overlay ein-/ausblenden. */
function showDemoHero(html: string): void {
  if (!demoOverlayEl) {
    return;
  }
  if (!demoHeroEl) {
    demoHeroEl = document.createElement('div');
    demoHeroEl.className = 'demo-hero';
    demoOverlayEl.appendChild(demoHeroEl);
  }
  demoHeroEl.innerHTML = html;
  requestAnimationFrame(() => demoHeroEl?.classList.add('show'));
}
function hideDemoHero(): void {
  demoHeroEl?.classList.remove('show');
}

/** Finger-Kreis als Gesten-Hinweis: AUSSEN startet an der Kante, INNEN in der Mitte
    (gleicher Vollkreis, anderer Startpunkt) und gleitet in Wisch-Richtung. */
function showDemoFinger(kind: 'edge' | 'inside', leftward: boolean): void {
  const el = demoFingerEl;
  if (!el) {
    return;
  }
  const w = window.innerWidth;
  const navTop = navTopY();
  const edgeInset = 22; // ~Radius → Kreis sitzt genau an der Kante
  const y = kind === 'edge' ? navTop * 0.8 : navTop * 0.5;
  const fromX = kind === 'edge' ? (leftward ? w - edgeInset : edgeInset) : w * 0.5;
  const dist = kind === 'edge' ? w * 0.42 : w * 0.3;
  const toX = leftward ? fromX - dist : fromX + dist;
  el.style.transition = 'none';
  el.style.top = `${y}px`;
  el.style.left = `${fromX}px`;
  el.style.opacity = '0';
  void el.offsetWidth; // Reflow → Startposition sitzt, bevor animiert wird
  const dur = 0.5;
  el.style.transition = `left ${dur}s ease, opacity ${dur}s ease`;
  el.style.left = `${toX}px`;
  el.style.opacity = '0.9';
  demoTimers.push(
    window.setTimeout(() => {
      el.style.transition = 'opacity 0.3s ease';
      el.style.opacity = '0';
    }, dur * 1000),
  );
}

/** Einen Kanten-Wisch programmatisch auslösen (untere Zone = direkt; vorwärts =
    rechte Kante). Zeigt die Trennlinie und nutzt exakt die echte Übergangs-/
    Wrap-Animation. dx-Betrag ≥ Schwelle committet; das Vorzeichen ist egal. */
function demoEdge(forward: boolean): void {
  const navTop = navTopY();
  swipeNavTop = navTop;
  swipeStartY = navTop * 0.8; // klar in der unteren Zone → direkter Wisch
  swipeEdge = forward ? 1 : -1; // rechts = vor, links = zurück
  showSwipeDivider();
  startEdgePreview();
  endEdgePreview(100); // |100| ≥ Commit-Schwelle (48) → Tab-Wechsel
}

/** Inside-Wisch der Demo (Karte rein/raus) – Pendant zu demoEdge. Der Finger-Hinweis
    läuft getrennt 0,4 s vorab (step.finger), daher hier nur die Geste selbst. */
function demoInside(next: 'main' | 'side'): void {
  switchMobileColumn(next);
}

interface DemoStep {
  caption?: string; // nur gesetzte Texte wechseln die Beschriftung
  finger?: { kind: 'edge' | 'inside'; leftward: boolean }; // Hinweis-Kreis, 0,4 s vorab
  run: () => void;
  wait: number; // ms bis zum nächsten Schritt (≥ Animationsdauer)
}

// Bewusst langsames Tempo: Zeit zum Lesen/Sehen je Schritt (1/6 der ursprünglichen
// Geschwindigkeit). Die Gesten-Animationen selbst bleiben normal schnell – hier wird
// nur die VERWEILDAUER zwischen den Schritten gestreckt.
const DEMO_PACE = 6;

/** Skript: Kanten-Wisch-Tour (day→…→undone), Inside-Wisch, Wrap zurück nach day. */
function buildDemoSteps(): DemoStep[] {
  const edge = 320 * DEMO_PACE; // Commit-Animation (~230ms) + langer Puffer
  const col = 480 * DEMO_PACE; // Spalten-Animation + langer Puffer
  const wrap = 780 * DEMO_PACE; // Wrap-Flug (~710ms) + langer Puffer
  const edgeF = { kind: 'edge', leftward: true } as const; // vorwärts: rechte Kante → nach links
  return [
    { caption: t('demoEdgeSwipe'), finger: edgeF, run: () => demoEdge(true), wait: edge }, // day → morrow
    { finger: edgeF, run: () => demoEdge(true), wait: edge }, // morrow → week
    { finger: edgeF, run: () => demoEdge(true), wait: edge }, // week → month
    { finger: edgeF, run: () => demoEdge(true), wait: edge }, // month → undone
    {
      caption: t('demoInsideSwipe'),
      finger: { kind: 'inside', leftward: true },
      run: () => demoInside('side'),
      wait: col,
    },
    { finger: { kind: 'inside', leftward: false }, run: () => demoInside('main'), wait: col },
    { caption: t('demoWrap'), finger: edgeF, run: () => demoEdge(true), wait: wrap }, // undone → Wrap → day
  ];
}

/** Demo starten: nach DO DAY springen, Overlay zeigen, Schritte takten. */
function startGestureDemo(): void {
  if (demoActive || !singleColumn.matches) {
    return;
  }
  demoActive = true;
  goToView('day'); // IMMER direkt nach DO DAY springen (0s) – Demo beginnt dort
  showDemoOverlay();

  let at = 1500; // nach dem Jump 1,5 s DO DAY zeigen …
  demoTimers.push(
    window.setTimeout(
      () =>
        showDemoHero(
          '<span class="demo-hero-title">DO DAY</span>' +
            '<span class="demo-hero-sub">your autistic to do list</span>',
        ),
      at,
    ),
  );
  at += 3000; // … Hero-Titel 3 s zeigen …
  demoTimers.push(window.setTimeout(hideDemoHero, at));
  at += 1000; // … 1 s Pause, dann die Gesten

  for (const step of buildDemoSteps()) {
    if (step.finger) {
      const f = step.finger;
      demoTimers.push(window.setTimeout(() => showDemoFinger(f.kind, f.leftward), Math.max(0, at - 400)));
    }
    demoTimers.push(
      window.setTimeout(() => {
        if (step.caption && demoCaptionEl) {
          demoCaptionEl.textContent = step.caption;
        }
        step.run();
      }, at),
    );
    at += step.wait;
  }

  // Schluss: großes „DO"-Hero, dann Demo beenden.
  demoTimers.push(
    window.setTimeout(() => {
      if (demoCaptionEl) {
        demoCaptionEl.textContent = '';
      }
      showDemoHero('<span class="demo-hero-do">DO</span>');
    }, at),
  );
  at += 1800;
  demoTimers.push(window.setTimeout(endGestureDemo, at));
}

/** Abbruch/Abschluss: Timer stoppen, laufende Vorschau abräumen, Overlay weg. */
function endGestureDemo(): void {
  if (!demoActive) {
    return;
  }
  demoActive = false;
  demoTimers.forEach((id) => window.clearTimeout(id));
  demoTimers = [];
  if (previewEl) {
    endEdgePreview(0); // laufende Vorschau sauber zurückschnappen → teardown
  }
  demoFingerEl?.remove();
  demoFingerEl = null;
  const el = demoOverlayEl;
  demoOverlayEl = null;
  demoCaptionEl = null;
  demoHeroEl = null; // Kind des Overlays – wird mit ihm entfernt
  el?.classList.remove('show');
  window.setTimeout(() => el?.remove(), 260);
}

root.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;

  // Klick ins Umbenennen-Feld darf den Bereich nicht zuklappen
  if (target.closest('input.area-rename')) {
    event.preventDefault();
    return;
  }

  const trigger = target.closest<HTMLElement>('[data-action]');
  if (!trigger) {
    return;
  }
  const { action, id, view, path } = trigger.dataset;

  if (action === 'switch-view' && view) {
    // Doppeltipp auf „UN:DONE" (mobil) startet die Gesten-Demo statt nur zu wechseln.
    // Der Einzeltipp-Wechsel wird kurz aufgeschoben, damit beim Doppeltipp KEIN
    // Zwischensprung nach UN:DONE aufblitzt – die Demo geht direkt nach DO DAY.
    if (view === 'undone' && singleColumn.matches) {
      const now = Date.now();
      if (now - lastUndoneTap < 350) {
        lastUndoneTap = 0;
        window.clearTimeout(undoneTapTimer);
        startGestureDemo();
        return;
      }
      lastUndoneTap = now;
      window.clearTimeout(undoneTapTimer);
      undoneTapTimer = window.setTimeout(() => goToView('undone'), 350);
      return;
    }
    goToView(view as ViewId);
  }

  if (action === 'switch-period' && trigger.dataset.dir) {
    // ‹ = -1 (zurück), › = +1 (Richtung heute) – nie über das Jetzt hinaus
    const next = Math.min(0, state.periodOffset + Number(trigger.dataset.dir));
    if (next !== state.periodOffset) {
      state.periodOffset = next;
      rerender();
      refreshAgenda();
    }
  }

  if (action === 'filter-area' && path) {
    // "Sprung in den Bereich": nur dieser Bereich inkl. Unterbereiche.
    // preventDefault, damit der Klick das <details> nicht zuklappt.
    event.preventDefault();
    state.filterArea = state.filterArea === path ? null : path; // zweiter Klick hebt auf
    rerender();
  }

  if (action === 'edit-area' && path) {
    event.preventDefault();
    state.editing = path;
    rerender();
    const input = root!.querySelector<HTMLInputElement>('input.area-rename');
    input?.focus();
    input?.select();
  }

  if (action === 'clear-filter') {
    state.filterArea = null;
    rerender();
  }

  if (action === 'toggle-habit-editor') {
    state.editingHabits = !state.editingHabits;
    rerender();
  }

  if (action === 'toggle-event-form') {
    // Gerade per Verlassen eines leeren Formulars geschlossen? Dann NICHT sofort
    // wieder öffnen (derselbe Tipp auf die Pille hat das Schließen ausgelöst).
    if (Date.now() - suppressCreateToggle < 500) {
      suppressCreateToggle = 0;
    } else {
      state.creatingEvent = !state.creatingEvent;
      rerender();
      root!.querySelector<HTMLInputElement>('[data-event-form] [data-field="title"]')?.focus();
    }
  }

  if (action === 'toggle-task-form') {
    if (Date.now() - suppressCreateToggle < 500) {
      suppressCreateToggle = 0;
    } else {
      state.creatingTask = !state.creatingTask;
      rerender();
      root!.querySelector<HTMLInputElement>('[data-task-form] [data-field="title"]')?.focus();
    }
  }

  if (action === 'edit-task' && id) {
    // Stift öffnet das Inline-Formular – zweiter Klick schließt es wieder
    state.editingTask = state.editingTask === id ? null : id;
    state.editingEvent = null;
    rerender();
    root!.querySelector<HTMLInputElement>('[data-task-edit-form] [data-field="title"]')?.focus();
  }

  if (action === 'edit-event' && id) {
    state.editingEvent = state.editingEvent === id ? null : id;
    state.editingTask = null;
    rerender();
    root!.querySelector<HTMLInputElement>('[data-event-edit-form] [data-field="title"]')?.focus();
  }

  if (action === 'cancel-edit') {
    state.editingTask = null;
    state.editingEvent = null;
    rerender();
  }

  if (action === 'delete-task' && id) {
    const task = state.data.tasks.find((t) => t.id === id);
    if (task && window.confirm(t('confirmDeleteTask', { title: task.title }))) {
      const href = task.href;
      // Optimistisch entfernen – die Nextcloud zieht im Hintergrund nach.
      state.data.tasks = state.data.tasks.filter((t) => t.id !== id);
      state.editingTask = null;
      rerender();
      if (href) {
        queue(async () => {
          try {
            await deleteTask(href);
          } catch {
            // Fehlgeschlagen: ehrlichen Stand aus der Nextcloud holen
            try {
              await reloadAgenda();
            } catch {
              /* Agenda nicht erreichbar – Hinweis reicht */
            }
            state.syncError = t('taskDeleteFailed');
            rerender();
          }
        });
      }
    }
  }

  if (action === 'event-ics') {
    // Alternative zum NC-Speichern: .ics herunterladen → Geräte-Kalender importiert
    const form = trigger.closest<HTMLElement>('[data-event-form]');
    if (form) {
      const { date, start, end } = readForm(form, ['date', 'start', 'end']);
      const title = normalizeText(readForm(form, ['title']).title);
      if (title && date && start && end) {
        registerTitleTags(title);
        downloadIcs(buildEventIcs({ title, date, start, end }), `termin-${date}.ics`);
        state.creatingEvent = false;
        rerender();
      }
    }
  }

  if (action === 'switch-column') {
    switchMobileColumn(state.mobileColumn === 'main' ? 'side' : 'main');
  }

  if (action === 'toggle-lang') {
    toggleLang();
    rerender();
  }

  if (action === 'add-habit') {
    const habit: Habit = {
      id: `h-${crypto.randomUUID()}`,
      title: t('newHabit'),
      schedule: 'daily',
      log: [],
      color: DEFAULT_HABIT_COLOR,
    };
    state.data.habits.push(habit);
    rerender();
    // Titel direkt zum Überschreiben markieren
    const titleInputs = root!.querySelectorAll<HTMLInputElement>(
      '.habit-editor input[data-edit="title"]',
    );
    const lastInput = titleInputs[titleInputs.length - 1];
    lastInput?.focus();
    lastInput?.select();
    queue(persistAchievements);
  }

  if (action === 'delete-habit' && id) {
    const habit = state.data.habits.find((h) => h.id === id);
    if (habit && window.confirm(`Gewohnheit "${habit.title}" löschen?`)) {
      state.data.habits = state.data.habits.filter((h) => h.id !== id);
      rerender();
      queue(persistAchievements);
    }
  }

  if (action === 'toggle-task') {
    const task = state.data.tasks.find((t) => t.id === id);
    if (task) {
      task.completed = !task.completed;
      // Erledigungszeitpunkt lokal mitführen → sofortige Monatsgruppierung in UN:DONE,
      // ohne auf den nächsten Agenda-Reload zu warten.
      task.completedAt = task.completed ? new Date().toISOString() : undefined;
      rerender();
      // In Nextcloud Tasks zurückschreiben (VTODO via CalDAV)
      const href = task.href;
      const desired = task.completed;
      if (href) {
        queue(async () => {
          try {
            await toggleTask(href, desired);
          } catch {
            // Konflikt oder Fehler: ehrlichen Stand aus der Nextcloud holen
            try {
              await reloadAgenda();
            } catch {
              /* Agenda nicht erreichbar – Hinweis reicht */
            }
            state.syncError = t('toggleSaveFailed');
            rerender();
          }
        });
      }
    }
  }

  if (action === 'toggle-habit') {
    const habit = state.data.habits.find((h) => h.id === id);
    if (habit) {
      const today = isoDate();
      const wasDone = habit.log.includes(today);
      // Heute abhaken bzw. das Abhaken zurücknehmen
      habit.log = wasDone
        ? habit.log.filter((day) => day !== today)
        : [...habit.log, today];
      // Verknüpfte Fortschrittsbalken reagieren mit: Zahl und Füllstand
      for (const achievement of state.data.achievements) {
        if (achievement.habitId === habit.id) {
          const delta = wasDone ? -1 : 1;
          achievement.progress = Math.min(
            achievement.target,
            Math.max(0, achievement.progress + delta),
          );
        }
      }
      rerender();
      queue(persistAchievements);
    }
  }
});

// Formulare: Termin → Nextcloud-Kalender, Aufgabe → Nextcloud Tasks
root.addEventListener('submit', (event) => {
  const form = event.target as HTMLElement;
  if (form.matches('[data-event-form]')) {
    event.preventDefault();
    void submitEventForm(form);
  }
  if (form.matches('[data-task-form]')) {
    event.preventDefault();
    void submitTaskForm(form);
  }
  if (form.matches('[data-task-edit-form]')) {
    event.preventDefault();
    void submitTaskEditForm(form);
  }
  if (form.matches('[data-event-edit-form]')) {
    event.preventDefault();
    void submitEventEditForm(form);
  }
});

// Habit-Editor: Änderungen an Farbe/Name/Zeitraum/Ziel übernehmen.
// "change" feuert erst beim Verlassen des Felds bzw. nach der Auswahl –
// so zerstört das Re-Rendering nicht den Fokus beim Tippen.
root.addEventListener('change', (event) => {
  const field = event.target as HTMLElement;
  const { edit, id } = field.dataset;
  if (!edit) {
    return;
  }
  const habit = state.data.habits.find((h) => h.id === id);
  if (!habit) {
    return;
  }
  if (edit === 'color' && field instanceof HTMLInputElement) {
    habit.color = field.value;
  }
  if (edit === 'title' && field instanceof HTMLInputElement && field.value.trim()) {
    habit.title = field.value.trim();
  }
  if (edit === 'schedule' && field instanceof HTMLSelectElement) {
    habit.schedule = field.value as 'daily' | 'weekly';
  }
  if (edit === 'target' && field instanceof HTMLInputElement) {
    habit.target = field.value ? Number(field.value) : undefined;
  }
  rerender();
  queue(persistAchievements);
});

// Umbenennen: Enter speichert, Escape bricht ab
root.addEventListener('keydown', (event) => {
  const input = (event.target as HTMLElement).closest?.('input.area-rename');
  if (!(input instanceof HTMLInputElement)) {
    return;
  }
  if (event.key === 'Escape') {
    state.editing = null;
    rerender();
  }
  if (event.key === 'Enter' && input.dataset.path) {
    commitRename(input.dataset.path, input.value.trim());
  }
});

// Fokus verlassen ohne Enter = Abbruch (blur blubbert nicht → Capture-Phase)
root.addEventListener(
  'blur',
  (event) => {
    const input = event.target as HTMLElement;
    if (input instanceof HTMLInputElement && input.classList.contains('area-rename')) {
      if (state.editing === input.dataset.path) {
        state.editing = null;
        rerender();
      }
    }
  },
  true,
);

// Auf-/Zugeklappt-Zustand der Bereiche merken, damit er Re-Renderings übersteht.
// Das toggle-Event blubbert nicht nach oben – deshalb die Capture-Phase (true).
root.addEventListener(
  'toggle',
  (event) => {
    const details = event.target as HTMLDetailsElement;
    const area = details.dataset.area;
    if (!area) {
      return;
    }
    if (details.open) {
      state.collapsed.delete(area);
    } else {
      state.collapsed.add(area);
    }
  },
  true,
);

// Tag-Vorschläge: jedes Zeichen in einem Titel-Feld aktualisiert das Dropdown
root.addEventListener('input', (event) => {
  const input = event.target as HTMLElement;
  if (input instanceof HTMLInputElement && input.dataset.field === 'title') {
    renderSuggest(input);
  }
});

// Tastatur im offenen Dropdown: ↑/↓ wählt, Enter übernimmt (statt Formular
// abzuschicken!), Escape schließt nur die Liste
root.addEventListener('keydown', (event) => {
  if (!suggestData || event.target !== suggestFor) {
    return;
  }
  const count = suggestData.matches.length;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    suggestIndex = (suggestIndex + (event.key === 'ArrowDown' ? 1 : count - 1)) % count;
    markActiveSuggest();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    pickSuggest(suggestIndex);
  } else if (event.key === 'Escape') {
    closeSuggest();
    // Escape hat hier nur die Liste geschlossen – NICHT auch das Formular schließen.
    event.stopImmediatePropagation();
  }
});

// Escape im Erstell- ODER Bearbeiten-Formular (Aufgabe/Termin) → abbrechen,
// nichts anlegen/ändern. Läuft nur, wenn kein Vorschlags-Dropdown den Escape
// vorher verbraucht hat (siehe stopImmediatePropagation oben).
root.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') {
    return;
  }
  const el = event.target as HTMLElement;
  if (el.closest?.('[data-task-form], [data-event-form]')) {
    state.creatingTask = false;
    state.creatingEvent = false;
    rerender();
  } else if (el.closest?.('[data-task-edit-form], [data-event-edit-form]')) {
    state.editingTask = null;
    state.editingEvent = null;
    rerender();
  }
});

// Klick/Tipp auf einen Vorschlag – mousedown statt click, damit das
// Eingabefeld den Fokus behält (blur würde die Liste vorher schließen)
root.addEventListener('mousedown', (event) => {
  const item = (event.target as HTMLElement).closest<HTMLElement>('[data-suggest-index]');
  if (item) {
    event.preventDefault();
    pickSuggest(Number(item.dataset.suggestIndex));
  }
});

// Feld verlassen = Liste schließen (Capture-Phase: blur blubbert nicht)
root.addEventListener(
  'focusout',
  (event) => {
    if (event.target === suggestFor) {
      closeSuggest();
    }
  },
  true,
);

// Erstell-Formular (Aufgabe/Termin) OHNE Eingabe verlassen → Modus schließen,
// nichts anlegen. Greift nur, wenn der Fokus das Formular ganz verlässt und der
// Titel leer ist. suppressCreateToggle verhindert, dass ein Tipp auf dieselbe
// (+)-Pille das Formular gleich wieder öffnet (siehe Toggle-Handler oben).
root.addEventListener('focusout', (event) => {
  const form = (event.target as HTMLElement).closest?.('[data-task-form], [data-event-form]');
  if (!form) {
    return;
  }
  const next = event.relatedTarget as Node | null;
  if (next && form.contains(next)) {
    return; // Fokus bleibt im Formular (z. B. ins Datumsfeld) → offen lassen
  }
  const title = form.querySelector<HTMLInputElement>('[data-field="title"]')?.value.trim() ?? '';
  if (title) {
    return; // schon etwas getippt → nicht automatisch verwerfen
  }
  state.creatingTask = false;
  state.creatingEvent = false;
  suppressCreateToggle = Date.now();
  rerender();
});

// Mobile-Wisch, nur im Ein-Spalten-Layout (gleiche Schwelle wie das CSS: 40.999rem):
//   • Wisch von der Bildschirm-KANTE  → Tab wechseln (Reihenfolge, mit Umlauf)
//   • Wisch von INNEN                 → Haupt-/Karten-Spalte umschalten
// Wichtig gegen das alte „nur perfekt waagerecht"-Problem: die Achse wird FRÜH
// (per touchmove) festgelegt; ist der Wisch waagerecht, sperren wir das vertikale
// Scrollen (preventDefault) – so zählt er zuverlässig, auch auf langen Seiten.
const singleColumn = window.matchMedia('(max-width: 40.999rem)');
const EDGE_ZONE = 28; // px ab Rand: Start hier = Tab-Wechsel statt Spalten-Toggle
const AXIS_LOCK = 8; // px Bewegung, ab der die Richtung (waagerecht/senkrecht) feststeht
const SWIPE_MIN_X = 36; // px Mindest-Weg waagerecht, damit der Wisch zählt
let swipeStartX = 0;
let swipeStartY = 0;
let swipeEdge = 0; // -1 linke Kante, +1 rechte Kante, 0 = innen
let swipeAxis: 'none' | 'h' | 'v' = 'none';
let swipeTracking = false;

root.addEventListener(
  'touchstart',
  (event) => {
    // Nur Einzelfinger und nur im schmalen Layout. Wische, die auf einem
    // Drag-Greifer oder in einem Eingabefeld beginnen, gehören diesen Elementen.
    // Buttons (Aufgaben/Habits/Termine sind ganze Buttons!) NICHT ausschließen:
    // der Wisch schlägt erst bei waagerechter Bewegung zu, ein reiner Tap klickt
    // weiter ganz normal den Button.
    const target = event.target as HTMLElement;
    if (
      event.touches.length !== 1 ||
      !singleColumn.matches ||
      target.closest('[data-drag], input, textarea, select')
    ) {
      swipeTracking = false;
      return;
    }
    window.clearTimeout(swipeResetTimer); // neue Geste → evtl. anstehenden Reset abblasen
    const touch = event.touches[0];
    swipeTracking = true;
    swipeAxis = 'none';
    swipeStartX = touch.clientX;
    swipeStartY = touch.clientY;
    const width = window.innerWidth;
    swipeEdge = touch.clientX <= EDGE_ZONE ? -1 : touch.clientX >= width - EDGE_ZONE ? 1 : 0;
    // Inhalts-Unterkante (Oberkante der Navi) – für die obere/untere 50%-Trennlinie.
    swipeNavTop =
      (root.querySelector('.bottom-nav') as HTMLElement | null)?.getBoundingClientRect().top ??
      window.innerHeight;
  },
  { passive: true },
);

root.addEventListener(
  'touchmove',
  (event) => {
    if (!swipeTracking) {
      return;
    }
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    const dx = touch.clientX - swipeStartX;
    const dy = touch.clientY - swipeStartY;
    if (swipeAxis === 'none') {
      if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) {
        return; // noch zu wenig Bewegung, um die Achse sicher zu bestimmen
      }
      swipeAxis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (swipeAxis === 'v') {
        swipeTracking = false; // senkrecht → der Liste das normale Scrollen lassen
        return;
      }
    }
    if (swipeAxis === 'h') {
      event.preventDefault(); // waagerecht → Scroll sperren, der Wisch gehört uns
      if (swipeEdge !== 0) {
        showSwipeDivider(); // Zonengrenze sichtbar machen (nur beim Kanten-Wisch)
        // Kanten-Wisch: Richtung kommt aus Kante + vertikaler Hälfte (startEdgePreview).
        if (!previewEl) {
          startEdgePreview();
        }
        moveEdgePreview(dx);
      }
    }
  },
  { passive: false },
);

root.addEventListener(
  'touchend',
  (event) => {
    if (!swipeTracking || swipeAxis !== 'h') {
      swipeTracking = false;
      if (previewEl) {
        endEdgePreview(0); // sicher zurückschnappen – Linie bleibt bis zum Ende (teardown)
      } else {
        hideSwipeDivider(); // kein laufender Tab-Wechsel → Linie sofort weg
      }
      return;
    }
    swipeTracking = false;
    const dx = (event.changedTouches[0]?.clientX ?? swipeStartX) - swipeStartX;
    if (swipeEdge !== 0 && previewEl) {
      // Von der Kante: die Vorschau entscheidet Commit (Tab-Wechsel) vs. Zurückschnappen.
      // Die Trennlinie wird erst in teardownEdgePreview ausgeblendet – nach der Animation.
      endEdgePreview(dx);
    } else {
      // Von innen: links → Termine-Karte, rechts → Aufgaben (immer direkt, keine Zonen).
      if (swipeEdge === 0 && Math.abs(dx) >= SWIPE_MIN_X) {
        switchMobileColumn(dx < 0 ? 'side' : 'main');
      }
      hideSwipeDivider(); // kein Tab-Wechsel → Linie sofort weg
    }
  },
  { passive: true },
);

// Bricht iOS den Wisch ab (z. B. System-Zurück), Vorschau sauber aufräumen.
root.addEventListener('touchcancel', () => {
  swipeTracking = false;
  if (previewEl) {
    endEdgePreview(0); // Linie bleibt bis zum Ende des Zurückschnappens (teardown)
  } else {
    hideSwipeDivider();
  }
});

// Drag & Drop: Greifer/Ziele erkennt die Engine selbst, wir verarbeiten nur das Ergebnis
initDragDrop(root, (info) => {
  if (info.dragKind === 'task') {
    dropTask(info);
  } else if (info.dragKind === 'area') {
    moveArea(info);
  }
});

// Hell/Dunkel-Wechsel des Geräts: Statusleisten-Farbe sofort nachziehen
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeColor);

rerender(); // Lade-Ansicht sofort zeigen …
ensureSwipeDivider(); // persistente Zonen-Doppellinie (Mobil) aufsetzen/positionieren
void boot(); // … und die echten Daten holen

// Doppellinie an Layoutänderungen (Drehen/Resize/Spaltenwechsel) anpassen.
window.addEventListener('resize', ensureSwipeDivider);
window.addEventListener('orientationchange', ensureSwipeDivider);
singleColumn.addEventListener('change', ensureSwipeDivider);
