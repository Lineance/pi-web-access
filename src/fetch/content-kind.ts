/**
 * Content-type classification.
 *
 * Separated from policy on purpose: this module answers "what is this", the tool
 * layer answers "do we return it and how". Adding a kind later is one switch arm
 * here plus one mapping there.
 */

export type ContentKind = "text" | "image" | "unsupported";

export interface ContentDecision {
  kind: ContentKind;
  /** Normalised media type, without parameters. */
  mimeType: string;
  /** Short factual reason for `unsupported`; never a remediation recipe. */
  reason?: string;
}

/**
 * Image types pi can hand to a model as an image block.
 *
 * Hard limit, not a preference: pi forwards `mimeType` to the provider verbatim
 * and only checks whether the model accepts images at all, so anything outside
 * this set is rejected by the provider — and because the block lives in a
 * tool-result message, that rejection poisons every later turn until compaction.
 * Nothing may be added here without confirming every target provider accepts it.
 */
export const IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]);

const TEXTUAL_BASE_TYPES: ReadonlySet<string> = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/rss",
  "application/atom",
  "application/xhtml",
]);

/**
 * Images are re-sent with every subsequent request until compaction, so the cap
 * is deliberately well below the generic 10 MiB body ceiling.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Classify a response by its content type.
 *
 * Ordering note: the textual arm comes before the generic `image/` fallback on
 * purpose. `image/svg+xml` is XML markup, and SVG source is useful to a coding
 * agent (inline an icon, inspect a chart spec), so it is returned as text — the
 * same thing the `read` tool does for an `.svg` file. It can never be returned as
 * an image block: no target provider accepts `image/svg+xml`, and a rejected
 * image block breaks the whole conversation rather than one turn.
 *
 * Reordering this to test `image/` first would silently drop SVG into
 * `unsupported` and take away a capability without any test noticing.
 */
export function classifyContentType(rawHeader: string | null | undefined): ContentDecision {
  const mimeType = normalizeMimeType(rawHeader);
  if (!mimeType) return { kind: "unsupported", mimeType: "", reason: "missing content type" };

  if (IMAGE_MIME_TYPES.has(mimeType)) return { kind: "image", mimeType };

  if (TEXTUAL_BASE_TYPES.has(mimeType) || mimeType.endsWith("+xml") || mimeType.endsWith("+json")) {
    return { kind: "text", mimeType };
  }
  if (mimeType.startsWith("text/")) return { kind: "text", mimeType };

  // Everything else: tiff/bmp/heic/avif, pdf, archives, octet-stream.
  return { kind: "unsupported", mimeType, reason: mimeType };
}

export function normalizeMimeType(rawHeader: string | null | undefined): string {
  if (!rawHeader) return "";
  return (rawHeader.split(";", 1)[0] ?? "").trim().toLowerCase();
}

export function isHtmlMimeType(mimeType: string): boolean {
  return mimeType === "text/html" || mimeType === "application/xhtml";
}
