import { describe, expect, it } from "vitest";

import { JSON_PROVIDER_SPECS } from "../../src/providers/json/specs.js";
import { JsonSearchProvider } from "../../src/providers/json/provider.js";
import { WebSearchError } from "../../src/orchestrator/errors.js";
import type { Transport } from "../../src/transport/transport.js";

interface Captured {
  url: string;
  init: RequestInit | undefined;
}

/** Transport that records the request and replies with a canned JSON payload. */
function capture(
  payload: unknown,
  options: { status?: number; body?: string } = {},
): { transport: Transport; requests: Captured[] } {
  const requests: Captured[] = [];
  const transport: Transport = async (url, init) => {
    requests.push({ url, init });
    const body = options.body ?? JSON.stringify(payload);
    return new Response(body, {
      status: options.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { transport, requests };
}

function make(
  name: string,
  options: {
    apiKey?: string;
    baseUrl?: string;
    status?: number;
    payload?: unknown;
    body?: string;
  } = {},
): { provider: JsonSearchProvider; requests: Captured[] } {
  const spec = JSON_PROVIDER_SPECS[name];
  if (spec === undefined) throw new Error(`no spec for ${name}`);
  const { transport, requests } = capture(options.payload ?? emptyPayloadFor(spec.resultsPath), {
    ...(options.status === undefined ? {} : { status: options.status }),
    ...(options.body === undefined ? {} : { body: options.body }),
  });
  const provider = new JsonSearchProvider(
    spec,
    transport,
    options.apiKey ?? "test-key",
    options.baseUrl,
  );
  return { provider, requests };
}

/** A payload that satisfies the spec's result path with an empty array. */
function emptyPayloadFor(path: string): unknown {
  const segments = path.split(".");
  const root: Record<string, unknown> = {};
  let cursor = root;
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      cursor[segment] = [];
      return;
    }
    const next: Record<string, unknown> = {};
    cursor[segment] = next;
    cursor = next;
  });
  return root;
}

const headersOf = (request: Captured): Record<string, string> =>
  (request.init?.headers ?? {}) as Record<string, string>;

describe("JSON provider specs", () => {
  it("covers exactly the seven plain JSON APIs", () => {
    expect(Object.keys(JSON_PROVIDER_SPECS).sort()).toEqual([
      "bocha",
      "brave",
      "exa",
      "firecrawl",
      "jina",
      "searxng",
      "tavily",
    ]);
  });
});

describe("JsonSearchProvider request shape", () => {
  it("sends Exa's key bare in x-api-key", async () => {
    const { provider, requests } = make("exa");

    await provider.search("q", 3);

    const headers = headersOf(requests[0]!);
    expect(headers["x-api-key"]).toBe("test-key");
    expect(headers["authorization"]).toBeUndefined();
  });

  it.each(["tavily", "firecrawl", "bocha", "jina"])(
    "sends %s's key as a bearer token",
    async (name) => {
      const { provider, requests } = make(name);

      await provider.search("q", 3);

      expect(headersOf(requests[0]!)["authorization"]).toBe("Bearer test-key");
    },
  );

  it("sends Brave's key in the subscription header", async () => {
    const { provider, requests } = make("brave");

    await provider.search("q", 3);

    const headers = headersOf(requests[0]!);
    expect(headers["X-Subscription-Token"]).toBe("test-key");
    expect(headers["authorization"]).toBeUndefined();
  });

  it("uses each vendor's own result-count parameter name", async () => {
    const cases: Array<[string, string]> = [
      ["tavily", "max_results"],
      ["firecrawl", "limit"],
      ["exa", "numResults"],
      ["bocha", "count"],
    ];

    for (const [name, field] of cases) {
      const { provider, requests } = make(name);
      await provider.search("q", 7);
      const body = JSON.parse(String(requests[0]!.init?.body)) as Record<string, unknown>;
      expect(body[field], `${name} should send ${field}`).toBe(7);
    }
  });

  it("uses GET with query parameters for Brave", async () => {
    const { provider, requests } = make("brave");

    await provider.search("a b&c", 4);

    const url = new URL(requests[0]!.url);
    expect(requests[0]!.init?.method).toBe("GET");
    expect(requests[0]!.init?.body).toBeUndefined();
    expect(url.searchParams.get("q")).toBe("a b&c");
    expect(url.searchParams.get("count")).toBe("4");
    expect(headersOf(requests[0]!)["Content-Type"]).toBeUndefined();
  });

  it("puts the Jina query in the path, encoded", async () => {
    const { provider, requests } = make("jina");

    await provider.search("a/b c", 2);

    expect(requests[0]!.url.startsWith("https://s.jina.ai/a%2Fb%20c")).toBe(true);
  });

  it("builds the SearXNG URL from the configured base", async () => {
    const { provider, requests } = make("searxng", { baseUrl: "http://localhost:8080/" });

    await provider.search("q", 5);

    const url = new URL(requests[0]!.url);
    expect(url.origin + url.pathname).toBe("http://localhost:8080/search");
    expect(url.searchParams.get("format")).toBe("json");
  });

  it("sends a JSON content type on POST providers", async () => {
    const { provider, requests } = make("tavily");

    await provider.search("q", 1);

    expect(headersOf(requests[0]!)["Content-Type"]).toBe("application/json");
  });

  it("passes the abort signal through", async () => {
    const { provider, requests } = make("tavily");
    const controller = new AbortController();

    await provider.search("q", 1, controller.signal);

    expect(requests[0]!.init?.signal).toBe(controller.signal);
  });
});

describe("JsonSearchProvider failures", () => {
  it("refuses to call a keyed provider without a key", async () => {
    const { provider, requests } = make("tavily", { apiKey: "" });

    const error = await provider.search("q", 1).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WebSearchError);
    expect((error as WebSearchError).kind).toBe("config");
    expect(requests).toHaveLength(0);
  });

  it.each([
    [429, "quota"],
    [402, "quota"],
    [401, "auth"],
    [403, "auth"],
    [500, "transport"],
  ])("classifies HTTP %i as %s", async (status, kind) => {
    const { provider } = make("tavily", { status });

    const error = await provider.search("q", 1).catch((caught: unknown) => caught);

    expect((error as WebSearchError).kind).toBe(kind);
    expect((error as WebSearchError).status).toBe(status);
  });

  it("fails as a parse error when the result array is missing", async () => {
    const { provider } = make("tavily", { payload: { unexpected: true } });

    const error = await provider.search("q", 1).catch((caught: unknown) => caught);

    expect((error as WebSearchError).kind).toBe("parse");
    expect((error as WebSearchError).message).toContain("results");
  });

  it("fails as a parse error when the body is not JSON", async () => {
    const { provider } = make("tavily", { body: "<html>oops</html>" });

    const error = await provider.search("q", 1).catch((caught: unknown) => caught);

    expect((error as WebSearchError).kind).toBe("parse");
  });
});

describe("JsonSearchProvider result mapping", () => {
  it("maps Exa's fields", async () => {
    const { provider } = make("exa", {
      payload: { results: [{ title: "T", url: "https://e.com", text: "snippet" }] },
    });

    await expect(provider.search("q", 5)).resolves.toEqual([
      { title: "T", url: "https://e.com", snippet: "snippet" },
    ]);
  });

  it("falls back across Bocha's snippet candidates", async () => {
    const { provider } = make("bocha", {
      payload: {
        data: {
          webPages: {
            value: [
              { name: "T", url: "https://e.com", summary: "", snippet: "from-snippet" },
              { name: "U", url: "https://f.com", summary: "from-summary" },
            ],
          },
        },
      },
    });

    await expect(provider.search("q", 5)).resolves.toEqual([
      { title: "T", url: "https://e.com", snippet: "from-snippet" },
      { title: "U", url: "https://f.com", snippet: "from-summary" },
    ]);
  });

  it("walks Brave's nested path", async () => {
    const { provider } = make("brave", {
      payload: { web: { results: [{ title: "T", url: "https://e.com", description: "d" }] } },
    });

    await expect(provider.search("q", 5)).resolves.toEqual([
      { title: "T", url: "https://e.com", snippet: "d" },
    ]);
  });

  it("tolerates missing fields instead of throwing", async () => {
    const { provider } = make("firecrawl", { payload: { data: [{}] } });

    await expect(provider.search("q", 5)).resolves.toEqual([{ title: "", url: "", snippet: "" }]);
  });

  it("trims to the requested count", async () => {
    const { provider } = make("firecrawl", {
      payload: {
        data: Array.from({ length: 10 }, (_, index) => ({
          title: `t${index}`,
          url: `https://e.com/${index}`,
          description: "d",
        })),
      },
    });

    const results = await provider.search("q", 3);

    expect(results).toHaveLength(3);
  });
});
