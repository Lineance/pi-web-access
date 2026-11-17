import { readFetchedContent } from "../read.js";
import {
  convertHtmlToMarkdown,
  pandocAvailable,
  defaultSpawnPandoc,
  type SpawnPandoc,
} from "./binary.js";
import { WebSearchError } from "../../../orchestrator/errors.js";
import type { Transport } from "../../../transport/transport.js";
import type { FetchedContent } from "../../types.js";
import type { FetchProvider, FetchRequest } from "../types.js";

export interface PandocFetchOptions {
  transport: Transport;
  /** Injectable so a test never touches a real binary. */
  spawnPandoc?: SpawnPandoc;
}

/**
 * Fetches the URL itself and converts HTML to GFM markdown with the pandoc
 * binary, for fidelity the in-process converter cannot reach — complex tables
 * especially.
 *
 * Keyless and local like `local`, but only as good as the machine it runs on: a
 * missing binary, a hung conversion or a non-zero exit is an ordinary provider
 * failure, and the chain falls back from here to the next provider.
 */
export class PandocFetchProvider implements FetchProvider {
  readonly name = "pandoc";
  readonly label = "Pandoc (local)";

  private readonly transport: Transport;
  private readonly spawnPandoc: SpawnPandoc;

  constructor(options: PandocFetchOptions) {
    this.transport = options.transport;
    this.spawnPandoc = options.spawnPandoc ?? defaultSpawnPandoc;
  }

  async fetch(request: FetchRequest, signal?: AbortSignal): Promise<FetchedContent> {
    if (!(await pandocAvailable(this.spawnPandoc))) {
      throw new WebSearchError("transport", this.name, "pandoc binary not found on PATH");
    }

    return readFetchedContent({
      provider: this.name,
      transport: this.transport,
      url: request.url,
      signal,
      render: (html) => convertHtmlToMarkdown(html, this.spawnPandoc, signal),
    });
  }
}
