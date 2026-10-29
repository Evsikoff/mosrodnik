"""Publish Gemini review examples through the existing reproducible watermark recipe."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
from PIL import Image, ImageDraw, ImageFont, ImageOps
from common import ROOT, SRC, PUBLIC, read_json, now
from watermark import export, encoded_sample, sha256


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='.' + path.name, suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def validate_binding(record):
    observation = read_json(ROOT / 'data/observations' / (record['observation_id'] + '.json'))
    user = read_json(ROOT / 'data/users' / (record['user_id'] + '.json'))
    assert observation['is_sample'] and user['is_sample']
    assert observation['affects_map'] is False
    for key in ['spring_id', 'user_id', 'kind', 'value']:
        assert observation[key] == record[key], f'Changed observation binding: {key}'
    source = ROOT / record['source']
    assert sha256(source) == record['source_sha256'], 'Original hash changed'
    return observation


def check_photo(photo_id, record):
    observation = validate_binding(record)
    photo = read_json(ROOT / 'data/photos' / (photo_id + '.json'))
    assert photo['is_sample'] and photo['spring_id'] == observation['spring_id']
    assert photo['user_id'] == observation['user_id']
    assert photo_id in observation['photo_ids']
    assert photo['created_at'] == record['generated_at']
    assert photo['caption'].startswith('Образец:')
    output = PUBLIC / photo['file'].lstrip('/')
    proof = read_json(SRC / 'processing/sample-watermarks.json')[photo_id]
    assert sha256(output) == proof['output_sha256']
    with Image.open(ROOT / record['source']) as source:
        assert hashlib.sha256(encoded_sample(source)).hexdigest() == proof['output_sha256']
    for path, size in [(output, (1600, 1200)), (PUBLIC / photo['thumb'].lstrip('/'), (400, 300))]:
        with Image.open(path) as image:
            assert image.size == size and image.format == 'WEBP'
            assert not image.getexif() and not image.info.get('exif')
            assert not image.info.get('icc_profile') and not image.info.get('xmp')


def contact_sheet(records):
    items = [(photo_id, r) for photo_id, r in records.items() if r.get('published_at')]
    cols, width, height = 4, 320, 260
    canvas = Image.new('RGB', (cols * width, ((len(items) + cols - 1) // cols) * height), '#F3F1EC')
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.truetype(str(SRC / 'fonts/golos-text-variable.ttf'), 14)
    for i, (photo_id, record) in enumerate(items):
        with Image.open(PUBLIC / 'samples/photos' / (photo_id + '.webp')) as image:
            image = ImageOps.fit(image, (width, 240))
            x, y = (i % cols) * width, (i // cols) * height
            canvas.paste(image, (x, y))
            draw.text((x + 5, y + 241), photo_id.replace('sample-review-', ''), fill='#1F2A3A', font=font)
    canvas.save(SRC / 'qa/review-photos-contact.jpg', quality=88)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    receipts_path = SRC / 'processing/gemini-review-photos.json'
    records = read_json(receipts_path)
    generated = {photo_id: record for photo_id, record in records.items() if record['status'] == 'generated'}
    for photo_id, record in generated.items():
        observation = validate_binding(record)
        if not args.check and not record.get('published_at'):
            target = PUBLIC / 'samples/photos' / (photo_id + '.webp')
            photo_path = ROOT / 'data/photos' / (photo_id + '.json')
            if photo_path.exists():
                assert read_json(photo_path)['is_sample'], 'Refusing to overwrite a real photo'
            assert not target.exists(), 'Refusing to overwrite an existing published asset'
            export(ROOT / record['source'], target, record['generated_at'])
            thumbnail = PUBLIC / 'samples/thumbs' / (photo_id + '.webp')
            thumbnail.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(target) as image:
                image.resize((400, 300), Image.Resampling.LANCZOS).save(thumbnail, 'WEBP', quality=80, method=6, exif=b'')
            photo = dict(id=photo_id, spring_id=record['spring_id'], user_id=record['user_id'],
                         file=f'/samples/photos/{photo_id}.webp', thumb=f'/samples/thumbs/{photo_id}.webp',
                         width=1600, height=1200, season=record['season'],
                         caption='Образец: ' + record['caption'] + ' Синтетическое изображение.',
                         created_at=record['generated_at'], is_sample=True)
            atomic_json(photo_path, photo)
            observation['photo_ids'] = list(dict.fromkeys(observation['photo_ids'] + [photo_id]))
            atomic_json(ROOT / 'data/observations' / (observation['id'] + '.json'), observation)
            record['published_at'] = now()
            record['file'] = photo['file']
            record['thumb'] = photo['thumb']
            atomic_json(receipts_path, records)
        check_photo(photo_id, record)
    if not args.check and generated:
        contact_sheet(records)
    print(f'PASS: {len(generated)} Gemini photo examples, same-author bindings, reproducible watermarks, thumbnails and stripped metadata.')


if __name__ == '__main__':
    main()
