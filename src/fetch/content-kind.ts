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

/** Image types pi can hand to the model as an image block. */
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

export function classifyContentType(rawHeader: string | null | undefined): ContentDecision {
  const mimeType = normalizeMimeType(rawHeader);
  if (!mimeType) return { kind: "unsupported", mimeType: "", reason: "missing content type" };

  if (TEXTUAL_BASE_TYPES.has(mimeType) || mimeType.endsWith("+xml") || mimeType.endsWith("+json")) {
    return { kind: "text", mimeType };
  }
  if (mimeType.startsWith("text/")) return { kind: "text", mimeType };
  if (IMAGE_MIME_TYPES.has(mimeType)) return { kind: "image", mimeType };

  return { kind: "unsupported", mimeType, reason: mimeType };
}

export function normalizeMimeType(rawHeader: string | null | undefined): string {
  if (!rawHeader) return "";
  return (rawHeader.split(";", 1)[0] ?? "").trim().toLowerCase();
}

export function isHtmlMimeType(mimeType: string): boolean {
  return mimeType === "text/html" || mimeType === "application/xhtml";
}
