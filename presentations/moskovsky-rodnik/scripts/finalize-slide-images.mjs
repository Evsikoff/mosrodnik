// Preserve the generated slide design, inserting actual app pixels inside its screen frames.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import writeFileAtomic from 'write-file-atomic';
const base = path.resolve(import.meta.dirname, '..');
const root = path.resolve(base, '../..');
const receiptPath = path.join(base, 'generation.json');
const records = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
const frames = [
  {id:'03-product', reference:'references/app-3d.png',left:371,top:246,width:1181,height:687,background:'#F3F1EC'},
  {id:'04-contribution', reference:'references/app-mobile.png',left:1362,top:142,width:436,height:837,background:'#1F2A3A'},
];
for (const frame of frames) {
  const record = records[frame.id];
  const screenshot = await sharp(path.join(base,frame.reference)).resize(frame.width,frame.height,{fit:'contain',background:frame.background}).png().toBuffer();
  const normalized = await sharp(path.join(root,record.original_file)).resize(1920,1080,{fit:'cover'}).png().toBuffer();
  const output = await sharp(normalized).composite([{input:screenshot,left:frame.left,top:frame.top}]).png().toBuffer();
  writeFileAtomic.sync(path.join(root,record.output_file),output);
  record.postprocessing = {method:'Actual application screenshot inserted into generated screen frame, no UI text regenerated',reference:`presentations/moskovsky-rodnik/${frame.reference}`,frame:{left:frame.left,top:frame.top,width:frame.width,height:frame.height}};
  record.output_sha256=crypto.createHash('sha256').update(output).digest('hex');
}
writeFileAtomic.sync(receiptPath,JSON.stringify(records,null,2)+'\n');
console.log('Inserted actual app screenshots into slides 3 and 4.');
