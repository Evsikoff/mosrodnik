"""Shared paths, deterministic serialization and raster export."""
from pathlib import Path
from datetime import datetime, timezone
import json
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / 'web/public'
SRC = ROOT / 'assets-src'
COLORS = dict(snow='#F3F1EC', ink='#1F2A3A', ice='#9FC3D6', ochre='#C8964A',
              slate='#8A94A3', frost='#E3EEF3', dusk='#2C3A52')

def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')

def write(path, content):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8')

def write_json(path, data):
    write(path, json.dumps(data, ensure_ascii=False, indent=2) + '\n')

def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))

def save_webp(image, path, size=None, position=(.5, .5), illustration=False):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if size:
        image = ImageOps.fit(image, size, method=Image.Resampling.LANCZOS, centering=position)
    image = image.convert('RGBA' if 'A' in image.getbands() else 'RGB')
    quality = 82
    while True:
        image.save(path, 'WEBP', quality=quality, method=6, exif=b'')
        if not illustration or path.stat().st_size <= 300_000:
            break
        quality -= 3
        if quality < 55:
            raise RuntimeError(f'Illustration exceeds 300 KB: {path}')
    return image
