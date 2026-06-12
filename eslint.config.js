// ESLint-Konfiguration (Flat Config, ESLint 9):
// findet typische Fehler und erzwingt sauberen TypeScript-Stil.
// eslint-config-prettier schaltet alle Regeln ab, die mit Prettier kollidieren würden.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
);
