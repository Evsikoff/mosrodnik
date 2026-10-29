import { api } from './api';
import type { User } from './types';

const KEY = 'mosrodn_device_token';

function readToken(): string | null {
  try {
    const ls = localStorage.getItem(KEY);
    if (ls) return ls;
  } catch {
    // localStorage может быть недоступен
  }
  const m = document.cookie.match(new RegExp(`(?:^|; )${KEY}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeToken(t: string) {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // ничего: останется cookie
  }
  document.cookie = `${KEY}=${encodeURIComponent(t)}; max-age=${400 * 24 * 3600}; path=/; samesite=lax`;
}

function newToken(): string {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Хеш отпечатка браузера; сырые компоненты никуда не уходят. */
async function fingerprint(): Promise<string | null> {
  try {
    const { Thumbmark } = await import('@thumbmarkjs/thumbmarkjs');
    const tm = new Thumbmark({ logging: false, collect_beacon: false } as any);
    const res: any = await tm.get();
    const raw = String(res.thumbmark ?? '');
    if (!raw) return null;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

export async function startSession(): Promise<User> {
  let token = readToken();
  if (!token) token = newToken();
  writeToken(token);
  const fp = await fingerprint();
  const { user } = await api.session(token, fp);
  return user;
}
