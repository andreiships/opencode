const AXIOM_URL = "https://api.axiom.co/v1/datasets"

/**
 * Ingest events into an Axiom dataset.
 * No-op when AXIOM_TOKEN is not set (local dev, testing, CI).
 */
export function ingest(dataset: string, events: Record<string, unknown>[]): void {
  // Read at call time so tests can set process.env.AXIOM_TOKEN after import
  const AXIOM_TOKEN = process.env.AXIOM_TOKEN
  if (!AXIOM_TOKEN) return

  // Fire-and-forget: send without awaiting to avoid blocking the request path
  const ndjson = events.map((e) => JSON.stringify(e)).join("\n")
  fetch(`${AXIOM_URL}/${dataset}/ingest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AXIOM_TOKEN}`,
      "Content-Type": "application/x-ndjson",
    },
    body: ndjson,
  }).catch(() => {
    // Telemetry is best-effort — never surface errors to callers
  })
}
