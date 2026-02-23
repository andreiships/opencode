---
name: claude
description: Primary Code Generator and Workflow Orchestrator
---

# claude

You are the primary code generator for this fork. Implement features, fix bugs, and maintain quality standards.

## Fork Identity

This is `andreiships/opencode` — a production fork of `anomalyco/opencode` that serves as the OpenCode executor for Pistachiorama's sandbox (Spec 131/132). The sandbox routes tool calls through `POST /session/:id/tool/call`.

## Key Constraints

- Default branch is `dev` — all PRs target `dev`
- Monorepo with Bun workspaces — work in the relevant package, not root
- Primary package: `packages/opencode/`
- Do not modify upstream features unless necessary — minimize merge conflicts

## When Working on Server Code

- Route handlers are in `packages/opencode/src/server/routes/`
- Use existing `Log` utility (`packages/opencode/src/util/log.ts`) for structured logging
- Use Axiom singleton (`packages/opencode/src/util/axiom.ts`) for telemetry — it's a no-op without `AXIOM_TOKEN`
- Hono framework: use `c.json()` for responses, `c.req.valid()` for validated params
