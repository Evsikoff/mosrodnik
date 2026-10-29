import { config } from './config.js';
import { Database } from './db/index.js';
import { buildApp } from './app.js';
import { scheduleSync } from './sync/datamos.js';

const log = {
  info: (m: string) => console.log(`[info] ${m}`),
  warn: (m: string) => console.warn(`[warn] ${m}`),
};

if (config.isProd) {
  const weak = [
    !process.env.SESSION_SECRET && 'SESSION_SECRET',
    !process.env.SESSION_SALT && 'SESSION_SALT',
  ].filter(Boolean);
  if (weak.length) log.warn(`не заданы ${weak.join(', ')}: используются небезопасные значения по умолчанию`);
  if (!config.adminToken) log.warn('ADMIN_TOKEN не задан: скрытие записей отключено');
}

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
