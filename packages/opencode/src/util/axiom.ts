import { Env } from "../env"

const AXIOM_URL = "https://api.axiom.co/v1/datasets"

/**
 * Ingest events into an Axiom dataset.
 * No-op when AXIOM_TOKEN is not set (local dev, testing, CI).
 * Fully best-effort: never throws, never blocks the caller.
 */
export function ingest(dataset: string, events: Record<string, unknown>[]): void {
  if (events.length === 0) return

  // Use instance-scoped Env to allow per-instance/test isolation
  const token = Env.get("AXIOM_TOKEN")
  if (!token) return

  // Fire-and-forget: send without awaiting to avoid blocking the request path
  // Serialization and fetch are both wrapped in try/catch to guarantee
  // telemetry failures never surface to callers.
  try {
    // JSON.stringify with BigInt handler; circular refs will throw and be caught below
    const replacer = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v)
    const ndjson = events.map((e) => JSON.stringify(e, replacer)).join("\n") + "\n"
    fetch(`${AXIOM_URL}/${dataset}/ingest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-ndjson",
      },
      body: ndjson,
      keepalive: true,
    }).catch(() => {
      // Telemetry is best-effort — never surface network errors to callers
    })
  } catch {
    // Telemetry is best-effort — never surface serialization errors to callers
  }
}
