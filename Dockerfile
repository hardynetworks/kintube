# ---- Build the web app ----
FROM node:22-bookworm-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---- Runtime: API + ffmpeg + built web app ----
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/src ./src
COPY --from=web /web/dist ./public

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    HLS_DIR=/hls \
    RECORDINGS_DIR=/recordings \
    NETBIRD_CTL_DIR=/netbird \
    WEB_DIR=/app/public

RUN mkdir -p /data /hls /recordings /netbird && chown -R node:node /data /hls /recordings /netbird
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/index.js"]
