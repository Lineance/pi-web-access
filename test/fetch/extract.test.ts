import { describe, expect, it } from "vitest";

import { decodeEntities, extractTitle, htmlToText } from "../../src/fetch/extract.js";

describe("htmlToText", () => {
  it("returns an empty string for empty input", () => {
    expect(htmlToText("")).toBe("");
  });

  it("drops script, style and noscript bodies", () => {
    const html =
      "<p>keep</p><script>var secret = 1;</script><style>.a{color:red}</style><noscript>no js</noscript>";

    const text = htmlToText(html);

    expect(text).toBe("keep");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("no js");
  });

  it("drops comments without inventing whitespace", () => {
    // A comment is zero-width in a browser, so the two halves join: "ab", not "a b".
    expect(htmlToText("<p>a<!-- hidden -->b</p>")).toBe("ab");
  });

  it("turns block-level tags into line breaks", () => {
    expect(htmlToText("<h1>Title</h1><p>one</p><p>two</p>")).toBe("Title\none\ntwo");
  });

  it("turns <br> into a line break", () => {
    expect(htmlToText("a<br>b<br/>c")).toBe("a\nb\nc");
  });

  it("keeps the text of list items on separate lines", () => {
    expect(htmlToText("<ul><li>a</li><li>b</li></ul>")).toBe("a\nb");
  });

  it("strips tags whose attributes contain a closing angle bracket", () => {
    const html = '<a href="https://example.com" data-x="a>b">link</a>';

    expect(htmlToText(html)).toBe("link");
  });

  it("decodes numeric and hex entities", () => {
    expect(htmlToText("<p>&#65;&#x42;</p>")).toBe("AB");
  });

  it("decodes named entities", () => {
    expect(htmlToText("<p>a &amp; b &lt;c&gt; &hellip;</p>")).toBe("a & b <c> …");
  });

  it("leaves unknown entities alone instead of mangling them", () => {
    expect(htmlToText("<p>&notarealentity; &amp;</p>")).toBe("&notarealentity; &");
  });

  it("does not treat an escaped tag as markup", () => {
    expect(htmlToText("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")).toBe(
      "<script>alert(1)</script>",
    );
  });

  it("refuses to build invalid unicode from an out-of-range code point", () => {
    expect(htmlToText("<p>&#1114112;x</p>")).toBe("&#1114112;x");
  });

  it("refuses lone surrogates", () => {
    expect(htmlToText("<p>&#xD800;</p>")).toBe("&#xD800;");
  });

  it("collapses horizontal whitespace and non-breaking spaces", () => {
    expect(htmlToText("<p>a   b&nbsp;&nbsp;c</p>")).toBe("a b c");
  });

  it("collapses adjacent block boundaries into a single newline", () => {
    expect(htmlToText("<p>a</p><div></div><div></div><p>b</p>")).toBe("a\nb");
  });

  it("does not preserve source-level blank lines", () => {
    expect(htmlToText("<p>a</p>\n\n\n<p>b</p>")).toBe("a\nb");
  });

  it("normalises CRLF line endings", () => {
    expect(htmlToText("<p>a\r\nb</p>")).toBe("a\nb");
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
});
