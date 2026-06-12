/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// Vite-Konfiguration: Dev-Server + Build.
// Der "test"-Block konfiguriert Vitest (unsere Unit-Tests).
export default defineConfig({
  server: {
    proxy: {
      // Entwicklung: API-Anfragen an das lokale Hono-Backend durchreichen
      // (gleiche Origin für den Browser → kein CORS-Thema)
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    // Die Logik-Tests (TagService, TagRegistry) brauchen keinen Browser
    environment: 'node',
  },
});
