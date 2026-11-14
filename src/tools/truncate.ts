/** Context cap for one fetched page, matching the read tool's order of magnitude. */
export const FETCH_MAX_LINES = 2_000;
export const FETCH_MAX_BYTES = 50 * 1024;

export interface TruncationResult {
  text: string;
  truncated: boolean;
  shownLines: number;
  totalLines: number;
  omittedLines: number;
  /** True when the cut happened inside a line rather than between lines. */
  clippedMidLine: boolean;
}

/**
 * Cap a page for the context window.
 *
 * Lines are dropped from the tail — the beginning of a page carries the title,
 * breadcrumbs and the opening of the content, which is what a follow-up query
 * usually needs.
 *
 * A single line longer than the byte budget is clipped rather than dropped. Minified
 * HTML, one-line JSON and bundled JavaScript are all one long line, and returning
 * nothing for them would look like an empty page.
 */
export function truncateForContext(
  text: string,
  maxLines: number = FETCH_MAX_LINES,
  maxBytes: number = FETCH_MAX_BYTES,
): TruncationResult {
  const lines = text.split("\n");
  const totalLines = lines.length;

  const kept: string[] = [];
  let bytes = 0;
  let clippedMidLine = false;

  for (const line of lines) {
    if (kept.length >= maxLines) break;

    const size = Buffer.byteLength(line, "utf8") + 1;
    if (bytes + size <= maxBytes) {
      kept.push(line);
      bytes += size;
      continue;
    }

    // The line does not fit. With nothing kept yet, clip inside it so the caller
    // still gets content instead of an empty string.
    const remaining = maxBytes - bytes;
    if (kept.length === 0 && remaining > 0) {
      kept.push(clipToBytes(line, remaining));
      clippedMidLine = true;
    }
    break;
  }

  const shownLines = kept.length;
  const truncated = shownLines < totalLines || clippedMidLine;
  return {
    text: truncated ? kept.join("\n") : text,
    truncated,
    shownLines,
    totalLines,
    omittedLines: totalLines - shownLines,
    clippedMidLine,
  };
}

/**
 * Cut a string to a byte budget without splitting a multi-byte character.
 *
 * A partial character would decode to U+FFFD, so the cut point walks back to the
 * start of the character it landed inside.
 */
function clipToBytes(text: string, maxBytes: number): string {
  const encoded = Buffer.from(text, "utf8");
  if (encoded.byteLength <= maxBytes) return text;

  let end = maxBytes;
  while (end > 0 && ((encoded[end] ?? 0) & 0xc0) === 0x80) end -= 1;
  return encoded.subarray(0, end).toString("utf8");
}
