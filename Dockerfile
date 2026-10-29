# Сборка: web/ (Vite) и server/ (tsc), затем один процесс на node:22-slim отдаёт API и статику.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY design ./design
COPY web ./web
COPY server ./server
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    SEED_DIR=/app/seed \
    WEB_DIST=/app/web/dist \
    WEB_PUBLIC=/app/web/dist
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist
# Начальное содержимое тома: образцы и опорный GeoJSON (копируются, только если том пуст)
COPY data/users ./seed/users
COPY data/observations ./seed/observations
COPY data/photos ./seed/photos
COPY data/source ./seed/source
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dist/index.js"]
