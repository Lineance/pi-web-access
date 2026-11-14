import { fetchWithInstalledProxy, installProxyDispatcher } from "./proxy.js";

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
}

export async function createTransport(options: TransportOptions = {}): Promise<Transport> {
  await installProxyDispatcher(options.proxy);
  return (url, init) => fetchWithInstalledProxy(url, init);
}
