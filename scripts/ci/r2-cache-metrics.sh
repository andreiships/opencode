#!/usr/bin/env bash
# r2-cache-metrics.sh - Emit R2 cache telemetry events to Axiom
# Intended to be sourced (not executed directly).
#
# Usage: source scripts/ci/r2-cache-metrics.sh
#        emit_r2_cache_event "r2_cache_restore" "lint-typecheck/abc/def" 200 150 "lint-typecheck/abc/def"
#
# Environment Variables:
#   AXIOM_TOKEN - Axiom API token (required for actual shipping)
#   AXIOM_DATASET - Axiom dataset name (default: ci-metrics)
#   GITHUB_RUN_ID - GitHub Actions run ID
#   GITHUB_WORKFLOW - GitHub Actions workflow name
#   GITHUB_JOB - GitHub Actions job name
#   GITHUB_REF_NAME - Branch name
#   GITHUB_SHA - Commit SHA
#   GITHUB_SERVER_URL - GitHub server URL
#   GITHUB_REPOSITORY - Repository owner/name

# Set dataset before sourcing axiom-core (it constructs AXIOM_INGEST_URL on load)
export AXIOM_DATASET="${AXIOM_DATASET:-ci-metrics}"

# Source Axiom logging library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/axiom-core.sh"

# Emit an R2 cache telemetry event
# Args:
#   $1 - event name (r2_cache_restore, r2_cache_miss, r2_cache_save, r2_cache_error)
#   $2 - cache key
#   $3 - HTTP status code
#   $4 - duration in milliseconds
#   $5 - matched key (optional, for prefix restore)
#   $6 - size in bytes (optional)
emit_r2_cache_event() {
  local event="$1"
  local key="$2"
  local http_code="${3:-0}"
  local duration_ms="${4:-0}"
  local matched_key="${5:-}"
  local size_bytes="${6:-0}"

  local timestamp run_url
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  run_url="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-unknown/unknown}/actions/runs/${GITHUB_RUN_ID:-0}"

  local payload
  payload=$(jq -n \
    --arg event "$event" \
    --arg timestamp "$timestamp" \
    --arg repository "${GITHUB_REPOSITORY:-unknown/unknown}" \
    --arg workflow "${GITHUB_WORKFLOW:-unknown}" \
    --arg job "${GITHUB_JOB:-unknown}" \
    --arg run_id "${GITHUB_RUN_ID:-0}" \
    --arg run_url "$run_url" \
    --arg branch "${GITHUB_REF_NAME:-unknown}" \
    --arg commit "${GITHUB_SHA:-unknown}" \
    --arg key "$key" \
    --argjson http_code "$http_code" \
    --argjson duration_ms "$duration_ms" \
    --arg matched_key "$matched_key" \
    --argjson size_bytes "$size_bytes" \
    '[{
      event: $event,
      timestamp: $timestamp,
      repository: $repository,
      workflow: $workflow,
      job: $job,
      run_id: $run_id,
      run_url: $run_url,
      branch: $branch,
      commit: $commit,
      key: $key,
      http_code: $http_code,
      duration_ms: $duration_ms,
      matched_key: $matched_key,
      size_bytes: $size_bytes
    }]')

  log_axiom_event "$payload"
}
