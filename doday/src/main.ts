// Einstiegspunkt: Zustand aufbauen, rendern, Interaktionen verdrahten.
//
// Event-Delegation: Wir hängen EINEN Klick-Listener an den App-Container
// statt an jeden Button einzeln. Vorteil: Der Listener überlebt jedes
// Re-Rendering (innerHTML ersetzt ja alle Elemente) und bleibt an einer Stelle.
import './style.css';
import { loadMockData, createMockRegistry } from './services/mockData';
import { renderDayView, type AppState } from './ui/dayView';
import { isoDate } from './utils/dates';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('Element #app fehlt in index.html');
}

const state: AppState = {
  data: loadMockData(), // Phase 2: hier kommen WebDAV/CalDAV-Services rein
  registry: createMockRegistry(),
  collapsed: new Set(),
  firstRender: true,
};

function rerender(): void {
  renderDayView(root!, state);
  state.firstRender = false;
}

root.addEventListener('click', (event) => {
  const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!trigger) {
    return;
  }
  const { action, id } = trigger.dataset;

  if (action === 'toggle-task') {
    const task = state.data.tasks.find((t) => t.id === id);
    if (task) {
      task.completed = !task.completed;
      rerender();
    }
  }

  if (action === 'toggle-habit') {
    const habit = state.data.habits.find((h) => h.id === id);
    if (habit) {
      const today = isoDate();
      // Heute abhaken bzw. das Abhaken zurücknehmen
      habit.log = habit.log.includes(today)
        ? habit.log.filter((day) => day !== today)
        : [...habit.log, today];
      rerender();
    }
  }
});

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

rerender();
