import * as SunCalc from 'suncalc';

export type Theme = 'day' | 'dusk' | 'night';

const MOSCOW = { lat: 55.7558, lon: 37.6173 };

/** День: солнце выше 6 градусов; сумерки: от -6 до 6; ночь: ниже. */
export function themeAt(date: Date): Theme {
  const alt = SunCalc.getPosition(date, MOSCOW.lat, MOSCOW.lon).altitude * (180 / Math.PI);
  if (alt > 6) return 'day';
  if (alt > -6) return 'dusk';
  return 'night';
}

export function currentTheme(): Theme {
  const forced = new URLSearchParams(location.search).get('theme');
  if (forced === 'day' || forced === 'dusk' || forced === 'night') return forced;
  return themeAt(new Date());
}
