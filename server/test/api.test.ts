import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import { Database } from '../src/db/index.js';
import { buildApp } from '../src/app.js';

const seed = path.resolve(import.meta.dirname, '../../data');
let tmp: string;
let db: Database;
let app: FastifyInstance;
let cookie = '';

const call = (method: string, url: string, payload?: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method: method as 'GET', url, payload: payload as any, headers: { cookie, ...headers } });

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mosrodn-'));
  db = new Database(tmp, { info() {}, warn() {} });
  await db.seed(seed);
  await db.load();
  app = await buildApp(db);
  const res = await app.inject({
    method: 'POST', url: '/api/session',
    payload: { device_token: 'a'.repeat(32), fingerprint_hash: 'b'.repeat(40) },
  });
  cookie = String(res.headers['set-cookie']).split(';')[0];
});
afterAll(async () => {
  await app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('API', () => {
  it('отдаёт 258 родников и совпадающие счётчики статусов', async () => {
    const body = (await call('GET', '/api/springs')).json();
    expect(body.features).toHaveLength(258);
    const c: Record<string, number> = {};
    body.features.forEach((f: any) => (c[f.properties.status] = (c[f.properties.status] ?? 0) + 1));
    expect(c).toEqual({ exceed: 108, ok: 63, not_sampled: 87 });
  });

  it('сессия возвращает пользователя и восстанавливается по отпечатку', async () => {
    const me = (await call('GET', '/api/me')).json();
    expect(me.user.display_name).toMatch(/^Гость-\S+ \d{4}$/);
    const again = await app.inject({
      method: 'POST', url: '/api/session',
      payload: { device_token: 'c'.repeat(32), fingerprint_hash: 'b'.repeat(40) },
    });
    expect(again.json().user.id).toBe(me.user.id);
  });

  it('смена имени валидируется', async () => {
    expect((await call('PATCH', '/api/me', { display_name: 'Образец' })).statusCode).toBe(400);
    expect((await call('PATCH', '/api/me', { display_name: 'Мосприрода 1' })).statusCode).toBe(400);
    const ok = await call('PATCH', '/api/me', { display_name: 'Анна-Мария 7' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.display_name).toBe('Анна-Мария 7');
  });

  it('образцы не влияют на агрегаты, реальные отметки влияют', async () => {
    const before = (await call('GET', '/api/springs/vao-123')).json();
    expect(before.aggregate.user_flow).toBe('unknown');
    expect(before.observations.some((o: any) => o.is_sample)).toBe(true);
    const res = await call('POST', '/api/springs/vao-123/observations', { kind: 'flow', value: 'frozen' });
    expect(res.statusCode).toBe(201);
    const after = (await call('GET', '/api/springs/vao-123')).json();
    expect(after.aggregate.user_flow).toBe('frozen');
    const stats = (await call('GET', '/api/stats')).json();
    expect(stats.observations).toBe(1);
    expect(stats.users).toBe(1);
  });

  it('отметка переживает перезагрузку базы', async () => {
    const db2 = new Database(tmp, { info() {}, warn() {} });
    await db.observations.flush();
    await db2.load();
    expect(db2.observations.all().filter((o) => !o.is_sample)).toHaveLength(1);
  });

  it('образцы скрываются после трёх реальных записей', async () => {
    await call('POST', '/api/springs/vao-123/observations', { kind: 'visit', value: 'visited' });
    await call('POST', '/api/springs/vao-123/observations', { kind: 'access', value: 'icy' });
    const d = (await call('GET', '/api/springs/vao-123')).json();
    expect(d.observations.some((o: any) => o.is_sample)).toBe(false);
  });

  it('отклоняет недопустимые значения и неверную точку', async () => {
    expect((await call('POST', '/api/springs/vao-123/observations', { kind: 'flow', value: 'icy' })).statusCode).toBe(400);
    expect((await call('POST', '/api/springs/vao-123/observations', { kind: 'location_check', value: 'wrong' })).statusCode).toBe(400);
    expect((await call('POST', '/api/springs/nope-1/observations', { kind: 'visit', value: 'visited' })).statusCode).toBe(404);
  });

  it('в загруженном фото нет EXIF и GPS', async () => {
    const src = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#789' } })
      .withExif({ IFD0: { Copyright: 'secret' }, IFD3: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' } })
      .withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect((await sharp(src).metadata()).exif).toBeDefined();
    const boundary = '----t';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
      src, Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await call('POST', '/api/springs/vao-123/photos', body, { 'content-type': `multipart/form-data; boundary=${boundary}` });
    expect(res.statusCode).toBe(201);
    const { photo } = res.json();
    const saved = fs.readFileSync(path.join(tmp, photo.file.replace('/uploads/', 'uploads/')));
    const meta = await sharp(saved).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(1600);
    expect(meta.width).toBeLessThan(meta.height!); // повернуто по EXIF (Orientation 6)
    expect(fs.readFileSync(path.join(tmp, photo.file.replace('/uploads/', 'uploads/'))).includes(Buffer.from('secret'))).toBe(false);
  });

  it('скрытие админом работает только с токеном', async () => {
    expect((await call('POST', '/api/admin/hide', { entity: 'observations', id: 'x' })).statusCode).toBe(403);
  });

  it('health и export', async () => {
    expect((await call('GET', '/api/health')).json().status).toBe('ok');
    expect((await call('GET', '/api/export/springs.geojson')).json().features).toHaveLength(258);
  });

  it('подписка: следить, список, отмена', async () => {
    expect((await call('PUT', '/api/springs/zao-8/subscription', {})).json().subscribed).toBe(true);
    const list = (await call('GET', '/api/me/subscriptions')).json().subscriptions;
    expect(list.map((x: any) => x.slug)).toContain('zao-8');
    expect((await call('GET', '/api/springs/zao-8')).json().subscribed).toBe(true);
    expect((await call('DELETE', '/api/springs/zao-8/subscription')).json().subscribed).toBe(false);
  });

  it('скрытая админом отметка пропадает из агрегатов и ленты', async () => {
    const created = (await call('POST', '/api/springs/zao-8/observations', { kind: 'flow', value: 'dry' })).json();
    const id = created.observation.id;
    expect((await call('GET', '/api/springs/zao-8')).json().aggregate.user_flow).toBe('dry');
    const res = await call('POST', '/api/admin/hide', { entity: 'observations', id }, { 'x-admin-token': 'test-admin' });
    expect(res.statusCode).toBe(200);
    const d = (await call('GET', '/api/springs/zao-8')).json();
    expect(d.aggregate.user_flow).toBe('unknown');
    expect(d.observations.some((o: any) => o.id === id)).toBe(false);
  });

  it('лимит: не больше 30 отметок в час', async () => {
    let last = 201;
    for (let i = 0; i < 40 && last === 201; i++) {
      last = (await call('POST', '/api/springs/zao-8/observations', { kind: 'visit', value: 'visited' })).statusCode;
    }
    expect(last).toBe(429);
  });
});
