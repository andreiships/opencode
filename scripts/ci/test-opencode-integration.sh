#!/bin/bash
# Integration smoke test for the pistachiorama-opencode Fly deployment.
#
# Verifies that the headless OpenCode server is running and responds
# correctly to health checks and basic API requests.
#
# Usage:
#   OPENCODE_URL=https://pistachiorama-opencode.fly.dev ./scripts/ci/test-opencode-integration.sh
#
# Exit codes:
#   0 — all tests passed
#   1 — one or more tests failed

set -euo pipefail

BASE_URL="${OPENCODE_URL:-http://localhost:8080}"
PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "Running integration tests against ${BASE_URL}"
echo "============================================="

# ---------------------------------------------------------------------------
# Test 1: Health check
# ---------------------------------------------------------------------------
echo ""
echo "Test 1: GET /global/health"
HTTP_CODE=$(curl -sf -o /tmp/health-response.json -w "%{http_code}" "${BASE_URL}/global/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  HEALTHY=$(cat /tmp/health-response.json | grep -o '"healthy":true' || true)
  if [ -n "$HEALTHY" ]; then
    pass "Health check returned 200 with healthy:true"
  else
    fail "Health check returned 200 but body missing healthy:true"
  fi
else
  fail "Health check expected 200, got ${HTTP_CODE}"
fi

# ---------------------------------------------------------------------------
# Test 2: Unknown session returns 404
# ---------------------------------------------------------------------------
echo ""
echo "Test 2: GET /session/nonexistent-session-id"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/session/nonexistent-session-id" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "404" ]; then
  pass "Unknown session returned 404"
else
  fail "Unknown session expected 404, got ${HTTP_CODE}"
fi

# ---------------------------------------------------------------------------
# Test 3: Session list returns 200
# ---------------------------------------------------------------------------
echo ""
echo "Test 3: GET /session"
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "${BASE_URL}/session" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass "Session list returned 200"
else
  fail "Session list expected 200, got ${HTTP_CODE}"
fi

# ---------------------------------------------------------------------------
# Test 4: POST /session creates a new session
# ---------------------------------------------------------------------------
echo ""
echo "Test 4: POST /session"
HTTP_CODE=$(curl -s -o /tmp/session-create.json -w "%{http_code}" \
  -X POST "${BASE_URL}/session" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  SESSION_ID=$(cat /tmp/session-create.json | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
  if [ -n "$SESSION_ID" ]; then
    pass "Session creation returned 200 with id=${SESSION_ID}"
  else
    fail "Session creation returned 200 but no id in response"
  fi
else
  fail "Session creation expected 200, got ${HTTP_CODE}"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "============================================="
echo "Results: ${PASS} passed, ${FAIL} failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi

echo "Integration tests passed"
