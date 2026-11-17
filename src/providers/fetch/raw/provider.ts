import { readFetchedContent } from "../read.js";
import type { Transport } from "../../../transport/transport.js";
import type { FetchedContent } from "../../types.js";
import type { FetchProvider, FetchRequest } from "../types.js";

export interface RawFetchOptions {
  transport: Transport;
}

/**
 * Fetches the URL itself and hands back the body untouched.
 *
 * `raw` used to be a flag on the tool; it is a provider now, so choosing
 * original markup is a chain decision like choosing pandoc over local — declared
 * in `fetchProviders`, ordered by tier, falling back like any other provider.
 * There is no third party and no conversion: what the server sent is what the
 * model sees.
 */
export class RawFetchProvider implements FetchProvider {
  readonly name = "raw";
  readonly label = "Raw (no conversion)";

  private readonly transport: Transport;

  constructor(options: RawFetchOptions) {
    this.transport = options.transport;
  }

  fetch(request: FetchRequest, signal?: AbortSignal): Promise<FetchedContent> {
    return readFetchedContent({
      provider: this.name,
      transport: this.transport,
      url: request.url,
      signal,
    });
  }
}
