import { notImplemented } from "../../not-implemented.js";
import type { FetchedContent } from "../types.js";

/**
 * The built-in fetch transport: SSRF-guarded direct HTTP, no credential, no
 * third party. Always the first link of the fetch chain.
 */
export class LocalFetchProvider {
  readonly name = "local";
  readonly label = "Local (SSRF-safe direct fetch)";

  fetch(url: string, _signal?: AbortSignal): Promise<FetchedContent> {
    void url;
    return notImplemented("local fetch");
  }
}
