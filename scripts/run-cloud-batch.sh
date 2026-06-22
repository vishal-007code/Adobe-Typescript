#!/bin/bash
set -euo pipefail

# ── Cloud Run Job auto-injects these ──────────────────────
TASK_INDEX="${CLOUD_RUN_TASK_INDEX:-0}"
TASK_COUNT="${CLOUD_RUN_TASK_COUNT:-1}"
# ─────────────────────────────────────────────────────────

echo "=== Cloud Run Task ${TASK_INDEX} of ${TASK_COUNT} starting ==="
echo "Container: $(hostname)"

# Required
: "${GCS_BUCKET:?GCS_BUCKET env var must be set (name of your GCS bucket)}"

ACCOUNTS_FULL="/tmp/accounts_full.csv"
ACCOUNTS_SLICE="/tmp/accounts_task_${TASK_INDEX}.csv"

# Download accounts CSV from GCS
echo "[1/4] Downloading accounts from gs://${GCS_BUCKET}/accounts.csv ..."
gcloud storage cp "gs://${GCS_BUCKET}/accounts.csv" "$ACCOUNTS_FULL"

# Slice for this task
echo "[2/4] Slicing accounts for task ${TASK_INDEX} ..."
node /app/scripts/slice-accounts.mjs \
  "$ACCOUNTS_FULL" \
  "$TASK_INDEX" \
  "$TASK_COUNT" \
  "$ACCOUNTS_SLICE"

ACCOUNT_COUNT=$(tail -n +2 "$ACCOUNTS_SLICE" | grep -c . || true)
echo "Task ${TASK_INDEX}: ${ACCOUNT_COUNT} accounts to process"

if [ "$ACCOUNT_COUNT" -eq 0 ]; then
  echo "No accounts assigned to this task — exiting cleanly."
  exit 0
fi

# Set env so playwright picks up this task's slice
export ADOBE_ACCOUNTS_CSV="$ACCOUNTS_SLICE"
export ADOBE_RUN_ID="${ADOBE_RUN_ID:-task-${TASK_INDEX}}"

# Run playwright using the cloud config (no GPU, Linux-safe args)
echo "[3/4] Running Playwright (config: playwright.cloud.config.ts) ..."
npx playwright test \
  --config=playwright.cloud.config.ts \
  --project=adobe-chromium \
  2>&1 | tee "/tmp/playwright-task-${TASK_INDEX}.log" || true

# Upload results and report to GCS
echo "[4/4] Uploading results to GCS ..."

REPORTS_DIR="/app/reports"
if [ -d "$REPORTS_DIR" ]; then
  gcloud storage cp -r "$REPORTS_DIR/" \
    "gs://${GCS_BUCKET}/results/task-${TASK_INDEX}/reports/"
  echo "Uploaded reports dir."
fi

PLAYWRIGHT_REPORT_DIR="/app/playwright-report"
if [ -d "$PLAYWRIGHT_REPORT_DIR" ]; then
  gcloud storage cp -r "$PLAYWRIGHT_REPORT_DIR/" \
    "gs://${GCS_BUCKET}/results/task-${TASK_INDEX}/playwright-report/"
  echo "Uploaded playwright-report dir."
fi

echo "=== Task ${TASK_INDEX} complete ==="
