// Gemini is used only by this local asset tool. The key never enters web code or provenance files.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import writeFileAtomic from 'write-file-atomic';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '../..');
const jobs = JSON.parse(fs.readFileSync(path.join(root, 'assets-src/prompts/review-photos.json'), 'utf8'));
const receiptsPath = path.join(root, 'assets-src/processing/gemini-review-photos.json');
const receipts = fs.existsSync(receiptsPath) ? JSON.parse(fs.readFileSync(receiptsPath, 'utf8')) : {};
const model = 'gemini-3.1-flash-image';
const planOnly = process.argv.includes('--plan');
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.slice(8)) : jobs.length;
if (!Number.isInteger(limit) || limit < 1 || limit > jobs.length) throw new Error('Invalid --limit.');

const read = dir => fs.readdirSync(path.join(root, 'data', dir)).filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(path.join(root, 'data', dir, f), 'utf8')));
const observations = read('observations').filter(o => o.is_sample && o.id.startsWith('sample-community-'));
const springs = JSON.parse(fs.readFileSync(path.join(root, 'data/source/springs.geojson'), 'utf8')).features;
const district = new Map(springs.map(f => [f.properties.spring_id, f.properties.adm_area]));
const selectedSprings = new Set(Object.values(receipts).map(r => r.spring_id));
const selectedObs = new Set(Object.values(receipts).map(r => r.observation_id));
const districtCounts = new Map();
Object.values(receipts).forEach(r => districtCounts.set(district.get(r.spring_id), (districtCounts.get(district.get(r.spring_id)) ?? 0) + 1));
const save = () => writeFileAtomic.sync(receiptsPath, JSON.stringify(receipts, null, 2) + '\n');

for (const job of jobs) {
  if (receipts[job.id]) continue;
  const candidates = observations.filter(o => o.kind === job.kind && o.value === job.value && !selectedObs.has(o.id)
    && (job.preferred_spring ? o.spring_id === job.preferred_spring : !selectedSprings.has(o.spring_id)));
  candidates.sort((a, b) => (districtCounts.get(district.get(a.spring_id)) ?? 0) - (districtCounts.get(district.get(b.spring_id)) ?? 0)
    || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
  const obs = candidates[0];
  if (!obs) throw new Error(`No matching sample observation: ${job.id}`);
  const prompt = `Use case: photorealistic-natural. Generate ONE landscape 4:3 smartphone photograph as a fictional demonstration attachment for a Moscow woodland spring review.\nScene: ${job.scene}\nThe demonstration review says: ${JSON.stringify(obs.comment)}. Match its visible physical details where applicable.\nStyle: ordinary visitor snapshot, imperfect casual framing, muted natural colors, realistic worn materials, subtle phone camera noise. No beauty-advertising lighting, no illustration, no 3D render, no collage, no frame.\nDo not show recognizable people, faces, drinking, drinking vessels, landmarks, logos, official emblems, lettering or claims about water purity. No added text or graphic watermark; a visible SAMPLE watermark will be applied locally before publication. This is fictional generic scenery, not a reconstruction or evidence of the named real spring.`;
  receipts[job.id] = { provider: 'Google Gemini API', model, source: `assets-src/generated/${job.id}.png`,
    spring_id: obs.spring_id, observation_id: obs.id, user_id: obs.user_id,
    kind: job.kind, value: job.value, season: job.season, caption: job.caption, prompt,
    is_sample: true, aspect_ratio: '4:3', image_size: '1K', status: 'planned' };
  selectedSprings.add(obs.spring_id); selectedObs.add(obs.id);
  districtCounts.set(district.get(obs.spring_id), (districtCounts.get(district.get(obs.spring_id)) ?? 0) + 1);
}
save();
console.log(`Planned ${jobs.length} sample photos across ${selectedSprings.size} springs and ${districtCounts.size} districts.`);
if (planOnly) process.exit(0);

process.loadEnvFile(path.join(root, '.env.local'));
const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error('GEMINI_API_KEY is missing in .env.local.');
const selected = jobs.slice(0, limit).filter(job => receipts[job.id].status !== 'generated');
let next = 0;
const failures = [];
async function generate(job) {
  const record = receipts[job.id];
  if (fs.existsSync(path.join(root, record.source))) throw new Error(`Unrecorded original already exists: ${job.id}`);
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: record.prompt }] }],
          generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:3', imageSize: '1K' } } }),
        signal: AbortSignal.timeout(180000),
      });
    } catch {
      // A request may have been billed before a transport timeout; do not repeat it automatically.
      throw new Error(`Transport failure for ${job.id}; rerun explicitly to retry.`);
    }
    if (!response.ok) {
      await response.arrayBuffer();
      if ([429, 503].includes(response.status) && attempt < 2) {
        console.log(`${job.id}: HTTP ${response.status}, retrying after ${15 * (attempt + 1)}s.`);
        await new Promise(resolve => setTimeout(resolve, 15000 * (attempt + 1)));
        continue;
      }
      throw new Error(`Gemini HTTP ${response.status}: ${job.id}`);
    }
    const result = await response.json();
    const parts = result.candidates?.[0]?.content?.parts ?? [];
    const generated = parts.filter(part => !part.thought && (part.inlineData?.mimeType ?? '').startsWith('image/'));
    if (generated.length !== 1) {
      console.error(JSON.stringify({ id: job.id, finishReason: result.candidates?.[0]?.finishReason,
        blockReason: result.promptFeedback?.blockReason, parts: parts.map(p => ({ thought: !!p.thought, keys: Object.keys(p), mime: p.inlineData?.mimeType })) }));
      throw new Error(`Expected one final image: ${job.id}`);
    }
    const mime = generated[0].inlineData.mimeType;
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mime];
    if (!extension) throw new Error(`Unsupported image type: ${job.id}`);
    const bytes = Buffer.from(generated[0].inlineData.data, 'base64');
    const metadata = await sharp(bytes).metadata();
    if (bytes.length < 10000 || !metadata.width || !metadata.height) throw new Error(`Invalid image: ${job.id}`);
    record.source = `assets-src/generated/${job.id}.${extension}`;
    const destination = path.join(root, record.source);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    writeFileAtomic.sync(destination, bytes);
    Object.assign(record, { status: 'generated', generated_at: new Date().toISOString(),
      source_sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      native_size: [metadata.width, metadata.height], mime_type: mime,
      response_id: result.responseId ?? null, usage: result.usageMetadata ?? null });
    save();
    console.log(`Generated ${job.id}: ${record.native_size.join('x')}, ${Math.round(bytes.length / 1024)} KB.`);
    return;
  }
}
async function worker() {
  while (next < selected.length) {
    const job = selected[next++];
    try { await generate(job); } catch (error) { failures.push(job.id); console.error(error.message); }
  }
}
await Promise.all(Array.from({ length: Math.min(3, selected.length) }, worker));
console.log(`Generated total: ${Object.values(receipts).filter(r => r.status === 'generated').length}/${jobs.length}; failed this run: ${failures.length}.`);
if (failures.length) process.exitCode = 1;
