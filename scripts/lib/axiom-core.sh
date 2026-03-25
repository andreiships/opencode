#!/bin/bash
# Axiom Core Logging Library
# Provides base infrastructure for all Axiom logging

# Guard against re-sourcing
[[ -n "${_AXIOM_CORE_LOADED:-}" ]] && return 0
_AXIOM_CORE_LOADED=1

# =============================================================================
# Environment Loading
# =============================================================================

_load_env() {
  # Skip .env loading if AXIOM_SKIP_ENV=1 (used by tests for hermetic behavior)
  [[ "${AXIOM_SKIP_ENV:-0}" == "1" ]] && return 0

  local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # Fix for #1217: Move pipefail toggle inside subshell to prevent SIGPIPE (exit 141)
  # when head closes pipe early. Pattern based on codex-review-merged.sh:101-103
  local main_repo
  main_repo="$(set +o pipefail; git -C "$script_dir" worktree list --porcelain 2>/dev/null | head -n 1 | sed 's/^worktree //' || true)"
  if [[ -n "$main_repo" && -f "$main_repo/.env" ]]; then
    set -a
    source "$main_repo/.env"
    set +a
  fi
}
_load_env

# =============================================================================
# Dataset Auto-Selection (CI vs Local)
# =============================================================================

if [[ -n "${CI:-}" || -n "${GITHUB_ACTIONS:-}" ]]; then
  AXIOM_DATASET="${AXIOM_DATASET:-ci-metrics}"
else
  AXIOM_DATASET="${AXIOM_DATASET:-dev-tools}"
fi

AXIOM_INGEST_URL="https://api.axiom.co/v1/datasets/${AXIOM_DATASET}/ingest"

# =============================================================================
# Timing Utilities
# =============================================================================

get_millis() {
  if command -v gdate >/dev/null 2>&1; then
    gdate +%s%3N
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import time; print(int(time.time() * 1000))'
  else
    echo $(($(date +%s) * 1000))
  fi
}

# =============================================================================
# Core Logging Function
# =============================================================================

# Usage: log_axiom_event <json_payload> [async]
# async: if "true", fire-and-forget (for hooks)
log_axiom_event() {
  local payload="$1"
  local async="${2:-false}"

  # Skip in test/validation mode to prevent metric pollution
  # Set AXIOM_TEST_MODE=1 in manual validation scripts or test workflows
  # Check this FIRST to avoid spurious warnings in test environments
  if [[ "${AXIOM_TEST_MODE:-}" == "1" ]]; then
    return 0
  fi

  # Skip if no token
  if [[ -z "${AXIOM_TOKEN:-}" ]]; then
    echo "⚠️  AXIOM_TOKEN not set - skipping log" >&2
    return 0
  fi

  # Check dependencies
  if ! command -v curl >/dev/null 2>&1; then
    echo "⚠️  curl not available - skipping log" >&2
    return 0
  fi

  if [[ "$async" == "true" ]]; then
    # Fire-and-forget for hooks (non-blocking)
    (curl -s -X POST "$AXIOM_INGEST_URL" \
      -H "Authorization: Bearer ${AXIOM_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$payload" &>/dev/null &) 2>/dev/null
    return 0
  fi

  # Synchronous with retries
  local http_code
  http_code=$(curl -s -X POST "$AXIOM_INGEST_URL" \
    -H "Authorization: Bearer ${AXIOM_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    --retry 3 \
    --retry-delay 1 \
    --retry-all-errors \
    -w "%{http_code}" \
    -o /dev/null 2>&1 || echo "000")

  if [[ "$http_code" != "200" && "$http_code" != "204" ]]; then
    echo "⚠️  Failed to ship logs (HTTP ${http_code})" >&2
    return 0  # Fail-soft
  fi
}

# Usage: echo '<json_payload>' | log_axiom_event_stdin
# Reads JSON from stdin to avoid shell escaping issues
log_axiom_event_stdin() {
  local payload
  payload=$(cat)
  log_axiom_event "$payload"
}

# =============================================================================
# Sampling Utilities
# =============================================================================

# Usage: should_sample <rate>
# Returns 0 (true) if this event should be sampled, 1 (false) otherwise
# rate: integer 1-100 representing percentage (e.g., 10 = 10%)
should_sample() {
  local rate="${1:-10}"
  # Validate rate is numeric, default to 10 if not
  if ! [[ "$rate" =~ ^[0-9]+$ ]]; then
    rate=10
  fi
  # Clamp to 0-100 range
  (( rate > 100 )) && rate=100
  (( rate < 0 )) && rate=0
  local random_val=$((RANDOM % 100))
  [[ $random_val -lt $rate ]]
}

# Usage: log_axiom_event_sampled <json_payload> <sample_rate> [async]
# Logs event only if sampled (for high-volume events like allows)
log_axiom_event_sampled() {
  local payload="$1"
  local sample_rate="${2:-10}"
  local async="${3:-false}"

  if should_sample "$sample_rate"; then
    log_axiom_event "$payload" "$async"
  fi
}
