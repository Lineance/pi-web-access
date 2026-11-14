import { describe, expect, it } from "vitest";

import { classifyContentType, isHtmlMimeType, normalizeMimeType } from "./content-kind.js";

describe("normalizeMimeType", () => {
  it("drops parameters and lowercases", () => {
    expect(normalizeMimeType("Text/HTML; charset=UTF-8")).toBe("text/html");
  });

  it("returns an empty string for a missing header", () => {
    expect(normalizeMimeType(null)).toBe("");
  });
});

describe("classifyContentType", () => {
  it.each([
    ["text/html; charset=utf-8", "text"],
    ["text/plain", "text"],
    ["text/markdown", "text"],
    ["application/json", "text"],
    ["application/xml", "text"],
    ["application/rss+xml", "text"],
    ["application/ld+json", "text"],
    ["application/javascript", "text"],
  ])("classifies %s as %s", (header, expected) => {
    expect(classifyContentType(header).kind).toBe(expected);
  });

  it.each(["image/png", "image/jpeg", "image/gif", "image/webp"])(
    "classifies %s as an image",
    (header) => {
      expect(classifyContentType(header).kind).toBe("image");
    },
  );

  it("reports PDF as unsupported with a factual reason", () => {
    const decision = classifyContentType("application/pdf");

    expect(decision.kind).toBe("unsupported");
    expect(decision.reason).toBe("application/pdf");
  });

  it("treats SVG as text, never as an image block", () => {
    // `+xml` wins: SVG is markup, and we hand it to the model as text. It is never
    // rendered here, so the script-carrying risk of an SVG does not apply, while
    // reading one is genuinely useful.
    const decision = classifyContentType("image/svg+xml");

    expect(decision.kind).toBe("text");
    expect(decision.mimeType).toBe("image/svg+xml");
  });

  it("refuses an image type pi cannot render", () => {
    expect(classifyContentType("image/tiff").kind).toBe("unsupported");
  });

  it("refuses a binary payload", () => {
    expect(classifyContentType("application/octet-stream").kind).toBe("unsupported");
  });

  it("reports a missing content type as unsupported rather than guessing text", () => {
    const decision = classifyContentType("");

    expect(decision.kind).toBe("unsupported");
    expect(decision.reason).toBe("missing content type");
  });
});

describe("isHtmlMimeType", () => {
  it("recognises HTML and XHTML only", () => {
    expect(isHtmlMimeType("text/html")).toBe(true);
    expect(isHtmlMimeType("application/xhtml")).toBe(true);
    expect(isHtmlMimeType("text/plain")).toBe(false);
  });
});
