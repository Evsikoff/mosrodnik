import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { WEB_PUBLIC: path.resolve(import.meta.dirname, '../web/public'), NODE_ENV: 'test', ADMIN_TOKEN: 'test-admin' },
  },
});
