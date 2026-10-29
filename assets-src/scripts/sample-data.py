"""Create sample data only against eight districts actually present in source."""
import argparse, re, time
from common import ROOT, SRC, read_json, write_json, now
from prompts import PHOTOS

SOURCE=ROOT/'data/source/springs.geojson'

def select_springs(path):
    collection=read_json(path)
    if collection.get('type')!='FeatureCollection': raise ValueError('Expected FeatureCollection')
    groups={}; seen=set()
    for feature in collection['features']:
        props=feature.get('properties') or {}; id=props.get('spring_id')
        if not isinstance(id,str) or not id.strip(): raise ValueError('Every feature must have a spring_id')
        if id in seen: raise ValueError(f'Duplicate spring_id: {id}')
        seen.add(id)
        match=re.fullmatch(r'(.+?)-\d+',id)
        if not match: raise ValueError(f'Cannot infer district from spring_id: {id}; expected district-number')
        district=match.group(1)
        groups.setdefault(district,[]).append(id)
    if len(groups)<8: raise ValueError('At least eight distinct districts are required; no sample data written')
    # Lexicographic spring_id order, not numeric suffix order; stable and explicit.
    return [(district,sorted(groups[district])[0]) for district in sorted(groups)[:8]]

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--wait',action='store_true'); args=parser.parse_args()
    user_path=ROOT/'data/users/sample.json'
    if not user_path.exists():
        write_json(user_path,dict(id='sample',display_name='Образец',is_sample=True,created_at=now()))
    if args.wait:
        print('Waiting for data/source/springs.geojson; Ctrl+C cancels.',flush=True)
        while not SOURCE.exists(): time.sleep(5)
    if not SOURCE.exists():
        print('WAITING: data/source/springs.geojson is absent. Photo and observation records were not fabricated.')
        return
    chosen=select_springs(SOURCE)
    receipts_path=SRC/'processing/sample-watermarks.json'
    if not receipts_path.exists(): raise ValueError('Publish watermarked sample photos first')
    receipts=read_json(receipts_path)
    # Bind photo examples round-robin; observations always use their photo spring.
    photos=[]
    for i,(suffix,season,caption,_) in enumerate(PHOTOS):
        id='sample-'+suffix
        if id not in receipts: raise ValueError(f'Missing watermark receipt: {id}')
        photos.append(dict(id=id,spring_id=chosen[i%8][1],user_id='sample',
            file=f'/samples/photos/{id}.webp',season=season,caption='Образец: '+caption,
            is_sample=True,created_at=receipts[id]['generated_at']))
    recipes=[(0,'flow','flowing'),(1,'access','icy'),(2,'flow','frozen'),(3,'visit','visited'),
        (4,'flow','flowing'),(5,'cleanliness','litter'),(6,'access','blocked'),(7,'visit','visited'),
        (8,'flow','flowing'),(9,'visit','visited'),(10,'visit','visited'),(11,'visit','visited'),
        (0,'visit','visited'),(1,'visit','visited'),(2,'access','icy'),(3,'visit','visited'),
        (4,'visit','visited'),(5,'visit','visited'),(6,'visit','visited'),(7,'visit','visited')]
    timestamp=now(); observations=[]
    for i,(photo_index,kind,value) in enumerate(recipes,1):
        photo=photos[photo_index]; id=f'sample-obs-{i:02d}'; path=ROOT/f'data/observations/{id}.json'
        previous=read_json(path) if path.exists() else {}
        observations.append(dict(id=id,spring_id=photo['spring_id'],user_id='sample',kind=kind,value=value,
            comment='Демонстрационная отметка. Не описывает фактическое состояние этого родника.',
            photo_ids=[photo['id']],is_sample=True,affects_map=False,created_at=previous.get('created_at',timestamp)))
    for photo in photos: write_json(ROOT/f'data/photos/{photo["id"]}.json',photo)
    for observation in observations: write_json(ROOT/f'data/observations/{observation["id"]}.json',observation)
    write_json(SRC/'processing/sample-bindings.json',dict(selection='first-lexicographic-spring-id-per-district; first-eight-districts',
        districts=[dict(district=district,spring_id=id) for district,id in chosen],is_sample=True,created_at=timestamp))
    print('Created 12 photo records, 20 observations, one system author, eight source districts.')

if __name__=='__main__': main()
