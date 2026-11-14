import { describe, expect, it } from "vitest";

import { ChainExhaustedError, WebSearchError, formatFailures, kindForStatus, toFailure } from "./errors.js";

describe("kindForStatus", () => {
  it("treats 429 and 402 as quota problems", () => {
    expect(kindForStatus(429)).toBe("quota");
    expect(kindForStatus(402)).toBe("quota");
  });

  it("treats 401 and 403 as credential problems", () => {
    expect(kindForStatus(401)).toBe("auth");
    expect(kindForStatus(403)).toBe("auth");
  });

  it("treats everything else as a transport problem", () => {
    expect(kindForStatus(500)).toBe("transport");
    expect(kindForStatus(404)).toBe("transport");
  });
});

describe("toFailure", () => {
  it("keeps the classification of a WebSearchError", () => {
    const failure = toFailure("fallback", new WebSearchError("parse", "tavily", "bad shape"));

    expect(failure).toEqual({ provider: "tavily", kind: "parse", message: "bad shape" });
  });

  it("classifies an unknown thrown value as a transport failure", () => {
    const failure = toFailure("tavily", new Error("ECONNRESET"));

    expect(failure.kind).toBe("transport");
    expect(failure.provider).toBe("tavily");
  });

  it("keeps only the first line, so an HTML error page cannot flood the context", () => {
    const failure = toFailure("tavily", new Error("upstream failed\n<html>…500 lines…</html>"));

    expect(failure.message).toBe("upstream failed");
  });

  it("caps a pathological single line", () => {
    const failure = toFailure("tavily", new Error("x".repeat(5_000)));

    expect(failure.message.length).toBe(160);
  });
});

describe("formatFailures", () => {
  it("renders a compact provider:kind list without vendor prose", () => {
    const rendered = formatFailures([
      { provider: "tavily", kind: "quota", message: "Tavily search error (429)" },
      { provider: "exa", kind: "auth", message: "Exa search error (401)" },
      { provider: "firecrawl", kind: "parse", message: "results field missing" },
    ]);

    expect(rendered).toBe("tavily:quota exa:auth firecrawl:parse");
  });

  it("stays readable when nothing was attempted", () => {
    expect(formatFailures([])).toBe("no providers attempted");
  });
});

describe("ChainExhaustedError", () => {
  it("carries the individual failures and summarises them in the message", () => {
    const error = new ChainExhaustedError([
      { provider: "tavily", kind: "quota", message: "429" },
      { provider: "bing", kind: "transport", message: "timeout" },
    ]);

    expect(error.kind).toBe("exhausted");
    expect(error.failures).toHaveLength(2);
    expect(error.message).toBe("tavily:quota bing:transport");
  });
});
