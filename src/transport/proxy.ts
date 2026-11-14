import {
  EnvHttpProxyAgent,
  fetch as undiciFetch,
  type RequestInit as UndiciRequestInit,
} from "undici";

import { WebSearchError } from "../orchestrator/errors.js";

export interface ProxyRoutes {
  http?: string;
  https?: string;
}

let dispatcher: EnvHttpProxyAgent | undefined;
let installedKey: string | undefined;
let installedRoutes: ProxyRoutes | undefined;

/** undici's agents speak HTTP CONNECT; a socks URL would fail every request. */
export function isSupportedProxyUrl(raw: string): boolean {
  try {
    const protocol = new URL(raw).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function assertSupportedProxy(raw: string): void {
  if (isSupportedProxyUrl(raw)) return;
  throw new WebSearchError(
    "config",
    "*",
    `unsupported proxy "${raw}": only http:// and https:// proxies work (socks is not supported)`,
  );
}

export function getInstalledProxyUrl(protocol: "http:" | "https:"): string | undefined {
  return protocol === "http:" ? installedRoutes?.http : installedRoutes?.https;
}

/**
 * Install a package-scoped proxy dispatcher.
 *
 * undici's global dispatcher is never touched: pi makes its own requests through
 * it, and hijacking it would change behaviour far outside this extension.
 */
export async function installProxyDispatcher(
  configuredProxy?: string,
): Promise<string | undefined> {
  const explicit = configuredProxy?.trim();
  if (explicit) assertSupportedProxy(explicit);

  const routes = explicit ? { http: explicit, https: explicit } : envRoutes();
  const selected = routes.https ?? routes.http;
  if (!selected) {
    await resetProxyDispatcher();
    return undefined;
  }

  const noProxy = process.env["no_proxy"] ?? process.env["NO_PROXY"] ?? "localhost,127.0.0.1,::1";
  const key = `${routes.http ?? ""}\n${routes.https ?? ""}\n${noProxy}`;
  if (dispatcher && installedKey === key) return selected;

  // A route that cannot be used must fail loudly instead of silently going direct.
  for (const route of [routes.http, routes.https]) {
    if (route) assertSupportedProxy(route);
  }

  const previous = dispatcher;
  dispatcher = new EnvHttpProxyAgent({
    httpProxy: routes.http,
    httpsProxy: routes.https,
    noProxy,
  });
  installedRoutes = routes;
  installedKey = key;
  if (previous) await previous.close().catch(() => undefined);
  return selected;
}

export async function resetProxyDispatcher(): Promise<void> {
  const previous = dispatcher;
  dispatcher = undefined;
  installedRoutes = undefined;
  installedKey = undefined;
  if (previous) await previous.close().catch(() => undefined);
}

/** Only used by the transport layer; providers never call undici directly. */
export async function fetchWithInstalledProxy(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!dispatcher) return globalThis.fetch(input, init);
  return (await undiciFetch(input, {
    ...(init as UndiciRequestInit | undefined),
    dispatcher,
  })) as unknown as Response;
}

function envRoutes(): ProxyRoutes {
  const all = process.env["all_proxy"]?.trim() || process.env["ALL_PROXY"]?.trim();
  const http = process.env["http_proxy"]?.trim() || process.env["HTTP_PROXY"]?.trim() || all;
  const https = process.env["https_proxy"]?.trim() || process.env["HTTPS_PROXY"]?.trim() || http;
  return { ...(http ? { http } : {}), ...(https ? { https } : {}) };
}
