FROM node:24-bookworm-slim
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @fitness/web build
EXPOSE 3000
CMD ["pnpm", "--filter", "@fitness/web", "start"]
