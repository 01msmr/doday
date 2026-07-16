// Tests zuerst (TDD): Config kommt jetzt aus einer Datei statt aus ENV.
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configExists, readConfig, writeConfig, type AppConfig } from './config';

const TEST_PATH = join(tmpdir(), `doday-config-test-${process.pid}.json`);

const SAMPLE: AppConfig = {
  nextcloudUrl: 'https://cd.example',
  nextcloudUser: 'uli',
  appPassword: 'geheim',
  dataDir: '/Notes/DoDay',
  auth: { password: 'anmelden', secret: 'abc123' },
  eventsCalendar: 'Persönlich',
  tasksCalendar: 'Aufgaben',
};

afterEach(() => {
  rmSync(TEST_PATH, { force: true });
});

describe('configExists', () => {
  it('ist false, solange keine Datei existiert', () => {
    expect(configExists(TEST_PATH)).toBe(false);
  });

  it('ist true, nachdem geschrieben wurde', () => {
    writeConfig(SAMPLE, TEST_PATH);
    expect(configExists(TEST_PATH)).toBe(true);
  });
});

describe('writeConfig/readConfig', () => {
  it('liest exakt das zurück, was geschrieben wurde', () => {
    writeConfig(SAMPLE, TEST_PATH);
    expect(readConfig(TEST_PATH)).toEqual(SAMPLE);
  });

  it('legt fehlende Verzeichnisse an', () => {
    const nested = join(tmpdir(), `doday-nested-${process.pid}`, 'sub', 'config.json');
    writeConfig(SAMPLE, nested);
    expect(existsSync(nested)).toBe(true);
    rmSync(join(tmpdir(), `doday-nested-${process.pid}`), { recursive: true, force: true });
  });

  it('lässt optionale Kalendernamen weg, wenn nicht gesetzt', () => {
    const { eventsCalendar, tasksCalendar, ...rest } = SAMPLE;
    writeConfig(rest as AppConfig, TEST_PATH);
    const loaded = readConfig(TEST_PATH);
    expect(loaded.eventsCalendar).toBeUndefined();
    expect(loaded.tasksCalendar).toBeUndefined();
  });
});
