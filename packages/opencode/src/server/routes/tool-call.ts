import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Session } from "../../session"
import { ToolRegistry } from "../../tool/registry"
import { Agent } from "../../agent/agent"
import { Log } from "../../util/log"
import { errors } from "../error"
import { lazy } from "../../util/lazy"

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
      const sessionID = c.req.valid("param").sessionID
      const { name, arguments: args } = c.req.valid("json")

      // Validate session exists (throws NotFoundError → 404 via error handler)
      await Session.get(sessionID)

      // Resolve agent name → Agent.Info so ToolRegistry receives the correct type
      const agentName = await Agent.defaultAgent()
      const agentInfo = await Agent.get(agentName)
      const modelCtx = agentInfo?.model ?? { providerID: "opencode", modelID: "default" }
      const tools = await ToolRegistry.tools(modelCtx, agentInfo)

      const tool = tools.find((t) => t.id === name)
      if (!tool) {
        return c.json({
          content: [{ type: "text" as const, text: `unknown tool: ${name}` }],
          isError: true,
        })
      }

      try {
        const abortController = new AbortController()
        const messages = await Session.messages({ sessionID })

        const result = await tool.execute(args, {
          sessionID,
          messageID: "tool-call-direct",
          agent: agentName,
          abort: abortController.signal,
          messages,
          metadata() {},
          async ask() {},
        })

        log.info("tool executed", {
          sessionID,
          tool: name,
          title: result.title,
        })

        return c.json({
          content: [{ type: "text" as const, text: result.output }],
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        log.error("tool execution failed", {
          error: err,
          sessionID,
          tool: name,
        })
        return c.json({
          content: [{ type: "text" as const, text: message }],
          isError: true,
        })
      }
    },
  ),
)
