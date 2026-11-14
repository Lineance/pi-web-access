import { describe, expect, it } from "vitest";

import { truncateForContext } from "./truncate.js";

describe("truncateForContext", () => {
  it("passes short text through untouched", () => {
    const result = truncateForContext("a\nb\nc");

    expect(result.truncated).toBe(false);
    expect(result.text).toBe("a\nb\nc");
    expect(result.omittedLines).toBe(0);
  });

  it("keeps the head of the page when the line cap is hit", () => {
    const text = Array.from({ length: 10 }, (_, index) => `line-${index}`).join("\n");
    const result = truncateForContext(text, 3, 1_000_000);

    expect(result.truncated).toBe(true);
    expect(result.text).toBe("line-0\nline-1\nline-2");
    expect(result.shownLines).toBe(3);
    expect(result.totalLines).toBe(10);
    expect(result.omittedLines).toBe(7);
  });

  it("respects the byte cap even when the line cap is generous", () => {
    const text = Array.from({ length: 100 }, () => "x".repeat(100)).join("\n");
    const result = truncateForContext(text, 2_000, 250);

    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.text, "utf8")).toBeLessThanOrEqual(250);
  });
});
