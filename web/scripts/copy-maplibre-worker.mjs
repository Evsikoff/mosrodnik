// Воркер MapLibre отдаётся как статический файл: dev-сервер Vite дописал бы в него клиент HMR.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve('maplibre-gl/package.json')) + '/dist';
const out = path.resolve(import.meta.dirname, '../public/vendor/maplibre');
fs.mkdirSync(out, { recursive: true });
for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  fs.copyFileSync(path.join(dist, f), path.join(out, f));
}
