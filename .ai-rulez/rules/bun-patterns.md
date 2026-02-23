---
priority: high
---

# Bun Patterns

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
# Dev server
bun run dev                   # From packages/opencode/

# Tests
cd packages/opencode && bun test --timeout 30000
cd packages/opencode && bun test --coverage

# Type check
bun turbo typecheck           # All packages
cd packages/opencode && bunx tsgo --noEmit  # Single package

# Lint (Prettier)
bunx prettier --check .       # Check
bunx prettier --write .       # Fix
```
