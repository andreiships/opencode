# Multi-stage build for OpenCode v1.3.2+
# Produces a single statically-linked opencode binary for linux/amd64.
#
# Build: docker build -t opencode .
# Extract binary: docker cp $(docker create opencode):/usr/local/bin/opencode ./opencode

# --- Builder stage ---
FROM ubuntu:24.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config git curl unzip xz-utils ca-certificates python3 \
    && rm -rf /var/lib/apt/lists/*

# Node.js v24.4.0 (required by upstream build system)
RUN curl -fsSL https://nodejs.org/dist/v24.4.0/node-v24.4.0-linux-x64.tar.xz | \
    tar -xJf - -C /usr/local --strip-components=1

# Bun v1.3.11 (pinned to match upstream)
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash

WORKDIR /build

# Copy dependency manifests first for layer caching
COPY package.json bun.lock bunfig.toml turbo.json ./
COPY patches/ patches/
COPY packages/ packages/

# Install dependencies
RUN bun install --exact

# Copy remaining source (invalidates cache less often)
COPY . .

# Build binary for current platform only (linux-x64)
RUN cd packages/opencode && bun run script/build.ts --single

# --- Runtime stage ---
FROM ubuntu:24.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/packages/opencode/dist/opencode-linux-x64/bin/opencode /usr/local/bin/opencode
RUN chmod +x /usr/local/bin/opencode

ENTRYPOINT ["opencode"]
