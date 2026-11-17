import { describe, expect, it } from "vitest";

import { ChainExhaustedError, WebSearchError } from "../../src/orchestrator/errors.js";
import type { ChainHealth } from "../../src/orchestrator/health.js";
import { buildFetchChain, fetchWithChain, MIN_USEFUL_TEXT_CHARS } from "../../src/fetch/chain.js";
import type { Transport } from "../../src/transport/transport.js";

const healthMarking = (cooled: string[]): ChainHealth => ({
  isCooled: (_capability, provider) => cooled.includes(provider),
  recordSuccess: () => undefined,
  recordFailure: () => undefined,
});

const htmlTransport =
  (body: string): Transport =>
  async () =>
    new Response(body, { status: 200, headers: { "content-type": "text/html" } });

const captureChainError = (run: () => unknown): unknown => {
  try {
    run();
    return undefined;
  } catch (caught) {
    return caught;
  }
};

describe("buildFetchChain", () => {
  it("falls back to the local default", () => {
    expect(buildFetchChain({})).toEqual(["local"]);
  });

  it("resolves a configured raw provider like any other", () => {
    expect(buildFetchChain({ fetchProviders: ["raw", "local"] })).toEqual(["raw", "local"]);
  });

  it("resolves a configured pandoc provider in config order within one tier", () => {
    expect(buildFetchChain({ fetchProviders: ["pandoc", "local"] })).toEqual(["pandoc", "local"]);
  });

  it("resolves the built-in remote readers on the fetch side", () => {
    expect(buildFetchChain({ fetchProviders: ["firecrawl", "jina", "tavily", "zenrows"] })).toEqual(
      ["firecrawl", "jina", "tavily", "zenrows"],
    );
  });

  it("refuses an unknown fetch provider", () => {
    const error = captureChainError(() => buildFetchChain({ fetchProviders: ["nope"] }));

    expect(error).toBeInstanceOf(WebSearchError);
    expect((error as WebSearchError).kind).toBe("config");
    expect((error as WebSearchError).message).toContain('unknown fetch provider "nope"');
  });

  it("refuses a provider that cannot fetch", () => {
    const error = captureChainError(() => buildFetchChain({ fetchProviders: ["bing"] }));

    expect((error as WebSearchError).kind).toBe("config");
    expect((error as WebSearchError).message).toContain("does not support fetch");
  });

  it("demotes a cooled provider inside its tier", () => {
    expect(
      buildFetchChain({ fetchProviders: ["local"] }, { health: healthMarking(["local"]) }),
    ).toEqual(["local"]);
  });
});

describe("fetchWithChain", () => {
  it("returns extracted text from the local provider", async () => {
    const body = `<html><head><title>Doc</title></head><body><p>${"x".repeat(MIN_USEFUL_TEXT_CHARS + 50)}</p></body></html>`;

    const outcome = await fetchWithChain(
      "https://example.com/",
      {},
      {
        transport: htmlTransport(body),
      },
    );

    expect(outcome.backend).toBe("local");
    expect(outcome.value.kind).toBe("text");
    expect(outcome.value.kind === "text" && outcome.value.title).toBe("Doc");
  });

  it("returns untouched markup when the raw provider serves the chain", async () => {
    const body = `<html><body><p>${"x".repeat(MIN_USEFUL_TEXT_CHARS + 50)}</p></body></html>`;

    const outcome = await fetchWithChain(
      "https://example.com/",
      { fetchProviders: ["raw"] },
      {
        transport: htmlTransport(body),
      },
    );

    expect(outcome.backend).toBe("raw");
    expect(outcome.value.kind === "text" && outcome.value.text).toBe(body);
  });

  it("still returns a short page when it is the only attempt left", async () => {
    const outcome = await fetchWithChain(
      "https://example.com/",
      {},
      {
        transport: htmlTransport("<html><body><p>tiny</p></body></html>"),
      },
    );

    expect(outcome.value.kind === "text" && outcome.value.text).toBe("tiny");
    expect(outcome.usedLastAttemptUnusable).toBe(true);
  });

  it("throws when the only provider refuses the content type", async () => {
    const transport: Transport = async () =>
      new Response("%PDF", { status: 200, headers: { "content-type": "application/pdf" } });

    const error = await fetchWithChain(
      "https://example.com/a.pdf",
      {},
      {
        transport,
      },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ChainExhaustedError);
    expect((error as ChainExhaustedError).failures[0]?.kind).toBe("unsupported");
  });

  it("reports the backend that answered", async () => {
    const outcome = await fetchWithChain(
      "https://example.com/",
      {},
      {
        transport: htmlTransport(`<html><body>${"x".repeat(400)}</body></html>`),
      },
    );

    expect(outcome.attempted).toEqual(["local"]);
  });
});
