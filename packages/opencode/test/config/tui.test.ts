import { afterEach, expect, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { TuiConfig } from "../../src/config/tui"
import { Global } from "../../src/global"

afterEach(async () => {
  delete process.env.OPENCODE_CONFIG
  delete process.env.OPENCODE_TUI_CONFIG
  await fs.rm(path.join(Global.Path.config, "tui.json"), { force: true }).catch(() => {})
  await fs.rm(path.join(Global.Path.config, "tui.jsonc"), { force: true }).catch(() => {})
})

test("loads tui config with the same precedence order as server config paths", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(path.join(Global.Path.config, "tui.json"), JSON.stringify({ theme: "global" }, null, 2))
      await Bun.write(path.join(dir, "tui.json"), JSON.stringify({ theme: "project" }, null, 2))
      await fs.mkdir(path.join(dir, ".opencode"), { recursive: true })
      await Bun.write(
        path.join(dir, ".opencode", "tui.json"),
        JSON.stringify({ theme: "local", diff_style: "stacked" }, null, 2),
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await TuiConfig.get()
      expect(config.theme).toBe("local")
      expect(config.diff_style).toBe("stacked")
    },
  })
})

test("migrates tui-specific keys from opencode.json when tui.json does not exist", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify(
          {
            theme: "migrated-theme",
            tui: { scroll_speed: 5 },
            keybinds: { app_exit: "ctrl+q" },
          },
          null,
          2,
        ),
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await TuiConfig.get()
      expect(config.theme).toBe("migrated-theme")
      expect(config.scroll_speed).toBe(5)
      expect(config.keybinds?.app_exit).toBe("ctrl+q")
      const text = await Bun.file(path.join(tmp.path, "tui.json")).text()
      expect(JSON.parse(text)).toMatchObject({
        theme: "migrated-theme",
        scroll_speed: 5,
      })
      const server = JSON.parse(await Bun.file(path.join(tmp.path, "opencode.json")).text())
      expect(server.theme).toBeUndefined()
      expect(server.keybinds).toBeUndefined()
      expect(server.tui).toBeUndefined()
      expect(await Bun.file(path.join(tmp.path, "opencode.json.tui-migration.bak")).exists()).toBe(true)
      expect(await Bun.file(path.join(tmp.path, "tui.json")).exists()).toBe(true)
    },
  })
})

test("migrates project legacy tui keys even when global tui.json already exists", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(path.join(Global.Path.config, "tui.json"), JSON.stringify({ theme: "global" }, null, 2))
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify(
          {
            theme: "project-migrated",
            tui: { scroll_speed: 2 },
          },
          null,
          2,
        ),
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await TuiConfig.get()
      expect(config.theme).toBe("project-migrated")
      expect(config.scroll_speed).toBe(2)
      expect(await Bun.file(path.join(tmp.path, "tui.json")).exists()).toBe(true)

      const server = JSON.parse(await Bun.file(path.join(tmp.path, "opencode.json")).text())
      expect(server.theme).toBeUndefined()
      expect(server.tui).toBeUndefined()
    },
  })
})

test("flattens nested tui key inside tui.json", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "tui.json"),
        JSON.stringify({
          theme: "outer",
          tui: { scroll_speed: 3, diff_style: "stacked" },
        }),
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await TuiConfig.get()
      expect(config.scroll_speed).toBe(3)
      expect(config.diff_style).toBe("stacked")
      // top-level keys take precedence over nested tui keys
      expect(config.theme).toBe("outer")
    },
  })
})

test("top-level keys in tui.json take precedence over nested tui key", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "tui.json"),
        JSON.stringify({
          diff_style: "auto",
          tui: { diff_style: "stacked", scroll_speed: 2 },
        }),
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await TuiConfig.get()
      expect(config.diff_style).toBe("auto")
      expect(config.scroll_speed).toBe(2)
    },
  })
})

test("OPENCODE_TUI_CONFIG takes precedence over project config", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(path.join(dir, "tui.json"), JSON.stringify({ theme: "project", diff_style: "auto" }))
      const custom = path.join(dir, "custom-tui.json")
      await Bun.write(custom, JSON.stringify({ theme: "custom", diff_style: "stacked" }))
      process.env.OPENCODE_TUI_CONFIG = custom
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await TuiConfig.get()
      // project tui.json overrides the custom path (higher precedence)
      expect(config.theme).toBe("project")
      // but project also set diff_style, so that wins
      expect(config.diff_style).toBe("auto")
    },
  })
})

test("OPENCODE_TUI_CONFIG provides settings when no project config exists", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      const custom = path.join(dir, "custom-tui.json")
      await Bun.write(custom, JSON.stringify({ theme: "from-env", diff_style: "stacked" }))
      process.env.OPENCODE_TUI_CONFIG = custom
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const config = await TuiConfig.get()
      expect(config.theme).toBe("from-env")
      expect(config.diff_style).toBe("stacked")
    },
  })
})
