// doday-Backend: dünner API-Layer zwischen Browser und Nextcloud.
//
// Warum ein Backend? Das App-Passwort bleibt auf dem Server (ENV-Variable)
// und wandert nie in den Browser. Der Browser spricht nur /api/v1/... –
// gleiche Origin, kein CORS, und später ExApp-tauglich (AppAPI).
//
// Im Container liefert derselbe Prozess auch das gebaute Frontend (dist/) aus.
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { loadConfig } from './config';
import { WebDavClient, WebDavConflictError } from './webdav';
import { CalDavClient, type CalendarInfo } from './caldav';
import {
  buildEventIcsUtc,
  buildTodoIcs,
  parseEvents,
  parseTodo,
  setTodoCompleted,
  updateEventIcs,
  updateTodoIcs,
} from './ical';
// Dieselbe Tag-Logik wie im Frontend – ein Repo, eine Wahrheit
import { parseTags } from '../src/services/tagService';

const config = loadConfig();
const dav = new WebDavClient(config.nextcloudUrl, config.nextcloudUser, config.appPassword);
const caldav = new CalDavClient(config.nextcloudUrl, config.nextcloudUser, config.appPassword);

const ACHIEVEMENTS_FILE = `${config.dataDir}/achievements.json`;
const TAGS_FILE = `${config.dataDir}/tags.json`;

/** Startwerte, solange die Dateien in der Nextcloud noch nicht existieren */
const DEFAULT_ACHIEVEMENTS = { habits: [], achievements: [] };
const defaultTags = () => ({ version: 0, updatedAt: new Date().toISOString(), tags: [] });

const app = new Hono();

app.get('/api/v1/health', (c) => c.json({ ok: true, dataDir: config.dataDir }));

/** GET = Datei lesen (oder Startwert), PUT = schreiben mit ETag-Konfliktschutz */
function jsonFileRoutes(route: string, file: string, fallback: () => unknown): void {
  app.get(`/api/v1/${route}`, async (c) => {
    const result = await dav.getJson(file);
    return c.json(result ?? { data: fallback(), etag: null });
  });

  app.put(`/api/v1/${route}`, async (c) => {
    try {
      const body = await c.req.json();
      const etag = c.req.header('if-match') ?? undefined;
      await dav.ensureFolder(config.dataDir);
      const newEtag = await dav.putJson(file, body, etag);
      return c.json({ etag: newEtag });
    } catch (error) {
      if (error instanceof WebDavConflictError) {
        // Client soll neu laden und seine Änderung erneut anwenden
        return c.json({ error: 'Konflikt – Datei wurde extern geändert' }, 409);
      }
      throw error;
    }
  });
}

jsonFileRoutes('achievements', ACHIEVEMENTS_FILE, () => DEFAULT_ACHIEVEMENTS);
jsonFileRoutes('tags', TAGS_FILE, defaultTags);

/* ---------- CalDAV: Termine + Aufgaben ---------- */

// Kalenderliste kurz cachen – sie ändert sich selten.
// App-generierte Kalender (z. B. Deck-Boards) bleiben außen vor:
// deren VTODOs sind Karten/Listen, keine echten Aufgaben.
let calendarCache: { at: number; list: CalendarInfo[] } | null = null;
async function calendars(): Promise<CalendarInfo[]> {
  if (!calendarCache || Date.now() - calendarCache.at > 5 * 60_000) {
    const list = (await caldav.listCalendars()).filter(
      (cal) => !cal.href.includes('app-generated'),
    );
    calendarCache = { at: Date.now(), list };
  }
  return calendarCache.list;
}

/** Ziel-Kalender fürs Anlegen: per ENV benannt, sonst der erste passende */
async function targetCalendar(component: string, envName?: string): Promise<CalendarInfo> {
  const candidates = (await calendars()).filter((cal) => cal.components.includes(component));
  const wanted = envName ? candidates.find((cal) => cal.displayName === envName) : undefined;
  const calendar = wanted ?? candidates[0];
  if (!calendar) {
    throw new Error(`Kein Nextcloud-Kalender mit ${component}-Unterstützung gefunden`);
  }
  return calendar;
}

/** Termine + Aufgaben des Zeitfensters aus allen Kalendern, fertig fürs Frontend */
app.get('/api/v1/agenda', async (c) => {
  const start = new Date(Number(c.req.query('start')));
  const end = new Date(Number(c.req.query('end')));

  const events = [];
  const tasks = [];
  for (const calendar of await calendars()) {
    if (calendar.components.includes('VEVENT')) {
      for (const object of await caldav.reportEvents(calendar.href, start, end)) {
        const instances = parseEvents(object.data);
        // Serie? Mehrere expandierte Instanzen ODER Serien-Marker in der Datei.
        // Serien sind im Frontend nicht editierbar (kein Stift).
        const recurring =
          instances.length > 1 || /^(RRULE|RECURRENCE-ID)[;:]/m.test(object.data);
        for (const event of instances) {
          const { cleanText, tags } = parseTags(event.summary);
          events.push({
            id: `${object.href}#${event.start}`,
            href: object.href,
            rawText: event.summary,
            title: cleanText,
            tags,
            start: event.start,
            end: event.end,
            allDay: event.allDay,
            recurring,
          });
        }
      }
    }
    if (calendar.components.includes('VTODO')) {
      for (const object of await caldav.reportTodos(calendar.href)) {
        const todo = parseTodo(object.data);
        if (!todo) {
          continue;
        }
        const { cleanText, tags } = parseTags(todo.summary);
        tasks.push({
          id: object.href,
          href: object.href,
          rawText: todo.summary,
          title: cleanText,
          tags,
          completed: todo.completed,
          due: todo.due,
        });
      }
    }
  }
  events.sort((a, b) => a.start.localeCompare(b.start));
  return c.json({ events, tasks });
});

/** Neue Aufgabe in Nextcloud Tasks (VTODO) */
app.post('/api/v1/tasks', async (c) => {
  const { title, due } = (await c.req.json()) as { title?: string; due?: string };
  if (!title?.trim()) {
    return c.json({ error: 'Titel fehlt' }, 400);
  }
  const calendar = await targetCalendar('VTODO', process.env.DODAY_TASKS_CALENDAR);
  const uid = crypto.randomUUID();
  await caldav.createObject(calendar.href, `${uid}.ics`, buildTodoIcs({ uid, title, due }));

  const href = `${calendar.href}${uid}.ics`;
  const { cleanText, tags } = parseTags(title);
  return c.json({
    task: { id: href, href, rawText: title, title: cleanText, tags, completed: false, due },
  });
});

/** Aufgabe abhaken / wieder öffnen – lädt das VTODO, ändert nur den Status */
app.post('/api/v1/tasks/toggle', async (c) => {
  const { href, completed } = (await c.req.json()) as { href?: string; completed?: boolean };
  if (!href) {
    return c.json({ error: 'href fehlt' }, 400);
  }
  try {
    const current = await caldav.getObject(href);
    const updated = setTodoCompleted(current.data, completed === true, new Date());
    await caldav.putObject(href, updated, current.etag ?? undefined);
    return c.json({ ok: true });
  } catch (error) {
    if (error instanceof WebDavConflictError) {
      return c.json({ error: 'Konflikt – Aufgabe wurde extern geändert' }, 409);
    }
    throw error;
  }
});

/** Aufgabe bearbeiten: Titel (inkl. #Tags) und Fälligkeit umschreiben */
app.post('/api/v1/tasks/update', async (c) => {
  const { href, title, due } = (await c.req.json()) as {
    href?: string;
    title?: string;
    due?: string;
  };
  if (!href || !title?.trim()) {
    return c.json({ error: 'href und Titel werden benötigt' }, 400);
  }
  try {
    const current = await caldav.getObject(href);
    const updated = updateTodoIcs(current.data, { title, due });
    await caldav.putObject(href, updated, current.etag ?? undefined);
    const todo = parseTodo(updated);
    const { cleanText, tags } = parseTags(title);
    return c.json({
      task: {
        id: href,
        href,
        rawText: title,
        title: cleanText,
        tags,
        completed: todo?.completed ?? false,
        due,
      },
    });
  } catch (error) {
    if (error instanceof WebDavConflictError) {
      return c.json({ error: 'Konflikt – Aufgabe wurde extern geändert' }, 409);
    }
    throw error;
  }
});

/** Neuer Termin direkt im Nextcloud-Kalender (synct von dort auf alle Geräte) */
app.post('/api/v1/events', async (c) => {
  const { title, start, end } = (await c.req.json()) as {
    title?: string;
    start?: number;
    end?: number;
  };
  if (!title?.trim() || !start || !end) {
    return c.json({ error: 'Titel, Start und Ende werden benötigt' }, 400);
  }
  const calendar = await targetCalendar('VEVENT', process.env.DODAY_EVENTS_CALENDAR);
  const uid = crypto.randomUUID();
  const startUtc = new Date(start);
  const endUtc = new Date(end);
  await caldav.createObject(
    calendar.href,
    `${uid}.ics`,
    buildEventIcsUtc({ uid, title, startUtc, endUtc }),
  );

  const { cleanText, tags } = parseTags(title);
  return c.json({
    event: {
      id: `${calendar.href}${uid}.ics#${startUtc.toISOString()}`,
      rawText: title,
      title: cleanText,
      tags,
      start: startUtc.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      end: endUtc.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      allDay: false,
    },
  });
});

/** Einzeltermin bearbeiten – Serien lehnt der Server ab (Schutz vor Massenänderung) */
app.post('/api/v1/events/update', async (c) => {
  const { href, title, start, end, date } = (await c.req.json()) as {
    href?: string;
    title?: string;
    start?: number;
    end?: number;
    date?: string;
  };
  if (!href || !title?.trim() || (!date && (!start || !end))) {
    return c.json({ error: 'href, Titel und Zeitangaben werden benötigt' }, 400);
  }
  try {
    const current = await caldav.getObject(href);
    if (/^(RRULE|RECURRENCE-ID)[;:]/m.test(current.data)) {
      return c.json({ error: 'Serientermine bitte direkt in der Nextcloud ändern' }, 400);
    }
    const startUtc = start ? new Date(start) : undefined;
    const endUtc = end ? new Date(end) : undefined;
    const updated = updateEventIcs(current.data, { title, startUtc, endUtc, date });
    await caldav.putObject(href, updated, current.etag ?? undefined);

    const event = parseEvents(updated)[0];
    const { cleanText, tags } = parseTags(title);
    return c.json({
      event: {
        id: `${href}#${event.start}`,
        href,
        rawText: title,
        title: cleanText,
        tags,
        start: event.start,
        end: event.end,
        allDay: event.allDay,
        recurring: false,
      },
    });
  } catch (error) {
    if (error instanceof WebDavConflictError) {
      return c.json({ error: 'Konflikt – Termin wurde extern geändert' }, 409);
    }
    throw error;
  }
});

/** Unerwartete Fehler (z. B. Nextcloud nicht erreichbar) → 502 mit Klartext */
app.onError((error, c) => {
  console.error('[doday]', error);
  return c.json({ error: error instanceof Error ? error.message : 'Unbekannter Fehler' }, 502);
});

// Produktion (Container): gebautes Frontend aus dist/ ausliefern
if (existsSync('./dist')) {
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', serveStatic({ path: './dist/index.html' }));
}

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`doday-Backend läuft auf http://localhost:${info.port}`);
  console.log(`Nextcloud: ${config.nextcloudUrl} (Daten in ${config.dataDir})`);
});
