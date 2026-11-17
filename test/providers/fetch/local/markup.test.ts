import { describe, expect, it } from "vitest";

import {
  decodeEntities,
  extractDocument,
  extractTitle,
} from "../../../../src/providers/fetch/local/markup.js";

describe("extractDocument", () => {
  it("renders structure-preserving markdown", () => {
    const html =
      '<html><head><title>Doc</title><style>.a{}</style></head><body><h2>Install</h2><ol><li>Clone</li><li>npm install</li></ol><p>see <a href="docs.md">docs</a></p></body></html>';

    expect(extractDocument(html, "https://example.com/guide/index.html")).toBe(
      "## Install\n\n1.  Clone\n2.  npm install\n\nsee [docs](https://example.com/guide/docs.md)",
    );
  });

  it("keeps the document title out of the body", () => {
    expect(extractDocument("<html><head><title>Doc</title></head><body><p>x</p></body></html>")).toBe(
      "x",
    );
  });

  it("drops site chrome before conversion", () => {
    const html =
      `<html><body><nav>Menu</nav><script>bad()</script><article><p>${"word ".repeat(60)}</p></article><footer>foot</footer></body></html>`;

    const text = extractDocument(html);
    expect(text).toContain("word word word");
    expect(text).not.toContain("Menu");
    expect(text).not.toContain("bad()");
    expect(text).not.toContain("foot");
  });

  it("prefers a substantial main container over the body", () => {
    const html =
      `<html><body><aside>sidebar text</aside><main><p>${"word ".repeat(60)}</p></main><p>outside the main element</p></body></html>`;

    const text = extractDocument(html);
    expect(text).toContain("word word word");
    expect(text).not.toContain("sidebar text");
    expect(text).not.toContain("outside the main element");
  });

  it("falls back to the body when the container is too short", () => {
    const html = "<html><body><main>teaser</main><p>the rest of the page</p></body></html>";

    expect(extractDocument(html)).toBe("teaser\n\nthe rest of the page");
  });

  it("renders GFM tables and preserves code block whitespace", () => {
    const html =
      "<html><body><table><tr><th>cmd</th><th>act</th></tr><tr><td>make</td><td>build</td></tr></table><pre><code>npm run a\n  indented  keep</code></pre></body></html>";

    expect(extractDocument(html)).toBe(
      "| cmd | act |\n| --- | --- |\n| make | build |\n\n```\nnpm run a\n  indented  keep\n```",
    );
  });

  it("resolves relative link and image targets against the final URL", () => {
    const html =
      '<html><body><p><a href="/docs.md">abs root</a> <a href="../up.md">up</a> <a href="#top">top</a> <a href="https://other.net/x">ext</a> <img src="/i.png" alt="pic"></p></body></html>';

    expect(extractDocument(html, "https://example.com/a/b/c.html")).toBe(
      "[abs root](https://example.com/docs.md) [up](https://example.com/a/up.md) [top](#top) [ext](https://other.net/x) ![pic](https://example.com/i.png)",
    );
  });

  it("keeps an escaped tag as literal text", () => {
    expect(extractDocument("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")).toBe(
      "<script>alert(1)</script>",
    );
  });

  it("survives malformed markup", () => {
    expect(extractDocument("<p>unclosed <b>bold <i>both")).toBe("unclosed **bold *both***");
  });

  it("returns an empty string for an empty body", () => {
    expect(extractDocument("<html><body></body></html>")).toBe("");
  });
});

describe("extractTitle", () => {
  it("reads a plain title", () => {
    expect(extractTitle("<html><head><title> Hello </title></head></html>")).toBe("Hello");
  });

  it("decodes entities in the title", () => {
    expect(extractTitle("<title>a &amp; b</title>")).toBe("a & b");
  });

  it("collapses whitespace in the title", () => {
    expect(extractTitle("<title>a\n   b</title>")).toBe("a b");
  });

  it("returns undefined when there is no title", () => {
    expect(extractTitle("<p>x</p>")).toBeUndefined();
  });

  it("returns undefined for an empty title", () => {
    expect(extractTitle("<title>   </title>")).toBeUndefined();
  });
});

describe("decodeEntities", () => {
  it("preserves an ampersand that does not start an entity", () => {
    expect(decodeEntities("a & b")).toBe("a & b");
  });

  it("decodes repeatedly distinct entities in one pass", () => {
    expect(decodeEntities("&#60;&#62;")).toBe("<>");
  });

  it("refuses to build invalid unicode from an out-of-range code point", () => {
    expect(decodeEntities("&#1114112;x")).toBe("&#1114112;x");
  });

  it("refuses lone surrogates", () => {
    expect(decodeEntities("&#xD800;")).toBe("&#xD800;");
  });
});
