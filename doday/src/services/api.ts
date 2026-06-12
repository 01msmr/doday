// API-Schicht: Frontend ↔ Hono-Backend (/api/v1/…).
// Das Backend reicht an die Nextcloud durch – der Browser sieht nie
// Zugangsdaten, nur diese vier kleinen Funktionen.
//
// ETag-Mechanik: Beim Laden merken wir uns das ETag (Fingerabdruck des
// Dateistands) und schicken es beim Speichern als If-Match mit. Wurde die
// Datei zwischenzeitlich extern geändert, antwortet das Backend mit 409 →
// ApiConflictError → der Aufrufer lädt neu.
import type { AchievementsFile, TagRegistryData } from '../models/types';

/** Die Datei wurde extern geändert – neu laden und erneut anwenden */
export class ApiConflictError extends Error {}

async function loadJson<T>(route: string): Promise<{ data: T; etag: string | null }> {
  const res = await fetch(`/api/v1/${route}`);
  if (!res.ok) {
    throw new Error(`Laden von ${route} fehlgeschlagen (${res.status})`);
  }
  return (await res.json()) as { data: T; etag: string | null };
}

async function saveJson(route: string, data: unknown, etag?: string): Promise<string | null> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (etag) {
    headers['If-Match'] = etag;
  }
  const res = await fetch(`/api/v1/${route}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  });
  if (res.status === 409) {
    throw new ApiConflictError(`${route} wurde extern geändert`);
  }
  if (!res.ok) {
    throw new Error(`Speichern von ${route} fehlgeschlagen (${res.status})`);
  }
  const body = (await res.json()) as { etag?: string | null };
  return body.etag ?? null;
}

export function loadAchievements(): Promise<{ data: AchievementsFile; etag: string | null }> {
  return loadJson<AchievementsFile>('achievements');
}

export function saveAchievements(data: AchievementsFile, etag?: string): Promise<string | null> {
  return saveJson('achievements', data, etag);
}

export function loadTagRegistry(): Promise<{ data: TagRegistryData; etag: string | null }> {
  return loadJson<TagRegistryData>('tags');
}

export function saveTagRegistry(data: TagRegistryData, etag?: string): Promise<string | null> {
  return saveJson('tags', data, etag);
}
