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

/**
 * Read at most `maxBytes` of the body as text, decoded with `charset`.
 *
 * The cap applies while streaming, not after: undici buffers unbounded, so a
 * hostile server could stream gigabytes into memory before a post-hoc slice.
 * Like the old slice, an oversized body truncates silently.
 */
export async function readResponseText(
  res: Response,
  maxBytes: number,
  charset?: string,
): Promise<string> {
  const { bytes } = await readBytes(res, maxBytes);
  return decode(bytes, charset);
}

/** Stream at most `maxBytes` of the body, reporting whether the cap cut it. */
export async function readBytes(
  res: Response,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!res.body) return { bytes: new Uint8Array(await res.arrayBuffer()), truncated: false };

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    chunks.push(value);
    if (total > maxBytes) {
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  const bytes = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= bytes.byteLength) break;
    bytes.set(chunk.subarray(0, bytes.byteLength - offset), offset);
    offset += chunk.byteLength;
  }
  return { bytes, truncated };
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
