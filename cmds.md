# Commands for Local + Server Batch Runs (Project: `new-adobe-type-496209`)

This runbook keeps the existing flow and uses only env/config knobs already in the repo.

## 1) Local verification with first 100 accounts

```powershell
Set-Location "C:\Users\Vishal Vats\Downloads\Playwright-TS"

$env:ADOBE_ACCOUNTS_CSV="accounts.csv"
$env:ADOBE_SCRIPT_ACCOUNT_LIMIT="100"
$env:ADOBE_STOP_AFTER_LOGIN="1"
$env:ADOBE_PLAYWRIGHT_WORKERS="2"
$env:ADOBE_SSL_BYPASS="1"
$env:ADOBE_EMAIL_TYPE_DELAY_MS="12"
$env:ADOBE_PROVIDER_KEYPRESS_DELAY_MS="250"

npm run test:adobe
```

Optional (force stable browser timezone across local/server):

```powershell
$env:TZ="Asia/Kolkata"
```

## 2) Server verification with first 100 accounts (Cloud Run Job)

Run from Cloud Shell or Linux shell:

```bash
cd ~/Playwright-TS
gcloud config set project new-adobe-type-496209

export PROJECT_ID=new-adobe-type-496209
export REGION=asia-south1

export ACCOUNTS_CSV=accounts.csv
export OBJECT_NAME=verify-100.csv

export TASKS=5
export PARALLELISM=5
export ADOBE_SCRIPT_ACCOUNT_LIMIT=20
export ADOBE_PLAYWRIGHT_WORKERS=1
export ADOBE_SSL_BYPASS=1
export ADOBE_STOP_AFTER_LOGIN=1
export ADOBE_EMAIL_TYPE_DELAY_MS=12
export ADOBE_PROVIDER_KEYPRESS_DELAY_MS=250

export CPU=2
export MEMORY=2Gi
export TASK_TIMEOUT=2h
export TOTAL_ACCOUNTS=100
export AVG_SECONDS_PER_ACCOUNT=90

bash scripts/deploy-gcp-cloud-run-job.sh
```

After execution, capture timing:

```bash
gcloud run jobs executions list --job=adobe-login-flow --region=asia-south1 --project=new-adobe-type-496209
```

## 3) 20k production execution in batches

Use built-in batch launcher. It splits CSV and runs multiple Cloud Run jobs in parallel.

```bash
cd ~/Playwright-TS
gcloud config set project new-adobe-type-496209

export PROJECT_ID=new-adobe-type-496209
export REGION=asia-south1
export INPUT_CSV=accounts.csv
export TOTAL_ACCOUNTS=20000
export BATCH_SIZE=5000

export CPU=2
export MEMORY=8Gi
export PARALLELISM=1
export ADOBE_PLAYWRIGHT_WORKERS=2
export ADOBE_SSL_BYPASS=1
export ADOBE_SCRIPT_ACCOUNT_LIMIT=21
export ADOBE_STOP_AFTER_LOGIN=1
export TASK_TIMEOUT=8h
export AVG_SECONDS_PER_ACCOUNT=90

bash scripts/run-cloud-run-account-batches.sh
```

## 4) Throughput tuning to meet 20k in 8 hours

Target formula:

```text
required_concurrency = total_accounts * avg_seconds_per_account / target_seconds
```

For 20,000 accounts in 8h (`28,800s`):

```text
required_concurrency ~= 20000 * avg_seconds_per_account / 28800
```

Examples:

```text
30 sec/account -> ~21 concurrent browsers
60 sec/account -> ~42 concurrent browsers
90 sec/account -> ~63 concurrent browsers
```

In this repo:

```text
active_concurrency = PARALLELISM * ADOBE_PLAYWRIGHT_WORKERS
```

Increase `PARALLELISM` first, then `ADOBE_PLAYWRIGHT_WORKERS` only if CPU/memory headroom exists.
