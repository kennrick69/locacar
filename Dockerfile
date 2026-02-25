FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine

WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/src/ ./src/
RUN mkdir -p /app/uploads/cars /app/uploads/documents /app/uploads/contracts
COPY --from=frontend-build /app/frontend/dist ./public/

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8080/api/health || exit 1
CMD ["node", "src/server.js"]
