// Konfiguration ausschließlich über Umgebungsvariablen (ExApp-Readiness):
// Zugangsdaten stehen NIE im Code – lokal kommen sie aus der .env-Datei,
// im Container aus dem Compose-/Traefik-Setup.
import 'dotenv/config';

export interface AppConfig {
  /** Basis-URL der Nextcloud, z. B. https://cd.msmr.co */
  nextcloudUrl: string;
  nextcloudUser: string;
  appPassword: string;
  /** Ordner für App-Daten in den Nextcloud-Dateien */
  dataDir: string;
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nextcloudUrl = env.NEXTCLOUD_URL;
  const nextcloudUser = env.NEXTCLOUD_USER;
  const appPassword = env.NEXTCLOUD_APP_PASSWORD;
  if (!nextcloudUrl || !nextcloudUser || !appPassword) {
    throw new Error(
      'Fehlende Umgebungsvariablen: NEXTCLOUD_URL, NEXTCLOUD_USER und ' +
        'NEXTCLOUD_APP_PASSWORD müssen gesetzt sein (siehe .env.example)',
    );
  }
  return {
    nextcloudUrl: nextcloudUrl.replace(/\/+$/, ''), // ohne Slash am Ende
    nextcloudUser,
    appPassword,
    dataDir: env.DODAY_DATA_DIR ?? '/Notes/DoDay',
    port: Number(env.PORT ?? 3000),
  };
}
