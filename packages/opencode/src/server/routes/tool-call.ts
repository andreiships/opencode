import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Session } from "../../session"
import { SessionID, MessageID } from "../../session/schema"
import { ProviderID, ModelID } from "../../provider/schema"
import { ToolRegistry } from "../../tool/registry"
import { Agent } from "../../agent/agent"
import { Log } from "../../util/log"
import { ingest } from "../../util/axiom"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { NamedError } from "@opencode-ai/util/error"

const log = Log.create({ service: "server.tool-call" })

const ToolCallRequest = z.object({
  name: z.string().meta({ description: "Tool name (e.g., 'read', 'glob', 'bash')" }),
  arguments: z.record(z.string(), z.any()).meta({ description: "Tool arguments as key-value pairs" }),
})

const ContentBlock = z.object({
  type: z.literal("text"),
  text: z.string(),
})

const ToolCallResponse = z.object({
  content: z.array(ContentBlock),
  isError: z.boolean().optional(),
})

export const ToolCallRoutes = lazy(() =>
  new Hono().post(
    "/:sessionID/tool/call",
    describeRoute({
      summary: "Execute tool directly",
      description:
        "Execute a tool directly within a session context, bypassing the LLM loop. Returns MCP-format content blocks.",
      operationId: "session.toolCall",
      responses: {
        200: {
          description: "Tool execution result in MCP content format",
          content: {
            "application/json": {
              schema: resolver(ToolCallResponse),
            },
          },
        },
        ...errors(400, 404),
      },
    }),
    validator(
      "param",
      z.object({
        sessionID: z.string().meta({ description: "Session ID" }),
      }),
    ),
    validator("json", ToolCallRequest),
    async (c) => {
      try {
      const sessionID = c.req.valid("param").sessionID
      const { name, arguments: args } = c.req.valid("json")

      // Validate session exists (throws NotFoundError → 404 via error handler)
      const sid = SessionID.make(sessionID)
      await Session.get(sid)

      // Resolve agent name → Agent.Info so ToolRegistry receives the correct type
      const agentName = await Agent.defaultAgent()
      const agentInfo = await Agent.get(agentName)
      const modelCtx = agentInfo?.model ?? { providerID: ProviderID.make("opencode"), modelID: ModelID.make("default") }
      const tools = await ToolRegistry.tools(modelCtx, agentInfo)

      // Base telemetry fields shared across all events
      const baseTelemetry = {
        session_id: sessionID,
        agent_name: agentName,
        provider_id: modelCtx.providerID,
        model_id: modelCtx.modelID,
      }

      const tool = tools.find((t) => t.id === name)
      if (!tool) {
        ingest("opencode-tool-calls", [
          {
            _time: new Date().toISOString(),
            ...baseTelemetry,
            tool_call_duration_ms: 0,
            tool_name: name,
            is_error: true,
            error_name: "UnknownToolError",
          },
        ])
        return c.json({
          content: [{ type: "text" as const, text: `unknown tool: ${name}` }],
          isError: true,
        })
      }

      const start = performance.now()
      let result: Awaited<ReturnType<typeof tool.execute>> | undefined
      let caughtErr: unknown

      try {
        const abortController = new AbortController()
        const messages = await Session.messages({ sessionID: sid })

        result = await tool.execute(args, {
          sessionID: sid,
          messageID: MessageID.make("tool-call-direct"),
          agent: agentName,
          abort: abortController.signal,
          messages,
          metadata() {},
          async ask() {},
        })
      } catch (err) {
        caughtErr = err
      } finally {
        const durationMs = Math.round(performance.now() - start)

        if (caughtErr !== undefined) {
          const errorName = caughtErr instanceof Error ? caughtErr.name : "Error"
          // Only include error_name in telemetry — not error_message to avoid
          // inadvertently forwarding sensitive content (paths, tokens, user data)
          // to third-party telemetry. Full error details remain in log.error.
          log.error("tool execution failed", {
            error: caughtErr,
            sessionID,
            tool: name,
            duration: durationMs,
          })
          ingest("opencode-tool-calls", [
            {
              _time: new Date().toISOString(),
              ...baseTelemetry,
              tool_call_duration_ms: durationMs,
              tool_name: name,
              is_error: true,
              error_name: errorName,
            },
          ])
        } else if (result !== undefined) {
          log.info("tool executed", {
            sessionID,
            tool: name,
            title: result.title,
            duration: durationMs,
          })
          ingest("opencode-tool-calls", [
            {
              _time: new Date().toISOString(),
              ...baseTelemetry,
              tool_call_duration_ms: durationMs,
              tool_name: name,
              tool_title: result.title,
              is_error: false,
            },
          ])
        }
      }

      if (caughtErr !== undefined) {
        const message = caughtErr instanceof Error ? caughtErr.message : String(caughtErr)
        return c.json({
          content: [{ type: "text" as const, text: message }],
          isError: true,
        })
      }

      // result must be defined here: the only paths are caughtErr (handled above)
      // or a successful tool.execute() call. Explicit guard makes this invariant clear.
      if (result === undefined) {
        return c.json({
          content: [{ type: "text" as const, text: "internal error: no result produced" }],
          isError: true,
        })
      }

      return c.json({
        content: [{ type: "text" as const, text: result.output }],
      })
      } catch (outerErr) {
        // Re-throw known errors so Hono's onError handler returns proper status codes
        // (e.g., NotFoundError → 404, ModelNotFoundError → 400)
        if (outerErr instanceof NamedError) throw outerErr
        const errorName = outerErr instanceof Error ? outerErr.name : "Error"
        const errorMessage = outerErr instanceof Error ? outerErr.message : String(outerErr)
        log.error("tool-call handler crash", { error: outerErr })
        ingest("opencode-tool-calls", [
          {
            _time: new Date().toISOString(),
            tool_call_duration_ms: 0,
            tool_name: "unknown",
            is_error: true,
            error_name: `OuterCatch:${errorName}`,
          },
        ])
        return c.json({
          content: [{ type: "text" as const, text: `tool-call handler error: ${errorMessage}` }],
          isError: true,
        })
      }
    },
  ),
)
