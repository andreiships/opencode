# Dockerfile for pistachiorama-opencode (Fly.io deployment)
#
# Multi-stage build: installs dependencies, builds the native binary,
# then copies it to a minimal Debian image with runtime dependencies.
# Using Debian (glibc) so the extracted binary is also compatible with
# the sprite's Ubuntu 25.04 environment (Services API bootstrap).

# ---------------------------------------------------------------------------
# Stage 1: Build
# ---------------------------------------------------------------------------
FROM oven/bun:1.3.9-debian AS builder

WORKDIR /app

# Install build dependencies (needed for native modules like tree-sitter)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ git && rm -rf /var/lib/apt/lists/*

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
FROM debian:bookworm-slim

# Runtime dependencies for the compiled binary
RUN apt-get update && apt-get install -y --no-install-recommends libgcc-s1 libstdc++6 ripgrep git ca-certificates && rm -rf /var/lib/apt/lists/*

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
