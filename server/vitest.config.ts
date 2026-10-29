import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Подготовка API-тестов копирует больше 3000 JSON образцов; на Windows это может занять больше 10 секунд.
    hookTimeout: 30_000,
    env: { WEB_PUBLIC: path.resolve(import.meta.dirname, '../web/public'), NODE_ENV: 'test', ADMIN_TOKEN: 'test-admin', SAMPLES_AFFECT_MAP: '0' },
  },
});
