FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app

ENV CI=1 \
    PLAYWRIGHT_HTML_OPEN=never \
    ADOBE_PLAYWRIGHT_WORKERS=1

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

CMD ["sh", "-lc", "echo '[SERVER] Starting Adobe Playwright Cloud Run job'; echo '[SERVER] Node version:' $(node --version); echo '[SERVER] NPM version:' $(npm --version); echo '[SERVER] Working directory:' $(pwd); echo '[SERVER] ADOBE_ACCOUNTS_CSV='${ADOBE_ACCOUNTS_CSV:-unset}; echo '[SERVER] ADOBE_ACCOUNTS_GCS_URI='${ADOBE_ACCOUNTS_GCS_URI:-unset}; echo '[SERVER] ADOBE_REPORTS_GCS_URI='${ADOBE_REPORTS_GCS_URI:-unset}; echo '[SERVER] ADOBE_PLAYWRIGHT_WORKERS='${ADOBE_PLAYWRIGHT_WORKERS:-1}; echo '[SERVER] ADOBE_STOP_AFTER_LOGIN='${ADOBE_STOP_AFTER_LOGIN:-0}; echo '[SERVER] ADOBE_SCRIPT_ACCOUNT_LIMIT='${ADOBE_SCRIPT_ACCOUNT_LIMIT:-unset}; echo '[SERVER] Fetching accounts from GCS'; node scripts/fetch-gcs-accounts.mjs; echo '[SERVER] Accounts fetch completed'; echo '[SERVER] Running only tests/adobe/script.spec.ts'; npx playwright test tests/adobe/script.spec.ts --project=adobe-chromium --workers=${ADOBE_PLAYWRIGHT_WORKERS:-1}; TEST_EXIT_CODE=$?; echo '[SERVER] Playwright exited with code:' ${TEST_EXIT_CODE}; echo '[SERVER] Listing local artifacts before upload'; find test-results playwright-report reports -maxdepth 5 -type f 2>/dev/null || true; echo '[SERVER] Uploading reports and Playwright artifacts'; node scripts/upload-adobe-reports.mjs || true; echo '[SERVER] Done'; exit ${TEST_EXIT_CODE}"]