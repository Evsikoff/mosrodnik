import type { Spring, SpringStatus } from '../db/schemas.js';

/** Строка выгрузки data.mos.ru (набор 2454), уже «расплющенная» из Cells. */
export interface RawRow {
  global_id?: number;
  SpringNumber: string | number;
  SpringName?: string | null;
  AdmArea: string;
  District?: string | null;
  Location?: string | null;
  Period: number | string;
  Condition: string;
  Longitude_WGS84?: string | number | null;
  Latitude_WGS84?: string | number | null;
  geoData?: { coordinates?: [number, number] } | null;
}

export const AREA_ABBR: Record<string, string> = {
  'Центральный административный округ': 'ЦАО',
  'Северный административный округ': 'САО',
  'Северо-Восточный административный округ': 'СВАО',
  'Восточный административный округ': 'ВАО',
  'Юго-Восточный административный округ': 'ЮВАО',
  'Южный административный округ': 'ЮАО',
  'Юго-Западный административный округ': 'ЮЗАО',
  'Западный административный округ': 'ЗАО',
  'Северо-Западный административный округ': 'СЗАО',
  'Зеленоградский административный округ': 'ЗелАО',
  'Новомосковский административный округ': 'НАО',
  'Троицкий административный округ': 'ТАО',
};

export const AREA_SLUG: Record<string, string> = {
  ЦАО: 'cao', САО: 'sao', СВАО: 'svao', ВАО: 'vao', ЮВАО: 'yuvao', ЮАО: 'yuao',
  ЮЗАО: 'yuzao', ЗАО: 'zao', СЗАО: 'szao', ЗелАО: 'zelao', НАО: 'nao', ТАО: 'tao',
};

export function normalizeStatus(condition: string): SpringStatus {
  const c = condition.toLowerCase().replace(/\s+/g, ' ').trim();
  if (c.includes('отбор проб')) return 'not_sampled';
  if (c.includes('превышени') && c.includes('не выявлен')) return 'ok';
  if (c.includes('превышени')) return 'exceed';
  throw new Error(`Неизвестное состояние: «${condition}»`);
}

function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function coordsOf(r: RawRow): [number, number] | null {
  const c = r.geoData?.coordinates;
  if (c && Number.isFinite(c[0]) && Number.isFinite(c[1])) return [c[0], c[1]];
  const lon = Number(r.Longitude_WGS84);
  const lat = Number(r.Latitude_WGS84);
  return Number.isFinite(lon) && Number.isFinite(lat) && lon && lat ? [lon, lat] : null;
}

function cleanName(raw: string): string {
  const n = raw.replace(/\s+/g, ' ').trim();
  const m = /^«([^«»]*)»$/.exec(n);
  return m ? m[1].trim() : n;
}

/** Сводит строки «родник × год» в один объект на родник. */
export function reduceRows(rows: RawRow[], nowIso: string): Spring[] {
  const groups = new Map<string, RawRow[]>();
  for (const r of rows) {
    const abbr = AREA_ABBR[r.AdmArea] ?? r.AdmArea;
    const key = `${abbr}-${String(r.SpringNumber).trim()}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  const out: Spring[] = [];
  for (const [spring_id, list] of groups) {
    const sorted = [...list].sort((a, b) => Number(a.Period) - Number(b.Period));
    const last = sorted[sorted.length - 1];
    const withCoords = sorted.filter((r) => coordsOf(r));
    if (!withCoords.length) continue;
    const lastC = withCoords[withCoords.length - 1];
    const [lon, lat] = coordsOf(lastC)!;
    let drift = 0;
    const pts = withCoords.map((r) => coordsOf(r)!);
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) drift = Math.max(drift, haversineM(pts[i], pts[j]));

    const byYear = new Map<number, SpringStatus>();
    for (const r of sorted) byYear.set(Number(r.Period), normalizeStatus(r.Condition));
    const history = [...byYear].sort((a, b) => a[0] - b[0]).map(([year, status]) => ({ year, status }));
    const sampled = history.filter((h) => h.status !== 'not_sampled');
    const abbr = spring_id.slice(0, spring_id.lastIndexOf('-'));
    const number = spring_id.slice(spring_id.lastIndexOf('-') + 1);
    const lastName = [...sorted].reverse().find((r) => r.SpringName && r.SpringName.trim());
    out.push({
      slug: `${AREA_SLUG[abbr] ?? 'x'}-${number}`,
      spring_id,
      number,
      name: cleanName(lastName?.SpringName ?? ''),
      adm_area: abbr,
      district: (last.District ?? '').trim(),
      location: (last.Location ?? '').trim(),
      lon,
      lat,
      status: history[history.length - 1].status,
      status_year: history[history.length - 1].year,
      last_sample_year: sampled.length ? sampled[sampled.length - 1].year : null,
      never_sampled: sampled.length === 0,
      coord_drift_m: Math.round(drift),
      history,
      source_global_ids: sorted.map((r) => r.global_id).filter((x): x is number => typeof x === 'number'),
      updated_from_source_at: nowIso,
    });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug, 'en', { numeric: true }));
}
