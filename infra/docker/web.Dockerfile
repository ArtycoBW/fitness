FROM node:24-bookworm-slim
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate
WORKDIR /app
COPY . .
ARG API_URL=http://api:4000
ARG SITE_URL=http://localhost:3000
ENV API_URL=$API_URL
ENV SITE_URL=$SITE_URL
RUN pnpm install --frozen-lockfile && pnpm --filter @fitness/web build
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "@fitness/web", "start"]
