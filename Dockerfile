FROM node:20-alpine

WORKDIR /app

# Copy package files first for better caching
COPY frontend/package*.json frontend/
COPY backend/package*.json backend/

# Install dependencies
RUN npm install -g react-scripts
RUN cd frontend && npm install --legacy-peer-deps
RUN cd backend && npm install --legacy-peer-deps

# Copy source code
COPY frontend/ frontend/
COPY backend/ backend/

# Build frontend
RUN cd frontend && npm run build

WORKDIR /app/backend

COPY backend/wait-for-db.sh .
RUN chmod +x wait-for-db.sh

EXPOSE 4000

CMD ["sh", "-c", "./wait-for-db.sh db && npx sequelize-cli db:migrate && npx nodemon src/index.js"] 