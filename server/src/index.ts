import { config } from './config.js';
import { Database } from './db/index.js';
import { buildApp } from './app.js';
import { scheduleSync } from './sync/datamos.js';

const log = {
  info: (m: string) => console.log(`[info] ${m}`),
  warn: (m: string) => console.warn(`[warn] ${m}`),
};

const db = new Database(config.dataDir, log);
await db.seed(config.seedDir);
await db.load();

const app = await buildApp(db, { logger: true });
await app.listen({ port: config.port, host: config.host });

// Синхронизация в фоне: старт не блокирует, дальше раз в сутки
scheduleSync(db, config.datamosKey, log, config.syncOnStart);

const stop = async () => {
  await app.close();
  await Promise.all([
    db.springs.flush(), db.users.flush(), db.observations.flush(), db.photos.flush(),
    db.subscriptions.flush(), db.hidden.flush(),
  ]);
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
