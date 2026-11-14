import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { readConfig, resolveMaxResults } from "./config/paths.js";
import { resolveProxy } from "./config/resolve.js";
import { NOOP_HEALTH } from "./orchestrator/health.js";
import { registerWebFetchTool } from "./tools/web-fetch.js";
import { registerWebSearchTool } from "./tools/web-search.js";
import { createTransport } from "./transport/transport.js";

/**
 * Extension entry point.
 *
 * Wiring only: read configuration, build the transport, hand both tools their
 * dependencies. A broken config file degrades to the built-in keyless defaults
 * instead of preventing the extension from loading.
 */
export default async function registerWebTools(pi: ExtensionAPI): Promise<void> {
  const read = readConfig();
  if (read.status === "invalid") {
    console.error(`[pi-web-search] ${read.path}: ${read.error ?? "invalid"}; using defaults`);
  }
  if (read.unknownKeys.length > 0) {
    console.warn(
      `[pi-web-search] ${read.path}: unknown key(s) ${read.unknownKeys.join(", ")} ignored`,
    );
  }

  const config = read.config;
  const transport = await createTransport(
    resolveProxy(config) === undefined ? {} : { proxy: resolveProxy(config) },
  );
  const health = NOOP_HEALTH;

  console.error(
    `[pi-web-search] maxResults=${resolveMaxResults(config)} providers=${(config.providers ?? ["exa-free"]).join(",")} fetch=${(config.fetchProviders ?? ["local"]).join(",")}`,
  );

  registerWebSearchTool(pi, { config, transport, health });
  registerWebFetchTool(pi, { config, health });
}
