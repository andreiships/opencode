---
priority: high
---

# Server Architecture

This fork adds a production HTTP server that Pistachiorama's sandbox uses for tool execution.

## Key Entry Points

| File                                               | Purpose                                                        |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `packages/opencode/src/server/server.ts`           | Hono app, CORS, auth, request logging                          |
| `packages/opencode/src/server/routes/tool-call.ts` | `POST /session/:id/tool/call` — direct tool execution          |
| `packages/opencode/src/server/routes/session.ts`   | Session CRUD, chat, abort                                      |
| `packages/opencode/src/util/log.ts`                | Custom logger (writes to stderr/file)                          |
| `packages/opencode/src/util/axiom.ts`              | Axiom telemetry singleton (graceful no-op without AXIOM_TOKEN) |

## Deployment

- **Runtime**: Docker (multi-stage Bun build → Alpine)
- **Platform**: Fly.io app `pistachiorama-opencode`, region `sjc`, `performance-2x` VM
- **Port**: 8080 (`opencode serve --port 8080 --hostname 0.0.0.0`)
- **Registry**: `registry.fly.io/pistachiorama-opencode`
- **Auto-stop/start**: Enabled — min 1 machine running (avoids cold starts)

## CI/CD

- **Docker build+push**: On `v*` tag push via `.github/workflows/build-push.yml`
- **Tests**: `.github/workflows/test.yml` on PR/push to `dev`
- **Type check**: `.github/workflows/typecheck.yml` on PR/push to `dev`
- **Lint**: `.github/workflows/ci.yml` on PR/push to `dev` (also has `ci-pass` aggregation job)

## Connection Context

The Pistachiorama Rust Durable Object connects server-to-server via `fetch()` — no browser in the loop. CORS is therefore irrelevant for the sandbox→OpenCode connection. The existing CORS config (localhost + opencode.ai domains) is correct and intentional.

## Git Workflow

- Default branch: `dev`
- All PRs target `dev`
- Never commit directly to `dev`
- Create worktrees for feature branches
