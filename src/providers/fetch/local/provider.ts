import { readFetchedContent } from "../read.js";
import { extractDocument } from "./markup.js";
import type { Transport } from "../../../transport/transport.js";
import type { FetchedContent } from "../../types.js";
import type { FetchProvider, FetchRequest } from "../types.js";

export interface LocalFetchOptions {
  transport: Transport;
}

/**
 * Fetches the URL itself and renders HTML to GFM markdown in-process.
 *
 * No third party is involved, no credential is needed, and the converter ships
 * with the package — this is the floor every fetch chain falls back to.
 */
export class LocalFetchProvider implements FetchProvider {
  readonly name = "local";
  readonly label = "Local";

  private readonly transport: Transport;

  constructor(options: LocalFetchOptions) {
    this.transport = options.transport;
  }

  fetch(request: FetchRequest, signal?: AbortSignal): Promise<FetchedContent> {
    return readFetchedContent({
      provider: this.name,
      transport: this.transport,
      url: request.url,
      signal,
      render: (html, finalUrl) => extractDocument(html, finalUrl),
    });
  }
}
