import type { Theme } from '../theme';

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

type Rgb = [number, number, number];

function parse(hex: string): Rgb {
  const h = hex.trim().replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

/** Смешение двух токенов: производные оттенки палитры, без новых цветов. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const f = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${f(ar, br)}${f(ag, bg)}${f(ab, bb)}`;
}

export interface Tokens {
  snow: string; ink: string; ice: string; ochre: string; slate: string; frost: string; dusk: string;
}

export function readTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => cs.getPropertyValue(`--${n}`).trim() || d;
  return {
    snow: v('snow', '#F3F1EC'), ink: v('ink', '#1F2A3A'), ice: v('ice', '#9FC3D6'),
    ochre: v('ochre', '#C8964A'), slate: v('slate', '#8A94A3'), frost: v('frost', '#E3EEF3'),
    dusk: v('dusk', '#2C3A52'),
  };
}

export interface Palette {
  bg: string; land: string; green: string; water: string; waterLine: string;
  building: string; building3d: string; roadMinor: string; roadMajor: string; roadCasing: string;
  path: string; rail: string; boundary: string; text: string; halo: string; textMuted: string;
  glow: number;
}

export function paletteFor(theme: Theme, t: Tokens): Palette {
  if (theme === 'night') {
    return {
      bg: t.dusk, land: t.dusk, green: mix(t.dusk, t.slate, 0.16), water: mix(t.dusk, t.ice, 0.22),
      waterLine: mix(t.dusk, t.ice, 0.4), building: mix(t.dusk, t.snow, 0.1), building3d: mix(t.dusk, t.slate, 0.5),
      roadMinor: mix(t.dusk, t.slate, 0.35), roadMajor: mix(t.dusk, t.ice, 0.35), roadCasing: mix(t.dusk, t.ink, 0.5),
      path: mix(t.dusk, t.slate, 0.5), rail: mix(t.dusk, t.slate, 0.4), boundary: mix(t.dusk, t.slate, 0.6),
      text: mix(t.snow, t.ice, 0.35), halo: t.dusk, textMuted: t.slate, glow: 0.45,
    };
  }
  if (theme === 'dusk') {
    const base = mix(t.snow, t.ochre, 0.1);
    return {
      bg: base, land: base, green: mix(base, t.slate, 0.22), water: mix(t.ice, base, 0.35),
      waterLine: mix(t.ice, t.slate, 0.3), building: mix(base, t.ink, 0.1), building3d: mix(base, t.slate, 0.55),
      roadMinor: mix(base, t.ink, 0.1), roadMajor: mix(base, t.ochre, 0.35), roadCasing: mix(base, t.ink, 0.28),
      path: mix(base, t.ink, 0.35), rail: mix(base, t.ink, 0.3), boundary: mix(base, t.ink, 0.4),
      text: t.ink, halo: base, textMuted: t.slate, glow: 0.2,
    };
  }
  return {
    bg: t.snow, land: t.snow, green: mix(t.snow, t.slate, 0.16), water: mix(t.ice, t.snow, 0.5),
    waterLine: mix(t.ice, t.ink, 0.1), building: mix(t.snow, t.ink, 0.07), building3d: mix(t.snow, t.slate, 0.5),
    roadMinor: mix(t.snow, t.ink, 0.1), roadMajor: mix(t.snow, t.ink, 0.2), roadCasing: mix(t.snow, t.ink, 0.3),
    path: mix(t.snow, t.ink, 0.4), rail: mix(t.snow, t.ink, 0.35), boundary: mix(t.snow, t.ink, 0.45),
    text: t.ink, halo: t.snow, textMuted: t.slate, glow: 0,
  };
}

const DROP = /^(natural_earth|poi_r\d+|road_one_way_arrow.*|road_area_pattern|highway-shield.*|road_shield.*|airport)$/;
const TEXT_FIELD = ['coalesce', ['get', 'name:ru'], ['get', 'name']];

function isMajor(id: string) {
  return /motorway|trunk_primary|secondary_tertiary/.test(id);
}

/** Краски слоя по палитре. Возвращает пары свойство -> значение для setPaintProperty. */
export function paintFor(layer: any, p: Palette): Record<string, any> {
  const id: string = layer.id;
  switch (layer.type) {
    case 'background':
      return { 'background-color': p.bg };
    case 'fill': {
      let color = p.land;
      if (/^park$|landcover_wood|landcover_grass|landuse_pitch|landcover_wetland|landuse_cemetery/.test(id)) color = p.green;
      else if (/^water$/.test(id)) color = p.water;
      else if (/landcover_ice/.test(id)) color = p.land;
      else if (/^building$/.test(id)) color = p.building;
      else if (/landuse_(hospital|school)|aeroway/.test(id)) color = p.building;
      return { 'fill-color': color, 'fill-outline-color': color };
    }
    case 'fill-extrusion':
      return { 'fill-extrusion-color': p.building3d };
    case 'line': {
      if (/waterway/.test(id)) return { 'line-color': p.waterLine };
      if (/boundary/.test(id)) return { 'line-color': p.boundary };
      if (/park_outline/.test(id)) return { 'line-color': p.green };
      if (/rail/.test(id)) return { 'line-color': p.rail };
      if (/path_pedestrian/.test(id)) return { 'line-color': id.includes('casing') ? p.roadCasing : p.path };
      if (/aeroway/.test(id)) return { 'line-color': p.roadMinor };
      if (id.includes('casing')) return { 'line-color': p.roadCasing };
      return { 'line-color': isMajor(id) ? p.roadMajor : p.roadMinor };
    }
    case 'symbol':
      return { 'text-color': /waterway|water_name/.test(id) ? p.waterLine : p.text, 'text-halo-color': p.halo };
    default:
      return {};
  }
}

/** Стиль OpenFreeMap, перекрашенный под токены; подписи по-русски; 3D-дома с зума 15. */
export async function loadStyle(theme: Theme): Promise<any> {
  const res = await fetch(STYLE_URL);
  if (!res.ok) throw new Error(`style ${res.status}`);
  const style = await res.json();
  const pal = paletteFor(theme, readTokens());
  style.layers = style.layers
    .filter((l: any) => !DROP.test(l.id) && !/^poi_/.test(l.id) && !/^label_country/.test(l.id))
    .map((l: any) => {
      const next = { ...l, paint: { ...(l.paint ?? {}), ...paintFor(l, pal) } };
      if (l.type === 'symbol' && l.layout?.['text-field']) {
        next.layout = { ...l.layout, 'text-field': TEXT_FIELD };
      }
      if (l.id === 'building-3d') {
        next.minzoom = 15;
        next.paint['fill-extrusion-opacity'] = 0.85;
      }
      return next;
    });
  delete style.sources.ne2_shaded;
  return style;
}
