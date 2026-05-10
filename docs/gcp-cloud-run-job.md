# Run the Adobe Login Flow on GCP

Use a Cloud Run Job for this project. It runs the Playwright container once, prints `Login flow completed successfully` when the login flow reaches the current stop point, then exits.

## Prerequisites

- A Google Cloud project with billing enabled.
- Google Cloud Shell, or a machine with `gcloud` installed.
- An `accounts.csv` file with this format:

```csv
email,password
user@example.com,password
```

Do not commit `accounts.csv`. It is excluded from Git and from the Docker image.

## Deploy from Google Cloud Shell

1. Open Google Cloud Shell.
2. Clone or upload this repository.
3. Put `accounts.csv` in the repository root.
4. Select your project:

```bash
gcloud config set project YOUR_PROJECT_ID
```

5. Run the deploy script:

```bash
bash scripts/deploy-gcp-cloud-run-job.sh
```

The script will:

- Enable Cloud Run, Cloud Build, Artifact Registry, and Cloud Storage APIs.
- Create an Artifact Registry Docker repository named `playwright-jobs` if missing.
- Create a Cloud Storage bucket named `<project-id>-adobe-accounts` if missing.
- Upload `accounts.csv` to `gs://<project-id>-adobe-accounts/accounts.csv`.
- Grant the Cloud Run runtime service account read access to that bucket object.
- Build and push the Docker image.
- Create or update a Cloud Run Job named `adobe-login-flow`.
- Execute the job immediately.

## Optional Settings

Set these environment variables before running the script to override defaults:

```bash
export REGION=us-central1
export REPOSITORY=playwright-jobs
export IMAGE_NAME=adobe-login-flow
export JOB_NAME=adobe-login-flow
export ACCOUNTS_BUCKET=new-adobe-type-adobe-accounts
export OBJECT_NAME=accounts.csv
export ACCOUNTS_CSV=accounts.csv
```

If your project uses a custom Cloud Run service account:

```bash
export RUNTIME_SERVICE_ACCOUNT=my-service-account@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

## Check the Result

The deploy script waits for the job execution. In the Cloud Run execution logs, look for:

```text
Login flow completed successfully
```

You can re-run the job without rebuilding:

```bash
gcloud run jobs execute adobe-login-flow --region=us-central1 --wait
```

If you change code, run the deploy script again so a new image is built and deployed.

## Notes

- Cloud Run Job retries are set to `0` because this project treats accounts as consumable inputs.
- The job runs with one task and one worker by default.
- Runtime reports are created inside the container filesystem. They are visible in logs/artifacts during that execution, but not persisted after the container exits. Persisting reports to Cloud Storage would need a small follow-up change.

References:

- Cloud Run Jobs: https://cloud.google.com/run/docs/create-jobs
- Cloud Storage buckets: https://cloud.google.com/storage/docs/
- Artifact Registry Docker images: https://cloud.google.com/artifact-registry/docs/docker/store-docker-container-images
