const COMMENT_BLOCK = /<!--[\s\S]*?-->/g;
const SCRIPT_BLOCK = /<script\b[\s\S]*?<\/script\s*>/gi;
const STYLE_BLOCK = /<style\b[\s\S]*?<\/style\s*>/gi;
const NOSCRIPT_BLOCK = /<noscript\b[\s\S]*?<\/noscript\s*>/gi;
const TITLE_BLOCK = /<title\b[\s\S]*?<\/title\s*>/gi;
const TITLE_TAG = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i;

/** Tags that imply a line break in rendered output. */
const BLOCK_BOUNDARY =
  /<\/?(?:address|article|aside|blockquote|br|dd|details|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|summary|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi;

/** An attribute value may contain `>`, so quoted spans are skipped whole. */
const ANY_TAG = /<(?:[^>"']|"[^"]*"|'[^']*')*>/g;

const NUMERIC_ENTITY = /&#(\d{1,7});/g;
const HEX_ENTITY = /&#[xX]([0-9a-fA-F]{1,6});/g;
const NAMED_ENTITY = /&([a-zA-Z][a-zA-Z0-9]{1,31});/g;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  laquo: "\u00ab",
  raquo: "\u00bb",
  middot: "\u00b7",
  bull: "\u2022",
  deg: "\u00b0",
  times: "\u00d7",
  divide: "\u00f7",
  plusmn: "\u00b1",
  sect: "\u00a7",
  para: "\u00b6",
  cent: "\u00a2",
  pound: "\u00a3",
  euro: "\u20ac",
  yen: "\u00a5",
  micro: "\u00b5",
  frac12: "\u00bd",
  frac14: "\u00bc",
  frac34: "\u00be",
  sup2: "\u00b2",
  sup3: "\u00b3",
  thinsp: "\u2009",
  ensp: "\u2002",
  emsp: "\u2003",
  zwj: "\u200d",
  zwnj: "\u200c",
  shy: "\u00ad",
};

/** A whole page reduced to what a reader would see, plus its declared title. */
export interface ExtractedDocument {
  text: string;
  title?: string;
}

/**
 * Document extraction for the local fetch provider.
 *
 * Owned here rather than shared: the block-level rules below are a policy of this
 * provider (drop script/style/title, one line per block, no blank lines). A second
 * consumer with a different input domain gets its own cleaner instead of inheriting
 * these choices.
 */
export function extractDocument(html: string): ExtractedDocument {
  const title = extractTitle(html);
  return { text: htmlToText(html), ...(title === undefined ? {} : { title }) };
}

/**
 * Strip markup down to readable text.
 *
 * Entities are decoded after tags are removed, so an escaped `&lt;b&gt;` in the
 * source stays literal text instead of becoming a tag that then disappears.
 *
 * Every block boundary collapses to a single newline: blank lines are not
 * preserved. Paragraph spacing is worth fewer tokens than it costs here, and a
 * source-level blank line is indistinguishable from the gap between two block
 * tags once the markup is gone.
 *
 * The `<title>` element is dropped from the body; use `extractTitle` for it. Left
 * in, it would be duplicated at the top of every page body.
 */
export function htmlToText(html: string): string {
  if (!html) return "";

  const stripped = html
    .replace(COMMENT_BLOCK, "")
    .replace(SCRIPT_BLOCK, "")
    .replace(STYLE_BLOCK, "")
    .replace(NOSCRIPT_BLOCK, "")
    .replace(TITLE_BLOCK, "")
    .replace(BLOCK_BOUNDARY, "\n")
    .replace(ANY_TAG, "");

  return decodeEntities(stripped)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** The document title, if the markup declares a non-empty one. */
export function extractTitle(html: string): string | undefined {
  const match = TITLE_TAG.exec(html);
  const raw = match?.[1];
  if (raw === undefined) return undefined;
  const title = decodeEntities(raw.replace(ANY_TAG, "")).replace(/\s+/g, " ").trim();
  return title.length > 0 ? title : undefined;
}

export function decodeEntities(text: string): string {
  return text
    .replace(NUMERIC_ENTITY, (match, code: string) => fromCodePoint(Number(code), match))
    .replace(HEX_ENTITY, (match, hex: string) => fromCodePoint(Number.parseInt(hex, 16), match))
    .replace(NAMED_ENTITY, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function fromCodePoint(code: number, fallback: string): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return fallback;
  // Lone surrogates are not valid Unicode scalar values.
  if (code >= 0xd800 && code <= 0xdfff) return fallback;
  return String.fromCodePoint(code);
}
