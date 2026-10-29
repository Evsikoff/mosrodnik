import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ulid } from 'ulid';
import type { Ctx } from '../app.js';
import { config } from '../config.js';
import type { User } from '../db/schemas.js';
import { ApiError, avatarFile, defaultIdentity, sha256, sign, validateName } from '../util.js';

const SessionBody = z.object({
  device_token: z.string().min(16).max(128),
  fingerprint_hash: z.string().regex(/^[a-f0-9]{16,128}$/i).nullable().optional(),
});

export function publicUser(u: User) {
  return {
    id: u.id,
    display_name: u.display_name,
    avatar_id: u.avatar_id ?? null,
    avatar: avatarFile(u.avatar_id),
    created_at: u.created_at,
    name_changed_at: u.name_changed_at ?? null,
  };
}

export function registerSessionRoutes(app: FastifyInstance, { db, currentUser, requireUser, limits }: Ctx) {
  app.post('/api/session', async (req, reply) => {
    const body = SessionBody.parse(req.body);
    const tokenHash = sha256(`device:${body.device_token}`);
    const fpHash = body.fingerprint_hash ? sha256(`fp:${body.fingerprint_hash}`) : null;
    const now = new Date().toISOString();

    let user = db.userByTokenHash(tokenHash) ?? (fpHash ? db.userByFingerprintHash(fpHash) : undefined);
    if (user) {
      user = {
        ...user,
        device_token_hash: tokenHash,
        fingerprint_hash: fpHash ?? user.fingerprint_hash ?? null,
        last_seen_at: now,
      };
    } else {
      const id = ulid();
      user = {
        id, ...defaultIdentity(id),
        device_token_hash: tokenHash, fingerprint_hash: fpHash,
        created_at: now, last_seen_at: now, name_changed_at: null, is_sample: false,
      };
    }
    await db.saveUser(user);
    reply.setCookie('sid', sign(user.id), {
      httpOnly: true, sameSite: 'lax', secure: config.isProd, path: '/', maxAge: 400 * 24 * 3600,
    });
    return { user: publicUser(user) };
  });

  app.get('/api/me', async (req) => {
    const u = currentUser(req);
    if (!u) throw new ApiError(401, 'no_session', 'Сессия не найдена.');
    return { user: publicUser(u) };
  });

  app.patch('/api/me', async (req) => {
    const u = requireUser(req);
    const { display_name } = z.object({ display_name: z.string() }).parse(req.body);
    const name = validateName(display_name);
    if (name === u.display_name) return { user: publicUser(u) };
    if (!limits.rename.take(u.id)) {
      throw new ApiError(429, 'rate_limited', 'Имя можно менять не чаще 5 раз в сутки.');
    }
    const next = { ...u, display_name: name, name_changed_at: new Date().toISOString() };
    await db.saveUser(next);
    db.touch();
    return { user: publicUser(next) };
  });
}
