# Бэкенд CorpSol. Собирается из корня монорепозитория:
#   docker build -f apps/api/Dockerfile -t corpsol-api .

# ---- сборка ----
FROM node:20-slim AS build
WORKDIR /repo

# Сначала только манифесты: слой с зависимостями переиспользуется,
# пока не поменялся package-lock.
# Корневой конфиг TypeScript: от него наследуются пакеты,
# без него сборка падает с «Cannot read file tsconfig.base.json».
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# Панель в образ бэкенда не входит, но npm ci по корню требует её манифест.
COPY apps/web/package.json apps/web/

RUN npm ci

COPY packages/shared packages/shared
COPY apps/api apps/api

# Бэкенд импортирует @corpsol/shared собранным — без этого шага
# сборка падает на каждом импорте.
RUN npm run build -w @corpsol/shared \
 && npm run build -w @corpsol/api

# Лишние зависимости из слоя выполнения выкидываем.
RUN npm prune --omit=dev

# ---- выполнение ----
FROM node:20-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Процесс под обычным пользователем: образ node:slim уже содержит его.
USER node

COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/packages/shared ./packages/shared
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
COPY --from=build --chown=node:node /repo/apps/api/package.json ./package.json

EXPOSE 3001

# Облако определяет живость этим же маршрутом.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
