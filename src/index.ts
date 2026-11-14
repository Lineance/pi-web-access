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
 * Wiring only: read configuration, build the transports, hand both tools their
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
  const proxy = resolveProxy(config);
  const proxyOptions = proxy === undefined ? {} : { proxy };

  // Search providers talk to their APIs; the fetch chain resolves user-supplied
  // hosts, so only that transport refuses non-public DNS answers.
  const searchTransport = await createTransport(proxyOptions);
  const fetchTransport = await createTransport({ ...proxyOptions, guardDns: true });
  const health = NOOP_HEALTH;

  console.error(
    `[pi-web-search] maxResults=${resolveMaxResults(config)} providers=${(config.providers ?? ["exa-free"]).join(",")} fetch=${(config.fetchProviders ?? ["local"]).join(",")}`,
  );

  registerWebSearchTool(pi, { config, transport: searchTransport, health });
  registerWebFetchTool(pi, { config, transport: fetchTransport, health });
}
