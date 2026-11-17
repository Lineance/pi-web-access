import { classifyContentType, isHtmlMimeType, MAX_IMAGE_BYTES } from "./local/content-kind.js";
import { extractTitle } from "./local/markup.js";
import { discardResponse, requestWithRedirectChecks } from "./request.js";
import { WebSearchError } from "../../orchestrator/errors.js";
import {
  charsetFromContentType,
  MAX_RESPONSE_BODY_BYTES,
  readResponseText,
} from "../../transport/response-body.js";
import type { Transport } from "../../transport/transport.js";
import type { FetchedContent } from "../types.js";

/** Renders an HTML body to text. A synchronous renderer needs no promise. */
export type HtmlRenderer = (html: string, finalUrl: string) => string | Promise<string>;

export interface ReadContentOptions {
  readonly provider: string;
  readonly transport: Transport;
  readonly url: string;
  readonly signal?: AbortSignal;
  /**
   * Converts an HTML body to text. Absent means markup is handed back unchanged —
   * that is the whole behavior of the `raw` provider.
   */
  readonly render?: HtmlRenderer;
}

/**
 * The body pipeline shared by every provider that reads the URL itself.
 *
 * Classification, the image arm, charset handling and metadata live here once;
 * the provider only decides how HTML becomes text. The renderer receives the
 * URL the response actually came from, so relative links can be resolved.
 */
export async function readFetchedContent(options: ReadContentOptions): Promise<FetchedContent> {
  const { response, finalUrl } = await requestWithRedirectChecks(
    options.provider,
    options.transport,
    options.url,
    options.signal,
  );
  const contentType = response.headers.get("content-type") ?? "";
  const decision = classifyContentType(contentType);

  if (decision.kind === "unsupported") {
    await discardResponse(response);
    throw new WebSearchError(
      "unsupported",
      options.provider,
      `unsupported content type: ${decision.mimeType || "(none)"}`,
    );
  }

  if (decision.kind === "image") return readImage(options.provider, response, decision.mimeType);

  const charset = charsetFromContentType(contentType);
  const body = await readResponseText(response, MAX_RESPONSE_BODY_BYTES, charset);
  const contentLengthHeader = response.headers.get("content-length");
  const contentLength = contentLengthHeader === null ? undefined : Number(contentLengthHeader);
  const meta = {
    ...(contentType === "" ? {} : { contentType }),
    ...(contentLength === undefined || Number.isNaN(contentLength) ? {} : { contentLength }),
  };

  if (isHtmlMimeType(decision.mimeType) && options.render !== undefined) {
    const text = await options.render(body, finalUrl);
    const title = extractTitle(body);
    return { kind: "text", text, ...(title === undefined ? {} : { title }), ...meta };
  }

  return { kind: "text", text: body, ...meta };
}

async function readImage(
  provider: string,
  response: Response,
  mimeType: string,
): Promise<FetchedContent> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new WebSearchError("unsupported", provider, `image too large: ${bytes.byteLength} bytes`);
  }
  return {
    kind: "image",
    data: Buffer.from(bytes).toString("base64"),
    mimeType,
    byteLength: bytes.byteLength,
  };
}
