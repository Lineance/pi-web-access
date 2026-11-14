import { afterEach, describe, expect, it, vi } from "vitest";

import type { WebConfig } from "../../src/config/schema.js";
import { ChainExhaustedError, WebSearchError } from "../../src/orchestrator/errors.js";
import type { ChainHealth } from "../../src/orchestrator/health.js";
import { buildSearchChain, searchWithChain } from "../../src/search/chain.js";
import type { Transport } from "../../src/transport/transport.js";

interface Call {
  url: string;
  body: string;
}

type Route = (url: string, init: RequestInit | undefined) => Response;

function routing(routes: Array<{ host: string; respond: Route }>): {
  transport: Transport;
  calls: Call[];
} {
  const calls: Call[] = [];
  const transport: Transport = async (url, init) => {
    calls.push({ url, body: String(init?.body ?? "") });
    const host = new URL(url).hostname;
    const route = routes.find((candidate) => host === candidate.host);
    if (route === undefined) return new Response("no route", { status: 599 });
    return route.respond(url, init);
  };
  return { transport, calls };
}

const json = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

const healthMarking = (cooled: string[]): ChainHealth => ({
  isCooled: (_capability, provider) => cooled.includes(provider),
  recordSuccess: () => undefined,
  recordFailure: () => undefined,
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildSearchChain", () => {
  it("falls back to the keyless default", () => {
    expect(buildSearchChain({})).toEqual(["exa-free"]);
  });

  it("refuses an unknown provider", () => {
    const error = (() => {
      try {
        buildSearchChain({ providers: ["nope"] });
        return undefined;
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(WebSearchError);
    expect((error as WebSearchError).kind).toBe("config");
    expect((error as WebSearchError).message).toContain('unknown search provider "nope"');
  });

  it("refuses a provider that cannot search", () => {
    const error = (() => {
      try {
        buildSearchChain({ providers: ["local"] });
        return undefined;
      } catch (caught) {
        return caught;
      }
    })();

    expect((error as WebSearchError).kind).toBe("config");
    expect((error as WebSearchError).message).toContain("does not support search");
  });

  it("demotes a cooled provider inside its own tier", () => {
    const config: WebConfig = { providers: ["tavily", "exa", "bing"] };

    expect(buildSearchChain(config, healthMarking(["tavily"]))).toEqual(["exa", "tavily", "bing"]);
  });

  it("keeps configured order when nothing is cooled", () => {
    const config: WebConfig = { providers: ["bing", "tavily"] };

    expect(buildSearchChain(config, healthMarking([]))).toEqual(["bing", "tavily"]);
  });
});

describe("searchWithChain", () => {
  it("falls through to the next provider after a quota failure", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tavily-key");
    vi.stubEnv("EXA_API_KEY", "exa-key");
    const { transport, calls } = routing([
      { host: "api.tavily.com", respond: () => json({ error: "quota" }, 429) },
      {
        host: "api.exa.ai",
        respond: () =>
          json({
            results: [{ title: "Hit", url: "https://example.com", text: "snippet" }],
          }),
      },
    ]);

    const outcome = await searchWithChain(
      "query",
      5,
      { providers: ["tavily", "exa"] },
      { transport },
    );

    expect(outcome.backend).toBe("exa");
    expect(outcome.attempted).toEqual(["tavily", "exa"]);
    expect(outcome.value).toEqual([
      { title: "Hit", url: "https://example.com", snippet: "snippet" },
    ]);
    expect(calls).toHaveLength(2);
  });

  it("clamps the request to each provider's own ceiling", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tavily-key");
    const { transport, calls } = routing([
      { host: "api.tavily.com", respond: () => json({ results: [] }) },
    ]);

    await searchWithChain("query", 20, { providers: ["tavily"] }, { transport });

    const body = JSON.parse(calls[0]!.body) as Record<string, unknown>;
    // Tavily accepts 20, so the global value passes through unchanged.
    expect(body["max_results"]).toBe(20);
  });

  it("caps a provider below the global value", async () => {
    vi.stubEnv("EXA_API_KEY", "exa-key");
    const { transport, calls } = routing([
      { host: "api.exa.ai", respond: () => json({ results: [] }) },
    ]);

    await searchWithChain("query", 20, { providers: ["exa"] }, { transport });

    const body = JSON.parse(calls[0]!.body) as Record<string, unknown>;
    // Exa's registry ceiling is 10, so it never sees 20.
    expect(body["numResults"]).toBe(10);
  });

  it("throws once every provider has failed", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tavily-key");
    vi.stubEnv("EXA_API_KEY", "exa-key");
    const { transport } = routing([
      { host: "api.tavily.com", respond: () => json({}, 429) },
      { host: "api.exa.ai", respond: () => json({}, 401) },
    ]);

    const error = await searchWithChain(
      "query",
      5,
      { providers: ["tavily", "exa"] },
      {
        transport,
      },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ChainExhaustedError);
    expect((error as ChainExhaustedError).failures.map((failure) => failure.kind)).toEqual([
      "quota",
      "auth",
    ]);
  });

  it("reports progress before each attempt", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tavily-key");
    vi.stubEnv("EXA_API_KEY", "exa-key");
    const { transport } = routing([
      { host: "api.tavily.com", respond: () => json({}, 500) },
      { host: "api.exa.ai", respond: () => json({ results: [] }) },
    ]);
    const seen: string[] = [];

    await searchWithChain(
      "query",
      5,
      { providers: ["tavily", "exa"] },
      {
        transport,
        onAttempt: (provider) => seen.push(provider),
      },
    );

    expect(seen).toEqual(["tavily", "exa"]);
  });

  it("normalises oversized snippets", async () => {
    vi.stubEnv("EXA_API_KEY", "exa-key");
    const { transport } = routing([
      {
        host: "api.exa.ai",
        respond: () =>
          json({
            results: [{ title: "T", url: "https://example.com", text: "x".repeat(10_000) }],
          }),
      },
    ]);

    const outcome = await searchWithChain("query", 5, { providers: ["exa"] }, { transport });

    expect(outcome.value[0]?.snippet.length).toBe(2_048);
  });
});
