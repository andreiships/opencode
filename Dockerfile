# Dockerfile for pistachiorama-opencode (Fly.io deployment)
#
# Multi-stage build: installs dependencies, builds the native binary,
# then copies it to a minimal alpine image with runtime dependencies.

# ---------------------------------------------------------------------------
# Stage 1: Build
# ---------------------------------------------------------------------------
FROM oven/bun:1.3.9-alpine AS builder

WORKDIR /app

# Receive version from CI build-arg; used by script/build.ts to resolve channel
ARG OPENCODE_VERSION
ENV OPENCODE_VERSION=$OPENCODE_VERSION

# Install build dependencies (needed for native modules like tree-sitter)
RUN apk add --no-cache python3 make g++ git

# Copy workspace root manifests and patches first for layer caching
COPY package.json bun.lock ./
COPY patches/ patches/
COPY packages/opencode/package.json packages/opencode/
COPY packages/script/package.json packages/script/
COPY packages/plugin/package.json packages/plugin/
COPY packages/sdk/js/package.json packages/sdk/js/
COPY packages/util/package.json packages/util/
COPY packages/slack/package.json packages/slack/

# Install all dependencies
RUN bun install

# Copy full source
COPY . .

# Build the native binary for the current platform (linux, single target)
# --single builds only for the current arch, --skip-install avoids re-fetching
# platform-specific packages (already installed above)
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
