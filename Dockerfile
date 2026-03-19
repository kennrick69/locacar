FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Instala dependências PHP via Composer
FROM composer:2 AS php-build

WORKDIR /app/php
COPY backend/php/composer.json ./
RUN composer install --no-dev --no-interaction --optimize-autoloader

# Imagem final
FROM node:20-alpine

# PHP CLI + extensões necessárias para PHPMailer (SMTP com TLS)
RUN apk add --no-cache php83 php83-openssl php83-mbstring php83-phar php83-tokenizer \
    php83-filter php83-iconv php83-ctype \
    && ln -sf /usr/bin/php83 /usr/bin/php

WORKDIR /app

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/src/ ./src/
COPY backend/php/ ./php/
COPY --from=php-build /app/php/vendor ./php/vendor

RUN mkdir -p /app/uploads/cars /app/uploads/documents /app/uploads/contracts
COPY --from=frontend-build /app/frontend/dist ./public/

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s CMD wget -qO- http://localhost:3001/api/health || exit 1
CMD ["node", "src/server.js"]
