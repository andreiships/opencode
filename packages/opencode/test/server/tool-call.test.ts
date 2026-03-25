import { describe, expect, test } from "bun:test"
import path from "path"
import { Session } from "../../src/session"
import { Log } from "../../src/util/log"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })

describe("POST /session/:sessionID/tool/call", () => {
  test("returns 404 when session does not exist", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const app = Server.createApp({})
        const response = await app.request("/session/ses_nonexistent123/tool/call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "read", arguments: { file_path: "/tmp/test.txt" } }),
        })
        expect(response.status).toBe(404)
      },
    })
  })

  test("returns 400 when request body is malformed", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const session = await Session.create({})
        try {
          const app = Server.createApp({})
          const response = await app.request(`/session/${session.id}/tool/call`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "not valid json{{{",
          })
          expect(response.status).toBe(400)
        } finally {
          await Session.remove(session.id)
        }
      },
    })
  })

  test("returns 200 with isError:true for unknown tool", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const session = await Session.create({})
        try {
          const app = Server.createApp({})
          const response = await app.request(`/session/${session.id}/tool/call`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "nonexistent_tool_xyz", arguments: {} }),
          })
          expect(response.status).toBe(200)
          const body = await response.json()
          expect(body.isError).toBe(true)
          expect(body.content).toBeArrayOfSize(1)
          expect(body.content[0].type).toBe("text")
          expect(body.content[0].text).toContain("nonexistent_tool_xyz")
        } finally {
          await Session.remove(session.id)
        }
      },
    })
  })

  test("returns 200 with content array for successful tool execution", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const session = await Session.create({})
        try {
          const app = Server.createApp({})
          // Use the glob tool which is simpler than bash (no permission prompts)
          const response = await app.request(`/session/${session.id}/tool/call`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "glob",
              arguments: { pattern: "package.json", path: projectRoot },
            }),
          })
          expect(response.status).toBe(200)
          const body = await response.json()
          expect(body.isError).toBeUndefined()
          expect(body.content).toBeArray()
          expect(body.content.length).toBeGreaterThanOrEqual(1)
          expect(body.content[0].type).toBe("text")
          expect(body.content[0].text.length).toBeGreaterThan(0)
        } finally {
          await Session.remove(session.id)
        }
      },
    })
  })
})
