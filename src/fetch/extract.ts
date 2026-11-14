import { notImplemented } from "../not-implemented.js";

/** A real browser UA: some hosts reject the default fetch user agent outright. */
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Strip markup down to readable text.
 *
 * Removes script/style/noscript blocks, turns block-level tags into line breaks,
 * decodes numeric and named entities, and collapses whitespace runs.
 */
export function htmlToText(html: string): string {
  void html;
  return notImplemented("HTML to text");
}

/** The document title, if the markup declares one. */
export function extractTitle(html: string): string | undefined {
  void html;
  return notImplemented("HTML title extraction");
}
