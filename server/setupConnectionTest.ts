// Verbindungstest fürs Setup-Formular: prüft echte Zugangsdaten gegen die
// Nextcloud, bevor irgendetwas gespeichert wird. Nutzt denselben WebDAV-Weg
// wie der spätere Normalbetrieb (ensureFolder legt den Datenordner an bzw.
// bestätigt, dass er existiert).
import { WebDavClient } from './webdav';

export interface ConnectionTestInput {
  nextcloudUrl: string;
  nextcloudUser: string;
  appPassword: string;
  dataDir: string;
}

export async function testNextcloudConnection(
  input: ConnectionTestInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const dav = new WebDavClient(input.nextcloudUrl, input.nextcloudUser, input.appPassword);
    await dav.ensureFolder(input.dataDir);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unbekannter Fehler' };
  }
}
