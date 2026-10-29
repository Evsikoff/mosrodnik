"""Build the vector lockups, alpha sprite atlases, animation metadata and demo."""
import io, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import resvg_py
from common import ROOT, SRC, PUBLIC, COLORS as C, write, write_json
from brandmark import mark_body

BRAND=PUBLIC/'brand'
COUNT=24; COLS=6; ROWS=4; FPS=12

def document(body,width,height):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">{body}</svg>\n'

def wordmark(color):
    font=TTFont(SRC/'fonts/golos-text-bold.ttf'); glyphs=font.getGlyphSet(); cmap=font.getBestCmap(); units=font['head'].unitsPerEm
    top='МОСКОВСКИЙ'; bottom='РОДНИК'; x=112
    def width(text,size): return sum(font['hmtx'][cmap[ord(c)]][0] for c in text)*size/units
    top_width=width(top,27)
    bottom_size=42; tracking=(top_width-width(bottom,bottom_size))/(len(bottom)-1)
    def line(text,size,y,tracking=0):
        paths=[]; cursor=x; scale=size/units
        for char in text:
            name=cmap[ord(char)]; pen=SVGPathPen(glyphs)
            glyphs[name].draw(TransformPen(pen,(scale,0,0,-scale,cursor,y)))
            paths.append('<path d="'+pen.getCommands()+'"/>')
            cursor+=font['hmtx'][name][0]*scale+tracking
        return ''.join(paths)
    body=f'<g id="wordmark" fill="{color}">'+line(top,27,45)+line(bottom,bottom_size,90,tracking)+'</g>'
    font.close(); return body

def lockup(phase=0,color=None):
    return document('<g transform="translate(8 14) scale(1.75)">'+mark_body(phase,color)+'</g>'+wordmark(color or C['ink']),384,112)

def render(text,size):
    return Image.open(io.BytesIO(resvg_py.svg_to_bytes(svg_string=text,width=size[0],height=size[1]))).convert('RGBA')

def atlases():
    variants={'color':None,'mono':C['ink'],'inverse':C['snow']}
    sheets={}; frames=[dict(index=i,x=(i%COLS),y=(i//COLS),duration_ms=1000/FPS) for i in range(COUNT)]
    for kind,frame_size,display_size in [('mark',(256,256),(128,128)),('lockup',(768,224),(384,112))]:
        for variant,color in variants.items():
            canvas=Image.new('RGBA',(COLS*frame_size[0],ROWS*frame_size[1]))
            for index in range(COUNT):
                phase=index/COUNT
                svg=document(mark_body(phase,color),48,48) if kind=='mark' else lockup(phase,color)
                frame=render(svg,frame_size)
                canvas.paste(frame,((index%COLS)*frame_size[0],(index//COLS)*frame_size[1]))
            name=f'logo-{kind}-sprite-{variant}'
            canvas.save(BRAND/(name+'.png'),optimize=True)
            canvas.save(BRAND/(name+'.webp'),lossless=True,method=6,exact=True)
            sheets[kind+'-'+variant]=dict(png=f'/brand/{name}.png',webp=f'/brand/{name}.webp',
                width=canvas.width,height=canvas.height,frame_width=frame_size[0],frame_height=frame_size[1],
                display_width=display_size[0],display_height=display_size[1],pixel_ratio=2,
                frames=[dict(index=i,x=(i%COLS)*frame_size[0],y=(i//COLS)*frame_size[1],
                    width=frame_size[0],height=frame_size[1],duration_ms=1000/FPS) for i in range(COUNT)])
    write_json(BRAND/'logo-sprite.json',dict(name='Московский родник',version=1,columns=COLS,rows=ROWS,
        frame_count=COUNT,fps=FPS,duration_ms=2000,loop=True,order='row-major',alpha=True,trimmed=False,
        static_frame=0,animation='subtle-water-ripples',sheets=sheets))

def review():
    canvas=Image.new('RGB',(1440,1100),C['snow']); d=ImageDraw.Draw(canvas)
    font=ImageFont.truetype(str(SRC/'fonts/golos-text-bold.ttf'),20)
    d.rectangle((720,0,1440,740),fill=C['dusk'])
    for x,color in [(0,None),(720,C['snow'])]:
        textcolor=C['ink'] if x==0 else C['snow']
        d.text((x+56,48),'МОСКОВСКИЙ РОДНИК / ЛОГОТИП',font=font,fill=textcolor)
        mark=render(document(mark_body(0,color),48,48),(224,224))
        canvas.paste(mark,(x+248,130),mark)
        logo=render(lockup(0,color),(600,175)); canvas.paste(logo,(x+60,424),logo)
        d.text((x+56,650),'Golos Text Bold / знак и надпись',font=font,fill=textcolor)
    d.text((56,790),'ЗНАК В МАЛОМ РАЗМЕРЕ',font=font,fill=C['ink'])
    for i,size in enumerate([16,24,32,48,64]):
        im=render(document(mark_body(),48,48),(size,size)); x=56+i*125
        canvas.paste(im,(x,852),im); d.text((x,938),f'{size} px',font=font,fill=C['ink'])
    d.text((800,790),'ДВИЖЕНИЕ КРУГОВ / 24 КАДРА',font=font,fill=C['ink'])
    for i,index in enumerate([0,6,12,18]):
        im=render(document(mark_body(index/COUNT),48,48),(96,96)); x=800+i*140
        canvas.paste(im,(x,852),im)
    canvas.save(BRAND/'logo-presentation.png',optimize=True)
    write(SRC/'qa/logo-review.svg',document(mark_body(),48,48))

def animation_css():
    frames=[]
    for i in range(COUNT):
        x=(i%COLS)/(COLS-1)*100; y=(i//COLS)/(ROWS-1)*100
        frames.append(f'  {i/COUNT*100:.6f}% {{ background-position: {x:.6f}% {y:.6f}%; }}')
    frames.append('  100% { background-position: 0% 0%; }')
    css='''/* Original logo sprite: 24 frames, 6 columns, 4 rows, 2 seconds. */
.mr-logo {
  display: inline-block;
  width: var(--logo-width, 128px);
  max-width: 100%;
  aspect-ratio: 1;
  vertical-align: middle;
  background-image: url('./logo-mark-sprite-color.png');
  background-repeat: no-repeat;
  background-size: 600% 400%;
  background-position: 0% 0%;
}
.mr-logo--mono { background-image: url('./logo-mark-sprite-mono.png'); }
.mr-logo--inverse { background-image: url('./logo-mark-sprite-inverse.png'); }
.mr-logo--lockup { --logo-width: 384px; aspect-ratio: 24 / 7; background-image: url('./logo-lockup-sprite-color.png'); }
.mr-logo--lockup.mr-logo--mono { background-image: url('./logo-lockup-sprite-mono.png'); }
.mr-logo--lockup.mr-logo--inverse { background-image: url('./logo-lockup-sprite-inverse.png'); }
.mr-logo--animated { animation: mr-logo-ripples 2s steps(1, end) infinite; }
@keyframes mr-logo-ripples {
'''+ '\n'.join(frames)+'''
}
@media (prefers-reduced-motion: reduce) {
  .mr-logo--animated { animation: none; background-position: 0% 0%; }
}
'''
    write(BRAND/'logo-animation.css',css)

def preview_page():
    write(ROOT/'preview/logo.html','''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Московский родник — логотип и анимация</title>
<link rel="stylesheet" href="../web/public/brand/logo-animation.css">
<style>
@font-face{font-family:Golos;src:url('../assets-src/fonts/golos-text-variable.ttf');font-weight:100 900;font-display:swap}
*{box-sizing:border-box}body{margin:0;background:#F3F1EC;color:#1F2A3A;font-family:Golos,Arial,sans-serif}a{color:inherit;text-underline-offset:5px}header,main,footer{max-width:1280px;margin:auto;padding:40px 48px}header{padding-bottom:24px}.topline{display:flex;justify-content:space-between;border-top:1px solid #8A94A3;padding-top:15px;font-size:11px;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(32px,5vw,64px);letter-spacing:-.05em;font-weight:650;line-height:1.08;max-width:850px;margin:38px 0 20px}header p{max-width:760px;line-height:1.65;color:#657082;font-size:16px}nav{display:flex;gap:26px;font-size:13px;flex-wrap:wrap}.pair{display:grid;grid-template-columns:1fr 1fr;border:1px solid #8A94A333;border-radius:8px;overflow:hidden}.panel{padding:36px;min-width:0;min-height:330px;display:flex;flex-direction:column;justify-content:space-between}.panel.dark{background:#2C3A52;color:#F3F1EC}.panel small,.label{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#8A94A3}.panel img{width:100%;display:block}.panel .mr-logo{--logo-width:100%}.section{margin:44px 0 20px;display:flex;align-items:center;justify-content:space-between;gap:18px}h2{font-size:22px;font-weight:550;letter-spacing:-.03em}.motion{border:1px solid #8A94A344;border-radius:8px;overflow:hidden}.motion .pair{border:0;border-radius:0}.motion .panel{min-height:260px}.motion:has(#motion:not(:checked)) .mr-logo{animation:none}.controls{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 24px;border-bottom:1px solid #8A94A344;font-size:13px}.controls label{cursor:pointer;display:flex;gap:10px;align-items:center}.controls input{accent-color:#1F2A3A;width:16px;height:16px}.controls span{font-size:11px;color:#657082}.info{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin:32px 0}.info h3{font-size:14px;font-weight:600}.info p{font-size:13px;line-height:1.7;color:#657082}.sizes{display:flex;align-items:end;gap:38px;padding:32px 0}.sizes figure{margin:0}.sizes figcaption{font-size:11px;color:#657082;margin-top:12px}.sizes img{display:block}.atlas{display:grid;grid-template-columns:1fr 1fr;gap:24px}.atlas figure{margin:0;border:1px solid #8A94A344;border-radius:6px;padding:22px}.atlas img{width:100%;display:block}.atlas figcaption{font-size:11px;margin-top:18px;color:#657082}.download{padding:24px;background:#E3EEF3;border-radius:6px;display:flex;flex-wrap:wrap;gap:24px;font-size:13px}footer{font-size:12px;color:#657082;border-top:1px solid #8A94A344;line-height:1.7}
@media(max-width:720px){header,main,footer{padding:28px 22px}.pair,.info,.atlas{grid-template-columns:1fr}.panel{min-height:260px;padding:28px}.sizes{gap:24px}.topline{font-size:9px}.controls{align-items:start;flex-direction:column}h1{font-size:40px}}
</style></head><body>
<header><div class="topline"><span>Московский родник</span><span>Независимый городской проект</span></div>
<h1>Буква «М». Точка источника.<br>Круги на воде.</h1><p>Геометрический знак объединяет первую букву названия со склонами оврага. От точки источника расходятся два кольца. В основе — прежняя палитра ink, ice и snow, крупная типографика и спокойное движение.</p>
<nav><a href="../web/public/brand/readme.md">README по анимации</a><a href="#motion-section">Посмотреть движение</a><a href="index.html">Все ассеты проекта</a></nav></header>
<main><div class="pair"><div class="panel"><small>Основная версия / ink + ice</small><img src="../web/public/brand/logo-lockup.svg" alt="Московский родник — основной логотип"><small>Golos Text Bold / текст переведён в кривые</small></div><div class="panel dark"><small>Инверсная версия / snow</small><img src="../web/public/brand/logo-lockup-inverse.svg" alt="Московский родник — светлый логотип"><small>Для фона dusk и фотографии с тёмной подложкой</small></div></div>
<div class="info"><div><h3>Устойчивая геометрия</h3><p>Знак и надпись сохраняют положение. Движутся только кольца: без вращения, скачков и смены цвета.</p></div><div><h3>Одна палитра</h3><p>Ink #1F2A3A, ice #9FC3D6, snow #F3F1EC. Для тёмной подложки — dusk #2C3A52. Цвет не обозначает качество воды.</p></div><div><h3>Вектор и прозрачный спрайт</h3><p>SVG для статичного размещения. PNG и WebP без потерь — для кадровой анимации; отдельные атласы знака и полной композиции.</p></div></div>
<div class="section" id="motion-section"><h2>Тихое движение</h2><span class="label">24 кадра / 12 fps / 2 секунды</span></div>
<div class="motion"><div class="controls"><label><input type="checkbox" id="motion" checked>Анимация кругов</label><span>Учитывается настройка уменьшения движения</span></div><div class="pair"><div class="panel"><small>Цветной спрайт</small><span class="mr-logo mr-logo--lockup mr-logo--animated" role="img" aria-label="Московский родник, анимированный логотип"></span></div><div class="panel dark"><small>Инверсный спрайт</small><span class="mr-logo mr-logo--lockup mr-logo--inverse mr-logo--animated" role="img" aria-label="Московский родник, анимированный светлый логотип"></span></div></div></div>
<div class="section"><h2>Знак в интерфейсе</h2><span class="label">Без надписи</span></div>
<div class="sizes"><figure><img width="16" height="16" src="../web/public/brand/logo.svg" alt="Знак 16 пикселей"><figcaption>16 px</figcaption></figure><figure><img width="24" height="24" src="../web/public/brand/logo.svg" alt="Знак 24 пикселя"><figcaption>24 px</figcaption></figure><figure><img width="32" height="32" src="../web/public/brand/logo.svg" alt="Знак 32 пикселя"><figcaption>32 px</figcaption></figure><figure><img width="48" height="48" src="../web/public/brand/logo.svg" alt="Знак 48 пикселей"><figcaption>48 px</figcaption></figure><figure><img width="64" height="64" src="../web/public/brand/logo.svg" alt="Знак 64 пикселя"><figcaption>64 px</figcaption></figure></div>
<div class="section"><h2>Спрайт-шиты</h2><span class="label">Порядок: слева направо, затем вниз</span></div>
<div class="atlas"><figure><img src="../web/public/brand/logo-mark-sprite-color.png" alt="24 кадра знака"><figcaption>Знак: 1536 × 1024 px / ячейка 256 × 256 px</figcaption></figure><figure><img src="../web/public/brand/logo-lockup-sprite-color.png" alt="24 кадра логотипа с надписью"><figcaption>Полная композиция: 4608 × 896 px / ячейка 768 × 224 px</figcaption></figure></div>
<div class="section"><h2>Файлы для подключения</h2></div><div class="download"><a href="../web/public/brand/logo-lockup.svg">Логотип SVG</a><a href="../web/public/brand/logo-mark-sprite-color.png">Спрайт знака PNG</a><a href="../web/public/brand/logo-lockup-sprite-color.png">Спрайт логотипа PNG</a><a href="../web/public/brand/logo-animation.css">Готовый CSS</a><a href="../web/public/brand/logo-sprite.json">Координаты кадров JSON</a><a href="../web/public/brand/readme.md">README</a></div>
</main><footer>Логотип создан в SVG кодом. Шрифт Golos Text распространяется по SIL OFL; лицензия находится в assets-src/fonts/ofl.txt. В спрайтах и векторных версиях нет внешних зависимостей от шрифта.</footer>
</body></html>''')

def main():
    BRAND.mkdir(parents=True,exist_ok=True)
    for suffix,color in [('',None),('-mono',C['ink']),('-inverse',C['snow'])]:
        write(BRAND/f'logo-lockup{suffix}.svg',lockup(0,color))
    # Static transparent PNGs for documents and environments without SVG support.
    render(document(mark_body(),48,48),(512,512)).save(BRAND/'logo-mark-512.png')
    render(lockup(),(1536,448)).save(BRAND/'logo-lockup.png')
    atlases(); review(); animation_css(); preview_page()
    print('Logo: outlined SVG lockups, six transparent 24-frame sprite atlases in PNG/WebP, metadata and presentation.')

if __name__=='__main__': main()
