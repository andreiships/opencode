# Dockerfile for pistachiorama-opencode (Fly.io deployment)
#
# Multi-stage build: installs dependencies, builds the native binary,
# then copies it to a minimal alpine image with runtime dependencies.

# ---------------------------------------------------------------------------
# Stage 1: Build
# ---------------------------------------------------------------------------
FROM oven/bun:1.3.9-alpine AS builder

WORKDIR /app

# Install build dependencies (needed for native modules like tree-sitter)
RUN apk add --no-cache python3 make g++ git

# Copy workspace root manifests first for layer caching
COPY package.json bun.lock ./
COPY patches/ patches/
# Copy all packages upfront so bun can resolve the full workspace graph.
# Individual package.json enumeration is fragile (upstream adds packages often).
COPY packages/ packages/

# Install all dependencies
RUN bun install

# Copy full source
COPY . .

# Build the native binary for the current platform (linux, single target)
# --single builds only for the current arch, --skip-install avoids re-fetching
# platform-specific packages (already installed above)
# OPENCODE_CHANNEL prevents the build script from calling `git branch` (no .git in Docker context)
ENV OPENCODE_CHANNEL=latest
RUN cd packages/opencode && bun run script/build.ts --single --skip-install

# Find the built binary (name varies by arch)
RUN set -e; \
    binary="$(find packages/opencode/dist -name opencode -type f | head -1)"; \
    [ -n "$binary" ] || { echo "ERROR: built binary not found in packages/opencode/dist"; exit 1; }; \
    cp "$binary" /usr/local/bin/opencode \
    && chmod +x /usr/local/bin/opencode

# ---------------------------------------------------------------------------
# Stage 2: Runtime
# ---------------------------------------------------------------------------
FROM alpine:3.21

# Runtime dependencies for the compiled binary
RUN apk add --no-cache libgcc libstdc++ ripgrep git

# Copy the compiled binary
COPY --from=builder /usr/local/bin/opencode /usr/local/bin/opencode

# Verify the binary works
RUN opencode --version

# Create data directory for persistence (mounted volume on Fly)
RUN mkdir -p /root/.config/opencode

EXPOSE 8080

# Start the headless server on 0.0.0.0:8080
# The DO's SandboxMcpExecutor connects to this endpoint
ENTRYPOINT ["opencode"]
CMD ["serve", "--port", "8080", "--hostname", "0.0.0.0"]
