#!/usr/bin/env bash
# Launch parallel Cloud Run job batches using a pre-built image.
# Requires: IMAGE_URI from scripts/setup-run.sh
# Does NOT build Docker image or touch IAM/bucket setup — that is setup-run.sh's job.
#
# Usage:
#   IMAGE_URI=<uri> bash scripts/run-batches.sh
#
# Example:
#   export IMAGE_URI=asia-south1-docker.pkg.dev/project-517cd71a-7c2f-4e1b-af2/playwright-jobs/adobe-login-flow:20260622120000
#   export INPUT_CSV=accounts.csv
#   export TOTAL_ACCOUNTS=20578
#   bash scripts/run-batches.sh
set -euo pipefail

: "${IMAGE_URI:?IMAGE_URI is required. Run scripts/setup-run.sh first and copy the printed IMAGE_URI.}"

PROJECT_ID="${PROJECT_ID:-project-517cd71a-7c2f-4e1b-af2}"
REGION="${REGION:-asia-south1}"
RUNTIME_SERVICE_ACCOUNT="${RUNTIME_SERVICE_ACCOUNT:-playwright-runner@${PROJECT_ID}.iam.gserviceaccount.com}"
ACCOUNTS_BUCKET="${ACCOUNTS_BUCKET:-${PROJECT_ID}-adobe-accounts}"
REPORTS_BUCKET="${REPORTS_BUCKET:-${ACCOUNTS_BUCKET}}"

INPUT_CSV="${INPUT_CSV:-accounts.csv}"
TOTAL_ACCOUNTS="${TOTAL_ACCOUNTS:-30300}"
# One job by default (BATCH_SIZE >= TOTAL_ACCOUNTS). The asia-south1 quota is small
# (20 vCPU / 40 GiB total per region), so launching several jobs in parallel just
# fights that shared cap at runtime. A single job uses the quota cleanly.
BATCH_SIZE="${BATCH_SIZE:-30300}"

CPU="${CPU:-2}"
MEMORY="${MEMORY:-4Gi}"
# Concurrent tasks per job. A job's deploy must satisfy PARALLELISM x {CPU, MEMORY}
# within the regional quota: 20 vCPU and 40 GiB total in asia-south1.
#   PARALLELISM=8 x CPU=2   = 16 vCPU   (<= 20)
#   PARALLELISM=8 x MEMORY=4Gi = 32 GiB (<= 40)   -> deploys with headroom.
# Throughput ~= PARALLELISM x WORKERS accounts in flight. The ~3.5 min dashboard
# dwell leaves the CPU mostly idle, so WORKERS can safely exceed CPU (oversubscribe).
# 8 x 4 = ~32 accounts in flight at ~6 min/account -> ~30300 done in ~4 days (~Fri).
# Going faster needs a Cloud Run CPU/Memory quota increase for the region.
PARALLELISM="${PARALLELISM:-8}"
# Workers per task. 4 oversubscribes 2 vCPU (fine during the idle dwell); if logins
# start failing/timing out under load, drop to 3 (gentler, ~a day slower).
ADOBE_PLAYWRIGHT_WORKERS="${ADOBE_PLAYWRIGHT_WORKERS:-4}"
ADOBE_SCRIPT_ACCOUNT_LIMIT="${ADOBE_SCRIPT_ACCOUNT_LIMIT:-21}"
ADOBE_STOP_AFTER_LOGIN="${ADOBE_STOP_AFTER_LOGIN:-1}"
ADOBE_STOP_AFTER_LETS_GO="${ADOBE_STOP_AFTER_LETS_GO:-1}"
ADOBE_LETS_GO_APPEAR_TIMEOUT_MS="${ADOBE_LETS_GO_APPEAR_TIMEOUT_MS:-60000}"
ADOBE_STRICT_LETS_GO="${ADOBE_STRICT_LETS_GO:-1}"
ADOBE_VIDEO_MODE="${ADOBE_VIDEO_MODE:-off}"
ADOBE_DEBUG_ARTIFACTS="${ADOBE_DEBUG_ARTIFACTS:-0}"
SAVE_ARTIFACTS="${SAVE_ARTIFACTS:-false}"
TASK_TIMEOUT="${TASK_TIMEOUT:-8h}"
BASE_JOB_NAME="${BASE_JOB_NAME:-adobe-login-flow}"

RUN_ID="$(date +%Y%m%d%H%M%S)"
BATCH_DIR="tmp/batches-${RUN_ID}"
LOG_DIR="tmp/batch-logs-${RUN_ID}"

mkdir -p "$BATCH_DIR" "$LOG_DIR"

log() { echo "[BATCHES][$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

# ── Pre-flight: Cloud Run CPU quota check (set CHECK_QUOTA=1 to enable) ────────
# This run needs ~(num batches x PARALLELISM x WORKERS x CPU) CPUs concurrently
# in ${REGION}. If that exceeds your "Total CPU allocation" limit, jobs queue or
# fail to scale. Run the command below (or set CHECK_QUOTA=1) before launching.
if [[ "${CHECK_QUOTA:-0}" == "1" ]]; then
  num_batches=$(( (TOTAL_ACCOUNTS + BATCH_SIZE - 1) / BATCH_SIZE ))
  needed_cpus=$(( num_batches * PARALLELISM * ADOBE_PLAYWRIGHT_WORKERS * CPU ))
  log "Estimated peak CPUs needed in ${REGION}: ${needed_cpus}"
  log "Current Cloud Run CPU quota in ${REGION}:"
  gcloud beta quotas info list \
    --service=run.googleapis.com \
    --project="${PROJECT_ID}" \
    --format="value(quotaId,dimensionsInfos.details.value)" 2>/dev/null \
    | grep -i cpu || log "  (could not read quota — check the console link in the script comments)"
fi

if [[ ! -f "$INPUT_CSV" ]]; then
  echo "ERROR: input CSV not found: $INPUT_CSV"
  exit 1
fi

HEADER="$(head -n 1 "$INPUT_CSV")"

log "============================================================"
log "Adobe Playwright — Batch Run"
log "Project:       ${PROJECT_ID}"
log "Image:         ${IMAGE_URI}"
log "Input CSV:     ${INPUT_CSV}"
log "Total accounts: ${TOTAL_ACCOUNTS}"
log "Batch size:    ${BATCH_SIZE}"
log "CPU/Memory:    ${CPU} / ${MEMORY}"
log "Parallelism:   ${PARALLELISM} (tasks running at once per job)"
log "Workers:       ${ADOBE_PLAYWRIGHT_WORKERS}"
log "Acct limit:    ${ADOBE_SCRIPT_ACCOUNT_LIMIT}"
log "Stop after login: ${ADOBE_STOP_AFTER_LOGIN}"
log "Save to GCS:   ${SAVE_ARTIFACTS} (false = logs only, no bucket uploads)"
log "============================================================"

# ── Split CSV into batches ────────────────────────────────────────────────────
log "Splitting CSV into batches..."
tail -n +2 "$INPUT_CSV" | head -n "$TOTAL_ACCOUNTS" | \
  split -l "$BATCH_SIZE" -d -a 2 - "$BATCH_DIR/accounts-part-"

BATCH_FILES=()
for part in "$BATCH_DIR"/accounts-part-*; do
  [[ -f "$part" ]] || continue
  batch_num="$(basename "$part" | sed 's/accounts-part-//')"
  batch_csv="$BATCH_DIR/accounts-batch-${batch_num}.csv"
  { echo "$HEADER"; cat "$part"; } > "$batch_csv"
  rm -f "$part"
  BATCH_FILES+=("$batch_csv")
done

log "Created ${#BATCH_FILES[@]} batch files:"
printf '  %s\n' "${BATCH_FILES[@]}"

# ── Launch batches in parallel ────────────────────────────────────────────────
log "Launching ${#BATCH_FILES[@]} batches in parallel..."

pids=()
i=0

for batch_csv in "${BATCH_FILES[@]}"; do
  i=$((i + 1))
  batch_label="$(printf 'batch-%02d' "$i")"
  job_name="${BASE_JOB_NAME}-${batch_label}"
  batch_rows=$(( $(wc -l < "$batch_csv") - 1 ))
  tasks=$(( (batch_rows + ADOBE_SCRIPT_ACCOUNT_LIMIT - 1) / ADOBE_SCRIPT_ACCOUNT_LIMIT ))
  object_name="accounts/${RUN_ID}/${batch_label}.csv"
  reports_prefix="adobe-runs/${RUN_ID}/${batch_label}"
  accounts_gcs_uri="gs://${ACCOUNTS_BUCKET}/${object_name}"
  reports_gcs_uri="gs://${REPORTS_BUCKET}/${reports_prefix}"

  log "  $batch_label: rows=$batch_rows, tasks=$tasks, job=$job_name"

  (
    step() { echo "[${batch_label}][$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

    step "Uploading CSV to ${accounts_gcs_uri}..."
    gcloud storage cp "$batch_csv" "$accounts_gcs_uri" --project="${PROJECT_ID}"

    step "Deploying Cloud Run job ${job_name}..."
    gcloud run jobs deploy "${job_name}" \
      --image="${IMAGE_URI}" \
      --region="${REGION}" \
      --project="${PROJECT_ID}" \
      --service-account="${RUNTIME_SERVICE_ACCOUNT}" \
      --tasks="${tasks}" \
      --parallelism="${PARALLELISM}" \
      --max-retries=0 \
      --task-timeout="${TASK_TIMEOUT}" \
      --cpu="${CPU}" \
      --memory="${MEMORY}" \
      --set-env-vars="CI=1,\
ADOBE_ACCOUNTS_CSV=/tmp/accounts.csv,\
ADOBE_ACCOUNTS_GCS_URI=${accounts_gcs_uri},\
ADOBE_REPORTS_GCS_URI=${reports_gcs_uri},\
ADOBE_PLAYWRIGHT_WORKERS=${ADOBE_PLAYWRIGHT_WORKERS},\
ADOBE_STOP_AFTER_LOGIN=${ADOBE_STOP_AFTER_LOGIN},\
ADOBE_STOP_AFTER_LETS_GO=${ADOBE_STOP_AFTER_LETS_GO},\
ADOBE_SCRIPT_ACCOUNT_LIMIT=${ADOBE_SCRIPT_ACCOUNT_LIMIT},\
ADOBE_LETS_GO_APPEAR_TIMEOUT_MS=${ADOBE_LETS_GO_APPEAR_TIMEOUT_MS},\
ADOBE_STRICT_LETS_GO=${ADOBE_STRICT_LETS_GO},\
ADOBE_VIDEO_MODE=${ADOBE_VIDEO_MODE},\
ADOBE_DEBUG_ARTIFACTS=${ADOBE_DEBUG_ARTIFACTS},\
SAVE_ARTIFACTS=${SAVE_ARTIFACTS}"

    step "Executing ${job_name} (waiting for completion)..."
    gcloud run jobs execute "${job_name}" \
      --region="${REGION}" \
      --project="${PROJECT_ID}" \
      --wait

    step "Done."
  ) > "$LOG_DIR/${batch_label}.log" 2>&1 &

  pids+=("$!")
done

log "All batches started. Waiting..."
log "Monitor with:"
log "  tail -f $LOG_DIR/batch-01.log"
log "  gcloud run jobs list --region=${REGION} --project=${PROJECT_ID}"

# ── Wait for all batches ──────────────────────────────────────────────────────
failed=0
for idx in "${!pids[@]}"; do
  pid="${pids[$idx]}"
  batch_no=$((idx + 1))
  batch_label="$(printf 'batch-%02d' "$batch_no")"
  if wait "$pid"; then
    log "$batch_label completed successfully."
  else
    log "$batch_label FAILED — check $LOG_DIR/${batch_label}.log"
    failed=1
  fi
done

echo
log "Logs:       $LOG_DIR"
log "Batch CSVs: $BATCH_DIR"

if [[ "$failed" -ne 0 ]]; then
  echo
  echo "One or more batches failed. Debug:"
  for i in $(seq 1 "${#BATCH_FILES[@]}"); do
    echo "  tail -n 50 $LOG_DIR/$(printf 'batch-%02d' "$i").log"
  done
  exit 1
fi

log "All batches completed successfully."
