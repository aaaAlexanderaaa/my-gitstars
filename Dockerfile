# Build stage for frontend
FROM node:20-alpine as frontend-builder
WORKDIR /app/new_frontend
COPY new_frontend/package*.json ./
RUN npm ci --legacy-peer-deps
COPY new_frontend/ ./
RUN npm run export

# Build stage for backend
FROM node:20-alpine as backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --legacy-peer-deps
COPY backend/ ./

# Final stage
FROM node:20-alpine
WORKDIR /app

# Copy built frontend and backend
COPY --from=frontend-builder /app/new_frontend/out /app/frontend/build
COPY --from=backend-builder /app/backend /app/backend

WORKDIR /app/backend

EXPOSE 4000

CMD ["sh", "-c", "node wait-db.js && npx sequelize-cli db:migrate && npx nodemon src/index.js"]
