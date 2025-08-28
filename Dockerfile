# Build stage for frontend
FROM node:20-alpine as frontend-builder
WORKDIR /app/new_frontend
COPY new_frontend/package*.json ./
RUN npm install --legacy-peer-deps
COPY new_frontend/ ./
RUN npm run export

# Build stage for backend
FROM node:20-alpine as backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --legacy-peer-deps --production
COPY backend/ ./

# Final stage
FROM node:20-alpine
WORKDIR /app

# Install only the necessary global packages
RUN npm install -g sequelize-cli

# Copy built frontend and backend
COPY --from=frontend-builder /app/new_frontend/out /app/frontend/build
COPY --from=backend-builder /app/backend /app/backend
# Copy node_modules from backend builder
COPY --from=backend-builder /app/backend/node_modules /app/backend/node_modules

WORKDIR /app/backend

# Install only dev dependencies needed for running the server
RUN npm install nodemon --save-dev

EXPOSE 4000

CMD ["sh", "-c", "node wait-db.js && npx sequelize-cli db:migrate && npx nodemon src/index.js"] 