FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Local JSON store lives here — mount a volume to persist it.
ENV DATA_DIR=/app/data
VOLUME /app/data

ENV PORT=8080
EXPOSE 8080

CMD ["npx", "tsx", "server.ts"]
