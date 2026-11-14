import { fetch as undiciFetch, type Agent, type Dispatcher } from "undici";

import { createFetchAgent } from "../fetch/ssrf.js";

import { fetchWithInstalledProxy, getInstalledProxyUrl, installProxyDispatcher } from "./proxy.js";

/**
 * The single network exit point for provider traffic.
 *
 * Providers receive an instance instead of importing a fetch helper, which is
 * what keeps every test offline and every provider free of proxy knowledge.
 */
export type Transport = (url: string, init?: RequestInit) => Promise<Response>;

export interface TransportOptions {
  /** Explicit proxy. Environment variables apply when this is absent. */
  proxy?: string;
  /**
   * Refuse non-public DNS answers at connect time.
   *
   * Ignored when a proxy is active: the proxy resolves names itself, so a local
   * pre-resolution result would not describe the address actually contacted.
   */
  guardDns?: boolean;
}

let guardedAgent: Agent | undefined;

export async function createTransport(options: TransportOptions = {}): Promise<Transport> {
  await installProxyDispatcher(options.proxy);

  const proxyActive = getInstalledProxyUrl("https:") !== undefined;
  if (!options.guardDns || proxyActive) {
    return (url, init) => fetchWithInstalledProxy(url, init);
  }

  const agent: Dispatcher = (guardedAgent ??= createFetchAgent());
  return async (url, init) =>
    (await undiciFetch(url, {
      ...(init as Parameters<typeof undiciFetch>[1]),
      dispatcher: agent,
    })) as unknown as Response;
}
