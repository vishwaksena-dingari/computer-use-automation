# Playwright image includes Chromium + OS deps for headless replay.
FROM mcr.microsoft.com/playwright:v1.63.0-jammy

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

ENV CUA_LOG=info
# Compose service hostname "mock"; CLI --base-url overrides config.yaml localhost.
ENV TARGET_HINT=http://mock:4173

CMD ["npm", "run", "demo:slice"]
