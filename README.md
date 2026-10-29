# Московский родник

Веб-приложение о состоянии родников Москвы поверх открытого набора data.mos.ru № 2454.
Полное ТЗ: `SPEC.md`. Решения по ходу работы: `DECISIONS.md`. Деплой: `DEPLOY.md`.

```bash
npm install
npm run dev     # сервер на :3000 и фронтенд на :5173 (ключ из .env.local, если он есть)
npm test        # тесты сервера
npm run lint    # проверка эмодзи и типов
npm run build   # сборка web/dist и server/dist
npm start       # продакшен-запуск одним процессом
```
