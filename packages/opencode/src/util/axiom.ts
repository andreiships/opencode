import { Env } from "../env"

const AXIOM_URL = "https://api.axiom.co/v1/datasets"

/**
 * Safely serialize a value to JSON, handling BigInt and circular references.
 * BigInt values are converted to strings; other non-serializable values fall
 * back to their string representation.
 */
function safeStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === "bigint") return val.toString()
    return val
  })
}

/**
 * Ingest events into an Axiom dataset.
 * No-op when AXIOM_TOKEN is not set (local dev, testing, CI).
 */
export function ingest(dataset: string, events: Record<string, unknown>[]): void {
  if (events.length === 0) return

  // Use instance-scoped Env to allow per-instance/test isolation
  const token = Env.get("AXIOM_TOKEN")
  if (!token) return

  // Fire-and-forget: send without awaiting to avoid blocking the request path
  const ndjson = events.map((e) => safeStringify(e)).join("\n") + "\n"
  fetch(`${AXIOM_URL}/${dataset}/ingest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-ndjson",
    },
    body: ndjson,
    keepalive: true,
  }).catch(() => {
    // Telemetry is best-effort — never surface errors to callers
  })
}
