"""The only publication path for synthetic sample photos."""
import argparse, hashlib, io
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
from common import ROOT, SRC, PUBLIC, now, read_json, write_json

RECIPE = 'sample-watermark-v1-golos-bold-diagonal-35-badge'

def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def marked_image(source):
    image=ImageOps.fit(source.convert('RGB'),(1600,1200),method=Image.Resampling.LANCZOS)
    image=Image.frombytes('RGB',image.size,image.tobytes()).convert('RGBA')
    font_path=SRC/'fonts/golos-text-bold.ttf'
    font=ImageFont.truetype(str(font_path),158)
    text='ОБРАЗЕЦ'
    layer=Image.new('RGBA',(1900,1900)); draw=ImageDraw.Draw(layer)
    draw.text((950,950),text,font=font,anchor='mm',fill=(255,255,255,89),
              stroke_width=2,stroke_fill=(31,42,58,89))
    layer=layer.rotate(28,resample=Image.Resampling.BICUBIC)
    image.alpha_composite(layer,(-150,-350))
    draw=ImageDraw.Draw(image); font=ImageFont.truetype(str(font_path),34)
    box=draw.textbbox((0,0),text,font=font); w=box[2]-box[0]+40
    draw.rounded_rectangle((1600-w-28,1116,1572,1172),radius=8,fill=(243,241,236,245),outline=(31,42,58,220),width=1)
    draw.text((1600-w/2-28,1144),text,font=font,anchor='mm',fill=(31,42,58,255))
    return image.convert('RGB')

def encoded_sample(source):
    out=io.BytesIO(); marked_image(source).save(out,'WEBP',quality=82,method=6,exif=b'')
    return out.getvalue()

def export(source, target, generated_at=None):
    source=Path(source); target=Path(target)
    if not target.name.startswith('sample-') or target.parent!=PUBLIC/'samples/photos':
        raise ValueError('Samples must be exported under web/public/samples/photos/sample-*.webp')
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(encoded_sample(Image.open(source)))
    receipt_path=SRC/'processing/sample-watermarks.json'
    receipts=read_json(receipt_path) if receipt_path.exists() else {}
    receipts[target.stem]=dict(source=source.relative_to(ROOT).as_posix(),
        file=target.relative_to(ROOT).as_posix(),source_sha256=sha256(source),
        output_sha256=sha256(target),recipe=RECIPE,watermarked=True,
        is_sample=True,generated_at=generated_at or now(),processed_at=now())
    write_json(receipt_path,receipts)

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('source'); parser.add_argument('target'); args=parser.parse_args()
    export(args.source,args.target)
