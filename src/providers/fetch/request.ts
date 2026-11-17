import { BROWSER_USER_AGENT } from "../../transport/http.js";
import { MAX_REDIRECTS, parseAndAssertFetchUrl } from "../../transport/address.js";
import { WebSearchError } from "../../orchestrator/errors.js";
import type { Transport } from "../../transport/transport.js";

const ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,image/*;q=0.7,*/*;q=0.5";

export interface TrackedResponse {
  readonly response: Response;
  /** The URL the response actually came from, after every redirect hop. */
  readonly finalUrl: string;
}

/**
 * Fetch a URL with every redirect hop re-checked before it is contacted.
 *
 * Shared by every provider that reads the URL itself: `redirect: "follow"` would
 * let a public host hand the socket to a private address with no opportunity to
 * intervene, so redirects are followed one hop at a time here.
 */
export async function requestWithRedirectChecks(
  provider: string,
  transport: Transport,
  url: string,
  signal?: AbortSignal,
): Promise<TrackedResponse> {
  let current = parseAndAssertFetchUrl(url).toString();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await transport(current, {
      ...(signal === undefined ? {} : { signal }),
      redirect: "manual",
      headers: { "User-Agent": BROWSER_USER_AGENT, Accept: ACCEPT },
    });

    if (!isRedirect(response.status)) {
      if (response.ok) return { response, finalUrl: current };
      await discardResponse(response);
      throw new WebSearchError(
        "transport",
        provider,
        `HTTP ${response.status} ${response.statusText} for ${current}`,
        response.status,
      );
    }

    const location = response.headers.get("location");
    await discardResponse(response);
    if (location === null) {
      throw new WebSearchError(
        "transport",
        provider,
        `HTTP ${response.status} redirect without Location for ${current}`,
      );
    }
    if (hop === MAX_REDIRECTS) {
      throw new WebSearchError(
        "transport",
        provider,
        `too many redirects (max ${MAX_REDIRECTS}) for ${url}`,
      );
    }
    current = parseAndAssertFetchUrl(new URL(location, current).toString()).toString();
  }

  throw new WebSearchError(
    "transport",
    provider,
    `too many redirects (max ${MAX_REDIRECTS}) for ${url}`,
  );
}

/** Drain and drop a body so the socket is released without reading it. */
export async function discardResponse(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}
