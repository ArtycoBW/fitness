FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm db:generate && pnpm --filter @fitness/api build
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
