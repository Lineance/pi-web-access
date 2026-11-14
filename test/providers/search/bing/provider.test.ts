import { describe, expect, it } from "vitest";

import type { WebSearchError } from "../../../../src/orchestrator/errors.js";
import {
  BingProvider,
  decodeBingUrl,
  parseBingResults,
} from "../../../../src/providers/search/bing/provider.js";
import type { Transport } from "../../../../src/transport/transport.js";

const block = (options: {
  href: string;
  title: string;
  lineclamp?: string;
  caption?: string;
}): string => `
<li class="b_algo" data-id>
  <h2><a href="${options.href}" h="ID=SERP">${options.title}</a></h2>
  ${
    options.lineclamp === undefined
      ? ""
      : `<p class="b_lineclamp4 b_algoSlug">${options.lineclamp}</p>`
  }
  ${options.caption === undefined ? "" : `<div class="b_caption"><p>${options.caption}</p></div>`}
</li>`;

const ckUrl = (target: string): string =>
  `/ck/a?!&&p=abc&u=a1${Buffer.from(target).toString("base64url")}&ntb=1`;

interface Captured {
  url: string;
  init: RequestInit | undefined;
}

function harness(replies: Array<{ status?: number; body: string; contentType?: string }>): {
  transport: Transport;
  requests: Captured[];
} {
  const requests: Captured[] = [];
  const transport: Transport = async (url, init) => {
    const reply = replies[Math.min(requests.length, replies.length - 1)];
    requests.push({ url, init });
    if (reply === undefined) return new Response("no reply", { status: 500 });
    return new Response(reply.body, {
      status: reply.status ?? 200,
      headers: { "content-type": reply.contentType ?? "text/html; charset=utf-8" },
    });
  };
  return { transport, requests };
}

describe("parseBingResults", () => {
  it("extracts title, url and snippet from a result block", () => {
    const html = block({
      href: "https://example.com/a",
      title: "Example title",
      lineclamp: "A short description.",
    });

    expect(parseBingResults(html, 5)).toEqual([
      { title: "Example title", url: "https://example.com/a", snippet: "A short description." },
    ]);
  });

  it("falls back to the b_caption paragraph when there is no lineclamp", () => {
    const html = block({
      href: "https://example.com/b",
      title: "Caption",
      caption: "From the caption block.",
    });

    expect(parseBingResults(html, 5)[0]?.snippet).toBe("From the caption block.");
  });

  it("returns an empty snippet when neither container is present", () => {
    const html = block({ href: "https://example.com/c", title: "Bare" });

    expect(parseBingResults(html, 5)[0]?.snippet).toBe("");
  });

  it("decodes entities and strips inline markup from the title", () => {
    const html = block({
      href: "https://example.com/d",
      title: "Cats &amp; <strong>dogs</strong>",
    });

    expect(parseBingResults(html, 5)[0]?.title).toBe("Cats & dogs");
  });

  it("stops at the requested count", () => {
    const html = [1, 2, 3, 4]
      .map((index) => block({ href: `https://e.com/${index}`, title: `t${index}` }))
      .join("\n");

    expect(parseBingResults(html, 2)).toHaveLength(2);
  });

  it("skips a block that only resolves back to bing", () => {
    const html = block({ href: "/images/search", title: "Not a result" });

    expect(parseBingResults(html, 5)).toEqual([]);
  });

  it("returns nothing for a page with no result blocks", () => {
    expect(parseBingResults("<html><body>no results</body></html>", 5)).toEqual([]);
  });
});

describe("decodeBingUrl", () => {
  it("unwraps a click-tracking url into its destination", () => {
    expect(decodeBingUrl(ckUrl("https://example.com/real?q=1"))).toBe(
      "https://example.com/real?q=1",
    );
  });

  it("leaves an ordinary external url alone", () => {
    expect(decodeBingUrl("https://example.com/direct")).toBe("https://example.com/direct");
  });

  it("resolves a relative href against bing", () => {
    expect(decodeBingUrl("/images/search")).toBe("https://www.bing.com/images/search");
  });

  it("falls back to the bing url when the payload is not a url", () => {
    const href = `/ck/a?u=a1${Buffer.from("not-a-url").toString("base64url")}`;

    expect(decodeBingUrl(href)).toContain("bing.com/ck/a");
  });

  it("falls back when the payload is not valid base64", () => {
    expect(decodeBingUrl("/ck/a?u=a1%%%")).toContain("bing.com/ck/a");
  });
});

describe("BingProvider", () => {
  it("returns results and sends a browser user agent", async () => {
    const html = block({ href: ckUrl("https://example.com/x"), title: "Wrapped" });
    const { transport, requests } = harness([{ body: html }]);

    const results = await new BingProvider(transport).search("query", 5);

    expect(results).toEqual([{ title: "Wrapped", url: "https://example.com/x", snippet: "" }]);
    const headers = requests[0]?.init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("Mozilla/5.0");
    expect(headers["Accept-Language"]).toContain("en-US");
  });

  it("sends the query in the q parameter", async () => {
    const { transport, requests } = harness([
      { body: block({ href: "https://e.com", title: "t" }) },
    ]);

    await new BingProvider(transport).search("hello world", 5);

    expect(new URL(requests[0]!.url).searchParams.get("q")).toBe("hello world");
  });

  it("returns an empty list for a genuinely empty short page", async () => {
    const { transport } = harness([{ body: "<html><body>no results</body></html>" }]);

    await expect(new BingProvider(transport).search("q", 5)).resolves.toEqual([]);
  });

  it("treats a large page with no results as a verification page and retries", async () => {
    const filler = `<html><body>${"x".repeat(2000)}</body></html>`;
    const { transport, requests } = harness([{ body: filler }, { body: filler }]);

    const error = await new BingProvider(transport)
      .search("q", 5)
      .catch((caught: unknown) => caught);

    expect((error as WebSearchError).kind).toBe("parse");
    expect(requests).toHaveLength(2);
  });

  it("retries a transport failure and surfaces the last error", async () => {
    const { transport, requests } = harness([
      { status: 500, body: "boom" },
      { status: 503, body: "boom" },
    ]);

    const error = await new BingProvider(transport)
      .search("q", 5)
      .catch((caught: unknown) => caught);

    expect((error as WebSearchError).kind).toBe("transport");
    expect((error as WebSearchError).status).toBe(503);
    expect(requests).toHaveLength(2);
  });

  it("does not retry a rate limit", async () => {
    const { transport, requests } = harness([{ status: 429, body: "slow down" }]);

    const error = await new BingProvider(transport)
      .search("q", 5)
      .catch((caught: unknown) => caught);

    expect((error as WebSearchError).kind).toBe("quota");
    expect(requests).toHaveLength(1);
  });

  it("honours an already aborted signal", async () => {
    const { transport, requests } = harness([{ body: "" }]);
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));

    await expect(new BingProvider(transport).search("q", 5, controller.signal)).rejects.toThrow(
      /cancelled/,
    );
    expect(requests).toHaveLength(0);
  });
});
