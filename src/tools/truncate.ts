/** Context cap for one fetched page, matching the read tool's order of magnitude. */
export const FETCH_MAX_LINES = 2_000;
export const FETCH_MAX_BYTES = 50 * 1024;

export interface TruncationResult {
  text: string;
  truncated: boolean;
  shownLines: number;
  totalLines: number;
  omittedLines: number;
}

/**
 * Cap a page for the context window.
 *
 * Lines are dropped from the head of the kept region — the beginning of a page
 * carries the title, breadcrumbs and the opening of the content, which is what a
 * follow-up query usually needs.
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
  for (const line of lines) {
    const size = Buffer.byteLength(line, "utf8") + 1;
    if (kept.length >= maxLines || bytes + size > maxBytes) break;
    kept.push(line);
    bytes += size;
  }

  const shownLines = kept.length;
  const truncated = shownLines < totalLines;
  return {
    text: truncated ? kept.join("\n") : text,
    truncated,
    shownLines,
    totalLines,
    omittedLines: totalLines - shownLines,
  };
}
