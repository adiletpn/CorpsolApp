# Мини-апп CorpSol для Telegram. Собирается из корня монорепозитория:
#   docker build -f apps/telegram/Dockerfile -t corpsol-telegram .
#
# Это статика: Vite подставляет VITE_* на этапе сборки, поэтому ключи
# передаются аргументами сборки, а отдаёт файлы nginx.

FROM node:20-slim AS build
WORKDIR /repo

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/telegram/package.json apps/telegram/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN npm ci

COPY packages/shared packages/shared
COPY apps/telegram apps/telegram

ARG VITE_API_URL
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID

# Общий пакет Vite берёт исходником, отдельной сборки ему не нужно.
RUN npm run build -w @corpsol/telegram

FROM nginx:1.27-alpine AS runtime

# Шаблон nginx подставляет PORT при старте: хостинг задаёт порт сам.
ENV PORT=8080
COPY apps/telegram/deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/telegram/dist /usr/share/nginx/html

EXPOSE 8080
