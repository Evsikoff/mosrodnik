import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { reduceRows } from '../src/sync/reduce.js';

const root = path.resolve(import.meta.dirname, '../../data/source');
const raw = JSON.parse(fs.readFileSync(path.join(root, 'data-2454-17-04-2026.json'), 'utf8'));
const geo = JSON.parse(fs.readFileSync(path.join(root, 'springs.geojson'), 'utf8'));

describe('reduceRows', () => {
  const springs = reduceRows(raw, '2026-04-17T00:00:00Z');
  const byId = new Map(springs.map((s) => [s.spring_id, s]));

  it('даёт столько же родников, что и эталонный GeoJSON', () => {
    expect(springs.length).toBe(geo.features.length);
    expect(springs.length).toBe(258);
  });
  it('slug уникальны', () => {
    expect(new Set(springs.map((s) => s.slug)).size).toBe(springs.length);
  });
  it('статусы совпадают с эталоном', () => {
    let bad = 0;
    for (const f of geo.features) {
      const s = byId.get(f.properties.spring_id);
      if (!s || s.status !== f.properties.status || s.last_sample_year !== f.properties.last_sample_year) bad++;
    }
    expect(bad).toBe(0);
    const c = { exceed: 0, ok: 0, not_sampled: 0 };
    springs.forEach((s) => c[s.status]++);
    expect(c).toEqual({ exceed: 108, ok: 63, not_sampled: 87 });
  });
  it('координаты, дрейф и история совпадают', () => {
    for (const f of geo.features) {
      const s = byId.get(f.properties.spring_id)!;
      expect(s.lon).toBeCloseTo(f.geometry.coordinates[0], 5);
      expect(s.lat).toBeCloseTo(f.geometry.coordinates[1], 5);
      expect(Math.abs(s.coord_drift_m - f.properties.coord_drift_m)).toBeLessThanOrEqual(1);
      expect(s.history).toEqual(f.properties.history);
      // эталон срезает кавычки по краям без учёта парности; сравниваем без них
      const strip = (x: string) => x.replace(/[«»\s]+/g, ' ').trim();
      expect(strip(s.name)).toBe(strip(f.properties.name));
      expect(s.never_sampled).toBe(f.properties.never_sampled);
    }
  });
});
