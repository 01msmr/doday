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

const config = loadConfig();
const dav = new WebDavClient(config.nextcloudUrl, config.nextcloudUser, config.appPassword);

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
