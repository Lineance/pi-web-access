import { describe, expect, it } from "vitest";

import { substitute, substituteString } from "../../src/providers/substitute.js";

describe("substituteString", () => {
  it("replaces a whole-string query with the raw value", () => {
    expect(substituteString("{query}", { query: "hello world" })).toBe("hello world");
  });

  it("keeps a whole-string maxResults numeric so the body stays numeric", () => {
    const value = substituteString("{maxResults}", { maxResults: 7 });

    expect(value).toBe(7);
    expect(typeof value).toBe("number");
  });

  it("replaces an embedded placeholder inside surrounding text", () => {
    expect(substituteString("site:example.com {query}", { query: "cats" })).toBe(
      "site:example.com cats",
    );
  });

  it("percent-encodes a url placeholder", () => {
    expect(substituteString("https://reader/{url}", { url: "https://a.com/b?c=1" })).toBe(
      "https://reader/https%3A%2F%2Fa.com%2Fb%3Fc%3D1",
    );
  });

  it("stringifies maxResults when embedded", () => {
    expect(substituteString("limit-{maxResults}", { maxResults: 3 })).toBe("limit-3");
  });

  it("leaves a placeholder alone when the value is unknown", () => {
    expect(substituteString("{query}", {})).toBe("{query}");
  });

  it("leaves unknown braces alone", () => {
    expect(substituteString("{unknown} and {query}", { query: "x" })).toBe("{unknown} and x");
  });
});

describe("substitute", () => {
  it("walks nested objects and arrays", () => {
    const result = substitute(
      {
        q: "{query}",
        limit: "{maxResults}",
        options: { deep: ["{query}", "literal"] },
      },
      { query: "cats", maxResults: 5 },
    );

    expect(result).toEqual({
      q: "cats",
      limit: 5,
      options: { deep: ["cats", "literal"] },
    });
  });

  it("passes numbers and booleans through untouched", () => {
    expect(substitute({ a: 1, b: true, c: null }, {})).toEqual({ a: 1, b: true, c: null });
  });

  it("does not let a query containing JSON syntax break the body", () => {
    const result = substitute({ q: "{query}" }, { query: '"},"evil":"1' });

    expect(JSON.parse(JSON.stringify(result))).toEqual({ q: '"},"evil":"1' });
  });
});
