"""Rebuild all code-authored assets. Never reads or writes source spring data."""
import io, math, urllib.request
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import resvg_py
from common import ROOT, SRC, PUBLIC, COLORS as C, write, write_json, save_webp
from brandmark import mark_body

def svg(folder, name, body, size=48, attrs=''):
    text=(f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
          f'viewBox="0 0 {size} {size}" {attrs}>{body}</svg>\n')
    write(PUBLIC/folder/(name+'.svg'),text)
    return text

def png_svg(text, path, width):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(resvg_py.svg_to_bytes(svg_string=text,width=width,height=width))

def font_files():
    folder=SRC/'fonts'; folder.mkdir(parents=True,exist_ok=True)
    base='https://raw.githubusercontent.com/google/fonts/main/ofl/golostext/'
    for name,url in [('golos-text-variable.ttf','GolosText%5Bwght%5D.ttf'),('ofl.txt','OFL.txt')]:
        path=folder/name
        if not path.exists():
            urllib.request.urlretrieve(base+url,path)
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
    path=folder/'golos-text-bold.ttf'
    if not path.exists():
        font=instantiateVariableFont(TTFont(folder/'golos-text-variable.ttf'),{'wght':700},inplace=False)
        font.save(path)
    return path

def logo_body(color=None):
    return mark_body(0,color)

def brand():
    logos={}
    for name,color in [('logo',None),('logo-mono',C['ink']),('logo-inverse',C['snow'])]:
        logos[name]=svg('brand',name,logo_body(color))
    for name,size in [('favicon-32',32),('apple-touch-icon-180',180),('icon-192',192),('icon-512',512),('icon-maskable-512',512)]:
        # Maskable foreground is entirely within the center 60%: 20% safe inset.
        transform='translate(12 12) scale(.5)' if name=='icon-maskable-512' else 'translate(4 4) scale(.8333333)'
        text=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'
              f'<rect width="48" height="48" fill="{C["snow"]}"/><g transform="{transform}">{logo_body()}</g></svg>')
        png_svg(text,PUBLIC/'brand'/f'{name}.png',size)
    Image.open(PUBLIC/'brand/icon-512.png').save(PUBLIC/'brand/favicon.ico',sizes=[(16,16),(32,32)])
    write_json(PUBLIC/'brand/site.webmanifest',dict(name='Московский родник',short_name='Родник',
        theme_color=C['ink'],background_color=C['snow'],display='standalone',lang='ru',icons=[
        dict(src='/brand/icon-192.png',sizes='192x192',type='image/png',purpose='any'),
        dict(src='/brand/icon-512.png',sizes='512x512',type='image/png',purpose='any'),
        dict(src='/brand/icon-maskable-512.png',sizes='512x512',type='image/png',purpose='maskable')]))

def crystal_path(radius, forks=2):
    d=f'M32 {32-radius}V32'
    for i in range(forks):
        y=32-radius+(i+1)*radius/(forks+1); reach=radius*.22
        d+=f'M{32-reach:.2f} {y-reach:.2f}L32 {y:.2f}l{reach:.2f} {-reach:.2f}'
    return d

def markers():
    ink=C['ink']; snow=C['snow']
    bodies={
      'status-ok':f'<circle cx="24" cy="24" r="15" fill="{C["ice"]}" stroke="{ink}" stroke-width="2"/>',
      'status-exceed':f'<path d="M21 7Q24 4 27 7L41 21Q44 24 41 27L27 41Q24 44 21 41L7 27Q4 24 7 21Z" fill="{C["ochre"]}" stroke="{ink}" stroke-width="2"/>',
      'status-not-sampled':f'<circle cx="24" cy="24" r="15" fill="none" stroke="{C["slate"]}" stroke-width="2.5" stroke-dasharray="4 3"/>',
      'selected-halo':f'<g fill="none" stroke="{ink}"><circle cx="24" cy="24" r="21" stroke-width="2"/><circle cx="24" cy="24" r="18.5" stroke-width="1"/></g>',
      'me':f'<circle cx="24" cy="24" r="9" fill="{ink}" stroke="#FFFFFF" stroke-width="3"/>'}
    for level,count in [(1,6),(2,12),(3,18)]:
        branches=[]
        for i in range(count):
            angle=360*i/count
            branches.append(f'<path transform="rotate({angle} 24 24)" d="M24 3v8m-3-6 3 3 3-3"/>')
        bodies[f'frost-{level}']=(f'<g fill="none" stroke="{C["frost"]}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'
            f'<circle cx="24" cy="24" r="19.5" stroke-opacity="{.2+level*.2}"/>'+''.join(branches)+'</g>')
    for name,body in bodies.items():
        text=svg('markers',name,body)
        png_svg(text,PUBLIC/'markers/png@2x'/f'{name}.png',96)
    state={
      'flowing':'<path d="M4 7q2-2 4 0t4 0t4 0M4 12q2-2 4 0t4 0t4 0"/>',
      'weak':'<path d="M4 10q2-2 4 0t4 0t4 0"/>',
      'frozen':'<path d="M10 4v12M4.8 7l10.4 6M4.8 13l10.4-6M8 5l2 2 2-2M8 15l2-2 2 2"/>',
      'dry':'<path d="m11 4-3 5 4 2-3 5M8 9H5m7 2h3"/>',
      'unknown':f'<circle cx="10" cy="10" r="1.3" fill="{ink}" stroke="none"/>'}
    for name,body in state.items():
        text=svg('markers','state-'+name,
            f'<circle cx="10" cy="10" r="9" fill="{snow}" stroke="{ink}" stroke-width="1"/>'
            f'<g fill="none" stroke="{ink}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">{body}</g>',20)
        png_svg(text,PUBLIC/'markers/png@2x'/f'state-{name}.png',40)

def pictograms():
    shapes={
      'chemistry-only':'<path d="M12 4h8m-6 0v9L7 25q-1 3 2 3h14q3 0 2-3l-7-12V4M10 20h12"/><path d="M14 23h.01M19 25h.01"/>',
      'no-microbiology':'<path d="M9 9a8 8 0 0 1 14 8M22 22a8 8 0 0 1-13-8M16 4V2M27 12l3-1M5 20l-3 1M16 28v2M5 5l22 22"/><path d="M14 11h.01M19 15h.01M13 21h.01"/>',
      'boil-water':'<path d="M7 17h16v7a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4ZM23 18h3a3 3 0 0 1 0 6h-3M5 17h20M10 12c-3-3 3-4 0-7M16 12c-3-3 3-4 0-7M22 12c-3-3 3-4 0-7"/>',
      'last-sample':'<rect x="5" y="6" width="22" height="23" rx="2"/><path d="M10 3v6M22 3v6M5 13h22M10 18h3M19 18h3M10 23h3"/>',
      'never-sampled':'<path d="M12 4h8m-6 0v9L7 25q-1 3 2 3h14q3 0 2-3l-7-12V4M5 5l22 22"/>'}
    for name,body in shapes.items():
        svg('pictograms',name,f'<g fill="none" stroke="{C["ink"]}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">{body}</g>',32)

def effects():
    for i in range(1,6):
        paths=''.join(f'<path transform="rotate({a} 32 32)" d="{crystal_path(22+i%3,i)}"/>' for a in range(0,360,60))
        # Draw ice underlay and white core to remain visible on pale maps.
        body=f'<g fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="{C["ice"]}" stroke-width="2.4" stroke-opacity=".5">{paths}</g><g stroke="#FFFFFF" stroke-width="1.6">{paths}</g></g>'
        svg('effects',f'snowflake-{i}',body,64)
    paths=''.join(f'<path id="branch-{i+1}" transform="rotate({i*60} 32 32)" d="{crystal_path(28,3)}"/>' for i in range(6))
    svg('effects','ice-crystal',f'<g fill="none" stroke="{C["ice"]}" stroke-width="1.5" stroke-linecap="round">{paths}</g>',64)
    n=512; rng=np.random.default_rng(2454)
    # Toroidal drawing: every branch is repeated in neighboring tiles.
    canvas=Image.new('RGBA',(n*3,n*3)); draw=ImageDraw.Draw(canvas)
    for _ in range(100):
        x,y=rng.uniform(0,n,2); r=rng.uniform(7,31); phase=rng.uniform(0,math.pi)
        alpha=int(rng.integers(25,95))
        for ox in (0,n,2*n):
            for oy in (0,n,2*n):
                for k in range(6):
                    a=phase+k*math.pi/3; v=np.array([math.cos(a),math.sin(a)])
                    origin=np.array([x+ox,y+oy]); end=origin+v*r
                    draw.line([tuple(origin),tuple(end)],fill=(227,238,243,alpha),width=1)
                    for t in (.45,.7):
                        p=origin+v*r*t
                        for da in (-.8,.8):
                            q=p+np.array([math.cos(a+da),math.sin(a+da)])*r*.23
                            draw.line([tuple(p),tuple(q)],fill=(227,238,243,alpha),width=1)
    arr=np.array(canvas.crop((n,n,2*n,2*n)))
    arr[-1,:,:]=arr[0,:,:]; arr[:,-1,:]=arr[:,0,:]
    # Lossless for exact RGBA edge equality and transparent fine lines.
    image=Image.fromarray(arr); image.save(PUBLIC/'effects/frost-tile-512.webp',lossless=True,method=6,exact=True)
    y,x=np.mgrid[0:1:complex(n),0:1:complex(n)]
    field=np.zeros((n,n))
    for _ in range(12):
        kx,ky=rng.integers(1,7,2); phase=rng.uniform(0,2*np.pi)
        field+=np.sin(2*np.pi*(kx*x+ky*y)+phase)/np.sqrt(kx*kx+ky*ky)
    lines=np.exp(-np.square(np.sin(field*2.8)/.14))
    a=np.uint8(35+lines*160); a[-1]=a[0]; a[:,-1]=a[:,0]
    Image.fromarray(a).save(PUBLIC/'effects/caustics-tile-512.webp',lossless=True,method=6)
    for name in ['frost','caustics']:
        tile=Image.open(PUBLIC/f'effects/{name}-tile-512.webp').convert('RGBA')
        preview=Image.new('RGBA',(1024,1024),C['dusk'] if name=='frost' else C['snow'])
        for tx in (0,512):
            for ty in (0,512): preview.alpha_composite(tile,(tx,ty))
        path=SRC/f'qa/{name}-tile-2x2.png'; path.parent.mkdir(parents=True,exist_ok=True); preview.convert('RGB').save(path)

def topo():
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    rng=np.random.default_rng(2454); axis=np.linspace(0,2*np.pi,257); x,y=np.meshgrid(axis,axis); z=np.zeros_like(x)
    for _ in range(18):
        kx,ky=rng.integers(1,5,2)
        z+=np.sin(kx*x+ky*y+rng.uniform(0,2*np.pi))/(kx*kx+ky*ky)
    contour=plt.contour(np.linspace(0,512,257),np.linspace(0,512,257),z,levels=14)
    paths=[]
    for segments in contour.allsegs:
        for points in segments:
            if len(points)<2: continue
            d='M'+'L'.join(f'{p[0]:.2f},{p[1]:.2f}' for p in points)
            paths.append(f'<path d="{d}"/>')
    plt.close()
    svg('patterns','topo-contours',f'<g fill="none" stroke="{C["ink"]}" stroke-width="1" opacity=".07">'+''.join(paths)+'</g>',512)
    text=(PUBLIC/'patterns/topo-contours.svg').read_text()
    png_svg(text,SRC/'qa/topo-tile.png',512)
    tile=Image.open(SRC/'qa/topo-tile.png'); canvas=Image.new('RGBA',(1024,1024),C['snow'])
    for x in (0,512):
        for y in (0,512): canvas.alpha_composite(tile,(x,y))
    canvas.convert('RGB').save(SRC/'qa/topo-tile-2x2.png')

def main():
    for folder in ['brand','markers/png@2x','effects','pictograms','patterns','illustrations/card','illustrations/hero','illustrations/empty','avatars','samples/photos']:
        (PUBLIC/folder).mkdir(parents=True,exist_ok=True)
    for folder in ['data/source','data/users','data/photos','data/observations','preview']:
        (ROOT/folder).mkdir(parents=True,exist_ok=True)
    write_json(ROOT/'design/tokens.json',C)
    write(ROOT/'design/tokens.css',':root {\n'+''.join(f'  --{k}: {v};\n' for k,v in C.items())+'}\n')
    font_files(); brand(); markers(); pictograms(); effects(); topo()
    print('Code-authored assets and Golos Text OFL font ready.')

if __name__=='__main__': main()
