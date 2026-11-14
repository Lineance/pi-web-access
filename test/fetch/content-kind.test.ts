import { describe, expect, it } from "vitest";

import {
  classifyContentType,
  isHtmlMimeType,
  normalizeMimeType,
} from "../../src/fetch/content-kind.js";

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

  it("treats SVG as text, matching what the read tool does for an .svg file", () => {
    // Two constraints meet here. It cannot be an image block: pi forwards the
    // mimeType verbatim and no target provider accepts image/svg+xml, which would
    // reject the whole conversation rather than one turn. And refusing it loses a
    // real capability, since inlining an icon or reading a chart spec from SVG
    // source is a normal coding task.
    const decision = classifyContentType("image/svg+xml");

    expect(decision.kind).toBe("text");
    expect(decision.mimeType).toBe("image/svg+xml");
  });

  it.each(["image/tiff", "image/bmp", "image/heic", "image/avif"])(
    "refuses %s: not textual, and no provider accepts it as an image block",
    (header) => {
      expect(classifyContentType(header).kind).toBe("unsupported");
    },
  );

  it("keeps SVG out of the image arm even though it is declared image/*", () => {
    // Regression guard for the ordering: testing `image/` before the textual arm
    // would turn SVG into an unsupported type and nobody would notice.
    expect(classifyContentType("image/svg+xml").kind).toBe("text");
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
