// Демонстрационные отметки и авторы, чтобы лента не была пустой до появления реальных жителей.
// Всё помечено is_sample: true, affects_map: false и в интерфейсе подписано «Образец».
// Статистика и экспорт всегда без образцов; карта включает их только в демонстрационном режиме.
// У родника с тремя реальными записями образцы скрываются.
// Запуск из корня: node server/scripts/generate-demo-content.mjs
import fs from 'node:fs';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';

const root = path.resolve(import.meta.dirname, '../..');
// Фиксированное время можно передать для воспроизводимой генерации: --at=2026-10-29T12:00:00Z.
const at = process.argv.find((arg) => arg.startsWith('--at='))?.slice(5);
const NOW = at ? Date.parse(at) : Date.now();
if (!Number.isFinite(NOW)) throw new Error('Некорректное время --at: ожидается дата ISO 8601.');
const HOUR = 3600 * 1000;

const users = [
  ['01', 'Марина В.', 'waxwing'], ['02', 'Дмитрий', 'fox'], ['03', 'Ольга и Тимофей', 'squirrel'],
  ['04', 'Гость-синица 2210', 'great-tit'], ['05', 'Лесной ходок', 'woodpecker'], ['06', 'Пётр С.', 'hare'],
  ['07', 'Алёна', 'goldfinch'], ['08', 'Гость-белка 7031', 'squirrel'], ['09', 'Виктор Н.', 'mallard'],
  ['10', 'Катя', 'bullfinch'],
  ['11', 'Алексей К.', 'nuthatch'], ['12', 'Наташа', 'blue-tit'], ['13', 'Иван и Лена', 'magpie'],
  ['14', 'Гость-поползень 4816', 'nuthatch'], ['15', 'Светлана', 'goldeneye'], ['16', 'Роман', 'jackdaw'],
  ['17', 'Татьяна М.', 'crossbill'], ['18', 'Антон', 'sparrow'], ['19', 'Дарья', 'fox'],
  ['20', 'Гость-клёст 1904', 'crossbill'], ['21', 'Сергей П.', 'woodpecker'], ['22', 'Юля', 'waxwing'],
  ['23', 'Михаил', 'mallard'], ['24', 'Вера', 'goldfinch'],
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
  const file = path.join(root, 'data', dir, `${name}.json`);
  if (fs.existsSync(file) && !JSON.parse(fs.readFileSync(file, 'utf8')).is_sample) {
    throw new Error(`Генератор не перезаписывает реальные записи: ${name}`);
  }
  writeFileAtomic.sync(file, JSON.stringify(obj, null, 2) + '\n');
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

// Несколько независимых наблюдений по каждому параметру. Стабильные ID позволяют
// обновлять образцы повторным запуском, не накапливая копии и не затрагивая записи жителей.
const comments = {
  flowing: [
    'Струя ровная, вода уходит по желобу. Пока стояли у родника, напор не менялся.',
    'Заглянула по дороге с прогулки. Родник течёт, под трубой хорошо слышно воду.',
    'Сегодня заметно сильнее, чем в прошлый раз. По краю лотка ещё лежат мокрые листья.',
    'Вода идёт без перерывов. Проверили оба выхода, основной работает.',
    'Сначала из-за листьев показалось, что родник пересох. Подошли ближе — струя есть.',
    'Заходил второй раз за неделю: течёт примерно так же, как и в начале недели.',
    'Издалека воду не видно, труба низко. У самого желоба видно, что родник работает.',
    'После дождя струя стала шире. На площадке под трубой вода не застаивается.',
  ],
  weak: [
    'Струйка тонкая, но не прерывается. В прошлый визит напор был заметно сильнее.',
    'Слышно, как капает, но сильной струи нет. Простояли несколько минут — без изменений.',
    'Вода идёт у самой стенки трубы, с дорожки её почти не заметно.',
    'Родник ещё течёт, хотя ручей ниже стал совсем узким.',
    'За последние несколько дней напор снизился. Желоб мокрый только посередине.',
    'Убрал листок у выхода, но заметно сильнее не стало. Отмечаю слабое течение.',
  ],
  frozen: [
    'Выход трубы во льду, свободной струи сейчас не видно.',
    'На желобе сплошная наледь. Под ней слышно воду, но снаружи всё замёрзло.',
    'В прошлый раз ещё капало, сегодня у выхода только лёд.',
    'Подошли к самой трубе: отверстие затянуто льдом, течения не увидели.',
  ],
  dry: [
    'У выхода сухо. Подождал несколько минут, вода так и не появилась.',
    'В трубе воды не видно, ручей ниже тоже пересох.',
    'На месте нашла только влажные камни под желобом. Струи и капель нет.',
    'Были здесь раньше, тогда текло. Сейчас под трубой лежат сухие листья.',
    'Проверили выход и канавку ниже: открытого течения сегодня нет.',
    'Возможно, течение восстановится после дождей. Сегодня родник сухой.',
  ],
  cleared: [
    'Тропа свободна, упавших веток по пути не встретили. Последние метры прошли без проблем.',
    'Основной спуск проходим, ступени видны. К самому роднику лучше подходить пешком.',
    'Ветки с дорожки убрали. Теперь не нужно обходить через кусты.',
    'Дошли по обычной тропе от парка. Проход открыт, ограждений нет.',
    'На развилке пошли по нижней дорожке, она вывела прямо к роднику.',
    'Подход свободный, но после дождя у самой площадки мокрая земля.',
  ],
  icy: [
    'На последних ступенях тонкий лёд, под листьями его почти не видно.',
    'Самая скользкая часть — площадка перед трубой. На спуске тоже есть наледь.',
    'Утром подход обледенел. Дошли медленно, держась за перила.',
    'Верхняя тропа сухая, а у воды лёд. Сверху это не сразу заметно.',
  ],
  blocked: [
    'На основном спуске лежит большая ветка, пройти напрямую не получилось.',
    'Проход к площадке закрыт ограждением. До родника не дошли.',
    'Дерево поперёк тропы, обхода по обычной дорожке не нашли.',
    'Узкий участок перед родником перекрыт. Остановились у начала спуска.',
  ],
  clean: [
    'На площадке и вдоль тропы мусора не заметили. Под желобом только листья.',
    'Забрали несколько старых пакетов, теперь у трубы чисто.',
    'Сегодня вокруг аккуратно, бутылок и стаканчиков нет.',
    'В прошлый раз у скамейки был мусор. Сейчас всё убрано.',
    'Осмотрели площадку и начало ручья, крупных отходов не нашли.',
    'По сравнению с прошлой прогулкой стало заметно чище. Спасибо тем, кто убирает.',
  ],
  litter: [
    'Рядом с площадкой оставили несколько бутылок и пакет. Сам желоб свободен.',
    'Под скамейкой стаканчики и упаковки. Часть собрали в свой пакет.',
    'На склоне выше трубы мусор, издалека его скрывают листья.',
    'После выходных появились пакеты у тропы. Вокруг выхода воды пока чище.',
    'На месте нет урны, но мусор всё равно оставляют рядом с родником.',
    'Унесли две пустые бутылки. Ниже по ручью ещё есть пластик среди веток.',
  ],
  damaged: [
    'Край желоба отколот, вода частично уходит в сторону от лотка.',
    'Одна ступень перед площадкой шатается, заметили это на обратном пути.',
    'Доска у подхода треснула. Сам выход воды на месте.',
    'Крепление трубы выглядит расшатанным, трогать не стали.',
    'Перила на последнем участке наклонены, одна опора не держится.',
  ],
  visited: [
    'Зашли во время прогулки. Посмотрели на родник и пошли дальше по тропе.',
    'Нашли по карте с первого раза. От большой дорожки нужно немного спуститься.',
    'Вернулся проверить родник после прошлой прогулки. Место на карте узнаваемое.',
    'Гуляли с семьёй, остановились у родника на несколько минут.',
    'Давно не был в этой части парка. Хорошо, что точка сохранилась на карте.',
    'Доехала на велосипеде, последние метры прошла пешком. У воды тихо.',
    'Проходили мимо по длинному маршруту, сделали небольшой привал выше по тропе.',
    'Первый раз здесь. Искали выход воды со стороны ручья, так оказалось проще.',
  ],
  confirmed: [
    'Точка совпадает с выходом воды. На месте сверил положение с картой.',
    'Нашли родник по этой отметке, переносить точку не нужно.',
    'Координаты вывели к площадке перед родником. Всё на месте.',
    'Проверил отметку с тропы и у трубы: родник здесь.',
  ],
};

const kinds = [
  { kind: 'flow', table: FLOW, shift: 0, alternatives: { flowing: 'weak', weak: 'flowing', frozen: 'weak', dry: 'weak' } },
  { kind: 'access', table: ACCESS, shift: 11, alternatives: { cleared: 'blocked', icy: 'cleared', blocked: 'cleared' } },
  { kind: 'cleanliness', table: CLEAN, shift: 17, alternatives: { clean: 'litter', litter: 'clean', damaged: 'clean' } },
];
let conversations = 0;
const featured = new Set(springs);
ids.forEach((spring, i) => {
  if (i % 32 === 5) return;
  const h = hash(spring);
  let serial = 0;
  const seenComments = new Set();
  const add = (kind, value, j, hoursAgo, seed) => {
    const n = String(++serial).padStart(2, '0');
    const observationId = `sample-community-${spring}-${n}`;
    const author = users[(h % users.length + j * 5 + (kind === 'visit' ? 7 : 0)) % users.length][0];
    const phrases = comments[value];
    let phraseIndex = seed % phrases.length;
    // В пределах одной карточки одинаковые тексты не повторяются.
    for (let attempt = 0; attempt < phrases.length && seenComments.has(phrases[phraseIndex]); attempt++) {
      phraseIndex = (phraseIndex + 1) % phrases.length;
    }
    const phrase = phrases[phraseIndex];
    const comment = seenComments.has(phrase) ? null : `Образец: ${phrase}`;
    if (comment) seenComments.add(phrase);
    write('observations', observationId, {
      id: observationId, spring_id: spring, user_id: `sample-user-${author}`,
      kind, value, comment, photo_ids: [], is_sample: true, affects_map: false,
      created_at: new Date(NOW - hoursAgo * HOUR).toISOString(),
    });
    conversations++;
  };
  kinds.forEach(({ kind, table, shift, alternatives }, gi) => {
    const basis = pick(((h >>> shift) % 1000) / 1000, table);
    const count = (kind === 'flow' ? 3 : 2) + ((h >>> (gi * 4)) % 2) + Number(featured.has(spring));
    for (let j = 0; j < count; j++) {
      const seed = hash(`${spring}/${kind}/${j}`);
      // Более старые наблюдения могут отличаться; самая свежая запись соответствует базовому состоянию.
      const value = j > 0 && (seed % 4 === 0 || j === count - 1) ? alternatives[basis] : basis;
      const hoursAgo = j === 0 ? (20 + seed % 280) / 60 : 12 + ((j * 43 + seed) % 300);
      add(kind, value, j + gi * 3, hoursAgo, seed);
    }
  });
  const visits = 1 + (h % 2);
  for (let j = 0; j < visits; j++) {
    const seed = hash(`${spring}/visit/${j}`);
    add('visit', 'visited', j + 11, 1 + (seed % 240), seed);
  }
  if (h % 5 === 0) add('location_check', 'confirmed', 17, 24 + h % 180, h);
});
console.log(`Родников с демонстрационными наблюдениями: ${covered}`);
console.log(`Демонстрационных авторов: ${users.length}; подробных новых отметок: ${conversations}`);
console.log(`Время генерации: ${new Date(NOW).toISOString()}`);
