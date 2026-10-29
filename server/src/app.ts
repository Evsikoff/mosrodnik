import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { config } from './config.js';
import { Database } from './db/index.js';
import type { User } from './db/schemas.js';
import { ApiError, RateLimiter, unsign } from './util.js';
import { registerSessionRoutes } from './routes/session.js';
import { registerSpringRoutes } from './routes/springs.js';
import { registerMiscRoutes } from './routes/misc.js';

export interface Ctx {
  db: Database;
  currentUser(req: FastifyRequest): User | null;
  requireUser(req: FastifyRequest): User;
  limits: { obs: RateLimiter; photo: RateLimiter; rename: RateLimiter; ip: RateLimiter };
}

export async function buildApp(db: Database, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? false,
    trustProxy: config.isProd,
    bodyLimit: 1024 * 1024,
  });

  await app.register(fastifyCookie);
  await app.register(fastifyMultipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 6 } });

  const ctx: Ctx = {
    db,
    currentUser(req) {
      const id = unsign(req.cookies.sid);
      const u = id ? db.users.get(id) : undefined;
      return u ?? null;
    },
    requireUser(req) {
      const u = ctx.currentUser(req);
      if (!u) throw new ApiError(401, 'no_session', 'Сессия не найдена. Обновите страницу.');
      return u;
    },
    limits: {
      obs: new RateLimiter(30, 3600_000),
      photo: new RateLimiter(10, 3600_000),
      rename: new RateLimiter(5, 24 * 3600_000),
      ip: new RateLimiter(300, 60_000),
    },
  };
  const sweeper = setInterval(() => Object.values(ctx.limits).forEach((l) => l.sweep()), 600_000);
  sweeper.unref();
  app.addHook('onClose', async () => clearInterval(sweeper));

  app.addHook('onRequest', async (req) => {
    if (req.url.startsWith('/api/') && !ctx.limits.ip.take(req.ip)) {
      throw new ApiError(429, 'rate_limited', 'Слишком много запросов. Подождите минуту.');
    }
  });

  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: { code: 'validation', message: 'Некорректные данные запроса.' } });
    }
    if (err.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.status(413).send({ error: { code: 'too_large', message: 'Файл больше 10 МБ.' } });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: { code: 'bad_request', message: 'Некорректный запрос.' } });
    }
    app.log.error(err);
    return reply.status(500).send({ error: { code: 'internal', message: 'Внутренняя ошибка сервера.' } });
  });

  registerSessionRoutes(app, ctx);
  registerSpringRoutes(app, ctx);
  registerMiscRoutes(app, ctx);

  app.all('/api/*', async (_req, reply) =>
    reply.status(404).send({ error: { code: 'not_found', message: 'Такого запроса нет.' } }));

  // Загруженные фото: внутри DATA_DIR/uploads
  const uploads = path.join(db.dir, 'uploads');
  fs.mkdirSync(path.join(uploads, 'photos'), { recursive: true });
  await app.register(fastifyStatic, {
    root: uploads, prefix: '/uploads/', decorateReply: false,
    maxAge: '7d', immutable: true, index: false,
  });

  // Статика фронтенда и SPA-маршруты
  const root = fs.existsSync(path.join(config.webDist, 'index.html')) ? config.webDist : null;
  if (root) {
    await app.register(fastifyStatic, {
      root, prefix: '/', maxAge: '1h',
      // хешированные файлы в /assets/ неизменны, остальное (включая index.html) проверяем при каждом заходе
      setHeaders(res, file) {
        const value = file.includes(`${path.sep}assets${path.sep}`)
          ? 'public, max-age=31536000, immutable' : 'no-cache';
        const r = res as any;
        if (typeof r.setHeader === 'function') r.setHeader('Cache-Control', value);
        else r.header('Cache-Control', value);
      },
    });
    const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/')) {
        return reply.status(404).send({ error: { code: 'not_found', message: 'Не найдено.' } });
      }
      return reply.header('Cache-Control', 'no-cache').type('text/html; charset=utf-8').send(indexHtml);
    });
  }
  return app;
}
