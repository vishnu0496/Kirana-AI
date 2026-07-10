FROM node:24-slim

WORKDIR /app

# Zero runtime dependencies — no npm install needed at all.
COPY . .

# Local JSON store lives here — mount a volume to persist it.
ENV DATA_DIR=/app/data
VOLUME /app/data

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.ts"]
