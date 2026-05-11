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
GOOGLE_CHAT_WEBHOOK_URL="${GOOGLE_CHAT_WEBHOOK_URL:-}"
TOTAL_ACCOUNTS="${TOTAL_ACCOUNTS:-}"
AVG_SECONDS_PER_ACCOUNT="${AVG_SECONDS_PER_ACCOUNT:-}"
REPORTS_BUCKET="${REPORTS_BUCKET:-${ACCOUNTS_BUCKET}}"
REPORTS_OBJECT_PREFIX="${REPORTS_OBJECT_PREFIX:-adobe-runs}"
TAG="${TAG:-$(date +%Y%m%d%H%M%S)}"
GOOGLE_CHAT_THREAD_KEY="${GOOGLE_CHAT_THREAD_KEY:-${JOB_NAME}-${TAG}}"
CURRENT_STAGE="initializing"

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
  notify_chat "Cloud Run job ${JOB_NAME} failed during ${stage} in ${REGION}. Exit code ${exit_code}. ${run_cost_summary}" || true
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

echo "Enabling required Google Cloud APIs..."
CURRENT_STAGE="enable-apis"
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  storage.googleapis.com \
  run.googleapis.com \
  --project="${PROJECT_ID}"

echo "Ensuring Artifact Registry repository ${REPOSITORY} exists..."
CURRENT_STAGE="ensure-artifact-registry"
if ! gcloud artifacts repositories describe "${REPOSITORY}" \
  --location="${REGION}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${REPOSITORY}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="Docker images for Playwright jobs" \
    --project="${PROJECT_ID}"
fi

echo "Ensuring Cloud Storage bucket gs://${ACCOUNTS_BUCKET} exists..."
CURRENT_STAGE="ensure-bucket"
if ! gcloud storage buckets describe "gs://${ACCOUNTS_BUCKET}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${ACCOUNTS_BUCKET}" \
    --location="${REGION}" \
    --uniform-bucket-level-access \
    --project="${PROJECT_ID}"
fi

echo "Uploading ${ACCOUNTS_CSV} to ${ACCOUNTS_URI}..."
CURRENT_STAGE="upload-accounts"
gcloud storage cp "${ACCOUNTS_CSV}" "${ACCOUNTS_URI}"

echo "Granting Cloud Run runtime service account access to ${ACCOUNTS_URI}..."
CURRENT_STAGE="grant-bucket-access"
gcloud storage buckets add-iam-policy-binding "gs://${ACCOUNTS_BUCKET}" \
  --member="serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
  --role="roles/storage.objectViewer" \
  --project="${PROJECT_ID}" >/dev/null

echo "Granting Cloud Run runtime service account write access for reports in gs://${REPORTS_BUCKET}..."
gcloud storage buckets add-iam-policy-binding "gs://${REPORTS_BUCKET}" \
  --member="serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
  --role="roles/storage.objectCreator" \
  --project="${PROJECT_ID}" >/dev/null

echo "Building and pushing ${IMAGE_URI}..."
CURRENT_STAGE="build-image"
gcloud builds submit \
  --tag="${IMAGE_URI}" \
  --project="${PROJECT_ID}" \
  .

echo "Deploying Cloud Run Job ${JOB_NAME}..."
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
  --set-env-vars="CI=1,ADOBE_ACCOUNTS_CSV=/tmp/accounts.csv,ADOBE_ACCOUNTS_GCS_URI=${ACCOUNTS_URI},ADOBE_REPORTS_GCS_URI=${REPORTS_URI},ADOBE_PLAYWRIGHT_WORKERS=${ADOBE_PLAYWRIGHT_WORKERS},ADOBE_STOP_AFTER_LOGIN=${ADOBE_STOP_AFTER_LOGIN}"

notify_chat "Starting Cloud Run job ${JOB_NAME} in ${REGION}. Tasks=${TASKS}, parallelism=${PARALLELISM}, cpu=${CPU}, memory=${MEMORY}. Reports=${REPORTS_URI}. ${run_cost_summary}" || true

echo "Executing ${JOB_NAME}; watch logs for: Login flow completed successfully"
CURRENT_STAGE="execute-job"
gcloud run jobs execute "${JOB_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --wait

notify_chat "Completed Cloud Run job ${JOB_NAME} in ${REGION}. Tasks=${TASKS}, parallelism=${PARALLELISM}, cpu=${CPU}, memory=${MEMORY}. Reports=${REPORTS_URI}." || true

echo "${run_cost_summary}"
