import { describe, expect, it } from "vitest";

import { cleanFragment, decodeEntities } from "../../../../src/providers/search/bing/markup.js";

describe("cleanFragment", () => {
  it("returns an empty string for empty input", () => {
    expect(cleanFragment("")).toBe("");
  });

  it("drops inline markup and keeps the text", () => {
    expect(cleanFragment("<strong>Node.js</strong> 26.13.0")).toBe("Node.js 26.13.0");
  });

  it("keeps the words apart when a line break disappears", () => {
    // Welding "a" and "b" into "ab" is the failure mode this guards against.
    expect(cleanFragment("a<br>b")).toBe("a b");
  });

  it("decodes named entities", () => {
    expect(cleanFragment("Cats &amp; dogs &hellip;")).toBe("Cats & dogs …");
  });

  it("decodes numeric and hex entities", () => {
    expect(cleanFragment("&#65;&#x42; &#8212;")).toBe("AB —");
  });

  it("collapses whitespace and non-breaking spaces", () => {
    expect(cleanFragment("a   b&nbsp;&nbsp;c")).toBe("a b c");
  });

  it("strips attributes that contain a closing angle bracket", () => {
    expect(cleanFragment('<a href="https://e.com" data-x="a>b">link</a>')).toBe("link");
  });

  it("leaves an unknown entity alone instead of mangling it", () => {
    expect(cleanFragment("&notarealentity; &amp;")).toBe("&notarealentity; &");
  });

  it("does not treat an escaped tag as markup", () => {
    expect(cleanFragment("&lt;script&gt;")).toBe("<script>");
  });

  it("refuses to build invalid unicode", () => {
    expect(cleanFragment("&#1114112;x")).toBe("&#1114112;x");
    expect(cleanFragment("&#xD800;")).toBe("&#xD800;");
  });

  it("collapses a newline inside a snippet into a space", () => {
    expect(cleanFragment("first line\nsecond line")).toBe("first line second line");
  });
});

describe("decodeEntities", () => {
  it("preserves an ampersand that does not start an entity", () => {
    expect(decodeEntities("a & b")).toBe("a & b");
  });

  it("does not decode the same text twice", () => {
    expect(decodeEntities("&amp;lt;")).toBe("&lt;");
  });
});
