FROM mcr.microsoft.com/playwright:v1.61.0-noble

# Install Google Cloud CLI for GCS access
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    apt-transport-https \
    ca-certificates \
  && curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | \
     gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
     > /etc/apt/sources.list.d/google-cloud-sdk.list \
  && apt-get update && apt-get install -y google-cloud-cli \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node deps without re-downloading Playwright browsers (already in base image)
COPY package.json ./
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install

COPY . .

ENTRYPOINT ["bash", "scripts/run-cloud-batch.sh"]
