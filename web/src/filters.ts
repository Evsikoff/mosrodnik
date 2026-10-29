import type { Filters, SpringFeature } from './types';

export const EMPTY_FILTERS: Filters = { status: [], age: [], flow: [], adm: [], photo: false, mine: false, q: '' };

export const STATUS_OPTIONS = [
  { id: 'exceed', label: 'Превышения' },
  { id: 'ok', label: 'Превышений нет' },
  { id: 'not_sampled', label: 'Не проверялся' },
];
export const AGE_OPTIONS = [
  { id: '2025', label: '2025 год' },
  { id: 'old', label: '2017–2024' },
  { id: 'never', label: 'Ни разу' },
];
export const FLOW_OPTIONS = [
  { id: 'flowing', label: 'Течёт' },
  { id: 'weak', label: 'Слабо' },
  { id: 'frozen', label: 'Замёрз' },
  { id: 'dry', label: 'Пересох' },
  { id: 'unknown', label: 'Нет свежих отметок' },
];
export const ADM_OPTIONS = [
  ['cao', 'ЦАО'], ['sao', 'САО'], ['svao', 'СВАО'], ['vao', 'ВАО'], ['yuvao', 'ЮВАО'], ['yuao', 'ЮАО'],
  ['yuzao', 'ЮЗАО'], ['zao', 'ЗАО'], ['szao', 'СЗАО'], ['zelao', 'ЗелАО'], ['nao', 'НАО'], ['tao', 'ТАО'],
].map(([id, label]) => ({ id, label }));

const AREA_SLUG: Record<string, string> = Object.fromEntries(
  ADM_OPTIONS.map((o) => [o.label, o.id]),
);
export const areaSlug = (adm: string) => AREA_SLUG[adm] ?? adm.toLowerCase();

type Group = 'status' | 'age' | 'flow' | 'adm' | 'photo' | 'mine' | 'q';

function ageOf(f: SpringFeature): string {
  const y = f.properties.last_sample_year;
  if (y == null) return 'never';
  return y >= 2025 ? '2025' : 'old';
}

function norm(s: string) {
  return s.toLowerCase().replace(/ё/g, 'е');
}

export function matches(
  f: SpringFeature, flt: Filters, mine: Set<string>, skip?: Group,
): boolean {
  const p = f.properties;
  if (skip !== 'status' && flt.status.length && !flt.status.includes(p.status)) return false;
  if (skip !== 'age' && flt.age.length && !flt.age.includes(ageOf(f))) return false;
  if (skip !== 'flow' && flt.flow.length && !flt.flow.includes(p.user_flow)) return false;
  if (skip !== 'adm' && flt.adm.length && !flt.adm.includes(areaSlug(p.adm_area))) return false;
  if (skip !== 'photo' && flt.photo && p.photos_count < 1) return false;
  if (skip !== 'mine' && flt.mine && !mine.has(p.slug)) return false;
  if (skip !== 'q' && flt.q.trim()) {
    const hay = norm(`${p.name} Родник № ${p.number} ${p.spring_id} ${p.district} ${p.adm_area} ${p.location}`);
    if (!norm(flt.q.trim()).split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

/** Число родников у каждого варианта при остальных активных фильтрах. */
export function facetCounts(all: SpringFeature[], flt: Filters, mine: Set<string>) {
  const count = (group: Group, key: (f: SpringFeature) => string) => {
    const out: Record<string, number> = {};
    for (const f of all) if (matches(f, flt, mine, group)) out[key(f)] = (out[key(f)] ?? 0) + 1;
    return out;
  };
  return {
    status: count('status', (f) => f.properties.status),
    age: count('age', ageOf),
    flow: count('flow', (f) => f.properties.user_flow),
    adm: count('adm', (f) => areaSlug(f.properties.adm_area)),
    photo: all.filter((f) => matches(f, flt, mine, 'photo') && f.properties.photos_count > 0).length,
    mine: all.filter((f) => matches(f, flt, mine, 'mine') && mine.has(f.properties.slug)).length,
  };
}

export function parseFilters(search: string): Filters {
  const sp = new URLSearchParams(search);
  const list = (k: string) => (sp.get(k) ?? '').split(',').filter(Boolean);
  return {
    status: list('status'), age: list('age'), flow: list('flow'), adm: list('adm'),
    photo: sp.get('photo') === '1', mine: sp.get('mine') === '1', q: sp.get('q') ?? '',
  };
}

export function filtersToSearch(f: Filters, extra: Record<string, string> = {}): string {
  const sp = new URLSearchParams();
  if (f.status.length) sp.set('status', f.status.join(','));
  if (f.age.length) sp.set('age', f.age.join(','));
  if (f.flow.length) sp.set('flow', f.flow.join(','));
  if (f.adm.length) sp.set('adm', f.adm.join(','));
  if (f.photo) sp.set('photo', '1');
  if (f.mine) sp.set('mine', '1');
  if (f.q.trim()) sp.set('q', f.q.trim());
  for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const hasFilters = (f: Filters) =>
  !!(f.status.length || f.age.length || f.flow.length || f.adm.length || f.photo || f.mine || f.q.trim());
