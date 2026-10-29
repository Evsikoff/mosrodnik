"""Validate deliverables, sample integrity and explicitly deferred source data."""
import argparse, hashlib, io, re, runpy, sys
from datetime import datetime, timezone
import xml.etree.ElementTree as ET
import numpy as np
import resvg_py
from PIL import Image
from common import ROOT, PUBLIC, SRC, COLORS, read_json
from manifest import dimensions, inventory_paths
from watermark import encoded_sample, sha256, RECIPE

ERRORS=[]

def check(condition,message):
    if not condition: ERRORS.append(message)

def timestamp(value,label):
    try:
        parsed=datetime.fromisoformat(value.replace('Z','+00:00'))
        check(parsed.tzinfo is not None,f'{label}: timezone missing')
        check(parsed<=datetime.now(timezone.utc),f'{label}: future timestamp')
    except (ValueError,TypeError,AttributeError):
        check(False,f'{label}: invalid ISO timestamp')

def emoji(text):
    return any(0x1F000<=ord(c)<=0x1FAFF or 0x2600<=ord(c)<=0x27BF or
        0xFE00<=ord(c)<=0xFE0F or ord(c) in [0x200D,0x20E3,0x231A,0x231B,0x23F0,0x23F3] for c in text)

def check_inventory():
    manifest=ROOT/'ASSETS.md'
    check(manifest.exists(),'ASSETS.md missing')
    if not manifest.exists(): return
    listed={}
    for line in manifest.read_text(encoding='utf-8').splitlines():
        if not line.startswith('| `'): continue
        parts=[part.strip() for part in line.strip('|').split('|')]
        check(len(parts)==6,'Malformed manifest row')
        if len(parts)!=6: continue
        rel=parts[0].strip('`'); path=ROOT/rel; listed[rel]=parts
        check(path.exists(),f'Missing manifest file: {rel}')
        if not path.exists(): continue
        check(dimensions(path)==parts[2],f'Dimensions differ: {rel}')
        check(str(path.stat().st_size)==parts[3],f'Byte size differs: {rel}; rebuild manifest')
    actual={p.relative_to(ROOT).as_posix() for p in inventory_paths()}
    check(actual==set(listed),f'Manifest inventory mismatch: {sorted(actual ^ set(listed))}')
    for path in inventory_paths()+[manifest]:
        rel=path.relative_to(ROOT)
        for name in rel.parts:
            check(name.isascii() and not re.search(r'\s',name),f'Invalid filename: {rel}')
            # check_assets.py is explicitly requested by the brief.
            check('_' not in name or name=='check_assets.py',f'Not kebab-case: {rel}')
        if path.suffix in ['.json','.svg','.css','.html','.md','.py','.txt']:
            text=path.read_text(encoding='utf-8')
            check(not emoji(text),f'Emoji found: {rel}')
            if path.suffix=='.json': read_json(path)
    return len(listed)

def check_public():
    prompts=read_json(SRC/'prompts/images.json'); ids=set()
    for prompt in prompts:
        check(all(k in prompt for k in ['id','target_path','size','prompt','negative','notes']),'Incomplete prompt')
        check(prompt['id'] not in ids,'Duplicate prompt id'); ids.add(prompt['id'])
        path=ROOT/prompt['target_path']; check(path.exists(),f'Missing generated asset: {path.name}')
        if not path.exists(): continue
        expected=(256,256) if prompt['id'].startswith('avatar-') else tuple(prompt['size'])
        with Image.open(path) as image:
            check(image.size==expected,f'Wrong generated asset dimensions: {path.name}')
            check(not any(image.info.get(k) for k in ['exif','xmp','icc_profile']),f'Metadata present: {path.name}')
        if '/illustrations/' in prompt['target_path'] or prompt['id'].startswith('avatar-'):
            check(path.stat().st_size<=300_000,f'Illustration over 300 KB: {path.name}')
    check(len(prompts)==37,'Expected 37 prompt entries including mobile crop')
    markers=['status-ok','status-exceed','status-not-sampled','selected-halo','me','frost-1','frost-2','frost-3',
             'state-flowing','state-weak','state-frozen','state-dry','state-unknown']
    for id in markers:
        path=PUBLIC/f'markers/{id}.svg'; raster=PUBLIC/f'markers/png@2x/{id}.png'
        check(path.exists() and raster.exists(),f'Missing SVG/PNG marker pair: {id}')
        if path.exists() and raster.exists():
            size=20 if id.startswith('state-') else 48
            check(dimensions(path)==f'{size}x{size}',f'Marker viewBox: {id}')
            with Image.open(raster) as im: check(im.size==(size*2,size*2),f'Marker @2x size: {id}')
    required={'brand/logo.svg':48,'brand/logo-mono.svg':48,'brand/logo-inverse.svg':48,
        'brand/favicon-32.png':32,'brand/apple-touch-icon-180.png':180,'brand/icon-192.png':192,
        'brand/icon-512.png':512,'brand/icon-maskable-512.png':512,'effects/ice-crystal.svg':64,
        'patterns/topo-contours.svg':512}
    for i in range(1,6): required[f'effects/snowflake-{i}.svg']=64
    for name in ['chemistry-only','no-microbiology','boil-water','last-sample','never-sampled']:
        required[f'pictograms/{name}.svg']=32
    for rel,size in required.items():
        path=PUBLIC/rel; check(path.exists(),f'Missing required asset: {rel}')
        if path.exists(): check(dimensions(path)==f'{size}x{size}',f'Wrong required dimensions: {rel}')
    with Image.open(PUBLIC/'brand/favicon.ico') as image:
        check(image.ico.sizes()=={(16,16),(32,32)},'ICO must contain 16 and 32')
    check(dimensions(PUBLIC/'brand/og-image.png')=='1200x630','OG dimensions')
    pwa=read_json(PUBLIC/'brand/site.webmanifest')
    check(pwa['name']=='Московский родник' and pwa['theme_color']==COLORS['ink'] and pwa['background_color']==COLORS['snow'],'PWA brand settings')
    for icon in pwa['icons']: check((PUBLIC/icon['src'].lstrip('/')).exists(),'Missing PWA icon')
    crystal=ET.parse(PUBLIC/'effects/ice-crystal.svg').getroot()
    branches=crystal.findall('.//{http://www.w3.org/2000/svg}path')
    check({p.get('id') for p in branches}=={f'branch-{i}' for i in range(1,7)},'Crystal branch IDs')
    check(read_json(ROOT/'design/tokens.json')==COLORS,'JSON tokens differ')
    css=(ROOT/'design/tokens.css').read_text()
    for key,color in COLORS.items(): check(f'--{key}: {color};' in css,f'Missing CSS token {key}')
    for name in ['frost','caustics']:
        with Image.open(PUBLIC/f'effects/{name}-tile-512.webp') as image:
            array=np.array(image)
            check(image.size==(512,512),f'{name}: size')
            check(np.array_equal(array[0],array[-1]) and np.array_equal(array[:,0],array[:,-1]),f'{name}: edges are not identical')
            if name=='frost': check(image.mode=='RGBA' and array[:,:,3].min()==0 and array[:,:,3].max()>0,'Frost alpha missing')
            else: check(image.mode=='RGB' and np.array_equal(array[:,:,0],array[:,:,1]) and np.array_equal(array[:,:,1],array[:,:,2]),'Caustics not grayscale')
    avatars=read_json(PUBLIC/'avatars/avatars.json')
    check(len(avatars)==16 and len({a['id'] for a in avatars})==16,'Avatar count or duplicate IDs')
    for avatar in avatars:
        check(avatar['name']==avatar['name'].lower(),'Avatar name must be lowercase')
        check((PUBLIC/avatar['file'].lstrip('/')).exists(),'Avatar catalog path missing')

def check_logo():
    brand=PUBLIC/'brand'; metadata=read_json(brand/'logo-sprite.json')
    check((metadata['columns'],metadata['rows'],metadata['frame_count'],metadata['fps'],metadata['duration_ms'])==(6,4,24,12,2000),'Logo animation timing or grid')
    check(metadata['frame_count']/metadata['fps']*1000==metadata['duration_ms'],'Logo duration mismatch')
    check(len(metadata['sheets'])==6,'Logo must have mark and lockup atlases in three variants')
    for key,sheet in metadata['sheets'].items():
        with Image.open(PUBLIC/sheet['png'].lstrip('/')) as png, Image.open(PUBLIC/sheet['webp'].lstrip('/')) as webp:
            check(png.mode=='RGBA' and png.getextrema()[3][0]==0,f'Logo transparency: {key}')
            check(png.size==(sheet['width'],sheet['height'])==webp.size,f'Logo atlas dimensions: {key}')
            check(png.convert('RGBA').tobytes()==webp.convert('RGBA').tobytes(),f'Logo lossless WebP differs: {key}')
            check(sheet['width']==sheet['frame_width']*6 and sheet['height']==sheet['frame_height']*4,f'Logo frame geometry: {key}')
            check(sheet['display_width']*2==sheet['frame_width'] and sheet['display_height']*2==sheet['frame_height'],f'Logo 2x dimensions: {key}')
            check(len(sheet['frames'])==24,f'Logo frame count: {key}')
            frames=[]
            for i,frame in enumerate(sheet['frames']):
                w,h=sheet['frame_width'],sheet['frame_height']; x,y=(i%6)*w,(i//6)*h
                check((frame['index'],frame['x'],frame['y'],frame['width'],frame['height'])==(i,x,y,w,h),f'Logo frame rect: {key}/{i}')
                frames.append(png.crop((x,y,x+w,y+h)))
                box=frames[-1].getbbox()
                check(box is not None and box[0]>0 and box[1]>0 and box[2]<w and box[3]<h,f'Logo clipping: {key}/{i}')
            check(len({hashlib.sha256(f.tobytes()).hexdigest() for f in frames})==24,f'Logo frames are not all distinct: {key}')
            if key.startswith('lockup'):
                baseline=frames[0].crop((224,0,w,h)).tobytes()
                check(all(f.crop((224,0,w,h)).tobytes()==baseline for f in frames),'Logo wordmark moved')
            else:
                baseline=frames[0].crop((0,0,w,149)).tobytes()
                check(all(f.crop((0,0,w,149)).tobytes()==baseline for f in frames),'Logo M moved')
            arrays=[np.array(f).astype(np.int16) for f in frames]
            deltas=[np.abs(arrays[i]-arrays[(i+1)%24]).sum() for i in range(24)]
            check(deltas[-1]<=max(deltas[:-1])*1.25,f'Logo loop discontinuity: {key}')
            suffix='-inverse' if key.endswith('inverse') else '-mono' if key.endswith('mono') else ''
            static=brand/('logo-lockup'+suffix+'.svg' if key.startswith('lockup') else 'logo'+suffix+'.svg')
            rendered=Image.open(io.BytesIO(resvg_py.svg_to_bytes(svg_string=static.read_text(),width=w,height=h))).convert('RGBA')
            check(rendered.tobytes()==frames[0].tobytes(),f'Logo first frame differs from static SVG: {key}')
    for name in ['logo-lockup.svg','logo-lockup-mono.svg','logo-lockup-inverse.svg']:
        document=ET.parse(brand/name).getroot()
        check(not document.findall('.//{http://www.w3.org/2000/svg}text'),f'Logo still depends on fonts: {name}')
    css=(brand/'logo-animation.css').read_text()
    check('steps(1, end)' in css and 'prefers-reduced-motion: reduce' in css,'Logo CSS timing or reduced-motion missing')
    check((brand/'readme.md').exists() and (ROOT/'preview/logo.html').exists(),'Logo README or demo missing')

def check_samples():
    records=read_json(SRC/'processing/sample-watermarks.json')
    paths=sorted((PUBLIC/'samples/photos').glob('*'))
    check(len(paths)==12 and len(records)==12,'Expected twelve published sample photos and receipts')
    for path in paths:
        check(path.name.startswith('sample-') and path.suffix=='.webp',f'Unapproved sample file: {path.name}')
        receipt=records.get(path.stem)
        check(bool(receipt),f'No processing proof: {path.name}')
        if not receipt: continue
        check(receipt.get('is_sample') is True and receipt.get('watermarked') is True,'Invalid watermark flags')
        check(receipt['recipe']==RECIPE,'Unknown watermark recipe')
        source=ROOT/receipt['source']; check(source.exists(),'Watermark source missing')
        if not source.exists(): continue
        check(sha256(source)==receipt['source_sha256'],'Watermark source hash differs')
        check(sha256(path)==receipt['output_sha256'],f'Watermark output hash differs: {path.name}')
        with Image.open(source) as image:
            regenerated=hashlib.sha256(encoded_sample(image)).hexdigest()
        check(regenerated==receipt['output_sha256'],f'Watermark regeneration mismatch: {path.name}')
        timestamp(receipt['generated_at'],path.name); timestamp(receipt['processed_at'],path.name)
    user=read_json(ROOT/'data/users/sample.json')
    check(user.get('id')=='sample' and user.get('display_name')=='Образец' and user.get('is_sample') is True,'Sample system author invalid')
    timestamp(user.get('created_at'),'sample author')
    users=list((ROOT/'data/users').glob('*.json')); check(len(users)==1,'Only one system sample author is permitted')

def check_data(require):
    source=ROOT/'data/source/springs.geojson'
    photo_paths=list((ROOT/'data/photos').glob('*.json')); observation_paths=list((ROOT/'data/observations').glob('*.json'))
    if not source.exists():
        check(not photo_paths and not observation_paths,'Data bound without source GeoJSON')
        if require: check(False,'Source GeoJSON required but absent')
        print('WAITING: data/source/springs.geojson; 12 photo records and 20 observations intentionally deferred.')
        return
    select=runpy.run_path(str(SRC/'scripts/sample-data.py'))['select_springs']
    chosen={id for _,id in select(source)}
    check(len(photo_paths)==12 and len(observation_paths)==20,'Expected twelve photo and twenty observation JSON files')
    photos={}; receipts=read_json(SRC/'processing/sample-watermarks.json')
    for path in photo_paths:
        record=read_json(path); photos[record['id']]=record
        check(record['created_at']==receipts[record['id']]['generated_at'],'Photo creation time differs from generation')
        check((PUBLIC/record['file'].lstrip('/')).exists(),'Photo path missing')
        check(record.get('season') in ['winter','summer','autumn'],'Invalid photo season')
    valid={'flow':{'flowing','weak','frozen','dry'},'access':{'cleared','icy','blocked'},'cleanliness':{'clean','litter'},'visit':{'visited'}}
    for path in photo_paths+observation_paths:
        record=read_json(path)
        check(path.stem==record['id'] and path.stem.startswith('sample-'),'Sample record ID or filename')
        check(record.get('is_sample') is True and record.get('user_id')=='sample','Sample record flags or author')
        check(record.get('spring_id') in chosen,'Non-deterministic source binding')
        timestamp(record.get('created_at'),path.name)
        if path in observation_paths:
            check(record.get('affects_map') is False,'Sample observation affects map')
            check(record.get('value') in valid.get(record.get('kind'),set()),'Invalid observation kind/value')
            for id in record['photo_ids']:
                check(id in photos,'Unknown attached photo')
                if id in photos: check(photos[id]['spring_id']==record['spring_id'],'Cross-spring photo attachment')
    check({r['spring_id'] for r in photos.values()}==chosen,'Photos must cover all eight chosen districts')

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--require-data',action='store_true'); args=parser.parse_args()
    try:
        count=check_inventory(); check_public(); check_logo(); check_samples(); check_data(args.require_data)
    except Exception as exc:
        ERRORS.append(f'{type(exc).__name__}: {exc}')
    if ERRORS:
        print('\n'.join('ERROR: '+message for message in ERRORS)); sys.exit(1)
    print(f'PASS: {count} inventory files; public assets, dimensions, metadata, tiles and twelve reproducible watermarks verified.')

if __name__=='__main__': main()
