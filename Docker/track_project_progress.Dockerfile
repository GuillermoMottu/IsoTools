# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:22-slim
ARG VITE_DASHBOARD_URL=""

FROM ${NODE_IMAGE} AS web
WORKDIR /demo-frontend

COPY demo-frontend/package.json demo-frontend/package-lock.json ./
RUN npm ci

COPY demo-frontend/ ./
ENV VITE_TOOL_ID=track_project_progress
RUN VITE_DASHBOARD_URL="${VITE_DASHBOARD_URL}" npm run build

FROM ${NODE_IMAGE} AS runtime
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV NODE_ENV=production
ENV WEB_DIST_DIR=/app/demo-frontend/dist
ENV TOOL_PAGE_ID=track_project_progress
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY db ./db
COPY src ./src
COPY --from=web /demo-frontend/dist ./demo-frontend/dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
