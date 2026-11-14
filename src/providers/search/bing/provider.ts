import { cleanFragment } from "./markup.js";
import { BROWSER_USER_AGENT } from "../../../transport/http.js";
import { kindForStatus, WebSearchError } from "../../../orchestrator/errors.js";
import {
  charsetFromContentType,
  MAX_SEARCH_RESPONSE_BODY_BYTES,
  readResponseText,
} from "../../../transport/response-body.js";
import type { Transport } from "../../../transport/transport.js";
import type { SearchResult } from "../../types.js";
import type { SearchProvider } from "../types.js";

const BING_ENDPOINT = "https://www.bing.com/search";
const MAX_ATTEMPTS = 2;
const BACKOFF_MS = 400;

/**
 * A 200 with a full-looking page but no parseable results is Bing's
 * human-verification markup, not an empty result set. Any genuine page — results
 * or "no matches" — is larger than this, so a smaller body is treated as a real
 * empty answer.
 */
const SUSPICIOUS_BODY_CHARS = 1024;

/**
 * Bing keyless HTML results.
 *
 * Bing is the only keyless search source that works from mainland China without a
 * proxy, which is why it is worth parsing markup at all.
 */
export class BingProvider implements SearchProvider {
  readonly name = "bing";
  readonly label = "Bing";

  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  async search(query: string, maxResults: number, signal?: AbortSignal): Promise<SearchResult[]> {
    const url = `${BING_ENDPOINT}?${new URLSearchParams({ q: query, form: "QBLH" }).toString()}`;

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      if (isAborted(signal)) throw signal?.reason ?? new Error("Search aborted");
      if (attempt > 0) await sleep(BACKOFF_MS * 2 ** (attempt - 1));

      try {
        return await this.request(url, maxResults, signal);
      } catch (error) {
        if (isAborted(signal)) throw error;
        // Retrying a rate limit or a refused credential only adds latency.
        if (error instanceof WebSearchError && (error.kind === "quota" || error.kind === "auth")) {
          throw error;
        }
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async request(
    url: string,
    maxResults: number,
    signal: AbortSignal | undefined,
  ): Promise<SearchResult[]> {
    const response = await this.transport(url, {
      redirect: "follow",
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      ...(signal === undefined ? {} : { signal }),
    });

    const body = await readResponseText(
      response,
      MAX_SEARCH_RESPONSE_BODY_BYTES,
      charsetFromContentType(response.headers.get("content-type")),
    );

    if (!response.ok) {
      throw new WebSearchError(
        kindForStatus(response.status),
        this.name,
        `Bing search error (${response.status})`,
        response.status,
      );
    }

    const results = parseBingResults(body, maxResults);
    if (results.length > 0) return results;
    if (body.length >= SUSPICIOUS_BODY_CHARS) {
      throw new WebSearchError(
        "parse",
        this.name,
        `Bing returned a page with no parseable results (${body.length} chars)`,
      );
    }
    return [];
  }
}

/** Extract result blocks from a Bing results page. */
export function parseBingResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  for (const chunk of html.split(/<li class="b_algo"/i).slice(1)) {
    if (results.length >= maxResults) break;

    const closing = chunk.indexOf("</li>");
    const block = closing > 0 ? chunk.slice(0, closing) : chunk;

    const titleMatch = /<h2\b[^>]*>\s*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (titleMatch === null) continue;

    const href = titleMatch[1];
    const rawTitle = titleMatch[2];
    if (href === undefined || rawTitle === undefined) continue;

    const url = decodeBingUrl(href);
    const title = cleanFragment(rawTitle);
    if (title === "" || !/^https?:\/\//i.test(url)) continue;
    // A relative link resolves against bing.com; an internal destination is not a
    // web result, and handing the model a bing.com URL is worse than dropping it.
    if (isBingHost(url)) continue;

    results.push({ title, url, snippet: extractSnippet(block) });
  }

  return results;
}

/**
 * Bing wraps click targets as `/ck/a?u=a1<base64url>` so the real destination is
 * not in the markup. Without unwrapping, every result URL would point at bing.com.
 */
export function decodeBingUrl(href: string): string {
  try {
    const url = new URL(href, "https://www.bing.com");
    if (url.hostname.endsWith("bing.com") && url.pathname.startsWith("/ck/a")) {
      const raw = url.searchParams.get("u");
      if (raw !== null && raw.startsWith("a1")) {
        const base64 = raw.slice(2).replace(/-/g, "+").replace(/_/g, "/");
        const decoded = Buffer.from(base64, "base64").toString("utf8");
        if (/^https?:\/\//i.test(decoded)) return decoded;
      }
    }
    return url.toString();
  } catch {
    return href;
  }
}

function isBingHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "bing.com" || host.endsWith(".bing.com");
  } catch {
    return false;
  }
}

function extractSnippet(block: string): string {
  const line =
    /<p class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(block) ??
    /<div class="b_caption"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);
  const raw = line?.[1];
  return raw === undefined ? "" : cleanFragment(raw);
}

/**
 * Read the abort flag through a call.
 *
 * A direct `signal?.aborted === true` comparison is narrowed away by the compiler
 * after the loop-head check, even though `abort()` can fire during an await.
 */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
