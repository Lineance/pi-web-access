import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { readCustomProviders } from "./config/custom.js";
import { readConfig, resolveMaxResults } from "./config/paths.js";
import { resolveProxy } from "./config/resolve.js";
import { NOOP_HEALTH } from "./orchestrator/health.js";
import { buildCatalog } from "./providers/catalog.js";
import { registerStatusCommand } from "./status/command.js";
import { registerWebFetchTool } from "./fetch/tool.js";
import { registerWebSearchTool } from "./search/tool.js";
import { createTransport } from "./transport/transport.js";

/**
 * Extension entry point.
 *
 * Wiring only: read configuration, compile user-declared providers, build the
 * transports, hand both tools their dependencies. A broken config file degrades to
 * the built-in keyless defaults instead of preventing the extension from loading,
 * and a broken custom provider is rejected by name without taking the others down.
 */
export default async function registerWebTools(pi: ExtensionAPI): Promise<void> {
  const read = readConfig();
  if (read.status === "invalid") {
    console.error(`[pi-web-access] ${read.path}: ${read.error ?? "invalid"}; using defaults`);
  }
  if (read.unknownKeys.length > 0) {
    console.warn(
      `[pi-web-access] ${read.path}: unknown key(s) ${read.unknownKeys.join(", ")} ignored`,
    );
  }

  const config = read.config;
  const custom = readCustomProviders(config.customProviders);
  for (const issue of custom.issues) {
    console.error(
      `[pi-web-access] custom ${issue.side} provider "${issue.name}": ${issue.message}`,
    );
  }
  const catalog = buildCatalog(custom.additions);

  const proxy = resolveProxy(config);
  const proxyOptions = proxy === undefined ? {} : { proxy };

  // Search providers talk to their own APIs; the fetch chain resolves user-supplied
  // hosts, so only that transport refuses non-public DNS answers.
  const searchTransport = await createTransport(proxyOptions);
  const fetchTransport = await createTransport({ ...proxyOptions, guardDns: true });
  const health = NOOP_HEALTH;

  const searchChain = (config.providers ?? catalog.searchNames().slice(0, 1)).join(",");
  const fetchChain = (config.fetchProviders ?? catalog.fetchNames().slice(0, 1)).join(",");
  console.error(
    `[pi-web-access] maxResults=${resolveMaxResults(config)} providers=${searchChain} fetch=${fetchChain}`,
  );

  registerWebSearchTool(pi, { config, transport: searchTransport, catalog, health });
  registerWebFetchTool(pi, { config, transport: fetchTransport, catalog, health });
  // The command re-reads the config itself, so it reflects edits without a restart.
  registerStatusCommand(pi);
}
