import type { Spring } from '../db/schemas.js';
import { AREA_SLUG } from './reduce.js';

/** Одна фича опорного springs.geojson -> запись родника. */
export function reduceGeojsonFeature(f: any, nowIso: string): Spring {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates as [number, number];
  const number = String(p.number);
  return {
    slug: `${AREA_SLUG[p.adm_area] ?? 'x'}-${number}`,
    spring_id: p.spring_id,
    number,
    name: p.name ?? '',
    adm_area: p.adm_area,
    district: p.district ?? '',
    location: p.location ?? '',
    lon,
    lat,
    status: p.status,
    status_year: p.status_year,
    last_sample_year: p.last_sample_year ?? null,
    never_sampled: !!p.never_sampled,
    coord_drift_m: p.coord_drift_m ?? 0,
    history: p.history,
    source_global_ids: p.source_global_ids ?? [],
    updated_from_source_at: nowIso,
  };
}
