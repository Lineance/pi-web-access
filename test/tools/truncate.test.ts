import { describe, expect, it } from "vitest";

import { truncateForContext } from "../../src/tools/truncate.js";

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

  it("clips a single over-long line instead of returning nothing", () => {
    // Minified HTML and one-line JSON are exactly this shape.
    const result = truncateForContext("x".repeat(120_000), 2_000, 51_200);

    expect(result.truncated).toBe(true);
    expect(result.clippedMidLine).toBe(true);
    expect(result.text.length).toBe(51_200);
  });

  it("clips a single long line at a character boundary", () => {
    const result = truncateForContext("中".repeat(40_000), 2_000, 51_200);

    expect(result.text).not.toContain("�");
    expect(Buffer.byteLength(result.text, "utf8")).toBeLessThanOrEqual(51_200);
    expect(result.text.length).toBe(17_066);
  });

  it("reports a mid-line clip separately from dropped lines", () => {
    const result = truncateForContext("x".repeat(120_000), 2_000, 51_200);

    expect(result.shownLines).toBe(1);
    expect(result.totalLines).toBe(1);
    expect(result.omittedLines).toBe(0);
  });

  it("respects the byte cap even when the line cap is generous", () => {
    const text = Array.from({ length: 100 }, () => "x".repeat(100)).join("\n");
    const result = truncateForContext(text, 2_000, 250);

    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.text, "utf8")).toBeLessThanOrEqual(250);
  });
});
