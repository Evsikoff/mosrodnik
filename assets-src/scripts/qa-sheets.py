"""Render portable review sheets without modifying the delivered images."""
import math
from PIL import Image, ImageDraw, ImageFont, ImageOps
from common import SRC, PUBLIC, COLORS

def sheet(paths,name,columns,cell):
    w,h=cell; label=48; rows=math.ceil(len(paths)/columns)
    canvas=Image.new('RGB',(columns*w,rows*(h+label)),COLORS['snow']); draw=ImageDraw.Draw(canvas)
    font=ImageFont.truetype(str(SRC/'fonts/golos-text-bold.ttf'),15)
    for i,path in enumerate(paths):
        x=(i%columns)*w; y=(i//columns)*(h+label)
        image=ImageOps.contain(Image.open(path).convert('RGBA'),(w-20,h-20),method=Image.Resampling.LANCZOS)
        canvas.paste(image,(x+(w-image.width)//2,y+(h-image.height)//2),image)
        draw.text((x+12,y+h+8),path.stem,font=font,fill=COLORS['ink'])
    target=SRC/f'qa/{name}.jpg'; target.parent.mkdir(parents=True,exist_ok=True); canvas.save(target,quality=90)

if __name__=='__main__':
    sheet(sorted((PUBLIC/'avatars').glob('avatar-*.webp')),'avatars-contact',4,(300,300))
    sheet(sorted((PUBLIC/'illustrations').rglob('*.webp')),'illustrations-contact',3,(480,300))
    sheet(sorted((PUBLIC/'samples/photos').glob('*.webp')),'samples-contact',3,(480,360))
