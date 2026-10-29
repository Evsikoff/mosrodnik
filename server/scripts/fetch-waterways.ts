// Одноразовая загрузка рек и ручьёв Москвы из OpenStreetMap (Overpass API) в data/source/waterways.geojson.
// Запуск: cd server && npx tsx scripts/fetch-waterways.ts
import fs from 'node:fs/promises';
import path from 'node:path';

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const UA = 'mosrodn-spring-map/1.0 (https://github.com/; contact: gsmevsikov@gmail.com)';
const BBOX = '55.48,37.30,56.02,37.97';
const QUERY = `[out:json][timeout:60];way["waterway"~"^(river|stream|canal)$"](${BBOX});out geom;`;

const out = path.resolve(import.meta.dirname, '../../data/source/waterways.geojson');

async function once(url: string): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: QUERY }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

let data: any = null;
for (let round = 0; round < 3 && !data; round++) {
  for (const url of MIRRORS) {
    try {
      data = await once(url);
      console.log(`получено с ${new URL(url).host}`);
      break;
    } catch (e) {
      console.warn(`${new URL(url).host}: ${(e as Error).message}`);
    }
  }
  if (!data) await new Promise((r) => setTimeout(r, 5000 * 2 ** round));
}
if (!data) {
  console.error('Overpass недоступен, файл не создан');
  process.exit(1);
}

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;
const features = data.elements
  .filter((e: any) => e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length > 1)
  .map((e: any) => ({
    type: 'Feature',
    properties: { waterway: e.tags?.waterway, name: e.tags?.['name:ru'] ?? e.tags?.name ?? null },
    // Направление линии в OSM совпадает с направлением течения
    geometry: { type: 'LineString', coordinates: e.geometry.map((p: any) => [r5(p.lon), r5(p.lat)]) },
  }));

await fs.writeFile(
  out,
  JSON.stringify({ type: 'FeatureCollection', metadata: { source: 'OpenStreetMap, Overpass API', bbox: BBOX }, features }),
);
console.log(`записано ${features.length} линий в ${out}`);
