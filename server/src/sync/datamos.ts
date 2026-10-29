import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import type { Database } from '../db/index.js';
import { reduceRows, type RawRow } from './reduce.js';

const BASE = 'https://apidata.mos.ru/v1/datasets/2454';
const PAGE = 500;
const MIN_SPRINGS = 200;

type Log = { info: (m: string) => void; warn: (m: string) => void };

/** Строка API бывает плоской или вложенной в Cells. */
export function flattenRow(r: any): RawRow {
  const cells = r && typeof r === 'object' && r.Cells ? r.Cells : r;
  return { global_id: r.global_id ?? cells.global_id, ...cells } as RawRow;
}

function scrub(text: string, key: string) {
  return key ? text.split(key).join('***') : text;
}

async function fetchJson(url: string, key: string): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const sep = url.includes('?') ? '&' : '?';
      const res = await fetch(`${url}${sep}api_key=${encodeURIComponent(key)}`, {
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  const err = lastErr as Error & { cause?: { code?: string } };
  throw new Error(scrub(`${err?.message ?? 'ошибка сети'}${err?.cause?.code ? ` (${err.cause.code})` : ''}`, key));
}

export async function fetchAllRows(key: string): Promise<RawRow[]> {
  const count = Number(await fetchJson(`${BASE}/count`, key));
  if (!Number.isFinite(count) || count <= 0) throw new Error('странный ответ /count');
  const rows: RawRow[] = [];
  for (let skip = 0; skip < count; skip += PAGE) {
    const page = await fetchJson(`${BASE}/rows?$top=${PAGE}&$skip=${skip}`, key);
    if (!Array.isArray(page)) throw new Error('ответ /rows не массив');
    rows.push(...page.map(flattenRow));
  }
  return rows;
}

let running = false;

/** Синхронизация. Любая ошибка = ничего не перезаписано, причина в sync-state.json. */
export async function runSync(db: Database, key: string, log: Log): Promise<boolean> {
  if (running) return false;
  running = true;
  const now = new Date().toISOString();
  try {
    await db.saveSyncState({ last_attempt_at: now });
    if (!key) throw new Error('DATAMOS_API_KEY не задан');
    const rows = await fetchAllRows(key);
    const springs = reduceRows(rows, now);
    if (springs.length < MIN_SPRINGS) {
      throw new Error(`после сведения всего ${springs.length} родников (< ${MIN_SPRINGS}), снимок отвергнут`);
    }
    await writeFileAtomic(path.join(db.dir, 'datamos', `raw-${now.slice(0, 10)}.json`), JSON.stringify(rows));
    for (const s of springs) {
      const prev = db.springBySpringId(s.spring_id);
      if (prev) s.slug = prev.slug;
      await db.springs.put(s);
    }
    db.reindex();
    await db.saveSyncState({ last_success_at: now, last_error: null, rows: rows.length, springs: springs.length });
    log.info(`sync: ${rows.length} строк, ${springs.length} родников`);
    return true;
  } catch (e) {
    const message = scrub((e as Error).message, key);
    log.warn(`sync: ${message}; работаем на последнем снимке`);
    await db.saveSyncState({ last_error: message });
    return false;
  } finally {
    running = false;
  }
}

export function scheduleSync(db: Database, key: string, log: Log, onStart: boolean) {
  if (onStart) void runSync(db, key, log);
  const t = setInterval(() => void runSync(db, key, log), 24 * 3600 * 1000);
  t.unref();
}
