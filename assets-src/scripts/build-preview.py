"""A static, script-free contact sheet. This is an asset preview, not an app."""
import html
from common import ROOT, PUBLIC, COLORS, read_json, write

def asset_image(path,cls=''):
    rel=path.relative_to(ROOT).as_posix()
    return f'<img class="{cls}" loading="lazy" src="../{html.escape(rel)}" alt="{html.escape(path.stem)}">'

def tile(path,caption=None,cls=''):
    return f'<figure class="tile {cls}"><div class="art">{asset_image(path)}</div><figcaption>{html.escape(caption or path.name)}<small>{html.escape(path.relative_to(PUBLIC).as_posix())}</small></figcaption></figure>'

def group(title,items,cls=''):
    return f'<h3>{title}</h3><div class="grid {cls}">'+''.join(items)+'</div>'

def theme_body(theme,avatars,photos):
    pieces=[]
    brand=PUBLIC/'brand'
    pieces.append('<p><a href="logo.html">Новый логотип: версии, спрайт-шиты и демонстрация анимации</a></p>')
    pieces.append(group('01 / Знак и носители',[tile(p) for p in sorted(brand.iterdir()) if p.suffix in ['.svg','.png','.ico']],'brand-grid'))
    marker=PUBLIC/'markers'
    pieces.append(group('02 / Статусы, давность данных и состояние',[tile(p) for p in sorted(marker.glob('*.svg'))],'small-grid'))
    combinations=[]
    statuses=['ok','exceed','not-sampled']; states=['flowing','weak','frozen','dry','unknown']
    for level in range(1,4):
        for i,status in enumerate(statuses):
            state=states[(level*3+i)%5]
            base='../web/public/markers/'
            combinations.append(f'<figure class="tile"><div class="art"><div class="marker-stack"><img alt="{status}" src="{base}status-{status}.svg"><img alt="иней {level}" src="{base}frost-{level}.svg"><img class="badge" alt="{state}" src="{base}state-{state}.svg"></div></div><figcaption>{status} / frost-{level} / {state}</figcaption></figure>')
    pieces.append(group('Наложения / иней поверх статуса, состояние в углу',combinations,'small-grid'))
    pieces.append(group('PNG @2x / для map.addImage',[tile(p) for p in sorted((marker/'png@2x').glob('*.png'))],'small-grid'))
    pieces.append(group('03 / Снег, иней и блики',[tile(p) for p in sorted((PUBLIC/'effects').iterdir())],'effects-grid'))
    for name in ['frost','caustics','topo']:
        path=ROOT/f'assets-src/qa/{name}-tile-2x2.png'
        if path.exists():
            pieces.append(f'<figure class="seam"><img loading="lazy" src="../assets-src/qa/{name}-tile-2x2.png" alt="{name}: четыре тайла"><figcaption>{name} / проверка стыков 2 × 2</figcaption></figure>')
    pieces.append(group('04 / О воде',[tile(p) for p in sorted((PUBLIC/'pictograms').glob('*.svg'))],'small-grid'))
    pieces.append(group('05 / Топографические горизонтали',[tile(PUBLIC/'patterns/topo-contours.svg')]))
    pieces.append(group('06 / Шапки карточек',[tile(p) for p in sorted((PUBLIC/'illustrations/card').glob('*.webp'))],'wide-grid'))
    pieces.append(group('07 / Зимний овраг',[tile(p) for p in sorted((PUBLIC/'illustrations/hero').glob('*.webp'))],'hero-grid'))
    pieces.append(group('08 / Пустые состояния',[tile(p) for p in sorted((PUBLIC/'illustrations/empty').glob('*.webp'))]))
    pieces.append(group('09 / Гостевые аватары',[tile(PUBLIC/a['file'].lstrip('/'),a['name']) for a in avatars if (PUBLIC/a['file'].lstrip('/')).exists()],'avatar-grid'))
    pieces.append(group('10 / Синтетические фотообразцы',[tile(p,photos.get(p.stem,p.stem)) for p in sorted((PUBLIC/'samples/photos').glob('*.webp'))],'photo-grid'))
    return '<section class="theme '+theme+'" id="'+theme+'"><header class="theme-title"><span>'+('Светлый фон / snow' if theme=='light' else 'Тёмный фон / dusk')+'</span><span>Все материалы</span></header>'+''.join(pieces)+'</section>'

def main():
    avatars=read_json(PUBLIC/'avatars/avatars.json')
    from prompts import PHOTOS
    photos={'sample-'+id:'Образец: '+caption for id,_,caption,_ in PHOTOS}
    palette=''.join(f'<div class="swatch"><span style="background:{color}"></span><b>{name}</b><code>{color}</code></div>' for name,color in COLORS.items())
    missing=not (ROOT/'data/source/springs.geojson').exists()
    status=('Ожидается data/source/springs.geojson. Привязка фото и 20 отметок к восьми округам пока не создана.' if missing else 'Источник родников найден. Статус записей проверяется командой check_assets.py.')
    content='''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Московский родник — визуальные материалы</title>
<style>
@font-face{font-family:Golos;src:url('../assets-src/fonts/golos-text-variable.ttf') format('truetype');font-weight:100 900;font-display:swap}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#F3F1EC;color:#1F2A3A;font-family:Golos,Arial,sans-serif;line-height:1.55}
a{color:inherit;text-underline-offset:4px}.masthead{max-width:1440px;margin:auto;padding:56px 48px 38px}.eyebrow{font-size:11px;letter-spacing:.16em;text-transform:uppercase;display:flex;justify-content:space-between;gap:20px;border-top:1px solid #8A94A3;padding-top:16px}
.title-row{display:flex;align-items:center;gap:24px;margin:38px 0 20px}.title-row img{width:84px}h1{font-size:clamp(38px,5vw,72px);letter-spacing:-.055em;line-height:1.05;font-weight:650;margin:0}.intro{max-width:760px;font-size:18px;color:#526071}.note{font-size:13px;padding:16px 20px;background:#E3EEF3;border-left:3px solid #9FC3D6;margin:26px 0}.status{border-left-color:#C8964A;background:#eee6d8}
nav{display:flex;gap:28px;font-size:13px;margin-top:26px}.palette{display:grid;grid-template-columns:repeat(7,1fr);gap:14px;margin:36px 0 0}.swatch span{display:block;height:54px;border:1px solid #1f2a3a22;border-radius:4px}.swatch b,.swatch code{display:block;font-size:12px;margin-top:5px}.swatch code{color:#687385;font-size:10px}
.theme{padding:42px max(28px,calc((100vw - 1344px)/2)) 64px}.light{background:#F3F1EC;color:#1F2A3A}.dark{background:#2C3A52;color:#F3F1EC}.theme-title{display:flex;justify-content:space-between;border-top:1px solid currentColor;padding-top:16px;font-size:12px;letter-spacing:.05em}.theme-title span:last-child{opacity:.5}h3{font-size:18px;font-weight:550;margin:42px 0 20px;letter-spacing:-.02em}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.tile{margin:0;min-width:0;border:1px solid #8A94A344;border-radius:6px;overflow:hidden}.art{height:220px;display:flex;align-items:center;justify-content:center;padding:16px}.art img{display:block;max-width:100%;max-height:100%;object-fit:contain}.tile figcaption{padding:12px 14px;font-size:12px;border-top:1px solid #8A94A333;overflow-wrap:anywhere}.tile small{display:block;opacity:.48;font-size:9px;margin-top:4px;font-family:monospace}.small-grid{grid-template-columns:repeat(6,minmax(0,1fr))}.small-grid .art{height:102px}.small-grid .art>img{width:48px;height:48px;image-rendering:auto}.small-grid figcaption{font-size:10px}.brand-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.brand-grid .art{height:150px}.brand-grid .art img{max-width:180px}.effects-grid .art>img{width:84px;height:84px}.effects-grid .tile:has(img[src$=".webp"]) .art img{width:100%;height:100%;object-fit:cover}.marker-stack{position:relative;width:48px;height:48px}.marker-stack>img{position:absolute;inset:0;width:48px;height:48px}.marker-stack>img.badge{inset:auto -6px -5px auto;width:20px;height:20px;max-width:none;max-height:none}.seam{display:inline-block;width:calc(33.333% - 14px);margin:20px 14px 0 0;vertical-align:top}.seam img{display:block;width:100%;border:1px solid #8A94A344}.seam figcaption{font-size:11px;margin-top:8px;opacity:.65}
.wide-grid,.hero-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.wide-grid .art,.hero-grid .art,.photo-grid .art{height:auto;padding:0}.wide-grid .art img,.hero-grid .art img,.photo-grid .art img{width:100%;max-height:none}.hero-grid .art{height:380px}.hero-grid .art img{height:100%;object-fit:contain}.avatar-grid{grid-template-columns:repeat(8,minmax(0,1fr))}.avatar-grid .art{height:auto;aspect-ratio:1;padding:12px}.avatar-grid img{border-radius:50%;width:100%}.avatar-grid figcaption{font-size:10px;padding:9px}.avatar-grid small{display:none}.photo-grid .tile{align-self:start}footer{padding:28px 48px;font-size:12px;color:#687385}
@media(max-width:900px){.masthead{padding:32px 24px}.theme{padding:28px 24px}.small-grid,.avatar-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.brand-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.grid{gap:12px}.art{height:170px}.photo-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.title-row img{width:60px}}
@media(max-width:560px){.eyebrow{font-size:9px}.title-row{gap:12px}h1{font-size:38px}.intro{font-size:15px}.palette{grid-template-columns:repeat(4,1fr)}.grid,.brand-grid,.wide-grid,.hero-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.small-grid,.avatar-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.small-grid .art{height:85px}.hero-grid .art{height:220px}.seam{width:100%;margin-right:0}.tile small{font-size:8px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style></head><body>
<header class="masthead"><div class="eyebrow"><span>Независимый городской проект</span><span>Библиотека материалов / зима</span></div>
<div class="title-row"><img src="../web/public/brand/logo.svg" alt="Знак: источник и круги на воде"><h1>Московский<br>родник</h1></div>
<p class="intro">Визуальные ассеты и образцовый контент. Зимние овраги, тихие ручьи и понятные знаки для карты.</p>
<p class="note">Цвет статуса всегда дополнен формой. Круг — превышений по химическим показателям не выявлено; ромб — выявлены превышения; пунктирный круг — пробы не отбирались. Эти обозначения не подтверждают безопасность воды и не описывают микробиологию.</p>
<p class="note status">__STATUS__</p><nav><a href="#light">Светлый фон</a><a href="#dark">Тёмный фон</a><a href="../ASSETS.md">Манифест и команды</a></nav>
<div class="palette">__PALETTE__</div></header>
__BODY__
<footer>Все фотообразцы синтетические и отмечены «ОБРАЗЕЦ». Они не подтверждают состояние реальных родников. Исходники, промпты и скрипты обработки находятся в assets-src/.</footer>
</body></html>'''
    write(ROOT/'preview/index.html',content.replace('__STATUS__',status).replace('__PALETTE__',palette).replace('__BODY__',theme_body('light',avatars,photos)+theme_body('dark',avatars,photos)))
    print('Static light/dark contact sheet rebuilt.')

if __name__=='__main__': main()
