// Проба API data.mos.ru: количество строк и структура ответа. Ключ в вывод не попадает.
const key = process.env.DATAMOS_API_KEY;
if (!key) {
  console.error('DATAMOS_API_KEY не задан');
  process.exit(1);
}
const base = 'https://apidata.mos.ru/v1/datasets/2454';
const mask = (s: string) => s.split(key).join('***');

async function get(path: string) {
  const url = `${base}${path}${path.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(key!)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  console.log(mask(`${res.status} ${path}`), `(${text.length} байт)`);
  return text;
}

console.log('count:', (await get('/count')).slice(0, 100));
const rows = await get('/rows?$top=2');
console.log(mask(rows.slice(0, 1200)));
