---
priority: critical
---

# Security - No Secrets

- NEVER output API keys or secrets
- NEVER read or output .env file contents
- Reference secrets by env var name only (e.g., `process.env.AXIOM_TOKEN`)
- Use .env.example for documentation
- Fly.io secrets are set via `fly secrets set` — never committed
