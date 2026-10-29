import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../app.js';
import { aggregates, countsForMap, springFeature } from '../aggregates.js';
import { config } from '../config.js';
import { ApiError } from '../util.js';

function tokenOk(given: unknown): boolean {
  if (!config.adminToken || typeof given !== 'string') return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(config.adminToken).digest();
  return crypto.timingSafeEqual(a, b);
}

export function registerMiscRoutes(app: FastifyInstance, { db }: Ctx) {
  app.get('/api/health', async () => ({
    status: 'ok',
    springs: db.springs.size,
    last_sync_at: db.syncState.last_success_at,
    last_sync_attempt_at: db.syncState.last_attempt_at,
    last_sync_error: db.syncState.last_error,
  }));

  app.get('/api/stats', async () => {
    const obs = db.observations.all().filter((o) => countsForMap(db, o));
    const photos = db.photos.all().filter((p) => !p.is_sample && !db.isHidden('photos', p.id));
    const byKind: Record<string, number> = { flow: 0, access: 0, cleanliness: 0, visit: 0, location_check: 0 };
    for (const o of obs) byKind[o.kind]++;
    const agg = aggregates(db);
    const withObs = [...agg.values()].filter((a) => a.observations_count > 0 || a.photos_count > 0).length;
    return {
      users: db.users.all().filter((u) => !u.is_sample).length,
      observations: obs.length,
      observations_by_kind: byKind,
      photos: photos.length,
      springs_total: db.springs.size,
      springs_with_observations: withObs,
    };
  });

  app.get('/api/export/springs.geojson', async (_req, reply) => {
    const agg = aggregates(db);
    reply
      .header('Content-Type', 'application/geo+json; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="springs.geojson"');
    return {
      type: 'FeatureCollection',
      metadata: {
        source: 'data.mos.ru, набор 2454; агрегаты по отметкам жителей без образцов',
        generated_at: new Date().toISOString(),
        note: 'Анализ только по химическим показателям, микробиология в набор не входит.',
      },
      features: db.springs.all().map((s) => {
        const f = springFeature(s, agg.get(s.spring_id)!);
        return { ...f, properties: { ...f.properties, history: s.history } };
      }),
    };
  });

  app.post('/api/admin/hide', async (req) => {
    if (!tokenOk(req.headers['x-admin-token'])) {
      throw new ApiError(403, 'forbidden', 'Нет доступа.');
    }
    const body = z.object({
      entity: z.enum(['observations', 'photos']),
      id: z.string(),
      reason: z.string().max(200).optional(),
      hidden: z.boolean().default(true),
    }).parse(req.body);
    const exists = body.entity === 'observations' ? db.observations.get(body.id) : db.photos.get(body.id);
    if (!exists) throw new ApiError(404, 'not_found', 'Запись не найдена.');
    const key = `${body.entity}__${body.id}`;
    if (body.hidden) {
      await db.hidden.put({
        entity: body.entity, id: body.id, reason: body.reason ?? null, created_at: new Date().toISOString(),
      });
    } else {
      await db.hidden.remove(key);
    }
    db.touch();
    return { ok: true };
  });
}
