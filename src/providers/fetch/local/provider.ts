import { classifyContentType, isHtmlMimeType, MAX_IMAGE_BYTES } from "./content-kind.js";
import { extractDocument } from "./markup.js";
import { BROWSER_USER_AGENT } from "../../../transport/http.js";
import { MAX_REDIRECTS, parseAndAssertFetchUrl } from "../../../transport/address.js";
import { WebSearchError } from "../../../orchestrator/errors.js";
import {
  charsetFromContentType,
  MAX_RESPONSE_BODY_BYTES,
  readResponseText,
} from "../../../transport/response-body.js";
import type { Transport } from "../../../transport/transport.js";
import type { FetchedContent } from "../../types.js";
import type { FetchProvider, FetchRequest } from "../types.js";

const ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,image/*;q=0.7,*/*;q=0.5";

export interface LocalFetchOptions {
  transport: Transport;
}

/** Fetches the URL itself. No third party is involved. */
export class LocalFetchProvider implements FetchProvider {
  readonly name = "local";
  readonly label = "Local";

  private readonly transport: Transport;

  constructor(options: LocalFetchOptions) {
    this.transport = options.transport;
  }

  async fetch(request: FetchRequest, signal?: AbortSignal): Promise<FetchedContent> {
    const response = await this.request(request.url, signal);
    const contentType = response.headers.get("content-type") ?? "";
    const decision = classifyContentType(contentType);

    if (decision.kind === "unsupported") {
      await discard(response);
      throw new WebSearchError(
        "unsupported",
        this.name,
        `unsupported content type: ${decision.mimeType || "(none)"}`,
      );
    }

    if (decision.kind === "image") return this.readImage(response, decision.mimeType);

    const charset = charsetFromContentType(contentType);
    const body = await readResponseText(response, MAX_RESPONSE_BODY_BYTES, charset);
    const contentLengthHeader = response.headers.get("content-length");
    const contentLength = contentLengthHeader === null ? undefined : Number(contentLengthHeader);

    if (isHtmlMimeType(decision.mimeType) && !request.raw) {
      const document = extractDocument(body);
      return {
        kind: "text",
        text: document.text,
        ...(document.title === undefined ? {} : { title: document.title }),
        ...(contentType === "" ? {} : { contentType }),
        ...(contentLength === undefined || Number.isNaN(contentLength) ? {} : { contentLength }),
      };
    }

    return {
      kind: "text",
      text: body,
      ...(contentType === "" ? {} : { contentType }),
      ...(contentLength === undefined || Number.isNaN(contentLength) ? {} : { contentLength }),
    };
  }

  private async readImage(response: Response, mimeType: string): Promise<FetchedContent> {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new WebSearchError(
        "unsupported",
        this.name,
        `image too large: ${bytes.byteLength} bytes`,
      );
    }
    return {
      kind: "image",
      data: Buffer.from(bytes).toString("base64"),
      mimeType,
      byteLength: bytes.byteLength,
    };
  }

  /**
   * Follow redirects by hand so every hop is validated before it is contacted.
   *
   * `redirect: "follow"` would let a public host hand the socket to a private
   * address with no opportunity to intervene.
   */
  private async request(url: string, signal?: AbortSignal): Promise<Response> {
    let current = parseAndAssertFetchUrl(url).toString();

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await this.transport(current, {
        ...(signal === undefined ? {} : { signal }),
        redirect: "manual",
        headers: { "User-Agent": BROWSER_USER_AGENT, Accept: ACCEPT },
      });

      if (!isRedirect(response.status)) {
        if (response.ok) return response;
        await discard(response);
        throw new WebSearchError(
          "transport",
          this.name,
          `HTTP ${response.status} ${response.statusText} for ${current}`,
          response.status,
        );
      }

      const location = response.headers.get("location");
      await discard(response);
      if (location === null) {
        throw new WebSearchError(
          "transport",
          this.name,
          `HTTP ${response.status} redirect without Location for ${current}`,
        );
      }
      if (hop === MAX_REDIRECTS) {
        throw new WebSearchError(
          "transport",
          this.name,
          `too many redirects (max ${MAX_REDIRECTS}) for ${url}`,
        );
      }
      current = parseAndAssertFetchUrl(new URL(location, current).toString()).toString();
    }

    throw new WebSearchError(
      "transport",
      this.name,
      `too many redirects (max ${MAX_REDIRECTS}) for ${url}`,
    );
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}
