import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const base = path.resolve(import.meta.dirname, '..');
const root = path.resolve(base, '../..');
const spec = JSON.parse(fs.readFileSync(path.join(base, 'presentation.json'), 'utf8'));
const escape = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const panels = spec.slides.map(s => `<section data-slide="${s.number}"${s.number === 1 ? '' : ' hidden'}><img src="slides/slide-${String(s.number).padStart(2,'0')}.png" alt="${escape(s.visible_text.join('. '))}"><details><summary>Текст докладчика и файл озвучки</summary><p>${escape(s.speaker_text)}</p><code>${escape(s.audio_path)}</code></details></section>`).join('\n');
const html = `<!doctype html>
<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Московский родник: презентация</title>
<style>body{margin:0;background:#1f2a3a;color:#f3f1ec;font:16px/1.5 system-ui,sans-serif}main{max-width:1500px;margin:auto;padding:20px}nav{display:flex;align-items:center;justify-content:center;gap:18px;margin-bottom:18px}button{font:inherit;background:#e3eef3;color:#1f2a3a;border:0;border-radius:8px;padding:9px 15px;cursor:pointer}button:disabled{opacity:.4;cursor:default}img{display:block;width:100%;height:auto;aspect-ratio:16/9}details{padding:16px 0}summary{cursor:pointer}code{overflow-wrap:anywhere}[hidden]{display:none!important}p{max-width:1000px}</style>
<main><nav aria-label="Навигация по слайдам"><button id="previous" type="button">Назад</button><output id="count" aria-live="polite">1 / 6</output><button id="next" type="button">Далее</button></nav>${panels}</main>
<script>let current=1;const sections=[...document.querySelectorAll('[data-slide]')];function show(n){current=Math.max(1,Math.min(6,n));for(const s of sections)s.hidden=Number(s.dataset.slide)!==current;document.getElementById('count').textContent=current+' / 6';document.getElementById('previous').disabled=current===1;document.getElementById('next').disabled=current===6;}document.getElementById('previous').onclick=()=>show(current-1);document.getElementById('next').onclick=()=>show(current+1);document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')show(current+1);if(e.key==='ArrowLeft')show(current-1);});show(1);</script></html>`;
fs.writeFileSync(path.join(base, 'preview.html'), html);
fs.writeFileSync(path.join(base, 'music-prompt.txt'), spec.music.prompt + '\n\n' + spec.music.prompt_ru + '\n');
fs.writeFileSync(path.join(base, 'speaker-notes.txt'), spec.slides.map(s => `${String(s.number).padStart(2,'0')}. ${s.title}\nФайл: ${s.audio_path}\n\n${s.speaker_text}`).join('\n\n---\n\n') + '\n');
const frames = [];
for (const slide of spec.slides) {
  const filename = path.join(root, slide.image_file);
  const metadata = await sharp(filename).metadata();
  if (metadata.width !== 1920 || metadata.height !== 1080) throw new Error(`Unexpected slide size: ${slide.id}`);
  const buffer = await sharp(filename).resize(640,360).toBuffer();
  frames.push({ input:buffer, left:((slide.number-1)%2)*640, top:Math.floor((slide.number-1)/2)*360 });
}
await sharp({create:{width:1280,height:1080,channels:3,background:'#F3F1EC'}}).composite(frames).jpeg({quality:88}).toFile(path.join(base,'contact-sheet.jpg'));
console.log('Saved slide preview, contact sheet, music prompt and speaker notes.');
