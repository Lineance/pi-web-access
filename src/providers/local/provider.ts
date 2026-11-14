import { notImplemented } from "../../not-implemented.js";
import type { FetchedContent } from "../types.js";

/** Fetches the URL itself. No third party is involved. */
export class LocalFetchProvider {
  readonly name = "local";
  readonly label = "Local";

  fetch(url: string, _signal?: AbortSignal): Promise<FetchedContent> {
    void url;
    return notImplemented("local fetch");
  }
}
