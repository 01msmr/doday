// Konfiguration ausschließlich über Umgebungsvariablen (ExApp-Readiness):
// Zugangsdaten stehen NIE im Code – lokal kommen sie aus der .env-Datei,
// im Container aus dem Compose-/Traefik-Setup.
import 'dotenv/config';
import { createHash } from 'node:crypto';

/** Cookie-Login: gemeinsames Passwort + HMAC-Schlüssel fürs Sitzungs-Cookie. */
export interface AuthConfig {
  password: string;
  secret: string;
}

export interface AppConfig {
  /** Basis-URL der Nextcloud, z. B. https://cd.msmr.co */
  nextcloudUrl: string;
  nextcloudUser: string;
  appPassword: string;
  /** Ordner für App-Daten in den Nextcloud-Dateien */
  dataDir: string;
  port: number;
  /** Cookie-Login aktiv, sobald DODAY_PASSWORD gesetzt ist (sonst kein Schutz – z. B. Dev) */
  auth?: AuthConfig;
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
  // Cookie-Login nur, wenn ein Passwort gesetzt ist. Der HMAC-Schlüssel kommt aus
  // DODAY_AUTH_SECRET oder wird stabil aus dem Passwort abgeleitet (eine ENV genügt).
  const auth = env.DODAY_PASSWORD
    ? {
        password: env.DODAY_PASSWORD,
        secret:
          env.DODAY_AUTH_SECRET ||
          createHash('sha256').update(env.DODAY_PASSWORD).digest('hex'),
      }
    : undefined;

  return {
    nextcloudUrl: nextcloudUrl.replace(/\/+$/, ''), // ohne Slash am Ende
    nextcloudUser,
    appPassword,
    dataDir: env.DODAY_DATA_DIR ?? '/Notes/DoDay',
    port: Number(env.PORT ?? 3000),
    auth,
  };
}
