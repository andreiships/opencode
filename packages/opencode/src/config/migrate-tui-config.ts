import path from "path"
import { applyEdits, modify, parse as parseJsonc } from "jsonc-parser"
import { unique } from "remeda"
import { Config } from "./config"
import { ConfigPaths } from "./paths"
import { Instance } from "@/project/instance"
import { Flag } from "@/flag/flag"
import { Log } from "@/util/log"
import { Global } from "@/global"

const log = Log.create({ service: "tui.migrate" })

const TUI_SCHEMA_URL = "https://opencode.ai/tui.json"

interface MigrateInput {
  directories: string[]
  custom?: string
  managed: string
}

/**
 * Migrates tui-specific keys (theme, keybinds, tui) from opencode.json files
 * into dedicated tui.json files. Migration is performed per-directory and
 * skips only locations where a tui.json already exists.
 */
export async function migrateTuiConfig(input: MigrateInput) {
  const opencode = await opencodeFiles(input)
  for (const file of opencode) {
    const source = await Bun.file(file)
      .text()
      .catch(() => undefined)
    if (!source) continue
    const data = parseJsonc(source)
    if (!data || typeof data !== "object" || Array.isArray(data)) continue

    const extracted = {
      theme: "theme" in data ? (data.theme as string | undefined) : undefined,
      keybinds: "keybinds" in data ? (data.keybinds as Record<string, unknown>) : undefined,
      tui:
        "tui" in data && data.tui && typeof data.tui === "object" && !Array.isArray(data.tui)
          ? (data.tui as Record<string, unknown>)
          : undefined,
    }
    if (!extracted.theme && !extracted.keybinds && !extracted.tui) continue

    const target = path.join(path.dirname(file), "tui.json")
    const targetExists = await Bun.file(target).exists()
    if (targetExists) continue

    const payload: Record<string, unknown> = {
      $schema: TUI_SCHEMA_URL,
    }
    if (extracted.theme) payload.theme = extracted.theme
    if (extracted.keybinds) payload.keybinds = extracted.keybinds
    if (extracted.tui) Object.assign(payload, extracted.tui)

    await backupAndStripLegacy(file, source)
    await Bun.write(target, JSON.stringify(payload, null, 2))
    log.info("migrated tui config", { from: file, to: target })
  }
}

async function backupAndStripLegacy(file: string, source: string) {
  const backup = file + ".tui-migration.bak"
  const hasBackup = await Bun.file(backup).exists()
  if (!hasBackup) {
    await Bun.write(backup, source)
  }

  const text = ["theme", "keybinds", "tui"].reduce((acc, key) => {
    const edits = modify(acc, [key], undefined, {
      formattingOptions: {
        insertSpaces: true,
        tabSize: 2,
      },
    })
    if (!edits.length) return acc
    return applyEdits(acc, edits)
  }, source)

  await Bun.write(file, text)
  log.info("stripped tui keys from server config", { path: file, backup })
}

async function opencodeFiles(input: { directories: string[]; managed: string }) {
  const project = Flag.OPENCODE_DISABLE_PROJECT_CONFIG
    ? []
    : await ConfigPaths.projectFiles("opencode", Instance.directory, Instance.worktree)
  const files = [...project, ...ConfigPaths.fileInDirectory(Global.Path.config, "opencode")]
  for (const dir of unique(input.directories)) {
    files.push(...ConfigPaths.fileInDirectory(dir, "opencode"))
  }
  if (Flag.OPENCODE_CONFIG) files.push(Flag.OPENCODE_CONFIG)
  files.push(...ConfigPaths.fileInDirectory(input.managed, "opencode"))

  const existing = await Promise.all(
    unique(files).map(async (file) => {
      const ok = await Bun.file(file).exists()
      return ok ? file : undefined
    }),
  )
  return existing.filter((file): file is string => !!file)
}
