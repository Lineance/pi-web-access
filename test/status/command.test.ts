import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STATUS_COMMAND, registerStatusCommand } from "../../src/status/command.js";

interface HandlerOptions {
  description?: string;
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}

interface Captured {
  name: string;
  options: HandlerOptions;
}

function capture(): { pi: ExtensionAPI; commands: Captured[] } {
  const commands: Captured[] = [];
  const pi = {
    registerCommand: (name: string, options: HandlerOptions) => {
      commands.push({ name, options });
    },
  } as unknown as ExtensionAPI;
  return { pi, commands };
}

function ui(hasUI: boolean): {
  ctx: ExtensionCommandContext;
  widgets: Array<string[] | undefined>;
} {
  const widgets: Array<string[] | undefined> = [];
  const ctx = {
    hasUI,
    ui: {
      setWidget: (_key: string, content: string[] | undefined) => {
        widgets.push(content);
      },
    },
  } as unknown as ExtensionCommandContext;
  return { ctx, widgets };
}

async function invoke(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const { pi, commands } = capture();
  registerStatusCommand(pi);
  const command = commands[0]!;
  await command.options.handler(args, ctx);
}

let configRoot: string;

beforeEach(() => {
  configRoot = mkdtempSync(join(tmpdir(), "pwa-status-"));
  vi.stubEnv("PI_PKG_CFG_DIR", configRoot);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("registerStatusCommand", () => {
  it("registers the expected command name and a short description", () => {
    const { pi, commands } = capture();

    registerStatusCommand(pi);

    expect(commands[0]?.name).toBe(STATUS_COMMAND);
    expect(commands[0]?.name).toBe("web-access-status");
    expect(commands[0]?.options.description).toBe("Show configured providers (clear to hide)");
  });
});

describe("the status command", () => {
  it("writes the report into a widget when the UI is available", async () => {
    const { ctx, widgets } = ui(true);

    await invoke("", ctx);

    expect(widgets).toHaveLength(1);
    const lines = widgets[0]!;
    expect(lines[0]).toContain("search");
    expect(lines.join("\n")).toContain("exa-free");
    expect(lines.join("\n")).toContain("keyless");
  });

  it("prints to stdout when there is no UI", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { ctx, widgets } = ui(false);

    await invoke("", ctx);

    expect(widgets).toHaveLength(0);
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0]?.[0])).toContain("exa-free");
  });

  it("passes --all through to the report", async () => {
    const { ctx, widgets } = ui(false);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await invoke("--all", ctx);

    expect(String(log.mock.calls[0]?.[0])).toContain("tavily");
    expect(widgets).toHaveLength(0);
  });

  it("caps the widget so the last line says what was left out", async () => {
    const { ctx, widgets } = ui(true);

    await invoke("--all", ctx);

    const lines = widgets[0]!;
    expect(lines.length).toBeLessThanOrEqual(10);
    expect(lines.at(-1)).toContain("more lines");
  });

  it("clears the widget on request", async () => {
    const { ctx, widgets } = ui(true);

    await invoke("clear", ctx);

    expect(widgets).toEqual([undefined]);
  });

  it("emits JSON for scripting", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { ctx } = ui(false);

    await invoke("--json", ctx);

    const parsed = JSON.parse(String(log.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(parsed["searchChain"]).toEqual(["exa-free"]);
    expect(Array.isArray(parsed["providers"])).toBe(true);
  });

  it("reflects a config written after startup", async () => {
    const dir = join(configRoot, "pi-web-access");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "config.json"),
      JSON.stringify({ providers: ["bing", "exa-free"], maxResults: 3 }),
      "utf8",
    );

    const { ctx, widgets } = ui(true);
    await invoke("", ctx);

    const text = widgets[0]!.join("\n");
    // Re-read on invocation, not captured at registration.
    expect(text).toContain("bing → exa-free");
    expect(text).toContain("maxResults 3");
  });

  it("reports a rejected custom provider rather than hiding it", async () => {
    const dir = join(configRoot, "pi-web-access");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "config.json"),
      JSON.stringify({ customProviders: { search: { broken: { url: "https://e.com" } } } }),
      "utf8",
    );

    const { ctx, widgets } = ui(true);
    await invoke("", ctx);

    expect(widgets[0]!.join("\n")).toContain('rejected custom search "broken"');
  });
});
