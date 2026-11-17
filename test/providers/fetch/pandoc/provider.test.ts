import { describe, expect, it, beforeEach } from "vitest";

import { WebSearchError } from "../../../../src/orchestrator/errors.js";
import { PandocFetchProvider } from "../../../../src/providers/fetch/pandoc/provider.js";
import {
  pandocAvailable,
  resetPandocAvailability,
} from "../../../../src/providers/fetch/pandoc/binary.js";
import { spawnRecorder, tick, type SpawnRecorder } from "./fake-child.js";
import type { Transport } from "../../../../src/transport/transport.js";

interface Reply {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
}

interface Harness extends SpawnRecorder {
  transport: Transport;
  calls: string[];
  provider: PandocFetchProvider;
}

/**
 * A transport replaying canned replies plus a spawn recorder. `children[0]` is
 * always the availability probe; the converter, when it runs, is `children[1]`.
 */
function harness(replies: Reply[] | ((url: string) => Reply)): Harness {
  const calls: string[] = [];
  const transport: Transport = async (url) => {
    calls.push(url);
    const reply = typeof replies === "function" ? replies(url) : replies[calls.length - 1];
    if (reply === undefined) return new Response("no reply", { status: 500 });
    const status = reply.status ?? 200;
    const body = reply.body ?? null;
    return new Response(body, { status, headers: reply.headers ?? {} });
  };
  const { spawnFn, children } = spawnRecorder();
  return {
    transport,
    calls,
    spawnFn,
    children,
    provider: new PandocFetchProvider({ transport, spawnPandoc: spawnFn }),
  };
}

/** Warm the cached availability probe so a test drives the converter directly. */
async function available(h: Harness): Promise<void> {
  const probe = pandocAvailable(h.spawnFn);
  h.children[0]?.finish(0);
  await probe;
}

beforeEach(() => {
  resetPandocAvailability();
});

describe("PandocFetchProvider", () => {
  it("converts HTML through the binary and keeps the title", async () => {
    const h = harness([
      {
        headers: { "content-type": "text/html; charset=utf-8" },
        body: "<html><head><title>Doc</title></head><body><p>body</p></body></html>",
      },
    ]);
    await available(h);

    const pending = h.provider.fetch({ url: "https://example.com/" });
    await tick();
    const converter = h.children[1];
    expect(converter).toBeDefined();
    converter?.stdout.emit("data", Buffer.from("rendered markdown", "utf8"));
    converter?.finish(0);

    const content = await pending;
    expect(content.kind === "text" && content.text).toBe("rendered markdown");
    expect(content.kind === "text" && content.title).toBe("Doc");
    expect(converter?.stdin.writes).toEqual([
      "<html><head><title>Doc</title></head><body><p>body</p></body></html>",
    ]);
  });

  it("throws a factual error without contacting the URL when the binary is missing", async () => {
    const h = harness([{ headers: { "content-type": "text/html" }, body: "<p>x</p>" }]);

    const pending = h.provider.fetch({ url: "https://example.com/" });
    h.children[0]?.crash(new Error("spawn ENOENT"));
    const error = await pending.catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WebSearchError);
    expect((error as WebSearchError).message).toBe("pandoc binary not found on PATH");
    expect(h.calls).toHaveLength(0);
  });

  it("passes non-HTML text through without spawning a converter", async () => {
    const h = harness([{ headers: { "content-type": "text/plain" }, body: "plain body" }]);
    await available(h);

    const content = await h.provider.fetch({ url: "https://example.com/a.txt" });

    expect(content.kind === "text" && content.text).toBe("plain body");
    expect(h.children).toHaveLength(1);
  });

  it("propagates the unsupported content type error", async () => {
    const h = harness([{ headers: { "content-type": "application/pdf" }, body: "%PDF" }]);
    await available(h);

    const error = await h.provider
      .fetch({ url: "https://example.com/a.pdf" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WebSearchError);
    expect((error as WebSearchError).kind).toBe("unsupported");
    expect(h.children).toHaveLength(1);
  });

  it("reports a conversion failure as a transport failure", async () => {
    const h = harness([{ headers: { "content-type": "text/html" }, body: "<p>x</p>" }]);
    await available(h);

    const pending = h.provider.fetch({ url: "https://example.com/" });
    await tick();
    h.children[1]?.finish(2, "panic");

    const error = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WebSearchError);
    expect((error as WebSearchError).kind).toBe("transport");
    expect((error as WebSearchError).provider).toBe("pandoc");
  });
});
