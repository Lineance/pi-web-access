import { BROWSER_USER_AGENT } from "../../transport/http.js";
import { MAX_REDIRECTS, parseAndAssertFetchUrl } from "../../transport/address.js";
import { kindForStatus, WebSearchError } from "../../orchestrator/errors.js";
import type { Transport } from "../../transport/transport.js";

const ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,image/*;q=0.7,*/*;q=0.5";

export interface TrackedResponse {
  readonly response: Response;
  /** The URL the response actually came from, after every redirect hop. */
  readonly finalUrl: string;
}

/** The request a provider wants to issue. POST bodies replay only on 307/308. */
export interface RedirectableRequest {
  readonly method: "GET" | "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

/**
 * Fetch a URL with every redirect hop re-checked before it is contacted.
 *
 * Shared by every provider that reads the URL itself: `redirect: "follow"` would
 * let a public host hand the socket to a private address with no opportunity to
 * intervene, so redirects are followed one hop at a time here. The optional
 * `request` carries a provider's own method, headers and POST body; a redirect
 * downgrade (301/302/303) drops both, matching what fetch would do.
 */
export async function requestWithRedirectChecks(
  provider: string,
  transport: Transport,
  url: string,
  signal?: AbortSignal,
  request?: RedirectableRequest,
  errorHint?: string,
): Promise<TrackedResponse> {
  let current = parseAndAssertFetchUrl(url).toString();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await transport(current, {
      ...(signal === undefined ? {} : { signal }),
      redirect: "manual",
      method: request?.method,
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: ACCEPT,
        ...(request?.headers ?? {}),
        ...(request?.method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      ...(request?.method === "POST" && request.body !== undefined ? { body: request.body } : {}),
    });

    if (!isRedirect(response.status)) {
      if (response.ok) return { response, finalUrl: current };
      await discardResponse(response);
      throw new WebSearchError(
        kindForStatus(response.status),
        provider,
        `HTTP ${response.status} ${response.statusText} for ${current}${errorHint ?? ""}`,
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
    // 301/302/303 downgrade a POST to GET and drop the body, matching fetch.
    if (response.status !== 307 && response.status !== 308) {
      request = request === undefined ? undefined : { ...request, method: "GET", body: undefined };
    }
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
