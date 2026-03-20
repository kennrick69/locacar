FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Imagem final
FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/src/ ./src/

RUN mkdir -p /app/uploads/cars /app/uploads/documents /app/uploads/contracts /app/uploads/contratos /app/uploads/settlements /app/uploads/properties
COPY --from=frontend-build /app/frontend/dist ./public/

# Volume persistente — configure no Railway: Mount Path = /app/uploads
VOLUME ["/app/uploads"]

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s CMD wget -qO- http://localhost:3001/api/health || exit 1
CMD ["node", "src/server.js"]
