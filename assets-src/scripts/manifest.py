"""Inventory with dimensions and byte sizes, consumed by check_assets.py."""
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image
from common import ROOT, PUBLIC, SRC, read_json, write

EXCLUDED={'ASSETS.md','assets-src/processing/imports.json'}

def inventory_paths():
    folders=['web/public','assets-src','design','preview','data/users','data/photos','data/observations']
    candidates=[ROOT/'.gitignore']+[p for folder in folders for p in (ROOT/folder).rglob('*')]
    return sorted(p for p in candidates if p.is_file()
        and p.relative_to(ROOT).as_posix() not in EXCLUDED
        and not any(part in ['.git','__pycache__','.venv'] for part in p.relative_to(ROOT).parts)
        and not p.is_relative_to(ROOT/'data/source'))

def dimensions(path):
    if path.suffix.lower() in ['.webp','.png','.ico','.jpg']:
        with Image.open(path) as im:
            if path.suffix=='.ico':
                return ','.join(f'{w}x{h}' for w,h in sorted(im.ico.sizes()))
            return f'{im.width}x{im.height}'
    if path.suffix=='.svg':
        node=ET.parse(path).getroot(); view=node.attrib.get('viewBox','').split()
        return f'{int(float(view[2]))}x{int(float(view[3]))}'
    return '-'

def describe(path,prompts):
    rel=path.relative_to(ROOT).as_posix(); id=path.stem
    if rel=='web/public/brand/readme.md': return 'Логотип: концепция, варианты, инструкция по анимации','код вручную','-'
    if '/brand/' in rel and '-sprite-' in id: return 'Прозрачный спрайт-шит логотипа: 24 кадра, сетка 6 на 4','процедурно','-'
    if rel=='web/public/brand/logo-sprite.json': return 'Координаты кадров и параметры анимации логотипа','процедурно','-'
    if rel=='web/public/brand/logo-animation.css': return 'Покадровая CSS-анимация с reduced-motion','процедурно','-'
    if '/brand/logo-' in rel and path.suffix=='.png': return 'Растровый логотип или презентационный лист','процедурно','-'
    if rel=='preview/logo.html': return 'Демонстрация логотипа и анимации на светлом и тёмном фоне','процедурно','-'
    if rel.startswith('assets-src/generated/'):
        return 'Исходник генерации вне публичного каталога','генерация',id
    if rel.startswith('web/public/illustrations/') or rel.startswith('web/public/avatars/avatar-'):
        if id.endswith('-mobile'): return 'Вертикальный кроп зимнего героя','процедурно',id
        return ('Гостевой аватар' if id.startswith('avatar-') else 'Зимняя редакционная иллюстрация'),'генерация',id
    if rel.startswith('web/public/samples/photos/'):
        return 'Синтетическое фото с двумя водяными знаками','генерация + процедурно',id
    if path.suffix=='.svg':
        if '/patterns/' in rel: return 'Периодические топографические горизонтали','процедурно','-'
        return ('Знак бренда' if '/brand/' in rel else 'Маркеры карты' if '/markers/' in rel else 'Пиктограмма о воде' if '/pictograms/' in rel else 'Зимний эффект'),'svg-вручную','-'
    if rel=='web/public/brand/og-image.png': return 'Социальное превью: герой, знак, Golos Text Bold','процедурно','hero-winter-ravine'
    if '/brand/' in rel: return 'Фавиконка, иконка приложения или PWA-манифест','процедурно','-'
    if '/markers/png@2x/' in rel: return 'Растровая копия маркера для map.addImage','процедурно','-'
    if '/effects/' in rel: return 'Бесшовная процедурная текстура','процедурно','-'
    if '/qa/' in rel: return 'Контроль стыков периодической текстуры','процедурно','-'
    if rel.startswith('data/'): return 'Системный автор или демонстрационная запись','процедурно','-'
    if rel.startswith('design/'): return 'Дизайн-токены','процедурно','-'
    if rel.startswith('assets-src/fonts/'): return 'Golos Text / лицензия SIL OFL 1.1','загрузка (OFL)','-'
    if rel=='preview/index.html': return 'Статический контактный лист на двух фонах','процедурно','-'
    if '/scripts/' in rel: return 'Воспроизводимый инструмент сборки или проверки','код вручную','-'
    if '/prompts/' in rel: return 'Все промпты, размеры, ограничения и пути','код вручную','-'
    if '/processing/' in rel: return 'Происхождение генераций и подтверждение обработки','процедурно','-'
    return 'Справочный или служебный файл','код вручную','-'

def main():
    prompts=read_json(SRC/'prompts/images.json'); paths=inventory_paths()
    pending=not (ROOT/'data/source/springs.geojson').exists()
    status=('Ожидается `data/source/springs.geojson`. Каталог source создан, исходник не изменяется. '
        'Системный автор создан; 12 JSON фото и 20 JSON отметок будут созданы после появления источника, '
        'без вымышленных spring_id.' if pending else 'Источник GeoJSON присутствует; демонстрационные записи связаны с восемью округами.')
    intro='''# Московский родник: визуальные материалы

Только ассеты, демонстрационный контент и инструменты их подготовки. Код приложения не создавался.
Все промпты находятся в `assets-src/prompts/images.json`. Изображения созданы встроенным imagegen;
API-ключ и отдельный вызов Images API для этого комплекта не нужны.

## Текущее состояние

'''+status+'''

Генеративные исходники находятся в `assets-src/generated/`, а сведения о фактическом разрешении
и времени генерации — в `assets-src/processing/generated-images.json`. При отличии исходного размера
от целевого применяется Lanczos; мобильный герой — кроп того же пейзажа с центром (0.66, 0.53).
Финальные иллюстрации — WebP, quality 82 с адаптивным снижением только для ограничения 300 000 байт.
Прозрачный иней и серые каустики сохранены без потерь для точной периодичности краёв.

## Просмотр и проверка

Новый логотип: `preview/logo.html`. Варианты SVG, прозрачные спрайт-шиты PNG/WebP и готовый CSS
находятся в `web/public/brand/`. Инструкция по подключению — `web/public/brand/readme.md`.
Анимация содержит 24 кадра в сетке 6 × 4, длится 2 секунды; знак и надпись неподвижны,
мягко движутся только круги на воде. SVG-надпись переведена в кривые из Golos Text Bold.

Откройте `preview/index.html` прямо в браузере. Сеть и сервер для контактного листа не нужны.
Внутри находятся все публичные изображения на snow и dusk, составные маркеры и раскладки тайлов 2 × 2.
JSON-каталог аватаров использует поля `id`, `file`, `name` (русское название, со строчной буквы).

Из корня проекта в PowerShell:

```powershell
python -m pip install -r assets-src/scripts/requirements.txt
python assets-src/scripts/check_assets.py
```

После добавления вашего GeoJSON достаточно выполнить:

```powershell
python assets-src/scripts/rebuild.py
```

Ожидание файла с автоматическим созданием демонстрационных JSON:

```powershell
python assets-src/scripts/sample-data.py --wait
python assets-src/scripts/build-preview.py
python assets-src/scripts/manifest.py
python assets-src/scripts/check_assets.py
```

`rebuild.py` пересобирает комплект из сохранённых исходников без новой генерации.
Для повторной генерации используйте соответствующий `id` из манифеста промптов во встроенном imagegen,
затем импортируйте ответ через `import-images.py --imports <json>`; JSON — объект `id: {path, generated_at}`,
где `path` указывает на PNG, а `generated_at` — фактическое время получения изображения ISO 8601 UTC.
`negative` добавляется к промпту как список исключений. Для mobile отдельная генерация не нужна.

## Демонстрационный контент

Все 12 фото синтетические. В публичный каталог они попадают только через `watermark.py`:
крупное диагональное «ОБРАЗЕЦ» (белый, 35%, тонкая тёмная обводка) и плашка внизу справа;
шрифт Golos Text Bold. При экспорте EXIF, ICC и XMP не переносятся.
Подтверждения хешей исходника и результата находятся в `assets-src/processing/sample-watermarks.json`.
Проверка заново воспроизводит водяной знак и сравнивает результат; наличие файла в папке само по себе не считается доказательством.

Единственный автор — системный пользователь «Образец». Даты фото — фактическое время генерации,
даты отметок — фактическое время их создания; повторная сборка сохраняет дату существующих отметок.
Все демонстрационные сущности имеют `is_sample: true`, отметки — `affects_map: false`.
Подписи и комментарии явно указывают на демонстрационный характер и не заявляют фактическое состояние родника.

Выбор родников: группировка по префиксу `spring_id` до последнего дефиса с числовым суффиксом;
округа сортируются лексикографически, берутся первые восемь. В каждом — первый `spring_id`
в лексикографическом порядке (это не сортировка числового суффикса). Повторяющиеся или некорректные ID
и источник с менее чем восемью округами отклоняются до записи фото и отметок.
Фото распределяются циклически по восьми выбранным родникам; каждая отметка относится к роднику своего фото.

Семантика цветов: круг ice — превышений по химическим веществам не выявлено;
скруглённый ромб ochre — превышения выявлены; пунктирный контур slate — пробы не отбирались.
Иней обозначает давность данных, отдельный значок — состояние по отметкам.
Микробиология не входит в анализ; визуальные материалы не обещают безопасность или питьевое качество воды.

## Воспроизводимость и лицензия шрифта

Процедурные изображения используют фиксированный seed 2454. Снежинки, пиктограммы и бренд заданы SVG.
В `ice-crystal.svg` шесть отдельных путей `branch-1` … `branch-6` для анимации.
Maskable-иконка оставляет не менее 20% безопасного поля с каждой стороны.
Golos Text загружен из официального репозитория Google Fonts:
[файлы и OFL](https://github.com/google/fonts/tree/main/ofl/golostext).
Оригинальная лицензия включена в `assets-src/fonts/ofl.txt`; жирное начертание получено из variable-шрифта.

Автоматическая проверка охватывает комплектность, размеры и байты из таблицы, имена, отсутствие эмодзи
в JSON/SVG и текстовых артефактах, PNG @2x, PWA, токены, лимит размера иллюстраций, края тайлов,
водяные знаки, метаданные, связи демонстрационных записей и временные метки.
Отсутствующий исходный GeoJSON сообщается как ожидание; `--require-data` превращает его в ошибку.
Семантика изображений и соответствие стилю дополнительно проверяются визуально.
Контактные листы для такой проверки находятся в `assets-src/qa/*-contact.jpg`.

## Файлы

Таблица включает публичные ассеты, исходники и инструменты. Размеры в пикселях; `-` — не изображение.
Сам `ASSETS.md`, локальный импорт со внешними абсолютными путями, Python-кеш и пользовательский source
не включаются в таблицу. Пользовательские данные вне каталогов ассетов также не входят в манифест.
Каталог `data/source/` не изменяется инструментами сборки.

| Путь | Назначение | Размер | Байт | Способ создания | ID промпта |
|---|---|---|---:|---|---|
'''
    rows=[]
    for path in paths:
        purpose,method,prompt=describe(path,prompts)
        rows.append(f'| `{path.relative_to(ROOT).as_posix()}` | {purpose} | {dimensions(path)} | {path.stat().st_size} | {method} | {prompt} |')
    write(ROOT/'ASSETS.md',intro+'\n'.join(rows)+'\n')
    print(f'Manifest: {len(rows)} files.')

if __name__=='__main__': main()
