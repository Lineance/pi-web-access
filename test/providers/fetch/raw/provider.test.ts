import { describe, expect, it } from "vitest";

import { WebSearchError } from "../../../../src/orchestrator/errors.js";
import { RawFetchProvider } from "../../../../src/providers/fetch/raw/provider.js";
import type { Transport } from "../../../../src/transport/transport.js";

interface Reply {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
}

function provider(replies: Reply[]): { fetch: RawFetchProvider; calls: string[] } {
  const calls: string[] = [];
  const transport: Transport = async (url) => {
    calls.push(url);
    const reply = replies[calls.length - 1];
    if (reply === undefined) return new Response("no reply", { status: 500 });
    return new Response(reply.body ?? null, {
      status: reply.status ?? 200,
      headers: reply.headers ?? {},
    });
  };
  return { fetch: new RawFetchProvider({ transport }), calls };
}

describe("RawFetchProvider", () => {
  it("hands HTML back untouched instead of converting it", async () => {
    const markup = "<html><body><h1>Hi</h1><p>body</p></body></html>";
    const { fetch } = provider([{ headers: { "content-type": "text/html" }, body: markup }]);

    const content = await fetch.fetch({ url: "https://example.com/" });

    expect(content.kind === "text" && content.text).toBe(markup);
  });

  it("passes plain text through with its metadata", async () => {
    const { fetch } = provider([
      { headers: { "content-type": "text/plain", "content-length": "5" }, body: "hello" },
    ]);

    const content = await fetch.fetch({ url: "https://example.com/a.txt" });

    expect(content).toMatchObject({ kind: "text", text: "hello", contentLength: 5 });
  });

  it("still returns images as image blocks", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const { fetch } = provider([{ headers: { "content-type": "image/png" }, body: bytes }]);

    const content = await fetch.fetch({ url: "https://example.com/a.png" });

    expect(content).toMatchObject({ kind: "image", mimeType: "image/png" });
  });

  it("refuses unsupported content types like any other provider", async () => {
    const { fetch } = provider([{ headers: { "content-type": "application/pdf" }, body: "%PDF" }]);

    const error = await fetch
      .fetch({ url: "https://example.com/a.pdf" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WebSearchError);
    expect((error as WebSearchError).kind).toBe("unsupported");
  });
});
