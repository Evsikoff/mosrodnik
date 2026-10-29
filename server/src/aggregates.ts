import type { Database } from './db/index.js';
import type { Observation, Spring } from './db/schemas.js';

const DAY = 24 * 3600 * 1000;

export interface Aggregate {
  user_flow: string;
  user_access: string;
  user_cleanliness: string;
  user_flow_at: string | null;
  user_access_at: string | null;
  user_cleanliness_at: string | null;
  visits_30d: number;
  photos_count: number;
  observations_count: number;
  last_activity_at: string | null;
  frost_level: 0 | 1 | 2 | 3;
}

export function frostLevel(lastSampleYear: number | null): 0 | 1 | 2 | 3 {
  if (lastSampleYear == null) return 3;
  if (lastSampleYear >= 2025) return 0;
  if (lastSampleYear >= 2022) return 1;
  return 2;
}

/** Учитываются только реальные, не скрытые записи с affects_map. */
export function countsForMap(db: Database, o: Observation): boolean {
  return !o.is_sample && o.affects_map && !db.isHidden('observations', o.id);
}

function compute(db: Database, now: number): Map<string, Aggregate> {
  const out = new Map<string, Aggregate>();
  const get = (s: Spring) => {
    let a = out.get(s.spring_id);
    if (!a) {
      a = {
        user_flow: 'unknown', user_access: 'unknown', user_cleanliness: 'unknown',
        user_flow_at: null, user_access_at: null, user_cleanliness_at: null,
        visits_30d: 0, photos_count: 0, observations_count: 0, last_activity_at: null,
        frost_level: frostLevel(s.last_sample_year),
      };
      out.set(s.spring_id, a);
    }
    return a;
  };
  for (const s of db.springs.all()) get(s);

  const obs = db.observations.all().filter((o) => countsForMap(db, o))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const o of obs) {
    const s = db.springBySpringId(o.spring_id);
    if (!s) continue;
    const a = get(s);
    const t = Date.parse(o.created_at);
    a.observations_count++;
    if (!a.last_activity_at || o.created_at > a.last_activity_at) a.last_activity_at = o.created_at;
    if (o.kind === 'visit' && now - t <= 30 * DAY) a.visits_30d++;
    if (now - t <= 14 * DAY) {
      if (o.kind === 'flow') { a.user_flow = o.value; a.user_flow_at = o.created_at; }
      if (o.kind === 'access') { a.user_access = o.value; a.user_access_at = o.created_at; }
      if (o.kind === 'cleanliness') { a.user_cleanliness = o.value; a.user_cleanliness_at = o.created_at; }
    }
  }
  for (const p of db.photos.all()) {
    if (p.is_sample || db.isHidden('photos', p.id)) continue;
    const s = db.springBySpringId(p.spring_id);
    if (!s) continue;
    const a = get(s);
    a.photos_count++;
    if (!a.last_activity_at || p.created_at > a.last_activity_at) a.last_activity_at = p.created_at;
  }
  return out;
}

let cache: { rev: number; at: number; data: Map<string, Aggregate> } | null = null;

/** Кэш на ревизию базы и минуту: окна 14/30 дней сдвигаются со временем. */
export function aggregates(db: Database): Map<string, Aggregate> {
  const now = Date.now();
  if (cache && cache.rev === db.rev && now - cache.at < 60_000) return cache.data;
  cache = { rev: db.rev, at: now, data: compute(db, now) };
  return cache.data;
}

export function springFeature(s: Spring, a: Aggregate) {
  return {
    type: 'Feature' as const,
    id: s.slug,
    geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
    properties: {
      slug: s.slug, spring_id: s.spring_id, number: s.number, name: s.name,
      adm_area: s.adm_area, district: s.district, location: s.location,
      status: s.status, status_year: s.status_year, last_sample_year: s.last_sample_year,
      never_sampled: s.never_sampled, coord_drift_m: s.coord_drift_m,
      ...a,
    },
  };
}
