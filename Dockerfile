# ---- base stage ----
FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

# ---- build stage ----
FROM base AS builder

ENV NODE_ENV=production
ENV NEXT_PUBLIC_BASE_URL=__NEXT_PUBLIC_BASE_URL__
ENV OAUTH_CLIENT_ID=__OAUTH_CLIENT_ID__
ENV OAUTH_CLIENT_SECRET=__OAUTH_CLIENT_SECRET__

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

# ---- runner stage ----
FROM base AS runner

WORKDIR /app

COPY --from=builder /app .

EXPOSE 3001

ENTRYPOINT ["./entrypoint.sh"]
CMD ["pnpm", "start"]
