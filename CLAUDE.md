<!--
🤖 AI-RULEZ :: GENERATED FILE — DO NOT EDIT DIRECTLY
Project: opencode-fork
Generated: 2026-02-22 22:15:44
Source: .ai-rulez/config.yaml
Target: CLAUDE.md
Content: rules=5, sections=0, agents=1

WHAT IS AI-RULEZ
AI-Rulez is a directory-based AI governance tool. All configuration lives in
the .ai-rulez/ directory. This file is auto-generated from source files.

.AI-RULEZ FOLDER ORGANIZATION
Root content (always included):
  .ai-rulez/config.yaml    Main configuration (presets, profiles)
  .ai-rulez/rules/         Mandatory rules for AI assistants
  .ai-rulez/context/       Reference documentation
  .ai-rulez/skills/        Specialized AI prompts
  .ai-rulez/agents/        Agent definitions

Domain content (profile-specific):
  .ai-rulez/domains/{name}/rules/    Domain-specific rules
  .ai-rulez/domains/{name}/context/  Domain-specific documentation
  .ai-rulez/domains/{name}/skills/   Domain-specific AI prompts

Profiles in config.yaml control which domains are included.

INSTRUCTIONS FOR AI AGENTS
1. NEVER edit this file (CLAUDE.md) - it is auto-generated

2. ALWAYS edit files in .ai-rulez/ instead:
   - Add/modify rules: .ai-rulez/rules/*.md
   - Add/modify context: .ai-rulez/context/*.md
   - Update config: .ai-rulez/config.yaml
   - Domain-specific: .ai-rulez/domains/{name}/rules/*.md

3. PREFER using the MCP Server (if available):
   Command: npx -y ai-rulez@latest mcp
   Provides safe CRUD tools for reading and modifying .ai-rulez/ content

4. After making changes: ai-rulez generate

5. Complete workflow:
   a. Edit source files in .ai-rulez/
   b. Run: ai-rulez generate
   c. Commit both .ai-rulez/ and generated files

Documentation: https://github.com/Goldziher/ai-rulez
-->

# opencode-fork

OpenCode executor fork for the Pistachiorama sandbox (Spec 131/132)

## Rules

### bun-patterns

**Priority:** high

This repo uses Bun as the runtime, package manager, and test runner.

## Core Conventions (from upstream AGENTS.md)

- Use Bun-native APIs: `Bun.file()`, `Bun.serve()`, etc.
- Prefer `const` over `let`; use ternaries over reassignment
- Avoid `try/catch`, `any`, `else`, unnecessary destructuring
- Rely on type inference; avoid explicit annotations unless needed
- Use `tsgo --noEmit` for type checking (not `tsc`)

## Testing

- Run tests from package directory, not repo root: `cd packages/opencode && bun test`
- Root `package.json` test script intentionally errors — run per-package
- No mocks — test actual implementation against real behavior
- Test timeout: `--timeout 30000` (30 seconds)
- Coverage: `bun test --coverage` generates LCOV at `coverage/lcov.info`

## Package Management

- Bun workspace monorepo — `bun install` installs all packages
- Use `bun add <pkg>` to add dependencies (not npm/pnpm)
- `bun.lock` is the lockfile — commit it

## Commands

```bash
bun run dev                   # From packages/opencode/

cd packages/opencode && bun test --timeout 30000
cd packages/opencode && bun test --coverage

bun turbo typecheck           # All packages
cd packages/opencode && bunx tsgo --noEmit  # Single package

bunx prettier --check .       # Check
bunx prettier --write .       # Fix
```

### no-any-types

**Priority:** high

Never use `any` in TypeScript. Use specific types or `unknown` with type guards.
Prefer type inference over explicit annotations unless ambiguity would arise.

### security-no-secrets

**Priority:** critical

- NEVER output API keys or secrets
- NEVER read or output .env file contents
- Reference secrets by env var name only (e.g., `process.env.AXIOM_TOKEN`)
- Use .env.example for documentation
- Fly.io secrets are set via `fly secrets set` — never committed

### server-architecture

**Priority:** high

This fork adds a production HTTP server that Pistachiorama's sandbox uses for tool execution.

## Key Entry Points

| File | Purpose |
|------|---------|
| `packages/opencode/src/server/server.ts` | Hono app, CORS, auth, request logging |
| `packages/opencode/src/server/routes/tool-call.ts` | `POST /session/:id/tool/call` — direct tool execution |
| `packages/opencode/src/server/routes/session.ts` | Session CRUD, chat, abort |
| `packages/opencode/src/util/log.ts` | Custom logger (writes to stderr/file) |
| `packages/opencode/src/util/axiom.ts` | Axiom telemetry singleton (graceful no-op without AXIOM_TOKEN) |

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

### ubicloud-runners

**Priority:** high

Use Ubicloud runners for GitHub Actions, never `ubuntu-latest` for new workflows.

**Default**: `ubicloud-standard-2` for most jobs.
**Allowed variants**:
- `ubicloud-standard-{2,4,8}` — Standard x86
- `ubicloud-standard-{4,8}-arm` — ARM64 for cost savings

```yaml
jobs:
  example:
    runs-on: ubicloud-standard-2  # NOT ubuntu-latest
```

Note: No Windows or macOS Ubicloud runners — remove upstream Windows/macOS jobs when migrating workflows.

