// Собирает редактируемую презентацию из настоящих ассетов приложения: текст живой, картинки только иллюстрации.
// Нужен pptxgenjs (MIT): npm i --no-save pptxgenjs, либо путь к его node_modules в NODE_PATH.
// Шрифты Segoe UI Variable Display, Segoe UI и Bahnschrift входят в Windows 11.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const pptxgen = require('pptxgenjs');

const base = path.resolve(import.meta.dirname, '..');
const root = path.resolve(base, '../..');
const out = path.join(base, 'outputs', 'moskovsky-rodnik-v3.pptx');
const deck = JSON.parse(fs.readFileSync(path.join(base, 'presentation.json'), 'utf8'));
const facts = deck.facts;

// Цвета только из design/tokens.css
const tokens = Object.fromEntries([...fs.readFileSync(path.join(root, 'design/tokens.css'), 'utf8')
  .matchAll(/--(\w+):\s*#([0-9A-Fa-f]{6})/g)].map(m => [m[1], m[2].toUpperCase()]));
const { snow: SNOW, ink: INK, ice: ICE, ochre: OCHRE, slate: SLATE, frost: FROST, dusk: DUSK } = tokens;

const HEAD = 'Segoe UI Variable Display';
const DATA = 'Bahnschrift SemiBold';
const BODY = 'Segoe UI';
const BODY_SEMI = 'Segoe UI Semibold';

const W = 13.333, H = 7.5, M = 0.6;

// ---------- изображения ----------
const asset = p => path.join(root, p);
const png = async img => 'image/png;base64,' + (await img.png().toBuffer()).toString('base64');
const jpg = async img => 'image/jpeg;base64,' + (await img.jpeg({ quality: 90 }).toBuffer()).toString('base64');
const svg = s => sharp(Buffer.from(s));
const recolor = (file, color, size) => svg(fs.readFileSync(asset(file), 'utf8').replaceAll('#1F2A3A', '#' + color)
  .replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`));
const rounded = async (img, w, h, r) => img.resize(w, h, { fit: 'cover' })
  .composite([{ input: Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}"/></svg>`), blend: 'dest-in' }]);

async function topo(color, opacity) {
  const src = fs.readFileSync(asset('web/public/patterns/topo-contours.svg'), 'utf8').replaceAll('#1F2A3A', '#' + color)
    .replace('opacity=".07"', `opacity="${opacity}"`).replace(/width="\d+" height="\d+"/, 'width="900" height="900"');
  const tile = await svg(src).png().toBuffer();
  return png(sharp({ create: { width: 2400, height: 1350, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: tile, tile: true, top: 0, left: 0 }]));
}

function gradient(w, h, stops, dir = 'x') {
  const [x2, y2] = dir === 'x' ? [1, 0] : [0, 1];
  const s = stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="#${c}" stop-opacity="${a}"/>`).join('');
  return png(svg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="${x2}" y2="${y2}">${s}</linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/></svg>`));
}

// 258 точек: заполненные — родники с пробами, пустые — без единой пробы
function dotStrip(total, hollow, cols, rows, wIn, hIn) {
  const k = 200, pw = wIn * k, ph = hIn * k, px = pw / cols, py = ph / rows, r = Math.min(px, py) * 0.34;
  let dots = '';
  for (let i = 0; i < total; i++) {
    const c = Math.floor(i / rows), rr = i % rows, cx = (c + 0.5) * px, cy = (rr + 0.5) * py;
    dots += i < total - hollow
      ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#${ICE}" stroke="#${INK}" stroke-width="${r * 0.28}"/>`
      : `<circle cx="${cx}" cy="${cy}" r="${r * 0.9}" fill="none" stroke="#${SLATE}" stroke-width="${r * 0.32}"/>`;
  }
  return png(svg(`<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}">${dots}</svg>`));
}

const I = {};
I.hero = await jpg(sharp(asset('web/public/illustrations/hero/hero-winter-ravine.webp')).extract({ left: 267, top: 0, width: 2133, height: 1200 }));
I.heroShade = await png(sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs>
  <linearGradient id="a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#${DUSK}" stop-opacity=".96"/><stop offset=".34" stop-color="#${DUSK}" stop-opacity=".82"/><stop offset=".6" stop-color="#${DUSK}" stop-opacity="0"/></linearGradient>
  <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#${INK}" stop-opacity="0"/><stop offset="1" stop-color="#${INK}" stop-opacity=".55"/></linearGradient>
  </defs><rect width="1920" height="1080" fill="url(#a)"/><rect width="1920" height="1080" fill="url(#b)"/></svg>`)));
I.logoInverse = await png(sharp(asset('web/public/brand/logo-inverse.svg'), { density: 1200 }).resize(512, 512));
I.lockupInverse = await png(sharp(asset('web/public/brand/logo-lockup-inverse.svg'), { density: 600 }).resize({ width: 1152 }));
I.topoLight = await topo(INK, 0.1);
I.topoDark = await topo(SNOW, 0.07);
for (const m of ['status-ok', 'status-exceed', 'status-not-sampled']) I[m] = await png(sharp(asset(`web/public/markers/${m}.svg`), { density: 1200 }).resize(256, 256));
for (const s of ['flowing', 'weak', 'frozen', 'dry']) I['state-' + s] = await png(sharp(asset(`web/public/markers/state-${s}.svg`), { density: 2400 }).resize(160, 160));
for (const p of ['last-sample', 'chemistry-only', 'never-sampled', 'no-microbiology', 'boil-water']) {
  I[p + '-ice'] = await png(recolor(`web/public/pictograms/${p}.svg`, ICE, 256));
  I[p + '-ink'] = await png(recolor(`web/public/pictograms/${p}.svg`, INK, 256));
}
I.strip = await dotStrip(facts.springs_total, facts.never_sampled, 86, 3, W - 2 * M, 0.42);
I.app3d = await png(sharp(asset('presentations/moskovsky-rodnik/references/app-3d.png')).extract({ left: 641, top: 0, width: 1279, height: 1080 }));
I.appMobile = await png(await rounded(sharp(asset('presentations/moskovsky-rodnik/references/app-mobile.png')), 430, 932, 34));
for (const p of ['flow-pipe', 'access-ice-steps', 'litter-leaves']) I['photo-' + p] = await png(await rounded(sharp(asset(`web/public/samples/photos/sample-review-${p}.webp`)), 480, 360, 22));
I.avatar = await png(sharp(asset('web/public/avatars/avatar-great-tit.webp')).resize(200, 200));
I.forest = await jpg(sharp(asset('assets-src/generated/spring-forest-park.png')).extract({ left: 420, top: 0, width: 820, height: 887 }));
I.forestShade = await gradient(800, 600, [[0, INK, 0], [0.4, INK, 0.55], [1, INK, 0.94]], 'y');
I.forestEdge = await gradient(300, 100, [[0, DUSK, 1], [1, DUSK, 0]], 'x');

// ---------- общие элементы ----------
const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.theme = { headFontFace: HEAD, bodyFontFace: BODY };
pres.title = deck.title;
pres.author = deck.project;
pres.lang = deck.language;

const text = (slide, t, o) => slide.addText(t, { margin: 0, valign: 'top', fontFace: BODY, color: INK, isTextBox: true, ...o });
const image = (slide, data, x, y, w, h, o = {}) => slide.addImage({ data, x, y, w, h, ...o });
const eyebrow = (slide, t, color = OCHRE, x = M, y = 0.5) => text(slide, t, { x, y, w: 6, h: 0.3, fontFace: DATA, fontSize: 13, charSpacing: 2.5, color });
const title = (slide, t, o = {}) => text(slide, t, { x: M, y: 0.82, w: W - 2 * M, h: 0.75, fontFace: HEAD, bold: true, fontSize: 36, ...o });
const notes = (slide, n) => slide.addNotes(deck.slides[n - 1].speaker_text);
const circle = (slide, x, y, d, o) => slide.addShape(pres.shapes.OVAL, { x: x - d / 2, y: y - d / 2, w: d, h: d, ...o });
function badge(slide, n, cx, cy, d, fill, o = {}) {
  circle(slide, cx, cy, d + 0.1, { fill: { color: SNOW }, line: { color: SNOW, width: 0 }, shadow: { type: 'outer', color: INK, opacity: 0.35, blur: 6, offset: 1.5, angle: 90 } });
  circle(slide, cx, cy, d, { fill: fill ? { color: fill } : { color: SNOW }, line: o.line || { color: INK, width: 1.25 } });
  text(slide, String(n), { x: cx - d / 2, y: cy - d / 2, w: d, h: d, align: 'center', valign: 'middle', fontFace: DATA, fontSize: d * 44, color: INK });
}
// ширина чипа: около 0.6 em на букву Segoe UI Semibold, текст без переноса
function chip(slide, label, x, y, selected, icon) {
  const tw = label.length * 0.6 * 14 / 72, pad = 0.18, iw = icon ? 0.32 : 0, w = tw + 2 * pad + iw, h = 0.46;
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.23, fill: { color: selected ? ICE : SNOW }, line: { color: selected ? INK : SLATE, width: selected ? 1.25 : 0.75 } });
  if (icon) image(slide, icon, x + 0.13, y + 0.1, 0.26, 0.26);
  text(slide, label, { x: x + pad + iw, y, w: tw, h, align: 'center', valign: 'middle', wrap: false, fontSize: 14, fontFace: selected ? BODY_SEMI : BODY });
  return x + w + 0.12;
}

// ---------- 1. Обложка ----------
{
  const s = pres.addSlide();
  s.background = { color: DUSK };
  image(s, I.hero, 0, 0, W, H);
  image(s, I.heroShade, 0, 0, W, H);
  // круги на воде у трубы, как в знаке
  [[0.9, 25], [1.5, 50], [2.1, 72]].forEach(([d, t]) => s.addShape(pres.shapes.OVAL, { x: 8.08 - d / 2, y: 5.93 - d * 0.14, w: d, h: d * 0.28, fill: { type: 'none' }, line: { color: SNOW, width: 1.25, transparency: t } }));
  image(s, I.logoInverse, 0.72, 0.62, 0.78, 0.78);
  text(s, 'Московский\nродник', { x: 0.75, y: 1.62, w: 7.6, h: 2.3, fontFace: HEAD, bold: true, fontSize: 74, color: SNOW, lineSpacingMultiple: 0.88 });
  text(s, 'Открытые данные\nи наблюдения жителей', { x: 0.78, y: 3.92, w: 6, h: 0.95, fontSize: 25, color: ICE, lineSpacingMultiple: 0.95 });
  text(s, String(facts.springs_total), { x: 0.72, y: 5.05, w: 2.3, h: 1.25, fontFace: DATA, fontSize: 96, color: OCHRE });
  text(s, 'родников Москвы\nна одной интерактивной карте', { x: 3.05, y: 5.42, w: 4, h: 0.8, fontSize: 19, color: SNOW, lineSpacingMultiple: 1.05 });
  text(s, `Данные: ${new URL(facts.portal_url).host}, набор № ${facts.dataset_id}`, { x: 0.78, y: 6.72, w: 6, h: 0.3, fontSize: 13, color: ICE, transparency: 15 });
  notes(s, 1);
}

// ---------- 2. Интеграция и цифры ----------
{
  const s = pres.addSlide();
  s.background = { color: SNOW };
  image(s, I.topoLight, 0, 0, W, H);
  eyebrow(s, 'ИСТОЧНИК ДАННЫХ');
  title(s, 'Интеграция с открытыми данными Москвы');

  const y = 1.95, h = 1.42;
  const node = (x, w, fill) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.14, fill: { color: fill }, line: { color: fill === DUSK ? DUSK : ICE, width: 1 } });
  const arrow = (x1, x2, label) => {
    s.addShape(pres.shapes.LINE, { x: x1, y: y + h / 2, w: x2 - x1, h: 0, line: { color: OCHRE, width: 2.25, endArrowType: 'triangle' } });
    text(s, label, { x: x1 - 0.3, y: y + h / 2 - 0.42, w: x2 - x1 + 0.6, h: 0.32, align: 'center', fontFace: DATA, fontSize: 14, color: OCHRE });
  };
  node(M, 3.6, FROST);
  text(s, [
    { text: new URL(facts.portal_url).host, options: { fontFace: DATA, fontSize: 28, breakLine: true } },
    { text: facts.portal_name, options: { fontSize: 14 } },
  ], { x: M + 0.28, y: y + 0.22, w: 3.1, h: h - 0.3, paraSpaceAfter: 4 });
  arrow(4.35, 5.15, 'по API');
  node(5.3, 4.2, FROST);
  text(s, [
    { text: `Набор № ${facts.dataset_id}`, options: { fontFace: DATA, fontSize: 28, breakLine: true } },
    { text: '«Состояние родников»\nбез микробиологических показателей', options: { fontSize: 14 } },
  ], { x: 5.58, y: y + 0.22, w: 3.75, h: h - 0.3, paraSpaceAfter: 4 });
  arrow(9.65, 10.45, 'раз в сутки');
  node(10.6, W - M - 10.6, DUSK);
  image(s, I.logoInverse, 10.85, y + 0.24, 0.6, 0.6);
  text(s, 'Московский\nродник', { x: 10.85, y: y + 0.84, w: 1.8, h: 0.55, fontFace: BODY_SEMI, fontSize: 15, color: SNOW, lineSpacingMultiple: 0.95 });

  text(s, 'ПОСТАВЩИК НАБОРА ДАННЫХ', { x: M, y: 3.62, w: 6, h: 0.28, fontFace: DATA, fontSize: 12, charSpacing: 2, color: SLATE });
  text(s, facts.provider_name, { x: M, y: 3.9, w: W - 2 * M, h: 0.42, fontFace: BODY_SEMI, fontSize: 19 });

  const cols = [
    { n: facts.springs_total, label: 'родников в наборе' },
    { n: facts.never_sampled, label: 'без единой пробы\nза всю историю наблюдений', icon: I['status-not-sampled'] },
    { n: facts.coordinate_drift_over_100m, label: 'с координатами, которые в разные\nгоды расходятся более чем на 100 м', drift: true },
  ];
  cols.forEach((c, i) => {
    const x = M + i * 4.12;
    text(s, String(c.n), { x, y: 4.52, w: 1.9, h: 1.05, fontFace: DATA, fontSize: 70, color: INK });
    const nx = x + String(c.n).length * 0.56 + 0.18;
    if (c.icon) image(s, c.icon, nx, 4.82, 0.5, 0.5);
    if (c.drift) {
      circle(s, nx + 0.12, 5.07, 0.2, { fill: { color: ICE }, line: { color: INK, width: 1.25 } });
      s.addShape(pres.shapes.LINE, { x: nx + 0.24, y: 5.07, w: 0.62, h: 0, line: { color: OCHRE, width: 1.5, dashType: 'dash' } });
      circle(s, nx + 0.98, 5.07, 0.2, { fill: { type: 'none' }, line: { color: INK, width: 1.25 } });
    }
    text(s, c.label, { x, y: 5.58, w: 3.9, h: 0.62, fontSize: 15, lineSpacingMultiple: 1.0 });
  });
  image(s, I.strip, M, 6.36, W - 2 * M, 0.42);
  text(s, `Снимок данных от ${facts.source_description.match(/\d{2}\.\d{2}\.\d{4}/)[0]}. Каждая точка — родник из набора, пустые — без единой пробы`, { x: M, y: 6.88, w: W - 2 * M, h: 0.28, fontSize: 12, color: SLATE });
  notes(s, 2);
}

// ---------- 3. Карточка на карте ----------
{
  const s = pres.addSlide();
  s.background = { color: SNOW };
  const sx = 4.45;
  image(s, I.app3d, sx, 0, W - sx, H);
  s.addShape(pres.shapes.LINE, { x: sx, y: 0, w: 0, h: H, line: { color: SLATE, width: 0.75, transparency: 40 } });
  eyebrow(s, 'РАБОТАЮЩИЙ ПРОТОТИП');
  title(s, 'Родник\nраскрывается\nна карте', { w: 3.7, h: 1.9, lineSpacingMultiple: 0.95 });

  // точки привязки взяты из references/app-3d.png (сдвиг 641 px, 144 px на дюйм)
  const at = (px, py) => [sx + (px - 641) / 144, py / 144];
  const items = [
    { fill: OCHRE, head: 'Официальные анализы', desc: 'Химический анализ, год пробы\nи история наблюдений', at: at(1026, 424) },
    { fill: ICE, head: 'Наблюдения жителей', desc: 'Течение, подход, чистота\nи свежие фото с места', at: at(1340, 262) },
    { fill: null, head: 'Пометка «Образец»', desc: 'Демонстрационные отзывы\nи фото отмечены явно', at: at(1020, 806), line: { color: SLATE, width: 1.5, dashType: 'dash' } },
  ];
  items.forEach((it, i) => {
    const y = 3.05 + i * 1.12;
    badge(s, i + 1, M + 0.22, y + 0.2, 0.44, it.fill, it);
    text(s, [{ text: it.head, options: { fontFace: BODY_SEMI, fontSize: 18, breakLine: true } }, { text: it.desc, options: { fontSize: 14, color: INK } }], { x: M + 0.62, y: y - 0.02, w: 3.2, h: 0.95, paraSpaceAfter: 2 });
    badge(s, i + 1, it.at[0], it.at[1], 0.5, it.fill, it);
  });
  text(s, 'Карточка разворачивается над маркером\nи складывается при отдалении карты', { x: M, y: 6.55, w: 3.7, h: 0.55, fontSize: 12.5, color: SLATE });
  notes(s, 3);
}

// ---------- 4. Вклад жителей ----------
{
  const s = pres.addSlide();
  s.background = { color: SNOW };
  const cx = 11.12, cy = 4.55;
  circle(s, cx, cy, 5.4, { fill: { color: FROST }, line: { color: FROST, width: 0 } });
  [[6.6, 30], [7.9, 60]].forEach(([d, t]) => circle(s, cx, cy, d, { fill: { type: 'none' }, line: { color: ICE, width: 1.25, transparency: t } }));
  eyebrow(s, 'УЧАСТИЕ ЖИТЕЛЕЙ');
  title(s, 'Жители дополняют картину на месте');

  const fx = 9.55, fy = 1.85, sw = 2.85, sh = sw * 932 / 430, bz = 0.14;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: fx, y: fy, w: sw + 2 * bz, h: sh + 2 * bz, rectRadius: 0.42, fill: { color: INK }, line: { color: INK, width: 0 }, shadow: { type: 'outer', color: INK, opacity: 0.3, blur: 18, offset: 6, angle: 90 } });
  image(s, I.appMobile, fx + bz, fy + bz, sw, sh);

  const rows = [
    { q: 'Течёт ли вода', chips: [['Течёт', 'state-flowing'], ['Слабо', 'state-weak'], ['Замёрз', 'state-frozen'], ['Пересох', 'state-dry']] },
    { q: 'Можно ли подойти', chips: [['Расчищен'], ['Обледенел'], ['Закрыт']] },
    { q: 'Что вокруг родника', chips: [['Чисто'], ['Мусор'], ['Повреждено']] },
  ];
  rows.forEach((r, i) => {
    const y = 2.05 + i * 1.0;
    text(s, r.q, { x: M, y, w: 2.9, h: 0.46, valign: 'middle', fontFace: BODY_SEMI, fontSize: 19 });
    let x = 3.45;
    r.chips.forEach(([label, icon], j) => { x = chip(s, label, x, y, j === 0, icon && I[icon]); });
    s.addShape(pres.shapes.LINE, { x: M, y: y + 0.73, w: 8.3, h: 0, line: { color: SLATE, width: 0.75, transparency: 55 } });
  });
  const py = 5.05;
  text(s, 'Фото с места', { x: M, y: py + 0.33, w: 2.9, h: 0.46, valign: 'middle', fontFace: BODY_SEMI, fontSize: 19 });
  ['flow-pipe', 'access-ice-steps', 'litter-leaves'].forEach((p, i) => image(s, I['photo-' + p], 3.45 + i * 1.62, py, 1.48, 1.11));

  image(s, I.avatar, M, 6.55, 0.46, 0.46, { rounding: true });
  text(s, [
    { text: 'Гость-синица 4789', options: { fontFace: BODY_SEMI } },
    { text: '  ·  дата и автор сохраняются вместе с отметкой, без регистрации', options: { color: INK } },
  ], { x: M + 0.6, y: 6.55, w: 8.6, h: 0.46, valign: 'middle', wrap: false, fontSize: 14.5 });
  notes(s, 4);
}

// ---------- 5. Прозрачность ----------
{
  const s = pres.addSlide();
  s.background = { color: DUSK };
  image(s, I.topoDark, 0, 0, W, H);
  eyebrow(s, 'ПРОЗРАЧНОСТЬ');
  title(s, 'Доверие начинается с прозрачности', { color: SNOW });
  text(s, 'Проба и взгляд прохожего отвечают на разные вопросы, поэтому в интерфейсе это отдельные слои', { x: M, y: 1.62, w: W - 2 * M, h: 0.4, fontSize: 17, color: ICE });

  const cards = [
    { x: M, tag: 'ОФИЦИАЛЬНЫЕ ДАННЫЕ', tagColor: OCHRE, icons: [I['status-exceed'], I['status-ok']], q: 'Что показал анализ и когда?',
      facts: [['last-sample', 'Год анализа указан рядом с результатом'], ['chemistry-only', `Только химические показатели, набор № ${facts.dataset_id}`]] },
    { x: M + 6.2, tag: 'НАБЛЮДЕНИЯ ЖИТЕЛЕЙ', tagColor: ICE, icons: [I['state-flowing']], q: 'Что у родника сейчас?',
      facts: [['last-sample', 'Дата и автор есть у каждой отметки'], ['never-sampled', 'Не заменяют лабораторный анализ воды']] },
  ];
  cards.forEach(c => {
    const y = 2.3, w = 5.93, h = 2.95;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: c.x, y, w, h, rectRadius: 0.16, fill: { color: INK }, line: { color: INK, width: 0 } });
    c.icons.forEach((ic, k) => image(s, ic, c.x + 0.32 + k * 0.42, y + 0.3, 0.42, 0.42));
    text(s, c.tag, { x: c.x + 0.4 + c.icons.length * 0.42, y: y + 0.38, w: 4, h: 0.3, fontFace: DATA, fontSize: 13, charSpacing: 2.5, color: c.tagColor });
    text(s, c.q, { x: c.x + 0.36, y: y + 0.92, w: w - 0.7, h: 0.5, fontFace: HEAD, bold: true, fontSize: 26, color: SNOW });
    c.facts.forEach(([ic, t], k) => {
      const fy = y + 1.72 + k * 0.58;
      image(s, I[ic + '-ice'], c.x + 0.36, fy, 0.38, 0.38);
      text(s, t, { x: c.x + 0.92, y: fy - 0.02, w: w - 1.2, h: 0.42, valign: 'middle', fontSize: 15, color: SNOW });
    });
  });

  const bottom = [
    { icon: 'no-microbiology', t: 'Микробиология в наборе\nне проверяется' },
    { icon: 'boil-water', t: 'Воду из родников пить\nтолько после кипячения' },
    { tag: 'Образец', t: 'Демонстрационные записи\nне входят в статистику' },
  ];
  bottom.forEach((b, i) => {
    const x = M + i * 4.12, y = 5.85;
    if (b.icon) {
      circle(s, x + 0.34, y + 0.34, 0.68, { fill: { color: ICE }, line: { color: ICE, width: 0 } });
      image(s, I[b.icon + '-ink'], x + 0.14, y + 0.14, 0.4, 0.4);
    } else {
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: y + 0.15, w: 0.98, h: 0.38, rectRadius: 0.1, fill: { type: 'none' }, line: { color: ICE, width: 1.25, dashType: 'dash' } });
      text(s, b.tag, { x, y: y + 0.15, w: 0.98, h: 0.38, align: 'center', valign: 'middle', fontFace: BODY_SEMI, fontSize: 12.5, color: ICE });
    }
    text(s, b.t, { x: x + (b.icon ? 0.92 : 1.12), y: y + 0.02, w: 2.9, h: 0.66, valign: 'middle', fontSize: 15, color: SNOW });
  });
  notes(s, 5);
}

// ---------- 6. Польза и следующий шаг ----------
{
  const s = pres.addSlide();
  s.background = { color: DUSK };
  const ix = 6.4;
  image(s, I.forest, ix, 0, W - ix, H);
  image(s, I.forestShade, ix, 3.3, W - ix, H - 3.3);
  image(s, I.forestEdge, ix, 0, 0.9, H);
  eyebrow(s, 'ПОЛЬЗА И ПЛАН');
  title(s, 'От карты\nк городскому\nмониторингу', { w: 5.6, h: 1.9, color: SNOW, lineSpacingMultiple: 0.95 });

  [['ЖИТЕЛЯМ', 'Понятная и честная картина\nпо каждому знакомому роднику'], ['ГОРОДУ', 'Структурированные наблюдения\nдля планирования выездных проверок']]
    .forEach(([tag, t], i) => {
      const y = 3.15 + i * 1.32;
      text(s, tag, { x: M, y, w: 4, h: 0.3, fontFace: DATA, fontSize: 14, charSpacing: 2.5, color: OCHRE });
      text(s, t, { x: M, y: y + 0.34, w: 5.5, h: 0.8, fontSize: 19, color: SNOW, lineSpacingMultiple: 1.05 });
    });
  image(s, I.lockupInverse, M, 6.42, 1.9, 1.9 * 112 / 384);

  // путь: прототип -> пилот -> мониторинг
  const ny = 6.05, xs = [7.45, 9.75, 12.05];
  s.addShape(pres.shapes.LINE, { x: xs[0], y: ny, w: xs[1] - xs[0], h: 0, line: { color: SNOW, width: 2 } });
  s.addShape(pres.shapes.LINE, { x: xs[1], y: ny, w: xs[2] - xs[1], h: 0, line: { color: SNOW, width: 2, dashType: 'dash', transparency: 30 } });
  circle(s, xs[0], ny, 0.3, { fill: { color: ICE }, line: { color: SNOW, width: 2 } });
  circle(s, xs[1], ny, 0.8, { fill: { type: 'none' }, line: { color: OCHRE, width: 1.25, transparency: 35 } });
  circle(s, xs[1], ny, 0.42, { fill: { color: OCHRE }, line: { color: SNOW, width: 2 } });
  circle(s, xs[2], ny, 0.3, { fill: { color: DUSK }, line: { color: SNOW, width: 2 } });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: xs[1] - 1.18, y: ny - 0.94, w: 2.36, h: 0.4, rectRadius: 0.2, fill: { color: OCHRE }, line: { color: OCHRE, width: 0 } });
  text(s, 'СЛЕДУЮЩИЙ ШАГ', { x: xs[1] - 1.18, y: ny - 0.94, w: 2.36, h: 0.4, align: 'center', valign: 'middle', fontFace: DATA, fontSize: 13, charSpacing: 2, color: INK });
  [['Прототип', 'работает'], ['Пилот с жителями', 'и экологами'], ['Городской', 'мониторинг']].forEach(([a, b], i) =>
    text(s, [{ text: a, options: { fontFace: BODY_SEMI, breakLine: true } }, { text: b }], { x: xs[i] - 1.1, y: ny + 0.36, w: 2.2, h: 0.7, align: 'center', fontSize: 15, color: SNOW }));
  notes(s, 6);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
await pres.writeFile({ fileName: out });
console.log(path.relative(root, out));
