# syntax=docker/dockerfile:1

# ---------- Build the frontend ----------
FROM node:20-alpine AS frontend-builder
WORKDIR /app/new_frontend
COPY new_frontend/package*.json ./
RUN npm ci --legacy-peer-deps
COPY new_frontend/ ./
RUN npm run build

# ---------- Install backend runtime dependencies ----------
FROM node:20-alpine AS backend-deps
WORKDIR /app/backend
COPY backend/package*.json ./
# sequelize-cli is a runtime dependency here because migrations run at container start.
RUN npm ci --omit=dev

# ---------- Runtime ----------
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

# tini gives us a real init: it reaps zombies and, crucially, forwards SIGTERM so the
# app's graceful-shutdown handlers actually run on `docker stop`.
RUN apk add --no-cache tini

COPY --from=frontend-builder /app/new_frontend/out /app/frontend/build
COPY --from=backend-deps /app/backend/node_modules /app/backend/node_modules
COPY backend/ /app/backend/

# Drop privileges. The node image already ships an unprivileged `node` user.
RUN chown -R node:node /app
USER node

WORKDIR /app/backend

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
# `exec` on the last command makes Node PID 1 of the shell, so signals reach it.
# Production runs `node`, not nodemon: nodemon survives a crashed app, which hides
# failures from Docker's restart policy and health check.
CMD ["sh", "-c", "node wait-db.js && npx sequelize-cli db:migrate && exec node src/index.js"]
