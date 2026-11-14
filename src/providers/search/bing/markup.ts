/**
 * Fragment cleanup for the Bing provider.
 *
 * Bing hands back escaped HTML fragments — a `<h2><a>` title and a `<p>` snippet —
 * not documents. Only two things are done to them: drop the inline markup and
 * decode the entities Bing's renderer emits.
 *
 * Deliberately not the extractor used by the local fetch provider: that one owns
 * document-level policy (removing script/style, one line per block, dropping the
 * title). Sharing it would make those rules apply here by accident and let a change
 * over there alter search output.
 */

const SEPARATOR_TAG = /<\/?(?:br|p|div|li|ul|ol|tr|td|th|h[1-6]|blockquote|pre)\b[^>]*>/gi;
const ANY_TAG = /<(?:[^>"']|"[^"]*"|'[^']*')*>/g;

const NUMERIC_ENTITY = /&#(\d{1,7});/g;
const HEX_ENTITY = /&#[xX]([0-9a-fA-F]{1,6});/g;
const NAMED_ENTITY = /&([a-zA-Z][a-zA-Z0-9]{1,31});/g;

/**
 * The entities that actually appear in Bing's own output. Kept small on purpose:
 * an unknown entity is left as literal text, which is the safe failure, and a
 * larger table here would be a second thing to keep in sync for no gain.
 */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  middot: "\u00b7",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  times: "\u00d7",
  deg: "\u00b0",
};

/** Turn one escaped HTML fragment into a single line of plain text. */
export function cleanFragment(html: string): string {
  if (!html) return "";

  // A separator tag becomes a space first, so `<b>a</b><br><b>b</b>` does not weld
  // two words together once the markup is gone.
  const stripped = html.replace(SEPARATOR_TAG, " ").replace(ANY_TAG, "");

  return decodeEntities(stripped)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v\u00a0\n]+/g, " ")
    .trim();
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
