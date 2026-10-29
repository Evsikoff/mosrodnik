import { config } from '../src/config.js';
import { Database } from '../src/db/index.js';
import { runSync } from '../src/sync/datamos.js';

const db = new Database(config.dataDir);
await db.seed(config.seedDir);
await db.load();
const ok = await runSync(db, config.datamosKey, console);
console.log(ok ? 'синхронизация выполнена' : 'синхронизация не удалась, см. datamos/sync-state.json');
process.exit(ok ? 0 : 1);
