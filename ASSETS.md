# Московский родник: визуальные материалы

Только ассеты, демонстрационный контент и инструменты их подготовки. Код приложения не создавался.
Все промпты находятся в `assets-src/prompts/images.json`. Изображения созданы встроенным imagegen;
API-ключ и отдельный вызов Images API для этого комплекта не нужны.

## Текущее состояние

Источник GeoJSON присутствует; демонстрационные записи связаны с восемью округами.

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
| `.gitignore` | Справочный или служебный файл | - | 26 | код вручную | - |
| `assets-src/fonts/golos-text-bold.ttf` | Golos Text / лицензия SIL OFL 1.1 | - | 70280 | загрузка (OFL) | - |
| `assets-src/fonts/golos-text-variable.ttf` | Golos Text / лицензия SIL OFL 1.1 | - | 184292 | загрузка (OFL) | - |
| `assets-src/fonts/ofl.txt` | Golos Text / лицензия SIL OFL 1.1 | - | 4394 | загрузка (OFL) | - |
| `assets-src/generated/avatar-blue-tit.png` | Исходник генерации вне публичного каталога | 1254x1254 | 2133754 | генерация | avatar-blue-tit |
| `assets-src/generated/avatar-bullfinch.png` | Исходник генерации вне публичного каталога | 1254x1254 | 2348384 | генерация | avatar-bullfinch |
| `assets-src/generated/avatar-crossbill.png` | Исходник генерации вне публичного каталога | 1254x1254 | 2175617 | генерация | avatar-crossbill |
| `assets-src/generated/avatar-fox.png` | Исходник генерации вне публичного каталога | 1254x1254 | 2519942 | генерация | avatar-fox |
| `assets-src/generated/avatar-goldeneye.png` | Исходник генерации вне публичного каталога | 1254x1254 | 2189434 | генерация | avatar-goldeneye |
| `assets-src/generated/avatar-goldfinch.png` | Исходник генерации вне публичного каталога | 1254x1254 | 2306232 | генерация | avatar-goldfinch |
| `assets-src/generated/avatar-great-tit.png` | Исходник генерации вне публичного каталога | 1254x1254 | 2182019 | генерация | avatar-great-tit |
| `assets-src/generated/avatar-hare.png` | Исходник генерации вне публичного каталога | 1254x1254 | 2218428 | генерация | avatar-hare |
| `assets-src/generated/avatar-jackdaw.png` | Исходник генерации вне публичного каталога | 1254x1254 | 2406408 | генерация | avatar-jackdaw |
| `assets-src/generated/avatar-magpie.png` | Исходник генерации вне публичного каталога | 1254x1254 | 2306724 | генерация | avatar-magpie |
| `assets-src/generated/avatar-mallard.png` | Исходник генерации вне публичного каталога | 1254x1254 | 2255284 | генерация | avatar-mallard |
| `assets-src/generated/avatar-nuthatch.png` | Исходник генерации вне публичного каталога | 1254x1254 | 2247521 | генерация | avatar-nuthatch |
| `assets-src/generated/avatar-sparrow.png` | Исходник генерации вне публичного каталога | 1254x1254 | 2188974 | генерация | avatar-sparrow |
| `assets-src/generated/avatar-squirrel.png` | Исходник генерации вне публичного каталога | 1254x1254 | 2596438 | генерация | avatar-squirrel |
| `assets-src/generated/avatar-waxwing.png` | Исходник генерации вне публичного каталога | 1254x1254 | 2434248 | генерация | avatar-waxwing |
| `assets-src/generated/avatar-woodpecker.png` | Исходник генерации вне публичного каталога | 1254x1254 | 2245818 | генерация | avatar-woodpecker |
| `assets-src/generated/empty-filters.png` | Исходник генерации вне публичного каталога | 1254x1254 | 2860546 | генерация | empty-filters |
| `assets-src/generated/empty-offline.png` | Исходник генерации вне публичного каталога | 1254x1254 | 3191327 | генерация | empty-offline |
| `assets-src/generated/empty-reports.png` | Исходник генерации вне публичного каталога | 1254x1254 | 2809478 | генерация | empty-reports |
| `assets-src/generated/hero-winter-ravine.png` | Исходник генерации вне публичного каталога | 1774x887 | 2983663 | генерация | hero-winter-ravine |
| `assets-src/generated/sample-autumn-leaves.png` | Исходник генерации вне публичного каталога | 1448x1086 | 4076845 | генерация | sample-autumn-leaves |
| `assets-src/generated/sample-broken-tray.png` | Исходник генерации вне публичного каталога | 1448x1086 | 3774485 | генерация | sample-broken-tray |
| `assets-src/generated/sample-evening-lamp.png` | Исходник генерации вне публичного каталога | 1448x1086 | 3309897 | генерация | sample-evening-lamp |
| `assets-src/generated/sample-filling-bottle.png` | Исходник генерации вне публичного каталога | 1448x1086 | 3118243 | генерация | sample-filling-bottle |
| `assets-src/generated/sample-frozen-pipe.png` | Исходник генерации вне публичного каталога | 1448x1086 | 3218558 | генерация | sample-frozen-pipe |
| `assets-src/generated/sample-icy-path.png` | Исходник генерации вне публичного каталога | 1448x1086 | 3980775 | генерация | sample-icy-path |
| `assets-src/generated/sample-info-board.png` | Исходник генерации вне публичного каталога | 1448x1086 | 2977294 | генерация | sample-info-board |
| `assets-src/generated/sample-litter.png` | Исходник генерации вне публичного каталога | 1448x1086 | 3797036 | генерация | sample-litter |
| `assets-src/generated/sample-pipe-flowing.png` | Исходник генерации вне публичного каталога | 1448x1086 | 3410406 | генерация | sample-pipe-flowing |
| `assets-src/generated/sample-steam-brook.png` | Исходник генерации вне публичного каталога | 1448x1086 | 3050233 | генерация | sample-steam-brook |
| `assets-src/generated/sample-summer-view.png` | Исходник генерации вне публичного каталога | 1448x1086 | 4493962 | генерация | sample-summer-view |
| `assets-src/generated/sample-wooden-canopy.png` | Исходник генерации вне публичного каталога | 1448x1086 | 3537089 | генерация | sample-wooden-canopy |
| `assets-src/generated/spring-brook.png` | Исходник генерации вне публичного каталога | 1774x887 | 3135093 | генерация | spring-brook |
| `assets-src/generated/spring-canopy.png` | Исходник генерации вне публичного каталога | 1774x887 | 3193534 | генерация | spring-canopy |
| `assets-src/generated/spring-forest-park.png` | Исходник генерации вне публичного каталога | 1774x887 | 3217985 | генерация | spring-forest-park |
| `assets-src/generated/spring-pipe-ravine.png` | Исходник генерации вне публичного каталога | 1774x887 | 3111672 | генерация | spring-pipe-ravine |
| `assets-src/processing/generated-images.json` | Происхождение генераций и подтверждение обработки | - | 8256 | процедурно | - |
| `assets-src/processing/sample-bindings.json` | Происхождение генераций и подтверждение обработки | - | 805 | процедурно | - |
| `assets-src/processing/sample-watermarks.json` | Происхождение генераций и подтверждение обработки | - | 6617 | процедурно | - |
| `assets-src/prompts/images.json` | Все промпты, размеры, ограничения и пути | - | 41051 | код вручную | - |
| `assets-src/qa/avatars-contact.jpg` | Контроль стыков периодической текстуры | 1200x1392 | 372685 | процедурно | - |
| `assets-src/qa/caustics-tile-2x2.png` | Контроль стыков периодической текстуры | 1024x1024 | 240994 | процедурно | - |
| `assets-src/qa/frost-tile-2x2.png` | Контроль стыков периодической текстуры | 1024x1024 | 75762 | процедурно | - |
| `assets-src/qa/illustrations-contact.jpg` | Контроль стыков периодической текстуры | 1440x1044 | 368912 | процедурно | - |
| `assets-src/qa/logo-review.svg` | Зимний эффект | 48x48 | 716 | svg-вручную | - |
| `assets-src/qa/samples-contact.jpg` | Контроль стыков периодической текстуры | 1440x1632 | 971429 | процедурно | - |
| `assets-src/qa/topo-tile-2x2.png` | Контроль стыков периодической текстуры | 1024x1024 | 198289 | процедурно | - |
| `assets-src/qa/topo-tile.png` | Контроль стыков периодической текстуры | 512x512 | 123804 | процедурно | - |
| `assets-src/scripts/brandmark.py` | Воспроизводимый инструмент сборки или проверки | - | 1136 | код вручную | - |
| `assets-src/scripts/build-assets.py` | Воспроизводимый инструмент сборки или проверки | - | 10720 | код вручную | - |
| `assets-src/scripts/build-preview.py` | Воспроизводимый инструмент сборки или проверки | - | 11436 | код вручную | - |
| `assets-src/scripts/check_assets.py` | Воспроизводимый инструмент сборки или проверки | - | 15237 | код вручную | - |
| `assets-src/scripts/common.py` | Воспроизводимый инструмент сборки или проверки | - | 1500 | код вручную | - |
| `assets-src/scripts/import-images.py` | Воспроизводимый инструмент сборки или проверки | - | 3184 | код вручную | - |
| `assets-src/scripts/logo-assets.py` | Воспроизводимый инструмент сборки или проверки | - | 15790 | код вручную | - |
| `assets-src/scripts/manifest.py` | Воспроизводимый инструмент сборки или проверки | - | 15834 | код вручную | - |
| `assets-src/scripts/prompts.py` | Воспроизводимый инструмент сборки или проверки | - | 9564 | код вручную | - |
| `assets-src/scripts/qa-sheets.py` | Воспроизводимый инструмент сборки или проверки | - | 1205 | код вручную | - |
| `assets-src/scripts/rebuild.py` | Воспроизводимый инструмент сборки или проверки | - | 404 | код вручную | - |
| `assets-src/scripts/requirements.txt` | Воспроизводимый инструмент сборки или проверки | - | 87 | код вручную | - |
| `assets-src/scripts/sample-data.py` | Воспроизводимый инструмент сборки или проверки | - | 4332 | код вручную | - |
| `assets-src/scripts/watermark.py` | Воспроизводимый инструмент сборки или проверки | - | 2552 | код вручную | - |
| `data/observations/sample-obs-01.json` | Системный автор или демонстрационная запись | - | 425 | процедурно | - |
| `data/observations/sample-obs-02.json` | Системный автор или демонстрационная запись | - | 419 | процедурно | - |
| `data/observations/sample-obs-03.json` | Системный автор или демонстрационная запись | - | 425 | процедурно | - |
| `data/observations/sample-obs-04.json` | Системный автор или демонстрационная запись | - | 427 | процедурно | - |
| `data/observations/sample-obs-05.json` | Системный автор или демонстрационная запись | - | 424 | процедурно | - |
| `data/observations/sample-obs-06.json` | Системный автор или демонстрационная запись | - | 427 | процедурно | - |
| `data/observations/sample-obs-07.json` | Системный автор или демонстрационная запись | - | 427 | процедурно | - |
| `data/observations/sample-obs-08.json` | Системный автор или демонстрационная запись | - | 424 | процедурно | - |
| `data/observations/sample-obs-09.json` | Системный автор или демонстрационная запись | - | 427 | процедурно | - |
| `data/observations/sample-obs-10.json` | Системный автор или демонстрационная запись | - | 425 | процедурно | - |
| `data/observations/sample-obs-11.json` | Системный автор или демонстрационная запись | - | 429 | процедурно | - |
| `data/observations/sample-obs-12.json` | Системный автор или демонстрационная запись | - | 426 | процедурно | - |
| `data/observations/sample-obs-13.json` | Системный автор или демонстрационная запись | - | 426 | процедурно | - |
| `data/observations/sample-obs-14.json` | Системный автор или демонстрационная запись | - | 422 | процедурно | - |
| `data/observations/sample-obs-15.json` | Системный автор или демонстрационная запись | - | 424 | процедурно | - |
| `data/observations/sample-obs-16.json` | Системный автор или демонстрационная запись | - | 427 | процедурно | - |
| `data/observations/sample-obs-17.json` | Системный автор или демонстрационная запись | - | 425 | процедурно | - |
| `data/observations/sample-obs-18.json` | Системный автор или демонстрационная запись | - | 422 | процедурно | - |
| `data/observations/sample-obs-19.json` | Системный автор или демонстрационная запись | - | 426 | процедурно | - |
| `data/observations/sample-obs-20.json` | Системный автор или демонстрационная запись | - | 424 | процедурно | - |
| `data/photos/sample-autumn-leaves.json` | Системный автор или демонстрационная запись | - | 331 | процедурно | - |
| `data/photos/sample-broken-tray.json` | Системный автор или демонстрационная запись | - | 337 | процедурно | - |
| `data/photos/sample-evening-lamp.json` | Системный автор или демонстрационная запись | - | 322 | процедурно | - |
| `data/photos/sample-filling-bottle.json` | Системный автор или демонстрационная запись | - | 347 | процедурно | - |
| `data/photos/sample-frozen-pipe.json` | Системный автор или демонстрационная запись | - | 336 | процедурно | - |
| `data/photos/sample-icy-path.json` | Системный автор или демонстрационная запись | - | 338 | процедурно | - |
| `data/photos/sample-info-board.json` | Системный автор или демонстрационная запись | - | 333 | процедурно | - |
| `data/photos/sample-litter.json` | Системный автор или демонстрационная запись | - | 325 | процедурно | - |
| `data/photos/sample-pipe-flowing.json` | Системный автор или демонстрационная запись | - | 343 | процедурно | - |
| `data/photos/sample-steam-brook.json` | Системный автор или демонстрационная запись | - | 322 | процедурно | - |
| `data/photos/sample-summer-view.json` | Системный автор или демонстрационная запись | - | 324 | процедурно | - |
| `data/photos/sample-wooden-canopy.json` | Системный автор или демонстрационная запись | - | 341 | процедурно | - |
| `data/users/sample.json` | Системный автор или демонстрационная запись | - | 124 | процедурно | - |
| `design/tokens.css` | Дизайн-токены | - | 153 | процедурно | - |
| `design/tokens.json` | Дизайн-токены | - | 160 | процедурно | - |
| `preview/index.html` | Статический контактный лист на двух фонах | - | 65976 | процедурно | - |
| `preview/logo.html` | Демонстрация логотипа и анимации на светлом и тёмном фоне | - | 8733 | процедурно | - |
| `web/public/avatars/avatar-blue-tit.webp` | Гостевой аватар | 256x256 | 9338 | генерация | avatar-blue-tit |
| `web/public/avatars/avatar-bullfinch.webp` | Гостевой аватар | 256x256 | 10538 | генерация | avatar-bullfinch |
| `web/public/avatars/avatar-crossbill.webp` | Гостевой аватар | 256x256 | 11076 | генерация | avatar-crossbill |
| `web/public/avatars/avatar-fox.webp` | Гостевой аватар | 256x256 | 11992 | генерация | avatar-fox |
| `web/public/avatars/avatar-goldeneye.webp` | Гостевой аватар | 256x256 | 7942 | генерация | avatar-goldeneye |
| `web/public/avatars/avatar-goldfinch.webp` | Гостевой аватар | 256x256 | 11572 | генерация | avatar-goldfinch |
| `web/public/avatars/avatar-great-tit.webp` | Гостевой аватар | 256x256 | 9236 | генерация | avatar-great-tit |
| `web/public/avatars/avatar-hare.webp` | Гостевой аватар | 256x256 | 9744 | генерация | avatar-hare |
| `web/public/avatars/avatar-jackdaw.webp` | Гостевой аватар | 256x256 | 9056 | генерация | avatar-jackdaw |
| `web/public/avatars/avatar-magpie.webp` | Гостевой аватар | 256x256 | 12934 | генерация | avatar-magpie |
| `web/public/avatars/avatar-mallard.webp` | Гостевой аватар | 256x256 | 9586 | генерация | avatar-mallard |
| `web/public/avatars/avatar-nuthatch.webp` | Гостевой аватар | 256x256 | 11164 | генерация | avatar-nuthatch |
| `web/public/avatars/avatar-sparrow.webp` | Гостевой аватар | 256x256 | 9290 | генерация | avatar-sparrow |
| `web/public/avatars/avatar-squirrel.webp` | Гостевой аватар | 256x256 | 12466 | генерация | avatar-squirrel |
| `web/public/avatars/avatar-waxwing.webp` | Гостевой аватар | 256x256 | 9574 | генерация | avatar-waxwing |
| `web/public/avatars/avatar-woodpecker.webp` | Гостевой аватар | 256x256 | 13288 | генерация | avatar-woodpecker |
| `web/public/avatars/avatars.json` | Справочный или служебный файл | - | 1779 | код вручную | - |
| `web/public/brand/apple-touch-icon-180.png` | Фавиконка, иконка приложения или PWA-манифест | 180x180 | 3653 | процедурно | - |
| `web/public/brand/favicon-32.png` | Фавиконка, иконка приложения или PWA-манифест | 32x32 | 770 | процедурно | - |
| `web/public/brand/favicon.ico` | Фавиконка, иконка приложения или PWA-манифест | 16x16,32x32 | 2428 | процедурно | - |
| `web/public/brand/icon-192.png` | Фавиконка, иконка приложения или PWA-манифест | 192x192 | 3910 | процедурно | - |
| `web/public/brand/icon-512.png` | Фавиконка, иконка приложения или PWA-манифест | 512x512 | 10861 | процедурно | - |
| `web/public/brand/icon-maskable-512.png` | Фавиконка, иконка приложения или PWA-манифест | 512x512 | 7968 | процедурно | - |
| `web/public/brand/logo-animation.css` | Покадровая CSS-анимация с reduced-motion | - | 2586 | процедурно | - |
| `web/public/brand/logo-inverse.svg` | Знак бренда | 48x48 | 717 | svg-вручную | - |
| `web/public/brand/logo-lockup-inverse.svg` | Знак бренда | 384x112 | 11124 | svg-вручную | - |
| `web/public/brand/logo-lockup-mono.svg` | Знак бренда | 384x112 | 11124 | svg-вручную | - |
| `web/public/brand/logo-lockup-sprite-color.png` | Прозрачный спрайт-шит логотипа: 24 кадра, сетка 6 на 4 | 4608x896 | 174044 | процедурно | - |
| `web/public/brand/logo-lockup-sprite-color.webp` | Прозрачный спрайт-шит логотипа: 24 кадра, сетка 6 на 4 | 4608x896 | 34398 | процедурно | - |
| `web/public/brand/logo-lockup-sprite-inverse.png` | Прозрачный спрайт-шит логотипа: 24 кадра, сетка 6 на 4 | 4608x896 | 172756 | процедурно | - |
| `web/public/brand/logo-lockup-sprite-inverse.webp` | Прозрачный спрайт-шит логотипа: 24 кадра, сетка 6 на 4 | 4608x896 | 32464 | процедурно | - |
| `web/public/brand/logo-lockup-sprite-mono.png` | Прозрачный спрайт-шит логотипа: 24 кадра, сетка 6 на 4 | 4608x896 | 169427 | процедурно | - |
| `web/public/brand/logo-lockup-sprite-mono.webp` | Прозрачный спрайт-шит логотипа: 24 кадра, сетка 6 на 4 | 4608x896 | 32854 | процедурно | - |
| `web/public/brand/logo-lockup.png` | Растровый логотип или презентационный лист | 1536x448 | 28146 | процедурно | - |
| `web/public/brand/logo-lockup.svg` | Знак бренда | 384x112 | 11124 | svg-вручную | - |
| `web/public/brand/logo-mark-512.png` | Растровый логотип или презентационный лист | 512x512 | 12268 | процедурно | - |
| `web/public/brand/logo-mark-sprite-color.png` | Прозрачный спрайт-шит логотипа: 24 кадра, сетка 6 на 4 | 1536x1024 | 120776 | процедурно | - |
| `web/public/brand/logo-mark-sprite-color.webp` | Прозрачный спрайт-шит логотипа: 24 кадра, сетка 6 на 4 | 1536x1024 | 39036 | процедурно | - |
| `web/public/brand/logo-mark-sprite-inverse.png` | Прозрачный спрайт-шит логотипа: 24 кадра, сетка 6 на 4 | 1536x1024 | 117333 | процедурно | - |
| `web/public/brand/logo-mark-sprite-inverse.webp` | Прозрачный спрайт-шит логотипа: 24 кадра, сетка 6 на 4 | 1536x1024 | 37184 | процедурно | - |
| `web/public/brand/logo-mark-sprite-mono.png` | Прозрачный спрайт-шит логотипа: 24 кадра, сетка 6 на 4 | 1536x1024 | 116280 | процедурно | - |
| `web/public/brand/logo-mark-sprite-mono.webp` | Прозрачный спрайт-шит логотипа: 24 кадра, сетка 6 на 4 | 1536x1024 | 37002 | процедурно | - |
| `web/public/brand/logo-mono.svg` | Знак бренда | 48x48 | 717 | svg-вручную | - |
| `web/public/brand/logo-presentation.png` | Растровый логотип или презентационный лист | 1440x1100 | 75140 | процедурно | - |
| `web/public/brand/logo-sprite.json` | Координаты кадров и параметры анимации логотипа | - | 28797 | процедурно | - |
| `web/public/brand/logo.svg` | Знак бренда | 48x48 | 717 | svg-вручную | - |
| `web/public/brand/og-image.png` | Социальное превью: герой, знак, Golos Text Bold | 1200x630 | 988226 | процедурно | hero-winter-ravine |
| `web/public/brand/readme.md` | Логотип: концепция, варианты, инструкция по анимации | - | 9810 | код вручную | - |
| `web/public/brand/site.webmanifest` | Фавиконка, иконка приложения или PWA-манифест | - | 620 | процедурно | - |
| `web/public/effects/caustics-tile-512.webp` | Бесшовная процедурная текстура | 512x512 | 43574 | процедурно | - |
| `web/public/effects/frost-tile-512.webp` | Бесшовная процедурная текстура | 512x512 | 14980 | процедурно | - |
| `web/public/effects/ice-crystal.svg` | Зимний эффект | 64x64 | 1121 | svg-вручную | - |
| `web/public/effects/snowflake-1.svg` | Зимний эффект | 64x64 | 1242 | svg-вручную | - |
| `web/public/effects/snowflake-2.svg` | Зимний эффект | 64x64 | 1626 | svg-вручную | - |
| `web/public/effects/snowflake-3.svg` | Зимний эффект | 64x64 | 2022 | svg-вручную | - |
| `web/public/effects/snowflake-4.svg` | Зимний эффект | 64x64 | 2382 | svg-вручную | - |
| `web/public/effects/snowflake-5.svg` | Зимний эффект | 64x64 | 2766 | svg-вручную | - |
| `web/public/illustrations/card/spring-brook.webp` | Зимняя редакционная иллюстрация | 1200x600 | 140916 | генерация | spring-brook |
| `web/public/illustrations/card/spring-canopy.webp` | Зимняя редакционная иллюстрация | 1200x600 | 167168 | генерация | spring-canopy |
| `web/public/illustrations/card/spring-forest-park.webp` | Зимняя редакционная иллюстрация | 1200x600 | 169068 | генерация | spring-forest-park |
| `web/public/illustrations/card/spring-pipe-ravine.webp` | Зимняя редакционная иллюстрация | 1200x600 | 147534 | генерация | spring-pipe-ravine |
| `web/public/illustrations/empty/empty-filters.webp` | Зимняя редакционная иллюстрация | 800x800 | 89534 | генерация | empty-filters |
| `web/public/illustrations/empty/empty-offline.webp` | Зимняя редакционная иллюстрация | 800x800 | 135026 | генерация | empty-offline |
| `web/public/illustrations/empty/empty-reports.webp` | Зимняя редакционная иллюстрация | 800x800 | 103746 | генерация | empty-reports |
| `web/public/illustrations/hero/hero-winter-ravine-mobile.webp` | Вертикальный кроп зимнего героя | 1080x1350 | 130532 | процедурно | hero-winter-ravine-mobile |
| `web/public/illustrations/hero/hero-winter-ravine.webp` | Зимняя редакционная иллюстрация | 2400x1200 | 273918 | генерация | hero-winter-ravine |
| `web/public/markers/frost-1.svg` | Маркеры карты | 48x48 | 630 | svg-вручную | - |
| `web/public/markers/frost-2.svg` | Маркеры карты | 48x48 | 1027 | svg-вручную | - |
| `web/public/markers/frost-3.svg` | Маркеры карты | 48x48 | 1395 | svg-вручную | - |
| `web/public/markers/me.svg` | Маркеры карты | 48x48 | 172 | svg-вручную | - |
| `web/public/markers/png@2x/frost-1.png` | Растровая копия маркера для map.addImage | 96x96 | 3590 | процедурно | - |
| `web/public/markers/png@2x/frost-2.png` | Растровая копия маркера для map.addImage | 96x96 | 4531 | процедурно | - |
| `web/public/markers/png@2x/frost-3.png` | Растровая копия маркера для map.addImage | 96x96 | 5089 | процедурно | - |
| `web/public/markers/png@2x/me.png` | Растровая копия маркера для map.addImage | 96x96 | 1195 | процедурно | - |
| `web/public/markers/png@2x/selected-halo.png` | Растровая копия маркера для map.addImage | 96x96 | 3228 | процедурно | - |
| `web/public/markers/png@2x/state-dry.png` | Растровая копия маркера для map.addImage | 40x40 | 1337 | процедурно | - |
| `web/public/markers/png@2x/state-flowing.png` | Растровая копия маркера для map.addImage | 40x40 | 1617 | процедурно | - |
| `web/public/markers/png@2x/state-frozen.png` | Растровая копия маркера для map.addImage | 40x40 | 1662 | процедурно | - |
| `web/public/markers/png@2x/state-unknown.png` | Растровая копия маркера для map.addImage | 40x40 | 1230 | процедурно | - |
| `web/public/markers/png@2x/state-weak.png` | Растровая копия маркера для map.addImage | 40x40 | 1413 | процедурно | - |
| `web/public/markers/png@2x/status-exceed.png` | Растровая копия маркера для map.addImage | 96x96 | 1392 | процедурно | - |
| `web/public/markers/png@2x/status-not-sampled.png` | Растровая копия маркера для map.addImage | 96x96 | 1936 | процедурно | - |
| `web/public/markers/png@2x/status-ok.png` | Растровая копия маркера для map.addImage | 96x96 | 2016 | процедурно | - |
| `web/public/markers/selected-halo.svg` | Маркеры карты | 48x48 | 228 | svg-вручную | - |
| `web/public/markers/state-dry.svg` | Маркеры карты | 20x20 | 316 | svg-вручную | - |
| `web/public/markers/state-flowing.svg` | Маркеры карты | 20x20 | 328 | svg-вручную | - |
| `web/public/markers/state-frozen.svg` | Маркеры карты | 20x20 | 347 | svg-вручную | - |
| `web/public/markers/state-unknown.svg` | Маркеры карты | 20x20 | 337 | svg-вручную | - |
| `web/public/markers/state-weak.svg` | Маркеры карты | 20x20 | 308 | svg-вручную | - |
| `web/public/markers/status-exceed.svg` | Маркеры карты | 48x48 | 220 | svg-вручную | - |
| `web/public/markers/status-not-sampled.svg` | Маркеры карты | 48x48 | 195 | svg-вручную | - |
| `web/public/markers/status-ok.svg` | Маркеры карты | 48x48 | 173 | svg-вручную | - |
| `web/public/patterns/topo-contours.svg` | Периодические топографические горизонтали | 512x512 | 188890 | процедурно | - |
| `web/public/pictograms/boil-water.svg` | Пиктограмма о воде | 32x32 | 339 | svg-вручную | - |
| `web/public/pictograms/chemistry-only.svg` | Пиктограмма о воде | 32x32 | 295 | svg-вручную | - |
| `web/public/pictograms/last-sample.svg` | Пиктограмма о воде | 32x32 | 302 | svg-вручную | - |
| `web/public/pictograms/never-sampled.svg` | Пиктограмма о воде | 32x32 | 264 | svg-вручную | - |
| `web/public/pictograms/no-microbiology.svg` | Пиктограмма о воде | 32x32 | 334 | svg-вручную | - |
| `web/public/samples/photos/sample-autumn-leaves.webp` | Синтетическое фото с двумя водяными знаками | 1600x1200 | 535048 | генерация + процедурно | sample-autumn-leaves |
| `web/public/samples/photos/sample-broken-tray.webp` | Синтетическое фото с двумя водяными знаками | 1600x1200 | 464444 | генерация + процедурно | sample-broken-tray |
| `web/public/samples/photos/sample-evening-lamp.webp` | Синтетическое фото с двумя водяными знаками | 1600x1200 | 371186 | генерация + процедурно | sample-evening-lamp |
| `web/public/samples/photos/sample-filling-bottle.webp` | Синтетическое фото с двумя водяными знаками | 1600x1200 | 293392 | генерация + процедурно | sample-filling-bottle |
| `web/public/samples/photos/sample-frozen-pipe.webp` | Синтетическое фото с двумя водяными знаками | 1600x1200 | 307854 | генерация + процедурно | sample-frozen-pipe |
| `web/public/samples/photos/sample-icy-path.webp` | Синтетическое фото с двумя водяными знаками | 1600x1200 | 508300 | генерация + процедурно | sample-icy-path |
| `web/public/samples/photos/sample-info-board.webp` | Синтетическое фото с двумя водяными знаками | 1600x1200 | 287490 | генерация + процедурно | sample-info-board |
| `web/public/samples/photos/sample-litter.webp` | Синтетическое фото с двумя водяными знаками | 1600x1200 | 476202 | генерация + процедурно | sample-litter |
| `web/public/samples/photos/sample-pipe-flowing.webp` | Синтетическое фото с двумя водяными знаками | 1600x1200 | 363906 | генерация + процедурно | sample-pipe-flowing |
| `web/public/samples/photos/sample-steam-brook.webp` | Синтетическое фото с двумя водяными знаками | 1600x1200 | 300156 | генерация + процедурно | sample-steam-brook |
| `web/public/samples/photos/sample-summer-view.webp` | Синтетическое фото с двумя водяными знаками | 1600x1200 | 661868 | генерация + процедурно | sample-summer-view |
| `web/public/samples/photos/sample-wooden-canopy.webp` | Синтетическое фото с двумя водяными знаками | 1600x1200 | 404462 | генерация + процедурно | sample-wooden-canopy |
