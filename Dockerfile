FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app

ENV CI=1 \
    PLAYWRIGHT_HTML_OPEN=never

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

CMD ["sh", "-lc", "node scripts/fetch-gcs-accounts.mjs && npm run test:adobe"]
