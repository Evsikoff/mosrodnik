// Local Gemini asset generation. No API key is saved in the presentation or in browser code.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import writeFileAtomic from 'write-file-atomic';

const base = path.resolve(import.meta.dirname, '..');
const root = path.resolve(base, '../..');
const spec = JSON.parse(fs.readFileSync(path.join(base, 'presentation.json'), 'utf8'));
const receiptPath = path.join(base, 'generation.json');
const receipts = fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath, 'utf8')) : {};
process.loadEnvFile(path.join(root, '.env.local'));
const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error('GEMINI_API_KEY is missing in .env.local');
const onlyArg = process.argv.find(v => v.startsWith('--only='));
const numbers = onlyArg ? onlyArg.slice(7).split(',').map(Number) : spec.slides.map(s => s.number);
if (numbers.some(n => !Number.isInteger(n) || n < 1 || n > spec.slide_count)) throw new Error('Invalid --only=');
const save = () => writeFileAtomic.sync(receiptPath, JSON.stringify(receipts, null, 2) + '\n');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const mime = file => ({'.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'}[path.extname(file)]);

async function generate(slide) {
  const destination = path.join(root, slide.image_file);
  if (receipts[slide.id]?.status === 'generated') {
    if (!fs.existsSync(destination) || hash(fs.readFileSync(destination)) !== receipts[slide.id].output_sha256) throw new Error(`Saved slide integrity mismatch: ${slide.id}`);
    console.log(`Already generated: ${slide.id}`);
    return;
  }
  if (fs.existsSync(destination)) throw new Error(`Refusing to replace an unrecorded slide: ${slide.id}`);
  const prompt = spec.image_generation.style_prompt + '\n\n' + slide.image_prompt
    + '\n\nRequired visible text, copied verbatim:\n' + slide.visible_text.map(t => JSON.stringify(t)).join('\n')
    + '\nBefore rendering, carefully check every Cyrillic letter, word ending and number. Never truncate or silently paraphrase Russian text.';
  const references = [...slide.reference_images];
  if (slide.number > 1) references.push(spec.slides[0].image_file);
  const parts = [{ text: prompt }];
  for (const [i, ref] of references.entries()) {
    const file = path.join(root, ref);
    if (!fs.existsSync(file)) throw new Error(`Missing image reference: ${ref}`);
    parts.push({ text: slide.number > 1 && i === references.length - 1 ? 'Visual style reference: keep its typography and color family, but use the new slide content and a different composition.' : 'Content reference supplied for this slide. Preserve actual application UI when present; other artwork is atmosphere only.' });
    parts.push({ inlineData: { mimeType: mime(file), data: fs.readFileSync(file).toString('base64') } });
  }
  console.log(`Generating ${slide.id} with ${spec.image_generation.model}...`);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${spec.image_generation.model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: {
      responseModalities: ['IMAGE'], imageConfig: { aspectRatio: spec.aspect_ratio, imageSize: spec.image_generation.image_size },
    } }), signal: AbortSignal.timeout(240000),
  });
  if (!response.ok) { await response.arrayBuffer(); throw new Error(`Gemini HTTP ${response.status}: ${slide.id}`); }
  const result = await response.json();
  const images = (result.candidates?.[0]?.content?.parts ?? []).filter(p => !p.thought && p.inlineData?.mimeType?.startsWith('image/'));
  if (images.length !== 1) throw new Error(`Expected one final image: ${slide.id}; finish=${result.candidates?.[0]?.finishReason ?? 'none'}`);
  const image = images[0].inlineData;
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[image.mimeType];
  if (!extension) throw new Error(`Unsupported image MIME: ${slide.id}`);
  const bytes = Buffer.from(image.data, 'base64');
  const metadata = await sharp(bytes).metadata();
  const original = path.join(base, 'sources', `slide-${String(slide.number).padStart(2,'0')}.${extension}`);
  const output = await sharp(bytes).resize(spec.slide_resolution.width, spec.slide_resolution.height, { fit: 'cover' }).png().toBuffer();
  fs.mkdirSync(path.dirname(original), { recursive: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  writeFileAtomic.sync(original, bytes);
  writeFileAtomic.sync(destination, output);
  receipts[slide.id] = { status: 'generated', provider: 'Google Gemini API', model: spec.image_generation.model,
    generated_at: new Date().toISOString(), prompt, references,
    original_file: path.relative(root, original).replaceAll('\\','/'), original_sha256: hash(bytes),
    original_size: [metadata.width, metadata.height], output_file: slide.image_file,
    output_sha256: hash(output), output_size: [spec.slide_resolution.width, spec.slide_resolution.height],
    response_id: result.responseId ?? null, usage: result.usageMetadata ?? null,
    previous_revisions: receipts[slide.id]?.previous_revisions ?? [] };
  save();
  console.log(`Saved ${slide.id}: ${metadata.width}x${metadata.height} original, 1920x1080 PNG.`);
}

if (numbers.includes(1)) await generate(spec.slides[0]);
const remaining = spec.slides.filter(s => s.number !== 1 && numbers.includes(s.number));
let next = 0;
const failures = [];
async function worker() {
  while (next < remaining.length) {
    const slide = remaining[next++];
    try { await generate(slide); }
    catch (error) { failures.push(slide.id); console.error(error.message); }
  }
}
await Promise.all(Array.from({ length: Math.min(2, remaining.length) }, worker));
console.log(`Slides ready: ${Object.values(receipts).filter(r => r.status === 'generated').length}/${spec.slide_count}`);
if (failures.length) process.exitCode = 1;
