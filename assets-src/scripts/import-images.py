"""Import built-in imagegen outputs, publish clean exports, retain local sources."""
import argparse, shutil
from pathlib import Path
from datetime import datetime, timezone
from PIL import Image, ImageDraw, ImageFont, ImageOps
from common import ROOT, SRC, PUBLIC, read_json, write_json, now, save_webp
from watermark import export

def og_image():
    hero=PUBLIC/'illustrations/hero/hero-winter-ravine.webp'
    if not hero.exists(): return
    image=ImageOps.fit(Image.open(hero).convert('RGB'),(1200,630)).convert('RGBA')
    shade=Image.new('RGBA',image.size); draw=ImageDraw.Draw(shade)
    for x in range(1200):
        alpha=int(210*max(0,1-x/1150))
        draw.line((x,0,x,630),fill=(31,42,58,alpha))
    image.alpha_composite(shade)
    import resvg_py, io
    mark=Image.open(io.BytesIO(resvg_py.svg_to_bytes(svg_string=(PUBLIC/'brand/logo-inverse.svg').read_text(),width=112,height=112)))
    image.alpha_composite(mark,(64,64))
    font=ImageFont.truetype(str(SRC/'fonts/golos-text-bold.ttf'),72)
    draw=ImageDraw.Draw(image)
    draw.text((64,235),'Московский',font=font,fill='#F3F1EC')
    draw.text((64,322),'родник',font=font,fill='#F3F1EC')
    image.convert('RGB').save(PUBLIC/'brand/og-image.png')

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--imports'); args=parser.parse_args()
    records_path=SRC/'processing/generated-images.json'
    records=read_json(records_path) if records_path.exists() else {}
    if args.imports:
        imports=read_json(ROOT/args.imports)
        for id,record in imports.items():
            source=SRC/'generated'/f'{id}.png'; source.parent.mkdir(parents=True,exist_ok=True)
            input_path=Path(record['path'])
            generated_at=record.get('generated_at') or datetime.fromtimestamp(input_path.stat().st_mtime,timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
            if source.resolve()!=input_path.resolve(): shutil.copyfile(input_path,source)
            with Image.open(source) as image:
                records[id]=dict(source=source.relative_to(ROOT).as_posix(),native_size=list(image.size),
                    generated_at=generated_at,method='built-in-imagegen')
        write_json(records_path,records)
    for prompt in read_json(SRC/'prompts/images.json'):
        id=prompt['id']; target=ROOT/prompt['target_path']
        if id=='hero-winter-ravine-mobile': continue
        if id not in records: continue
        source=ROOT/records[id]['source']; image=Image.open(source)
        if id.startswith('sample-'):
            export(source,target,records[id]['generated_at'])
        else:
            size=(256,256) if id.startswith('avatar-') else tuple(prompt['size'])
            save_webp(image,target,size,illustration=True)
    hero=PUBLIC/'illustrations/hero/hero-winter-ravine.webp'
    if hero.exists():
        save_webp(Image.open(hero),PUBLIC/'illustrations/hero/hero-winter-ravine-mobile.webp',
                  (1080,1350),position=(.66,.53),illustration=True)
    og_image()
    print(f'Imported {len(records)} generated originals; published resized WebP, marked sample photos and OG.')

if __name__=='__main__': main()
