import { describe, expect, it } from "vitest";

import { readCustomProviders } from "../../src/config/custom.js";
import type { WebConfig } from "../../src/config/schema.js";
import type { ChainExhaustedError } from "../../src/orchestrator/errors.js";
import { WebSearchError } from "../../src/orchestrator/errors.js";
import { buildCatalog } from "../../src/providers/catalog.js";
import { CustomFetchProvider } from "../../src/providers/fetch/custom/provider.js";
import { fetchWithChain } from "../../src/fetch/chain.js";
import { searchWithChain } from "../../src/search/chain.js";
import type { Transport } from "../../src/transport/transport.js";

const jsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

interface Call {
  url: string;
  body: string;
  headers: Record<string, string>;
}

function routing(routes: Array<{ host: string; respond: (call: Call) => Response }>): {
  transport: Transport;
  calls: Call[];
} {
  const calls: Call[] = [];
  const transport: Transport = async (url, init) => {
    const call = {
      url,
      body: String(init?.body ?? ""),
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    const route = routes.find((candidate) => new URL(url).hostname === candidate.host);
    if (route === undefined) return new Response("no route", { status: 599 });
    return route.respond(call);
  };
  return { transport, calls };
}

const catalogFor = (customProviders: unknown) =>
  buildCatalog(readCustomProviders(customProviders).additions);

describe("a custom search provider in the chain", () => {
  it("is called with a substituted body and parsed by its own paths", async () => {
    const catalog = catalogFor({
      search: {
        "my-engine": {
          url: "https://api.example.com/search",
          method: "POST",
          body: { q: "{query}", limit: "{maxResults}" },
          resultsPath: "data.items",
          fields: { title: "name", url: "link", snippet: "summary" },
        },
      },
    });
    const { transport, calls } = routing([
      {
        host: "api.example.com",
        respond: () =>
          jsonResponse({
            data: { items: [{ name: "Hit", link: "https://e.com", summary: "s" }] },
          }),
      },
    ]);

    const outcome = await searchWithChain(
      "cats",
      3,
      { searchProviders: ["my-engine"] },
      { transport, catalog },
    );

    expect(outcome.backend).toBe("my-engine");
    expect(outcome.value).toEqual([{ title: "Hit", url: "https://e.com", snippet: "s" }]);
    expect(JSON.parse(calls[0]!.body)).toEqual({ q: "cats", limit: 3 });
  });

  it("is rejected when the chain asks a fetch-only name for search", async () => {
    const catalog = catalogFor({ fetch: { "my-reader": { url: "https://r/{url}" } } });

    const error = await searchWithChain(
      "q",
      3,
      { searchProviders: ["my-reader"] },
      {
        transport: async () => jsonResponse({}),
        catalog,
      },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WebSearchError);
    expect((error as WebSearchError).kind).toBe("config");
    expect((error as WebSearchError).message).toContain("does not support search");
  });

  it("reads its key from the environment only", async () => {
    const catalog = catalogFor({
      search: {
        keyed: {
          url: "https://api.example.com/search",
          resultsPath: "data",
          auth: { header: "authorization", prefix: "Bearer " },
          keyEnv: "PWA_TEST_KEY",
        },
      },
    });
    const { transport, calls } = routing([
      { host: "api.example.com", respond: () => jsonResponse({ data: [] }) },
    ]);

    process.env["PWA_TEST_KEY"] = "secret";
    try {
      await searchWithChain(
        "q",
        1,
        { searchProviders: ["keyed"], apiKeys: { keyed: "from-file" } },
        {
          transport,
          catalog,
        },
      );

      expect(calls).toHaveLength(1);
      // envOnly: the environment value is used and the config-file value is not.
      expect(calls[0]!.headers["authorization"]).toBe("Bearer secret");
    } finally {
      delete process.env["PWA_TEST_KEY"];
    }

    // With no environment value there is no fallback to the file.
    const error = await searchWithChain(
      "q",
      1,
      { searchProviders: ["keyed"], apiKeys: { keyed: "from-file" } },
      { transport, catalog },
    ).catch((caught: unknown) => caught);

    // The chain wraps the provider failure, so the cause is on the failure list.
    expect((error as ChainExhaustedError).failures[0]?.kind).toBe("config");
  });
});

describe("a custom fetch provider in the chain", () => {
  const spec = {
    name: "my-reader",
    label: "My Reader",
    url: (url: string) => `https://reader.example.com/${encodeURIComponent(url)}`,
    method: "GET" as const,
    textPath: "data.markdown",
  };

  it("extracts the text at its configured path", async () => {
    const transport: Transport = async () => jsonResponse({ data: { markdown: "x".repeat(300) } });

    const content = await new CustomFetchProvider(spec, transport).fetch({
      url: "https://a.com/page",
      raw: false,
    });

    expect(content.kind).toBe("text");
    expect(content.kind === "text" && content.text).toHaveLength(300);
  });

  it("reports a missing text path as a parse failure", async () => {
    const transport: Transport = async () => jsonResponse({ data: {} });

    const error = await new CustomFetchProvider(spec, transport)
      .fetch({ url: "https://a.com/page", raw: false })
      .catch((caught: unknown) => caught);

    expect((error as WebSearchError).kind).toBe("parse");
  });

  it("classifies an HTTP error by status", async () => {
    const transport: Transport = async () => jsonResponse({}, 429);

    const error = await new CustomFetchProvider(spec, transport)
      .fetch({ url: "https://a.com/page", raw: false })
      .catch((caught: unknown) => caught);

    expect((error as WebSearchError).kind).toBe("quota");
  });

  it("is used by the fetch chain and becomes the backend", async () => {
    const customProviders = {
      fetch: {
        "my-reader": { url: "https://reader.example.com/{url}", fetch: { textPath: "text" } },
      },
    };
    const catalog = catalogFor(customProviders);
    const config: WebConfig = { fetchProviders: ["my-reader"] };
    const transport: Transport = async () => jsonResponse({ text: "y".repeat(400) });

    const outcome = await fetchWithChain("https://a.com/page", config, {
      raw: false,
      transport,
      catalog,
    });

    expect(outcome.backend).toBe("my-reader");
    expect(outcome.value.kind === "text" && outcome.value.text).toHaveLength(400);
  });
});
