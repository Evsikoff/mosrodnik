import type { Status } from './types';

export const STATUS_LABEL: Record<Status, string> = {
  exceed: 'Выявлены превышения по химическим веществам',
  ok: 'Превышений по химическим веществам не выявлено',
  not_sampled: 'Пробы не отбирались',
};

export const FLOW_LABEL: Record<string, string> = {
  flowing: 'Течёт', weak: 'Течёт слабо', frozen: 'Замёрз', dry: 'Пересох', unknown: 'Свежих отметок нет',
};
export const ACCESS_LABEL: Record<string, string> = {
  cleared: 'Подход расчищен', icy: 'Подход обледенел', blocked: 'Подход закрыт', unknown: 'Свежих отметок нет',
};
export const CLEAN_LABEL: Record<string, string> = {
  clean: 'Чисто', litter: 'Есть мусор', damaged: 'Есть повреждения', unknown: 'Свежих отметок нет',
};

export const KIND_LABEL: Record<string, string> = {
  flow: 'Течение', access: 'Подход', cleanliness: 'Чистота вокруг', visit: 'Был здесь', location_check: 'Точка на карте',
};

export function obsText(kind: string, value: string): string {
  if (kind === 'flow') return FLOW_LABEL[value] ?? value;
  if (kind === 'access') return ACCESS_LABEL[value] ?? value;
  if (kind === 'cleanliness') return CLEAN_LABEL[value] ?? value;
  if (kind === 'visit') return 'Был здесь';
  if (kind === 'location_check') return value === 'confirmed' ? 'Точка на карте верна' : 'Точка на карте указана неверно';
  return value;
}

export const springTitle = (s: { name: string; number: string }) => s.name || `Родник № ${s.number}`;

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
export { plural };

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return 'только что';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} ${plural(m, 'минуту', 'минуты', 'минут')} назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} ${plural(d, 'день', 'дня', 'дней')} назад`;
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export const SEASON_LABEL: Record<string, string> = {
  winter: 'зима', spring: 'весна', summer: 'лето', autumn: 'осень',
};

export const CARD_ILLUSTRATIONS = ['spring-brook', 'spring-canopy', 'spring-forest-park', 'spring-pipe-ravine'];
export function cardIllustration(slug: string): string {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `/illustrations/card/${CARD_ILLUSTRATIONS[h % CARD_ILLUSTRATIONS.length]}.webp`;
}

export function routeUrl(lat: number, lon: number): string {
  return `https://yandex.ru/maps/?rtext=~${lat},${lon}&rtt=pd`;
}
