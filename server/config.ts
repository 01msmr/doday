// Konfiguration liegt in einer Datei (data/doday-config.json), die der
// Setup-Assistent beim ersten Start schreibt (server/setupRoutes.ts).
// Kein ENV mehr für Nextcloud-Zugangsdaten oder Cookie-Login – nur PORT
// bleibt eine Infrastruktur-ENV-Variable (siehe server/index.ts).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

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
  /** Cookie-Login: gemeinsames Passwort + HMAC-Schlüssel fürs Sitzungs-Cookie */
  auth: AuthConfig;
  eventsCalendar?: string;
  tasksCalendar?: string;
}

export const CONFIG_PATH = 'data/doday-config.json';

export function configExists(path: string = CONFIG_PATH): boolean {
  return existsSync(path);
}

export function readConfig(path: string = CONFIG_PATH): AppConfig {
  return JSON.parse(readFileSync(path, 'utf-8')) as AppConfig;
}

export function writeConfig(config: AppConfig, path: string = CONFIG_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
}
