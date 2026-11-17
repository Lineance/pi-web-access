import { describe, expect, it } from "vitest";

import { WebSearchError } from "../../../../src/orchestrator/errors.js";
import { LocalFetchProvider } from "../../../../src/providers/fetch/local/provider.js";
import type { Transport } from "../../../../src/transport/transport.js";

interface Reply {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
}

interface Harness {
  transport: Transport;
  calls: string[];
}

/** Builds a transport that replays canned replies and records every URL it saw. */
function harness(replies: Reply[] | ((url: string) => Reply)): Harness {
  const calls: string[] = [];
  const transport: Transport = async (url) => {
    const index = calls.length;
    calls.push(url);
    const reply = typeof replies === "function" ? replies(url) : replies[index];
    if (reply === undefined) return new Response("no reply", { status: 500 });
    const status = reply.status ?? 200;
    const body = reply.body ?? null;
    const nullBodyStatus = status === 101 || status === 204 || status === 205 || status === 304;
    return new Response(nullBodyStatus ? null : body, {
      status,
      headers: reply.headers ?? {},
    });
  };
  return { transport, calls };
}

function provider(replies: Reply[] | ((url: string) => Reply)): {
  fetch: LocalFetchProvider;
  calls: string[];
} {
  const { transport, calls } = harness(replies);
  return { fetch: new LocalFetchProvider({ transport }), calls };
}

describe("LocalFetchProvider", () => {
  describe("text responses", () => {
    it("returns a plain text body unchanged", async () => {
      const { fetch } = provider([{ headers: { "content-type": "text/plain" }, body: "hello" }]);

      const content = await fetch.fetch({ url: "https://example.com/a.txt" });

      expect(content).toMatchObject({ kind: "text", text: "hello" });
    });

    it("renders HTML as markdown and keeps the title", async () => {
      const { fetch } = provider([
        {
          headers: { "content-type": "text/html; charset=utf-8" },
          body: "<html><head><title>Doc</title><style>x{}</style></head><body><h1>Hi</h1><p>body</p></body></html>",
        },
      ]);

      const content = await fetch.fetch({ url: "https://example.com/" });

      expect(content).toMatchObject({ kind: "text", title: "Doc" });
      expect(content.kind === "text" && content.text).toBe("# Hi\n\nbody");
    });

    it("resolves relative links against the final redirect URL", async () => {
      const { fetch } = provider([
        { status: 302, headers: { location: "https://example.com/final/" } },
        {
          headers: { "content-type": "text/html" },
          body: '<html><body><p><a href="next.md">next</a></p></body></html>',
        },
      ]);

      const content = await fetch.fetch({ url: "https://example.com/start" });

      expect(content.kind === "text" && content.text).toContain(
        "[next](https://example.com/final/next.md)",
      );
    });

    it("decodes using the charset declared by the response", async () => {
      // GBK bytes for 中文.
      const gbk = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]);
      const { fetch } = provider([
        { headers: { "content-type": "text/plain; charset=gbk" }, body: gbk },
      ]);

      const content = await fetch.fetch({ url: "https://example.com/gbk" });

      expect(content.kind === "text" && content.text).toBe("中文");
    });

    it("reports the content length when the header is present", async () => {
      const { fetch } = provider([
        { headers: { "content-type": "text/plain", "content-length": "5" }, body: "hello" },
      ]);

      const content = await fetch.fetch({ url: "https://example.com/a.txt" });

      expect(content.kind === "text" && content.contentLength).toBe(5);
    });
  });

  describe("images", () => {
    it("returns base64 bytes for a renderable image type", async () => {
      const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      const { fetch } = provider([{ headers: { "content-type": "image/png" }, body: bytes }]);

      const content = await fetch.fetch({ url: "https://example.com/a.png" });

      expect(content).toMatchObject({
        kind: "image",
        mimeType: "image/png",
        byteLength: 4,
        data: Buffer.from(bytes).toString("base64"),
      });
    });

    it("refuses an image above the size cap", async () => {
      const huge = new Uint8Array(5 * 1024 * 1024 + 1);
      const { fetch } = provider([{ headers: { "content-type": "image/png" }, body: huge }]);

      await expect(fetch.fetch({ url: "https://example.com/big.png" })).rejects.toThrow(
        /image too large/,
      );
    });
  });

  describe("unsupported content", () => {
    it("refuses a PDF with a factual message", async () => {
      const { fetch } = provider([
        { headers: { "content-type": "application/pdf" }, body: "%PDF" },
      ]);

      const error = await fetch
        .fetch({ url: "https://example.com/a.pdf" })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(WebSearchError);
      expect((error as WebSearchError).kind).toBe("unsupported");
      expect((error as WebSearchError).message).toBe("unsupported content type: application/pdf");
    });

    it("refuses an SVG-shaped image type by treating it as markup, not an image", async () => {
      const { fetch } = provider([
        {
          headers: { "content-type": "image/svg+xml" },
          body: '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
        },
      ]);

      const content = await fetch.fetch({ url: "https://example.com/a.svg" });

      expect(content.kind).toBe("text");
    });
  });

  describe("redirects", () => {
    it("follows a redirect that stays public", async () => {
      const { fetch, calls } = provider([
        { status: 302, headers: { location: "https://example.com/final" } },
        { headers: { "content-type": "text/plain" }, body: "arrived" },
      ]);

      const content = await fetch.fetch({ url: "https://example.com/start" });

      expect(content.kind === "text" && content.text).toBe("arrived");
      expect(calls).toEqual(["https://example.com/start", "https://example.com/final"]);
    });

    it("resolves a relative Location against the current URL", async () => {
      const { fetch, calls } = provider([
        { status: 301, headers: { location: "/next" } },
        { headers: { "content-type": "text/plain" }, body: "ok" },
      ]);

      await fetch.fetch({ url: "https://example.com/a/b" });

      expect(calls[1]).toBe("https://example.com/next");
    });

    it("refuses a redirect into a loopback address", async () => {
      const { fetch, calls } = provider([
        { status: 302, headers: { location: "http://127.0.0.1:8080/" } },
      ]);

      await expect(fetch.fetch({ url: "https://example.com/start" })).rejects.toThrow(
        /private\/loopback/,
      );
      expect(calls).toHaveLength(1);
    });

    it("refuses a redirect into a cloud metadata address", async () => {
      const { fetch } = provider([
        { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } },
      ]);

      await expect(fetch.fetch({ url: "https://example.com/start" })).rejects.toThrow(
        /private\/loopback/,
      );
    });

    it("fails on a redirect without a Location", async () => {
      const { fetch } = provider([{ status: 302 }]);

      await expect(fetch.fetch({ url: "https://example.com/x" })).rejects.toThrow(
        /redirect without Location/,
      );
    });

    it("stops after the redirect budget", async () => {
      const { fetch, calls } = provider(() => ({
        status: 302,
        headers: { location: "https://example.com/loop" },
      }));

      await expect(fetch.fetch({ url: "https://example.com/loop" })).rejects.toThrow(
        /too many redirects/,
      );
      expect(calls).toHaveLength(6);
    });
  });

  describe("http errors", () => {
    it("reports the status without reading the body", async () => {
      const { fetch } = provider([{ status: 404, body: "<html>gone</html>" }]);

      const error = await fetch
        .fetch({ url: "https://example.com/missing" })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(WebSearchError);
      expect((error as WebSearchError).kind).toBe("transport");
      expect((error as WebSearchError).status).toBe(404);
    });

    it("sends a browser user agent and manual redirect handling", async () => {
      const seen: RequestInit[] = [];
      const transport: Transport = async (_url, init) => {
        seen.push(init ?? {});
        return new Response("ok", { headers: { "content-type": "text/plain" } });
      };

      await new LocalFetchProvider({ transport }).fetch({
        url: "https://example.com/",
        
      });

      const init = seen[0];
      expect(init?.redirect).toBe("manual");
      expect((init?.headers as Record<string, string>)["User-Agent"]).toContain("Mozilla/5.0");
    });
  });
});
