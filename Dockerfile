FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Cloud Run sets PORT env var automatically
ENV PORT=8080
EXPOSE 8080

CMD ["npx", "tsx", "server.ts"]
