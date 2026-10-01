# Augmont report webapp — container image
# puppeteer-core drives the system Chromium installed below (no bundled download).
FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# Chromium + the shared libraries headless Chrome needs to start.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-liberation \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# render.js checks BROWSER_PATH first when locating a browser.
ENV BROWSER_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app

COPY webapp/package.json webapp/package-lock.json ./
RUN npm ci --omit=dev

COPY webapp/ ./

EXPOSE 3000
CMD ["node", "server.js"]
