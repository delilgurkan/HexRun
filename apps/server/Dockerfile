# HexRun API — çok aşamalı derleme. Kökten derlenir: docker build -f apps/server/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/contracts/package.json packages/contracts/
COPY apps/server/package.json apps/server/
RUN npm ci --workspaces --include-workspace-root
COPY packages packages
COPY apps/server apps/server
RUN npm run build -w @hexrun/core && npm run build -w @hexrun/contracts && npm run build -w @hexrun/server

FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/contracts/package.json packages/contracts/
COPY apps/server/package.json apps/server/
RUN npm ci --omit=dev --workspaces --include-workspace-root

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=build /app/packages/core/package.json packages/core/
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/contracts/package.json packages/contracts/
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/migrations apps/server/migrations
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/server/dist/server.js"]
