FROM node:20-alpine

WORKDIR /app

# Dependências
COPY package*.json ./
RUN npm ci --only=production

# Código
COPY src/ ./src/
COPY uploads/.gitkeep ./uploads/

# Porta
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

# Start
CMD ["node", "src/server.js"]
