/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// Vite-Konfiguration: Dev-Server + Build.
// Der "test"-Block konfiguriert Vitest (unsere Unit-Tests).
export default defineConfig({
  test: {
    // Die Logik-Tests (TagService, TagRegistry) brauchen keinen Browser
    environment: 'node',
  },
});
