// Демонстрационные отметки и авторы, чтобы лента не была пустой до появления реальных жителей.
// Всё помечено is_sample: true, affects_map: false и в интерфейсе подписано «Образец».
// Образцы не влияют на карту, фильтры, статистику и экспорт, а у родника с тремя реальными записями скрываются.
// Запуск из корня: node server/scripts/generate-demo-content.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const NOW = Date.parse('2026-10-29T18:00:00Z');
const HOUR = 3600 * 1000;

const users = [
  ['01', 'Марина В.', 'waxwing'], ['02', 'Дмитрий', 'fox'], ['03', 'Ольга и Тимофей', 'squirrel'],
  ['04', 'Гость-синица 2210', 'great-tit'], ['05', 'Лесной ходок', 'woodpecker'], ['06', 'Пётр С.', 'hare'],
  ['07', 'Алёна', 'goldfinch'], ['08', 'Гость-белка 7031', 'squirrel'], ['09', 'Виктор Н.', 'mallard'],
  ['10', 'Катя', 'bullfinch'],
];

const springs = ['ВАО-123', 'ЗАО-101', 'ЗелАО-1', 'НАО-104', 'САО-235', 'СВАО-116', 'СЗАО-10', 'ТАО-181'];

// [вид, значение, комментарий или null]
const pool = [
  ['flow', 'flowing', 'Образец: приехали с утра после дождей, вода идёт ровной струёй, лоток сухой, значит напор держится не первый день.'],
  ['flow', 'weak', 'Образец: течёт тонкой струйкой, бутылку на полтора литра набирали минут пять. Летом, говорят, было заметно сильнее.'],
  ['flow', 'frozen', 'Образец: лоток в наледи, из трубы свисает сосулька, воды нет. Через пару дней проверим ещё раз.'],
  ['flow', 'flowing', null],
  ['access', 'cleared', 'Образец: дорожка расчищена и утоптана, до родника можно дойти в обычных ботинках, коляска тоже пройдёт до начала спуска.'],
  ['access', 'icy', 'Образец: спуск скользкий, на последних метрах лёд. Лучше брать трекинговые палки или идти по траве слева от тропы.'],
  ['access', 'blocked', 'Образец: подход перекрыт упавшим деревом, пролезть можно, но с детьми и с канистрами неудобно.'],
  ['cleanliness', 'clean', 'Образец: вокруг чисто, мусорный пакет у лавочки уже вывезли.'],
  ['cleanliness', 'litter', 'Образец: у воды оставили пакеты и пластиковые бутылки. Собрали часть, остальное не унесли: нужна помощь.'],
  ['cleanliness', 'damaged', 'Образец: сломан желоб, вода уходит в сторону и размывает тропу.'],
  ['visit', 'visited', null],
  ['visit', 'visited', 'Образец: гуляли по парку, зашли посмотреть. Информационной таблички нет, нашли родник по карте.'],
  ['location_check', 'confirmed', 'Образец: точка на карте совпадает с родником, ошибки нет.'],
  ['visit', 'visited', 'Образец: помним, что воду из родников нужно кипятить, поэтому просто посмотрели и сфотографировали.'],
];

const write = (dir, name, obj) => {
  fs.mkdirSync(path.join(root, 'data', dir), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', dir, `${name}.json`), JSON.stringify(obj, null, 2) + '\n');
};

for (const [n, display_name, avatar_id] of users) {
  write('users', `sample-user-${n}`, {
    id: `sample-user-${n}`, display_name, avatar_id, is_sample: true,
    created_at: new Date(NOW - (30 + Number(n)) * 24 * HOUR).toISOString(),
  });
}

// Детерминированный выбор без случайности: результат одинаков при каждом запуске
let k = 0;
let id = 21;
for (const [si, spring] of springs.entries()) {
  for (let j = 0; j < 6; j++, k++) {
    const [kind, value, comment] = pool[(k * 5 + si) % pool.length];
    const user = users[(k * 3 + j) % users.length][0];
    const hoursAgo = 2 + ((k * 37) % 200);
    write('observations', `sample-obs-${id}`, {
      id: `sample-obs-${id}`, spring_id: spring, user_id: `sample-user-${user}`, kind, value,
      comment, photo_ids: [], is_sample: true, affects_map: false,
      created_at: new Date(NOW - hoursAgo * HOUR).toISOString(),
    });
    id++;
  }
}
// Состояние у 250 родников из 258: у каждого отметка о течении, у большинства ещё о подходе и чистоте.
const geo = JSON.parse(fs.readFileSync(path.join(root, 'data/source/springs.geojson'), 'utf8'));
const ids = geo.features.map((f) => f.properties.spring_id).sort((a, b) => a.localeCompare(b, 'ru'));
const hash = (str) => {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
};
const pick = (r, table) => {
  let acc = 0;
  for (const [v, w] of table) { acc += w; if (r < acc) return v; }
  return table[table.length - 1][0];
};
const FLOW = [['flowing', 0.52], ['weak', 0.22], ['frozen', 0.1], ['dry', 0.16]];
const ACCESS = [['cleared', 0.5], ['icy', 0.35], ['blocked', 0.15]];
const CLEAN = [['clean', 0.55], ['litter', 0.33], ['damaged', 0.12]];
let covered = 0;
ids.forEach((spring, i) => {
  if (i % 32 === 5) return; // 8 родников остаются без отметок
  covered++;
  const h = hash(spring);
  const author = (n) => `sample-user-${users[(h >>> n) % users.length][0]}`;
  const when = (n) => new Date(NOW - (3 + ((h >>> n) % 110)) * HOUR).toISOString();
  const base = { spring_id: spring, comment: null, photo_ids: [], is_sample: true, affects_map: false };
  write('observations', `sample-state-flow-${i}`, {
    ...base, id: `sample-state-flow-${i}`, user_id: author(3), kind: 'flow',
    value: pick((h % 1000) / 1000, FLOW), created_at: when(5),
  });
  if ((h >>> 9) % 10 < 7) {
    write('observations', `sample-state-access-${i}`, {
      ...base, id: `sample-state-access-${i}`, user_id: author(7), kind: 'access',
      value: pick(((h >>> 11) % 1000) / 1000, ACCESS), created_at: when(13),
    });
  }
  if ((h >>> 15) % 10 < 6) {
    write('observations', `sample-state-clean-${i}`, {
      ...base, id: `sample-state-clean-${i}`, user_id: author(11), kind: 'cleanliness',
      value: pick(((h >>> 17) % 1000) / 1000, CLEAN), created_at: when(19),
    });
  }
});
console.log(`родников с состоянием: ${covered}`);
console.log(`пользователей: ${users.length}, отметок: ${id - 21}`);
