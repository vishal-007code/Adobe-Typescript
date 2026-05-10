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
TAG="${TAG:-$(date +%Y%m%d%H%M%S)}"

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

echo "Enabling required Google Cloud APIs..."
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  storage.googleapis.com \
  run.googleapis.com \
  --project="${PROJECT_ID}"

echo "Ensuring Artifact Registry repository ${REPOSITORY} exists..."
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
if ! gcloud storage buckets describe "gs://${ACCOUNTS_BUCKET}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${ACCOUNTS_BUCKET}" \
    --location="${REGION}" \
    --uniform-bucket-level-access \
    --project="${PROJECT_ID}"
fi

echo "Uploading ${ACCOUNTS_CSV} to ${ACCOUNTS_URI}..."
gcloud storage cp "${ACCOUNTS_CSV}" "${ACCOUNTS_URI}"

echo "Granting Cloud Run runtime service account access to ${ACCOUNTS_URI}..."
gcloud storage buckets add-iam-policy-binding "gs://${ACCOUNTS_BUCKET}" \
  --member="serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
  --role="roles/storage.objectViewer" \
  --project="${PROJECT_ID}" >/dev/null

echo "Building and pushing ${IMAGE_URI}..."
gcloud builds submit \
  --tag="${IMAGE_URI}" \
  --project="${PROJECT_ID}" \
  .

echo "Deploying Cloud Run Job ${JOB_NAME}..."
gcloud run jobs deploy "${JOB_NAME}" \
  --image="${IMAGE_URI}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --service-account="${RUNTIME_SERVICE_ACCOUNT}" \
  --tasks=1 \
  --parallelism=1 \
  --max-retries=0 \
  --task-timeout=30m \
  --cpu=2 \
  --memory=2Gi \
  --set-env-vars="CI=1,ADOBE_ACCOUNTS_CSV=/tmp/accounts.csv,ADOBE_ACCOUNTS_GCS_URI=${ACCOUNTS_URI}"

echo "Executing ${JOB_NAME}; watch logs for: Login flow completed successfully"
gcloud run jobs execute "${JOB_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --wait
