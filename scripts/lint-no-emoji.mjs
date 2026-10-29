// Проверка: в интерфейсе, коде, данных и документации нет эмодзи.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const SKIP = new Set(['node_modules', 'dist', '.git', '.tmp', 'vendor', 'assets-src', 'uploads', 'datamos', '.claude']);
const EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.html', '.json', '.geojson', '.md', '.svg', '.yml', '.yaml', '.webmanifest']);
// Эмодзи-блоки, символы-пиктограммы, вариационный селектор и склейка ZWJ
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u;
const ALLOWED = new Set([path.join(root, 'scripts', 'lint-no-emoji.mjs')]);

let bad = 0;
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full);
    else if (EXT.has(path.extname(name)) && !ALLOWED.has(full) && name !== 'package-lock.json') {
      const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        const m = EMOJI.exec(line);
        if (m) {
          bad++;
          console.error(`${path.relative(root, full)}:${i + 1}: эмодзи или пиктограмма U+${m[0].codePointAt(0).toString(16).toUpperCase()}`);
        }
      });
    }
  }
}
walk(root);
if (bad) {
  console.error(`Найдено: ${bad}`);
  process.exit(1);
}
console.log('Эмодзи не найдено.');
