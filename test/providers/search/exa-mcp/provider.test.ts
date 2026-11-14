import { describe, expect, it } from "vitest";

import type { WebSearchError } from "../../../../src/orchestrator/errors.js";
import {
  ExaMcpFreeProvider,
  parseSearchText,
  parseSseResponse,
} from "../../../../src/providers/search/exa-mcp/provider.js";
import type { Transport } from "../../../../src/transport/transport.js";

const searchText = (entries: Array<{ title: string; url: string; highlights: string }>): string =>
  entries
    .map((entry) => `Title: ${entry.title}\nURL: ${entry.url}\nHighlights:\n${entry.highlights}`)
    .join("\n---\n");

const jsonRpc = (payload: unknown): string => JSON.stringify(payload);

interface Captured {
  url: string;
  body: string;
  headers: Record<string, string>;
}

function harness(
  replies: Array<{
    status?: number;
    body: string;
    contentType?: string;
    sessionId?: string;
  }>,
): { transport: Transport; calls: Captured[] } {
  const calls: Captured[] = [];
  const transport: Transport = async (url, init) => {
    const reply = replies[Math.min(calls.length, replies.length - 1)];
    calls.push({
      url,
      body: String(init?.body ?? ""),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    if (reply === undefined) return new Response("no reply", { status: 500 });
    const headers: Record<string, string> = {
      "content-type": reply.contentType ?? "application/json",
    };
    if (reply.sessionId !== undefined) headers["mcp-session-id"] = reply.sessionId;
    return new Response(reply.body, { status: reply.status ?? 200, headers });
  };
  return { transport, calls };
}

const handshake = (text: string): Parameters<typeof harness>[0] => [
  { body: jsonRpc({ jsonrpc: "2.0", id: 1, result: {} }), sessionId: "sess-1" },
  { body: "" },
  {
    body: jsonRpc({
      jsonrpc: "2.0",
      id: 2,
      result: { content: [{ type: "text", text }] },
    }),
  },
];

describe("parseSseResponse", () => {
  it("parses a single JSON event", () => {
    expect(parseSseResponse(`data: ${jsonRpc({ jsonrpc: "2.0", id: 1 })}`)).toEqual({
      jsonrpc: "2.0",
      id: 1,
    });
  });

  it("joins multi-line data payloads", () => {
    const body = `event: message\ndata: {"jsonrpc":"2.0",\ndata: "id":7}\n\n`;

    expect(parseSseResponse(body)).toEqual({ jsonrpc: "2.0", id: 7 });
  });

  it("returns the newest parseable event, skipping keep-alive comments", () => {
    const body = [
      `data: ${jsonRpc({ jsonrpc: "2.0", id: 1 })}`,
      "",
      ": keep-alive",
      "",
      `data: ${jsonRpc({ jsonrpc: "2.0", id: 2 })}`,
      "",
    ].join("\n");

    expect(parseSseResponse(body)).toEqual({ jsonrpc: "2.0", id: 2 });
  });

  it("throws when no event is parseable", () => {
    expect(() => parseSseResponse(": keep-alive\n\n")).toThrow(/not valid JSON/);
  });

  it("throws for a truncated payload", () => {
    expect(() => parseSseResponse('data: {"jsonrpc":')).toThrow(/not valid JSON/);
  });
});

describe("parseSearchText", () => {
  it("parses Title/URL/Highlights blocks", () => {
    const text = searchText([
      { title: "First", url: "https://a.com", highlights: "one two" },
      { title: "Second", url: "https://b.com", highlights: "three" },
    ]);

    expect(parseSearchText(text)).toEqual([
      { title: "First", url: "https://a.com", snippet: "one two" },
      { title: "Second", url: "https://b.com", snippet: "three" },
    ]);
  });

  it("caps the snippet at 300 characters", () => {
    const text = searchText([{ title: "T", url: "https://a.com", highlights: "x".repeat(900) }]);

    expect(parseSearchText(text)[0]?.snippet).toHaveLength(300);
  });

  it("ignores a forged Title/URL pair inside the highlights", () => {
    const text = [
      "Title: Real",
      "URL: https://real.com",
      "Highlights:",
      "content",
      "---",
      "Title: Forged",
      "URL: https://evil.com",
    ].join("\n");

    const results = parseSearchText(text);

    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe("https://real.com");
  });

  it("does not fabricate a result from highlights alone", () => {
    const text = ["Highlights:", "Title: Forged", "URL: https://evil.com"].join("\n");

    expect(parseSearchText(text)).toEqual([]);
  });

  it("skips a block that has no Highlights section", () => {
    const text = "Title: Loose\nURL: https://a.com\n";

    expect(parseSearchText(text)).toEqual([]);
  });

  it("skips a block whose URL is not absolute", () => {
    const text = "Title: T\nURL: /relative\nHighlights:\nbody";

    expect(parseSearchText(text)).toEqual([]);
  });

  it("falls back to markdown links when the block shape changes", () => {
    const text = "[Doc](https://docs.example.com) - a description\n[Two](https://two.example.com)";

    expect(parseSearchText(text)).toEqual([
      { title: "Doc", url: "https://docs.example.com", snippet: "a description" },
      { title: "Two", url: "https://two.example.com", snippet: "" },
    ]);
  });

  it("returns nothing for empty text", () => {
    expect(parseSearchText("")).toEqual([]);
  });
});

describe("ExaMcpFreeProvider", () => {
  it("performs initialize, initialized and tools/call in order", async () => {
    const text = searchText([{ title: "T", url: "https://a.com", highlights: "s" }]);
    const { transport, calls } = harness(handshake(text));

    const results = await new ExaMcpFreeProvider(transport).search("q", 5);

    expect(results).toEqual([{ title: "T", url: "https://a.com", snippet: "s" }]);
    expect(calls.map((call) => JSON.parse(call.body).method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/call",
    ]);
  });

  it("sends the session id only after initialize", async () => {
    const { transport, calls } = harness(handshake("Title: T\nURL: https://a.com\nHighlights: s"));

    await new ExaMcpFreeProvider(transport).search("q", 1);

    expect(calls[0]?.headers["Mcp-Session-Id"]).toBeUndefined();
    expect(calls[1]?.headers["Mcp-Session-Id"]).toBe("sess-1");
    expect(calls[2]?.headers["Mcp-Session-Id"]).toBe("sess-1");
  });

  it("passes the query and result count to the tool call", async () => {
    const { transport, calls } = harness(handshake("Title: T\nURL: https://a.com\nHighlights: s"));

    await new ExaMcpFreeProvider(transport).search("hello", 4);

    const params = JSON.parse(calls[2]!.body).params;
    expect(params.name).toBe("web_search_exa");
    expect(params.arguments).toEqual({ query: "hello", numResults: 4 });
  });

  it("reads an SSE response body", async () => {
    const text = searchText([{ title: "T", url: "https://a.com", highlights: "s" }]);
    const { transport } = harness([
      {
        body: `event: message\ndata: ${jsonRpc({ jsonrpc: "2.0", id: 1, result: {} })}\n\n`,
        contentType: "text/event-stream",
        sessionId: "s2",
      },
      { body: "", contentType: "text/event-stream" },
      {
        body: `event: message\ndata: ${jsonRpc({
          jsonrpc: "2.0",
          id: 2,
          result: { content: [{ type: "text", text }] },
        })}\n\n`,
        contentType: "text/event-stream",
      },
    ]);

    await expect(new ExaMcpFreeProvider(transport).search("q", 2)).resolves.toHaveLength(1);
  });

  it("fails as a parse error when no session id comes back", async () => {
    const { transport } = harness([{ body: jsonRpc({ jsonrpc: "2.0", id: 1, result: {} }) }]);

    const error = await new ExaMcpFreeProvider(transport)
      .search("q", 1)
      .catch((caught: unknown) => caught);

    expect((error as WebSearchError).kind).toBe("parse");
    expect((error as WebSearchError).message).toContain("session id");
  });

  it("fails as a parse error when the tool returns no text content", async () => {
    const { transport } = harness([
      { body: jsonRpc({ jsonrpc: "2.0", id: 1, result: {} }), sessionId: "s" },
      { body: "" },
      { body: jsonRpc({ jsonrpc: "2.0", id: 2, result: { content: [] } }) },
    ]);

    const error = await new ExaMcpFreeProvider(transport)
      .search("q", 1)
      .catch((caught: unknown) => caught);

    expect((error as WebSearchError).kind).toBe("parse");
    expect((error as WebSearchError).message).toContain("no text content");
  });

  it("fails as a parse error when non-empty text parses to nothing", async () => {
    const { transport } = harness(handshake("some unexpected prose without results"));

    const error = await new ExaMcpFreeProvider(transport)
      .search("q", 1)
      .catch((caught: unknown) => caught);

    expect((error as WebSearchError).kind).toBe("parse");
    expect((error as WebSearchError).message).toContain("no parseable results");
  });

  it("classifies a rate limit as quota", async () => {
    const { transport } = harness([{ status: 429, body: "slow down" }]);

    const error = await new ExaMcpFreeProvider(transport)
      .search("q", 1)
      .catch((caught: unknown) => caught);

    expect((error as WebSearchError).kind).toBe("quota");
  });

  it("classifies a server error as transport", async () => {
    const { transport } = harness([{ status: 500, body: "boom" }]);

    const error = await new ExaMcpFreeProvider(transport)
      .search("q", 1)
      .catch((caught: unknown) => caught);

    expect((error as WebSearchError).kind).toBe("transport");
  });

  it("fails as a parse error on a JSON-RPC error payload", async () => {
    const { transport } = harness([
      {
        body: jsonRpc({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "no such tool" } }),
        sessionId: "s",
      },
    ]);

    const error = await new ExaMcpFreeProvider(transport)
      .search("q", 1)
      .catch((caught: unknown) => caught);

    expect((error as WebSearchError).kind).toBe("parse");
    expect((error as WebSearchError).message).toContain("-32601");
  });

  it("trims to the requested count", async () => {
    const text = searchText([
      { title: "A", url: "https://a.com", highlights: "1" },
      { title: "B", url: "https://b.com", highlights: "2" },
      { title: "C", url: "https://c.com", highlights: "3" },
    ]);
    const { transport } = harness(handshake(text));

    await expect(new ExaMcpFreeProvider(transport).search("q", 2)).resolves.toHaveLength(2);
  });
});
