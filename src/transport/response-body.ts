/** Hard ceiling for a fetched page body. */
export const MAX_RESPONSE_BODY_BYTES = 10 * 1024 * 1024;
/** Hard ceiling for a search API response body. */
export const MAX_SEARCH_RESPONSE_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Charset from the content type, if it declares one.
 *
 * Without this, a GBK-encoded page decodes to replacement characters even though
 * the bytes arrived intact.
 */
export function charsetFromContentType(contentType: string | null | undefined): string | undefined {
  if (!contentType) return undefined;
  const match = /charset\s*=\s*"?([^";,\s]+)"?/i.exec(contentType);
  return match?.[1]?.toLowerCase();
}

/** Read at most `maxBytes` of the body as text, decoded with `charset`. */
export async function readResponseText(
  res: Response,
  maxBytes: number,
  charset?: string,
): Promise<string> {
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, maxBytes));
  return decode(bytes, charset);
}

/** Read at most `maxBytes` of the body and parse it as JSON. */
export async function readResponseJson<T>(res: Response, maxBytes: number): Promise<T> {
  const text = await readResponseText(res, maxBytes);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("response body is not valid JSON");
  }
}

function decode(bytes: Uint8Array, charset: string | undefined): string {
  if (charset && charset !== "utf-8" && charset !== "utf8") {
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {
      // Unknown label: fall through to UTF-8 rather than failing the fetch.
    }
  }
  return new TextDecoder("utf-8").decode(bytes);
}
