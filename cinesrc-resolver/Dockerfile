# cinesrc-resolver — needs real Chrome, so it ships as a container (or any
# VPS with Chrome + Node 20). Build: docker build -t cinesrc-resolver .
# Run:   docker run -p 3100:3100 cinesrc-resolver
FROM node:20-slim

# Google Chrome stable (puppeteer-core drives the system binary).
RUN apt-get update \
  && apt-get install -y --no-install-recommends wget gnupg ca-certificates \
  && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - \
  && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends google-chrome-stable \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3100 \
    CHROME_PATH=/usr/bin/google-chrome

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js ./

EXPOSE 3100
CMD ["node", "server.js"]
