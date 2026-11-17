import { createDocument, type DominoDocument, type DominoElement } from "@mixmark-io/domino";
import TurndownService from "turndown";
import gfmPlugin from "turndown-plugin-gfm";

const TITLE_TAG = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i;
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

/** Site chrome that never carries document content. */
const NOISE_SELECTOR =
  "script, style, noscript, template, iframe, svg, canvas, nav, footer, aside, dialog, form, button, input, select, textarea";

/**
 * A candidate content container must hold at least this much text to displace
 * `<body>`, so a teaser-length `<article>` cannot shadow the rest of the page.
 */
const MIN_MAIN_TEXT_CHARS = 200;

/** One shared converter: constructing it is not free and rules never change. */
const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  hr: "---",
  emDelimiter: "*",
  strongDelimiter: "**",
});
turndown.use(gfmPlugin.gfm);

/**
 * Document conversion for the local fetch provider.
 *
 * A real DOM parse replaces the old regex flattening: headings keep their level,
 * lists keep their markers and numbering, tables become GFM tables, code blocks
 * keep their whitespace, and links keep their targets. Script, style and site
 * chrome are dropped before conversion; relative links resolve against the URL
 * the response actually came from, because a markdown link to `/next` is half a
 * link for a model that may want to follow it.
 */
export function extractDocument(html: string, baseUrl?: string): string {
  const document = createDocument(html);
  for (const element of Array.from(document.querySelectorAll(NOISE_SELECTOR))) element.remove();
  const root = contentRoot(document);
  if (baseUrl !== undefined) absolutizeUrls(root, baseUrl);
  return turndown.turndown(root as unknown as Parameters<TurndownService["turndown"]>[0]);
}

/**
 * The narrowest container that actually holds the content.
 *
 * `<main>`, `<article>` and `[role="main"]` are tried in document order; each
 * candidate must clear `MIN_MAIN_TEXT_CHARS`, and `<body>` is the floor. A page
 * with no container, or only containers below the floor, converts in full.
 */
function contentRoot(document: DominoDocument): DominoElement {
  for (const element of Array.from(document.querySelectorAll("main, article, [role='main']"))) {
    if (element.textContent.trim().length >= MIN_MAIN_TEXT_CHARS) return element;
  }
  return document.body;
}

/**
 * Resolve relative link and image targets in an HTML body, and return the HTML.
 *
 * Exported for the pandoc provider: it hands the HTML to the binary instead of
 * converting here, so the resolution must happen before the hand-off or the
 * markdown comes back full of half links a model cannot follow.
 */
export function resolveLinks(html: string, baseUrl: string): string {
  const document = createDocument(html);
  const root = document.body;
  absolutizeUrls(root, baseUrl);
  return root.innerHTML;
}

/** Resolve relative link and image targets so the markdown stands alone. */
function absolutizeUrls(root: DominoElement, baseUrl: string): void {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return;
  }

  for (const element of Array.from(root.querySelectorAll("a[href], img[src]"))) {
    const attribute = element.tagName === "A" ? "href" : "src";
    const value = element.getAttribute(attribute);
    // A fragment refers into this same document; leave it as the author wrote it.
    if (value === null || value === "" || value.startsWith("#")) continue;
    try {
      element.setAttribute(attribute, new URL(value, base).href);
    } catch {
      // An unresolvable target is passed through untouched.
    }
  }
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
