import { describe, expect, it } from "vitest";

import {
  MAX_SEARCH_RESULT_BYTES,
  MAX_SEARCH_SNIPPET_BYTES,
  normalizeSearchResults,
  truncateUtf8,
} from "./normalize.js";

describe("truncateUtf8", () => {
  it("leaves short text untouched", () => {
    expect(truncateUtf8("hello", 10)).toEqual({ text: "hello", bytes: 5 });
  });

  it("never splits a multi-byte character", () => {
    // Each CJK character is three bytes; four bytes would cut the second one.
    const result = truncateUtf8("中文中文", 4);

    expect(result.text).toBe("中");
    expect(result.text).not.toContain("\uFFFD");
    expect(result.bytes).toBe(3);
  });

  it("never splits a surrogate pair", () => {
    const result = truncateUtf8("😀😀", 5);

    expect(result.text).toBe("😀");
    expect(result.text).not.toContain("\uFFFD");
  });

  it("returns an empty string when not even one character fits", () => {
    expect(truncateUtf8("中文", 1).text).toBe("");
  });

  it("stringifies non-string input rather than throwing", () => {
    expect(truncateUtf8(undefined, 10).text).toBe("");
    expect(truncateUtf8(42, 10).text).toBe("42");
  });
});

describe("normalizeSearchResults", () => {
  const result = (title: string, snippet = "") => ({
    title,
    url: "https://example.com/page",
    snippet,
  });

  it("keeps results that fit", () => {
    const normalized = normalizeSearchResults([result("a"), result("b")], 5);

    expect(normalized).toHaveLength(2);
  });

  it("honours the requested result count", () => {
    const normalized = normalizeSearchResults([result("a"), result("b"), result("c")], 2);

    expect(normalized).toHaveLength(2);
  });

  it("caps a single snippet and marks the cut", () => {
    const normalized = normalizeSearchResults([result("t", "x".repeat(10_000))], 5);

    expect(normalized[0]?.snippet.length).toBe(MAX_SEARCH_SNIPPET_BYTES);
  });

  it("stops once the shared budget is spent instead of emitting partial entries", () => {
    const huge = Array.from({ length: 40 }, (_, index) =>
      result(`title-${index}`, "x".repeat(MAX_SEARCH_SNIPPET_BYTES)),
    );

    const normalized = normalizeSearchResults(huge, 40);
    const bytes = normalized.reduce(
      (sum, item) =>
        sum +
        Buffer.byteLength(item.title) +
        Buffer.byteLength(item.url) +
        Buffer.byteLength(item.snippet),
      0,
    );

    expect(normalized.length).toBeLessThan(huge.length);
    expect(bytes).toBeLessThanOrEqual(MAX_SEARCH_RESULT_BYTES);
  });
});
