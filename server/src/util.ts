import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export const sha256 = (s: string) =>
  crypto.createHash('sha256').update(`${config.sessionSalt}:${s}`).digest('hex');

export function sign(value: string): string {
  const mac = crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
  return `${value}.${mac}`;
}

export function unsign(signed: string | undefined): string | null {
  if (!signed) return null;
  const i = signed.lastIndexOf('.');
  if (i < 0) return null;
  const value = signed.slice(0, i);
  const expected = sign(value);
  const a = Buffer.from(expected);
  const b = Buffer.from(signed);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? value : null;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export interface Avatar { id: string; file: string; name: string }

let avatarsCache: Avatar[] | null = null;
export function avatars(): Avatar[] {
  if (avatarsCache) return avatarsCache;
  const candidates = [
    path.join(config.webPublic, 'avatars', 'avatars.json'),
    path.join(config.webDist, 'avatars', 'avatars.json'),
  ];
  for (const f of candidates) {
    try {
      avatarsCache = JSON.parse(fs.readFileSync(f, 'utf8'));
      return avatarsCache!;
    } catch {
      // пробуем следующий путь
    }
  }
  avatarsCache = [{ id: 'bullfinch', file: '/avatars/avatar-bullfinch.webp', name: 'снегирь' }];
  return avatarsCache;
}

export function avatarFile(id?: string): string | null {
  return avatars().find((a) => a.id === id)?.file ?? null;
}

/** Простое ограничение «N событий за окно» в памяти. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private limit: number, private windowMs: number) {}
  take(key: string): boolean {
    const now = Date.now();
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.limit) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }
  sweep() {
    const now = Date.now();
    for (const [k, arr] of this.hits) {
      const f = arr.filter((t) => now - t < this.windowMs);
      if (f.length) this.hits.set(k, f);
      else this.hits.delete(k);
    }
  }
}

const FORBIDDEN_NAMES = /(образец|мосприрод|департамент|администратор|модератор|правительств|официальн|admin|moderator|support)/i;

export function validateName(raw: string): string {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 32) throw new ApiError(400, 'bad_name', 'Имя должно быть от 2 до 32 символов.');
  if (!/^[\p{L}\p{N} -]+$/u.test(name))
    throw new ApiError(400, 'bad_name', 'В имени допустимы буквы, цифры, пробел и дефис.');
  if (FORBIDDEN_NAMES.test(name)) throw new ApiError(400, 'bad_name', 'Это имя занято или похоже на официальное.');
  return name;
}

export function defaultIdentity(seed: string): { display_name: string; avatar_id: string } {
  const list = avatars();
  const h = crypto.createHash('sha256').update(seed).digest();
  const avatar = list[h.readUInt32BE(0) % list.length];
  const animal = avatar.name.split(' ').pop() ?? avatar.name;
  const digits = String(h.readUInt32BE(4) % 10000).padStart(4, '0');
  return { display_name: `Гость-${animal} ${digits}`, avatar_id: avatar.id };
}

export function seasonOf(date: Date): 'winter' | 'spring' | 'summer' | 'autumn' {
  const m = date.getMonth();
  if (m === 11 || m <= 1) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'autumn';
}
