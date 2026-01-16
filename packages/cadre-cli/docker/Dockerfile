# Sereus Cadre Node Docker Image
# Multi-stage build for minimal production image

# ============================================================================
# Stage 1: Build
# ============================================================================
FROM node:22-alpine AS build

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy workspace root files for monorepo setup
COPY package.json package-lock.json ./
COPY packages/cadre-core/package.json packages/cadre-core/
COPY packages/cadre-cli/package.json packages/cadre-cli/

# Install all dependencies
RUN npm ci --ignore-scripts

# Copy source files
COPY packages/cadre-core/src packages/cadre-core/src
COPY packages/cadre-core/tsconfig.json packages/cadre-core/tsconfig.build.json packages/cadre-core/

COPY packages/cadre-cli/src packages/cadre-cli/src
COPY packages/cadre-cli/tsconfig.json packages/cadre-cli/tsconfig.build.json packages/cadre-cli/

# Build packages
RUN npm run build -w @sereus/cadre-core
RUN npm run build -w @sereus/cadre-cli

# ============================================================================
# Stage 2: Production
# ============================================================================
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup -S cadre && adduser -S cadre -G cadre

# Copy built packages and production dependencies
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/cadre-core/dist ./packages/cadre-core/dist
COPY --from=build /app/packages/cadre-core/package.json ./packages/cadre-core/
COPY --from=build /app/packages/cadre-cli/dist ./packages/cadre-cli/dist
COPY --from=build /app/packages/cadre-cli/package.json ./packages/cadre-cli/

# Copy entrypoint script
COPY packages/cadre-cli/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create data directory
RUN mkdir -p /data && chown -R cadre:cadre /data

# Volumes for persistent data
VOLUME ["/data"]

# Default ports: libp2p (4001), health check (8080), metrics (9090)
EXPOSE 4001/tcp 8080/tcp 9090/tcp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:8080/health || exit 1

# Switch to non-root user
USER cadre

# Set default environment variables
ENV DATA_DIR=/data \
    CADRE_PROFILE=storage \
    CADRE_STORAGE_TYPE=file \
    CADRE_STORAGE_PATH=/data/storage \
    CADRE_LISTEN_ADDRS=/ip4/0.0.0.0/tcp/4001 \
    CADRE_HEALTH_PORT=8080 \
    CADRE_METRICS_PORT=9090 \
    CADRE_HIBERNATION_ENABLED=true

ENTRYPOINT ["/entrypoint.sh"]
CMD ["start"]

