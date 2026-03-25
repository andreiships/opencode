---
priority: high
---

# Ubicloud Runners

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
