#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-us-central1}"
REPOSITORY="${REPOSITORY:-playwright-jobs}"
IMAGE_NAME="${IMAGE_NAME:-adobe-login-flow}"
JOB_NAME="${JOB_NAME:-adobe-login-flow}"
ACCOUNTS_BUCKET="${ACCOUNTS_BUCKET:-${PROJECT_ID}-adobe-accounts}"
OBJECT_NAME="${OBJECT_NAME:-accounts.csv}"
ACCOUNTS_CSV="${ACCOUNTS_CSV:-accounts.csv}"
TASKS="${TASKS:-1}"
PARALLELISM="${PARALLELISM:-1}"
TASK_TIMEOUT="${TASK_TIMEOUT:-30m}"
CPU="${CPU:-2}"
MEMORY="${MEMORY:-2Gi}"
ADOBE_PLAYWRIGHT_WORKERS="${ADOBE_PLAYWRIGHT_WORKERS:-1}"
ADOBE_STOP_AFTER_LOGIN="${ADOBE_STOP_AFTER_LOGIN:-0}"
ADOBE_SCRIPT_ACCOUNT_LIMIT="${ADOBE_SCRIPT_ACCOUNT_LIMIT:-1}"
GOOGLE_CHAT_WEBHOOK_URL="${GOOGLE_CHAT_WEBHOOK_URL:-}"
TOTAL_ACCOUNTS="${TOTAL_ACCOUNTS:-}"
AVG_SECONDS_PER_ACCOUNT="${AVG_SECONDS_PER_ACCOUNT:-}"
REPORTS_BUCKET="${REPORTS_BUCKET:-${ACCOUNTS_BUCKET}}"
REPORTS_OBJECT_PREFIX="${REPORTS_OBJECT_PREFIX:-adobe-runs}"
TAG="${TAG:-$(date +%Y%m%d%H%M%S)}"
GOOGLE_CHAT_THREAD_KEY="${GOOGLE_CHAT_THREAD_KEY:-${JOB_NAME}-${TAG}}"
CURRENT_STAGE="initializing"

log() {
  echo "[DEPLOY][$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
}

notify_chat() {
  local message="$1"
  if [[ -z "${GOOGLE_CHAT_WEBHOOK_URL}" ]]; then
    return 0
  fi

  GOOGLE_CHAT_WEBHOOK_URL="${GOOGLE_CHAT_WEBHOOK_URL}" \
  GOOGLE_CHAT_MESSAGE="${message}" \
  GOOGLE_CHAT_THREAD_KEY="${GOOGLE_CHAT_THREAD_KEY}" \
  node scripts/send-google-chat-update.mjs >/dev/null
}

on_error() {
  local exit_code="$1"
  local stage="$2"
  log "ERROR: Cloud Run job ${JOB_NAME} failed during stage: ${stage}. Exit code: ${exit_code}"
  notify_chat "Cloud Run job ${JOB_NAME} failed during ${stage} in ${REGION}. Exit code ${exit_code}. ${run_cost_summary:-Cost summary unavailable.}" || true
  exit "${exit_code}"
}

trap 'on_error $? "$CURRENT_STAGE"' ERR

if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "PROJECT_ID is not set. Run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

if [[ ! -f "${ACCOUNTS_CSV}" ]]; then
  echo "Account CSV not found at ${ACCOUNTS_CSV}."
  echo "Create it with columns: email,password"
  exit 1
fi

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${TAG}"
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
RUNTIME_SERVICE_ACCOUNT="${RUNTIME_SERVICE_ACCOUNT:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"
ACCOUNTS_URI="gs://${ACCOUNTS_BUCKET}/${OBJECT_NAME}"
REPORTS_URI="gs://${REPORTS_BUCKET}/${REPORTS_OBJECT_PREFIX}"

run_cost_summary="$(CPU="${CPU}" MEMORY="${MEMORY}" TASKS="${TASKS}" PARALLELISM="${PARALLELISM}" TOTAL_ACCOUNTS="${TOTAL_ACCOUNTS}" AVG_SECONDS_PER_ACCOUNT="${AVG_SECONDS_PER_ACCOUNT}" node scripts/estimate-cloud-run-cost.mjs)"

log "============================================================"
log "Adobe Playwright Cloud Run Job Deployment"
log "============================================================"
log "Project ID: ${PROJECT_ID}"
log "Project number: ${PROJECT_NUMBER}"
log "Region: ${REGION}"
log "Repository: ${REPOSITORY}"
log "Image name: ${IMAGE_NAME}"
log "Image tag: ${TAG}"
log "Image URI: ${IMAGE_URI}"
log "Job name: ${JOB_NAME}"
log "Runtime service account: ${RUNTIME_SERVICE_ACCOUNT}"
log "Accounts CSV local path: ${ACCOUNTS_CSV}"
log "Accounts GCS URI: ${ACCOUNTS_URI}"
log "Reports GCS URI: ${REPORTS_URI}"
log "Tasks: ${TASKS}"
log "Parallelism: ${PARALLELISM}"
log "Task timeout: ${TASK_TIMEOUT}"
log "CPU: ${CPU}"
log "Memory: ${MEMORY}"
log "Playwright workers: ${ADOBE_PLAYWRIGHT_WORKERS}"
log "Script account limit: ${ADOBE_SCRIPT_ACCOUNT_LIMIT}"
log "Stop after login: ${ADOBE_STOP_AFTER_LOGIN}"
log "Cost estimate:"
echo "${run_cost_summary}"
log "============================================================"

log "Enabling required Google Cloud APIs..."
CURRENT_STAGE="enable-apis"
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  storage.googleapis.com \
  run.googleapis.com \
  --project="${PROJECT_ID}"

log "Ensuring Artifact Registry repository ${REPOSITORY} exists..."
CURRENT_STAGE="ensure-artifact-registry"
if ! gcloud artifacts repositories describe "${REPOSITORY}" \
  --location="${REGION}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  log "Artifact Registry repository does not exist. Creating ${REPOSITORY}..."
  gcloud artifacts repositories create "${REPOSITORY}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="Docker images for Playwright jobs" \
    --project="${PROJECT_ID}"
else
  log "Artifact Registry repository already exists."
fi

log "Ensuring Cloud Storage bucket gs://${ACCOUNTS_BUCKET} exists..."
CURRENT_STAGE="ensure-bucket"
if ! gcloud storage buckets describe "gs://${ACCOUNTS_BUCKET}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  log "Bucket does not exist. Creating gs://${ACCOUNTS_BUCKET}..."
  gcloud storage buckets create "gs://${ACCOUNTS_BUCKET}" \
    --location="${REGION}" \
    --uniform-bucket-level-access \
    --project="${PROJECT_ID}"
else
  log "Bucket already exists."
fi

log "Uploading ${ACCOUNTS_CSV} to ${ACCOUNTS_URI}..."
CURRENT_STAGE="upload-accounts"
gcloud storage cp "${ACCOUNTS_CSV}" "${ACCOUNTS_URI}"

log "Granting Cloud Run runtime service account read access to ${ACCOUNTS_URI}..."
CURRENT_STAGE="grant-bucket-access"
gcloud storage buckets add-iam-policy-binding "gs://${ACCOUNTS_BUCKET}" \
  --member="serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
  --role="roles/storage.objectViewer" \
  --project="${PROJECT_ID}" >/dev/null

log "Granting Cloud Run runtime service account write access for reports in gs://${REPORTS_BUCKET}..."
gcloud storage buckets add-iam-policy-binding "gs://${REPORTS_BUCKET}" \
  --member="serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
  --role="roles/storage.objectCreator" \
  --project="${PROJECT_ID}" >/dev/null

log "Building and pushing Docker image: ${IMAGE_URI}"
CURRENT_STAGE="build-image"
gcloud builds submit \
  --tag="${IMAGE_URI}" \
  --project="${PROJECT_ID}" \
  .

log "Deploying Cloud Run Job: ${JOB_NAME}"
CURRENT_STAGE="deploy-job"
gcloud run jobs deploy "${JOB_NAME}" \
  --image="${IMAGE_URI}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --service-account="${RUNTIME_SERVICE_ACCOUNT}" \
  --tasks="${TASKS}" \
  --parallelism="${PARALLELISM}" \
  --max-retries=0 \
  --task-timeout="${TASK_TIMEOUT}" \
  --cpu="${CPU}" \
  --memory="${MEMORY}" \
  --set-env-vars="CI=1,ADOBE_ACCOUNTS_CSV=/tmp/accounts.csv,ADOBE_ACCOUNTS_GCS_URI=${ACCOUNTS_URI},ADOBE_REPORTS_GCS_URI=${REPORTS_URI},ADOBE_PLAYWRIGHT_WORKERS=${ADOBE_PLAYWRIGHT_WORKERS},ADOBE_STOP_AFTER_LOGIN=${ADOBE_STOP_AFTER_LOGIN},ADOBE_SCRIPT_ACCOUNT_LIMIT=${ADOBE_SCRIPT_ACCOUNT_LIMIT}"

notify_chat "Starting Cloud Run job ${JOB_NAME} in ${REGION}. Tasks=${TASKS}, parallelism=${PARALLELISM}, cpu=${CPU}, memory=${MEMORY}, workers=${ADOBE_PLAYWRIGHT_WORKERS}, account_limit=${ADOBE_SCRIPT_ACCOUNT_LIMIT}. Reports=${REPORTS_URI}. ${run_cost_summary}" || true

log "Executing Cloud Run Job: ${JOB_NAME}"
log "Watch logs for:"
log "  [SERVER] Starting Adobe Playwright Cloud Run job"
log "  [SERVER] Fetching accounts from GCS"
log "  [SERVER] Running only tests/adobe/script.spec.ts"
log "  Login flow completed successfully"
CURRENT_STAGE="execute-job"

gcloud run jobs execute "${JOB_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --wait

notify_chat "Completed Cloud Run job ${JOB_NAME} in ${REGION}. Tasks=${TASKS}, parallelism=${PARALLELISM}, cpu=${CPU}, memory=${MEMORY}, workers=${ADOBE_PLAYWRIGHT_WORKERS}, account_limit=${ADOBE_SCRIPT_ACCOUNT_LIMIT}. Reports=${REPORTS_URI}." || true

log "Cloud Run job completed."
log "Final cost estimate:"
echo "${run_cost_summary}"

log "To view logs, run:"
echo "gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}\" --project=${PROJECT_ID} --limit=100 --format='value(timestamp,textPayload)'"

log "Reports path:"
echo "${REPORTS_URI}"