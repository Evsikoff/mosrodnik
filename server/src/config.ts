import fs from 'node:fs';
import path from 'node:path';

/** Корень репозитория: ближайшая папка вверх от cwd, где лежат server/ и web/. */
function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    if (fs.existsSync(path.join(dir, 'server')) && fs.existsSync(path.join(dir, 'web'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}
const root = repoRoot();

const env = process.env;

export const config = {
  port: Number(env.NODE_ENV === 'production' ? (env.PORT ?? 3000) : (env.API_PORT ?? 3000)),
  host: env.HOST ?? '0.0.0.0',
  dataDir: path.resolve(env.DATA_DIR ?? path.join(root, 'data')),
  seedDir: path.resolve(env.SEED_DIR ?? path.join(root, 'data')),
  webDist: path.resolve(env.WEB_DIST ?? path.join(root, 'web', 'dist')),
  webPublic: path.resolve(env.WEB_PUBLIC ?? path.join(root, 'web', 'public')),
  datamosKey: env.DATAMOS_API_KEY ?? '',
  sessionSecret: env.SESSION_SECRET ?? 'dev-session-secret-change-me',
  sessionSalt: env.SESSION_SALT ?? 'dev-session-salt-change-me',
  adminToken: env.ADMIN_TOKEN ?? '',
  publicUrl: env.PUBLIC_URL ?? '',
  syncOnStart: env.SYNC_ON_START !== '0',
  isProd: env.NODE_ENV === 'production',
};
