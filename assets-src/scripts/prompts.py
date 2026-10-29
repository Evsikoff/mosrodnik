"""Source of the complete, reproducible image prompt manifest."""
from common import ROOT, SRC, write_json

BASE = ('flat editorial illustration, limited palette: snow white #F3F1EC, ink navy #1F2A3A, '
        'ice blue #9FC3D6, muted ochre #C8964A, slate grey #8A94A3; subtle paper grain, '
        'clean vector shapes, soft winter dusk light, Moscow outskirts nature, no text, '
        'no logos, no 3D render, no glossy effects, no sparkling water')
PHOTO = ('candid smartphone photo, overcast Moscow winter day, natural colors, slight noise, '
         'unremarkable composition, no people faces, no text, no signs with readable text, '
         'no recognizable landmarks')
NEGATIVE = ('No emoji, lettering, readable signage, logos, Moscow government emblems, Saint George, '
            'Kremlin, landmark skyscrapers, identifiable faces, shiny blue water, freshness sparkles, '
            'drinking glasses, water purity claims, collages, frames, captions or watermarks.')
AVATARS = [
 ('bullfinch','снегирь','Eurasian bullfinch, black cap, muted ochre-red breast'),
 ('great-tit','большая синица','great tit, black head, white cheeks, muted ochre-yellow breast with black stripe'),
 ('blue-tit','лазоревка','Eurasian blue tit, small ice-blue cap, white face, dark eye stripe, pale yellow breast'),
 ('nuthatch','поползень','Eurasian nuthatch, slate-blue back, long pointed bill, black eye stripe, buff underside'),
 ('woodpecker','большой пёстрый дятел','great spotted woodpecker, black-white plumage, small muted red undertail'),
 ('waxwing','свиристель','Bohemian waxwing, swept crest, black mask, warm gray body, restrained ochre accents'),
 ('magpie','сорока','Eurasian magpie, long dark tail, black-white plumage'),
 ('jackdaw','галка','Eurasian jackdaw, dark face, slate-gray nape, pale ice-gray eye'),
 ('mallard','кряква','male mallard duck, subdued dark head, pale neck ring, warm chest, broad bill'),
 ('goldeneye','гоголь','male common goldeneye duck, dark rounded head, white cheek patch, small ochre eye'),
 ('squirrel','белка','Eurasian red squirrel in winter coat, tufted ears, fluffy tail, slate and muted russet fur'),
 ('fox','лиса','red fox, pointed ears, ochre winter fur, pale muzzle, dark legs'),
 ('sparrow','воробей','house sparrow, gray crown, brown back, black throat bib, short stout bill'),
 ('goldfinch','щегол','European goldfinch, small muted red face mask, black-white head, ochre wing bar'),
 ('crossbill','клёст','red crossbill, clearly crossed bill tips, muted ochre-russet plumage'),
 ('hare','заяц-беляк','mountain hare in white winter coat, long black-tipped ears, slate shadow details')]
PHOTOS = [
 ('pipe-flowing','winter','Трубка в заснеженном склоне, вода течёт.', 'A short utilitarian metal pipe in a snow-covered ravine slope with a visible modest flowing stream of dull gray water.'),
 ('icy-path','winter','Обледенелая тропинка и ступени к роднику.', 'Slippery icy path and uneven concrete steps leading down to a small spring, packed dirty snow, visible dull ice.'),
 ('frozen-pipe','winter','Трубка и выход воды покрыты наледью.', 'A frozen spring pipe with its outlet sealed by opaque ice, heavy dull icicles around it, no flowing water.'),
 ('wooden-canopy','winter','Деревянный навес над зимним родником.', 'A modest weathered wooden canopy over a captured spring, snowy path and posts, ordinary forest park.'),
 ('steam-brook','winter','Лёгкий пар над ручьём в мороз.', 'Small dark unfrozen brook below a spring in snow, subtle vapor rising into cold humid winter air, no glossy reflections.'),
 ('litter','winter','Пакеты и бутылки на снегу у родника.', 'Litter problem near a small spring: a few crumpled plastic bags and unbranded bottles on dirty snow.'),
 ('broken-tray','winter','Повреждённый бетонный лоток каптажа.', 'A damaged concrete spring capture trough, cracked broken edges, fallen chunk obstructing approach, snow and rough stone.'),
 ('info-board','winter','Стенд у родника, надписи не читаются.', 'A modest information board next to a snowy spring path, board out of focus, all markings completely illegible abstract blur.'),
 ('filling-bottle','winter','Руки в перчатках набирают воду в бутыль.', 'Close candid crop of only two gloved hands holding an unbranded large plastic water bottle under a modest spring pipe, snow; no body or face, no drinking gesture, no purity advertising.'),
 ('summer-view','summer','Летний вид небольшого родника.', 'Season override: overcast Moscow SUMMER day, green foliage, bare damp earth, no snow or ice. Modest metal pipe spring and concrete trough in a leafy ravine.'),
 ('autumn-leaves','autumn','Осенние листья в лотке родника.', 'Season override: overcast Moscow AUTUMN day. Close-up of a small natural water spring: a metal outlet pipe embedded in an earthy forest ravine bank, dripping dull gray water into a shallow rough concrete drainage trough in the foreground. Many brown fallen autumn leaves visibly clog the trough around the pipe. Sparse yellow foliage, damp soil, no snow. The pipe, flowing water and leaf-clogged trough must be clearly visible and occupy most of the frame. Forest ravine setting only, no city sidewalk, road, parked cars, apartment courtyard or buildings.'),
 ('evening-lamp','winter','Вечерний родник под фонарём.', 'Time override: winter evening under an ordinary warm streetlamp, light snow falling, a small spring and path, no dramatic cinematic staging.')]

def main():
    items=[]
    def add(id, folder, size, desc, base=BASE, notes=''):
        items.append(dict(id=id, target_path=f'web/public/{folder}/{id}.webp', size=size,
                          prompt=base+'\n'+desc, negative=NEGATIVE, notes=notes))
    for id,desc in [
      ('spring-pipe-ravine','A modest spring pipe emerging from a snowy ravine slope, a narrow dull gray stream, opaque ice around the outlet. Quiet wide composition.'),
      ('spring-canopy','A modest captured spring under a weathered wooden canopy, small snowy footpath, bare trees, quiet wide composition.'),
      ('spring-brook','Small spring next to an unfrozen dark gray brook, faint steam in freezing air, snow banks and bare shrubs, quiet wide composition.'),
      ('spring-forest-park','A small captured spring in a snowy forest park, distant unremarkable Moscow panel apartment blocks, no landmark architecture, quiet wide composition.')]:
        add(id,'illustrations/card',[1200,600],desc+' Aspect ratio 2:1.')
    add('hero-winter-ravine','illustrations/hero',[2400,1200],
        'Wide 2:1 landscape hero artwork, target 2400x1200. A quiet snow-covered ravine at the outskirts of Moscow, a modest captured spring pipe emerging from the earth near lower center-right, small muted dark unfrozen stream with faint rising steam. Layered snow slopes and bare deciduous trees, distant ordinary low-detail panel apartment blocks, deep dusk navy atmosphere. Keep central portion usable for portrait crop. No people, no identifiable landmarks, no Moscow official emblems, no domes, no lettering, no watermark, no drinking vessels. Restrained editorial visual that makes no claim of water purity.')
    add('hero-winter-ravine-mobile','illustrations/hero',[1080,1350],
        'Portrait crop of hero-winter-ravine, preserving the spring outlet and ravine. No new content.',
        notes='Derived with Pillow crop from hero-winter-ravine, not a separate generation. Center at 0.66, 0.53.')
    for id,desc in [
      ('empty-filters','An empty snowy ravine slope, a few footprints disappear beyond the edge, sparse bare shrubs. No spring visible. Calm spacious square illustration.'),
      ('empty-reports','A quiet small spring, untouched snow surrounding it, no footprints, no visitors, muted dark water. Spacious square illustration.'),
      ('empty-offline','An ordinary isolated streetlamp covered with snow, gently falling snow, sparse bare branches, no buildings or symbols, quiet square illustration.')]:
        add(id,'illustrations/empty',[800,800],desc)
    for id,name,desc in AVATARS:
        add('avatar-'+id,'avatars',[512,512],
            f'Single recognizable head-and-upper-body portrait of {desc}. One centered circular medallion on solid frost #E3EEF3 background, muted editorial winter style, clean rounded silhouette, no accessories. Identical framing across an animal avatar collection. Square 512x512.',
            notes=f'Final export 256x256. Russian name: {name}. Species identity retained within a restrained palette.')
    for id,season,caption,desc in PHOTOS:
        add('sample-'+id,'samples/photos',[1600,1200],desc+' Landscape 4:3. Unstaged ordinary smartphone photograph.',PHOTO,
            'Synthetic sample, not evidence of any actual spring. Add mandatory watermark in code before public export. '+
            ('Season override takes precedence over the winter baseline. ' if season!='winter' else '')+caption)
    write_json(SRC/'prompts/images.json',items)
    write_json(ROOT/'web/public/avatars/avatars.json',[
        dict(id=id,file=f'/avatars/avatar-{id}.webp',name=name) for id,name,_ in AVATARS])

if __name__=='__main__': main()
