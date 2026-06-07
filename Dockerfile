FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public build-time configuration. NEXT_PUBLIC_* values are inlined at build.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CONSOLE_URL
ARG NEXT_PUBLIC_N8N_EDITOR_BASE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_CONSOLE_URL=$NEXT_PUBLIC_CONSOLE_URL \
    NEXT_PUBLIC_N8N_EDITOR_BASE_URL=$NEXT_PUBLIC_N8N_EDITOR_BASE_URL

ENV NEXT_TELEMETRY_DISABLED=1
# Force Node to prefer IPv4 — Next.js font loader (undici) defaults to IPv6,
# which is not routable in the Docker build network and causes font fetch to fail.
ENV NODE_OPTIONS=--dns-result-order=ipv4first

RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

RUN mkdir .next
RUN chown nextjs:nodejs .next

# Leverage Next.js standalone output to minimize image size.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 9001

ENV PORT=9001
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
