import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ulid } from 'ulid';
import type { Ctx } from '../app.js';
import { aggregates, springFeature } from '../aggregates.js';
import { OBS_VALUES, type Observation, type Photo, type Spring } from '../db/schemas.js';
import { processPhoto } from '../photos.js';
import { ApiError, avatarFile, seasonOf } from '../util.js';

const ObsBody = z.object({
  kind: z.enum(['flow', 'access', 'cleanliness', 'visit', 'location_check']),
  value: z.string(),
  comment: z.string().trim().max(500).nullable().optional(),
  photo_ids: z.array(z.string()).max(3).optional(),
  location: z.object({ lon: z.number(), lat: z.number() }).optional(),
});

// Грубая рамка Москвы с округами: защита от случайных координат
const inMoscow = (lon: number, lat: number) => lon > 36.7 && lon < 38.1 && lat > 55.1 && lat < 56.2;

export function registerSpringRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, currentUser, requireUser, limits } = ctx;

  const mustSpring = (slug: string): Spring => {
    const s = db.springBySlug(slug);
    if (!s) throw new ApiError(404, 'not_found', 'Родник не найден.');
    return s;
  };

  const author = (userId: string) => {
    const u = db.users.get(userId);
    return {
      id: userId,
      name: u?.display_name ?? 'Неизвестный',
      avatar: avatarFile(u?.avatar_id),
      is_sample: !!u?.is_sample,
    };
  };

  app.get('/api/springs', async (_req, reply) => {
    const agg = aggregates(db);
    const features = db.springs.all().map((s) => springFeature(s, agg.get(s.spring_id)!));
    reply.header('Cache-Control', 'no-cache');
    return { type: 'FeatureCollection', features };
  });

  app.get('/api/springs/:slug', async (req) => {
    const { slug } = req.params as { slug: string };
    const spring = mustSpring(slug);
    const user = currentUser(req);
    const agg = aggregates(db).get(spring.spring_id)!;

    const obsAll = db.observations.all()
      .filter((o) => o.spring_id === spring.spring_id && !db.isHidden('observations', o.id));
    const realObs = obsAll.filter((o) => !o.is_sample);
    // Образцы скрываются, когда у родника набралось 3 реальные записи
    const showSamples = realObs.length < 3;
    const observations = obsAll
      .filter((o) => showSamples || !o.is_sample)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((o) => ({ ...o, author: author(o.user_id) }));
    const photos = db.photos.all()
      .filter((p) => p.spring_id === spring.spring_id && !db.isHidden('photos', p.id))
      .filter((p) => showSamples || !p.is_sample)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((p) => ({ ...p, author: author(p.user_id) }));

    let subscribed = false;
    if (user) {
      const sub = db.subscriptions.get(`${user.id}__${slug}`);
      subscribed = !!sub;
      if (sub) void db.subscriptions.put({ ...sub, last_seen_at: new Date().toISOString() });
    }
    return { spring, aggregate: agg, observations, photos, subscribed, samples_shown: showSamples };
  });

  app.post('/api/springs/:slug/observations', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const spring = mustSpring(slug);
    const user = requireUser(req);
    const body = ObsBody.parse(req.body);
    if (!(OBS_VALUES[body.kind] as readonly string[]).includes(body.value)) {
      throw new ApiError(400, 'bad_value', 'Недопустимое значение отметки.');
    }
    if (body.kind === 'location_check' && body.value === 'wrong') {
      if (!body.location || !inMoscow(body.location.lon, body.location.lat)) {
        throw new ApiError(400, 'bad_location', 'Укажите на карте, где находится родник (в пределах Москвы).');
      }
    }
    for (const pid of body.photo_ids ?? []) {
      const p = db.photos.get(pid);
      if (!p || p.user_id !== user.id || p.spring_id !== spring.spring_id) {
        throw new ApiError(400, 'bad_photo', 'Фото не найдено.');
      }
    }
    if (!limits.obs.take(user.id)) {
      throw new ApiError(429, 'rate_limited', 'Не больше 30 отметок в час. Попробуйте позже.');
    }
    const o: Observation = {
      id: ulid(),
      spring_id: spring.spring_id,
      user_id: user.id,
      kind: body.kind,
      value: body.value,
      comment: body.comment || null,
      photo_ids: body.photo_ids ?? [],
      created_at: new Date().toISOString(),
      is_sample: false,
      affects_map: true,
      ...(body.kind === 'location_check' && body.location ? { location: body.location } : {}),
    };
    await db.observations.put(o);
    db.touch();
    const agg = aggregates(db).get(spring.spring_id)!;
    reply.status(201);
    return { observation: { ...o, author: author(user.id) }, feature: springFeature(spring, agg) };
  });

  app.post('/api/springs/:slug/photos', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const spring = mustSpring(slug);
    const user = requireUser(req);
    if (!limits.photo.take(user.id)) {
      throw new ApiError(429, 'rate_limited', 'Не больше 10 фото в час. Попробуйте позже.');
    }
    const part = await req.file();
    if (!part) throw new ApiError(400, 'no_file', 'Файл не получен.');
    const buf = await part.toBuffer();
    const fields = part.fields as Record<string, { value?: unknown } | undefined>;
    const caption = typeof fields.caption?.value === 'string' ? fields.caption.value.trim().slice(0, 200) : '';

    const id = ulid();
    const dir = path.join(db.dir, 'uploads', 'photos');
    const { width, height } = await processPhoto(buf, path.join(dir, `${id}.webp`), path.join(dir, `${id}-thumb.webp`));
    const now = new Date();
    const photo: Photo = {
      id, spring_id: spring.spring_id, user_id: user.id,
      file: `/uploads/photos/${id}.webp`, thumb: `/uploads/photos/${id}-thumb.webp`,
      width, height, season: seasonOf(now), caption: caption || null,
      created_at: now.toISOString(), is_sample: false,
    };
    await db.photos.put(photo);
    db.touch();
    const agg = aggregates(db).get(spring.spring_id)!;
    reply.status(201);
    return { photo: { ...photo, author: author(user.id) }, feature: springFeature(spring, agg) };
  });

  app.put('/api/springs/:slug/subscription', async (req) => {
    const { slug } = req.params as { slug: string };
    const spring = mustSpring(slug);
    const user = requireUser(req);
    const now = new Date().toISOString();
    await db.subscriptions.put({
      user_id: user.id, spring_id: spring.spring_id, slug, created_at: now, last_seen_at: now,
    });
    return { subscribed: true };
  });

  app.delete('/api/springs/:slug/subscription', async (req) => {
    const { slug } = req.params as { slug: string };
    mustSpring(slug);
    const user = requireUser(req);
    await db.subscriptions.remove(`${user.id}__${slug}`);
    return { subscribed: false };
  });

  app.get('/api/me/subscriptions', async (req) => {
    const user = requireUser(req);
    const agg = aggregates(db);
    const items = db.subscriptions.all()
      .filter((s) => s.user_id === user.id)
      .map((s) => {
        const spring = db.springBySlug(s.slug);
        if (!spring) return null;
        const since = s.last_seen_at;
        const newObs = db.observations.all().filter((o) =>
          o.spring_id === spring.spring_id && !o.is_sample && o.created_at > since &&
          o.user_id !== user.id && !db.isHidden('observations', o.id)).length;
        const newPhotos = db.photos.all().filter((p) =>
          p.spring_id === spring.spring_id && !p.is_sample && p.created_at > since &&
          p.user_id !== user.id && !db.isHidden('photos', p.id)).length;
        return {
          slug: s.slug, name: spring.name, number: spring.number,
          new_observations: newObs, new_photos: newPhotos,
          aggregate: agg.get(spring.spring_id),
        };
      })
      .filter(Boolean);
    return { subscriptions: items };
  });
}
