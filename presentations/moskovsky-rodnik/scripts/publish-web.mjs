// Готовит презентацию для кнопки «О проекте»: слайды в WebP, озвучку и музыку в MP3, тексты в deck.json.
// Источники: slides/ (экспорт из PowerPoint, номер слайда в конце имени), audio/voiceover/*.wav, audio/music/background.mp3.
// Нужен ffmpeg в PATH.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import writeFileAtomic from 'write-file-atomic';

const base = path.resolve(import.meta.dirname, '..');
const root = path.resolve(base, '../..');
const outDir = path.join(root, 'web/src/presentation');
const media = path.join(outDir, 'media');
const deck = JSON.parse(fs.readFileSync(path.join(base, 'presentation.json'), 'utf8'));

fs.mkdirSync(media, { recursive: true });
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
const duration = (file) => Number(execFileSync('ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());

const slideFiles = fs.readdirSync(path.join(base, 'slides')).filter((f) => /\d+\.(jpe?g|png)$/i.test(f));
const slides = [];
for (const s of deck.slides) {
  const nn = String(s.number).padStart(2, '0');
  const src = slideFiles.find((f) => Number(/(\d+)\.\w+$/.exec(f)[1]) === s.number);
  if (!src) throw new Error(`Нет изображения слайда ${s.number} в slides/`);
  const image = `slide-${nn}.webp`;
  await sharp(path.join(base, 'slides', src)).webp({ quality: 86 }).toFile(path.join(media, image));

  const wav = path.join(root, s.audio_path);
  const voice = `voice-${nn}.mp3`;
  ffmpeg('-i', wav, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '64k', path.join(media, voice));
  slides.push({ number: s.number, title: s.title, image, voice, seconds: Math.round(duration(wav) * 100) / 100, text: s.speaker_text });
}

const music = 'music.mp3';
ffmpeg('-i', path.join(base, 'audio/music/background.mp3'), '-codec:a', 'libmp3lame', '-b:a', '128k', path.join(media, music));

writeFileAtomic.sync(path.join(outDir, 'deck.json'), JSON.stringify({ title: deck.title, music, slides }, null, 2) + '\n');
for (const f of fs.readdirSync(media)) console.log(`${f}\t${fs.statSync(path.join(media, f)).size}`);
