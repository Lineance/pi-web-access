import { afterEach, describe, expect, it, vi } from "vitest";

import { ChainExhaustedError } from "../../src/orchestrator/errors.js";
import type { WebConfig } from "../../src/config/schema.js";
import { registerWebSearchTool } from "../../src/search/tool.js";
import type { Transport } from "../../src/transport/transport.js";

import {
  acceptsParams,
  captureApi,
  jsonResponse,
  numberConstraint,
  textOf,
  tool,
  type RegisteredTool,
} from "../harness.js";

interface Setup {
  definition: RegisteredTool;
  calls: string[];
}

function setup(config: WebConfig, transport: Transport): Setup {
  const { api, tools } = captureApi();
  registerWebSearchTool(api, { config, transport });
  const calls: string[] = [];
  return {
    definition: tool(tools, "web_search"),
    calls,
  };
}

const fixedTransport = (
  payload: unknown,
  status = 200,
): { transport: Transport; urls: string[] } => {
  const urls: string[] = [];
  const transport: Transport = async (url) => {
    urls.push(url);
    return jsonResponse(payload, status);
  };
  return { transport, urls };
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("web_search registration", () => {
  it("registers the expected name and a terse description", () => {
    vi.stubEnv("EXA_API_KEY", "k");
    const { definition } = setup({ maxResults: 5, providers: ["exa"] }, async () =>
      jsonResponse({ results: [] }),
    );

    expect(definition.name).toBe("web_search");
    expect(definition.description.length).toBeLessThan(120);
    expect(definition.description).not.toMatch(/https?:\/\//);
  });

  it("derives the schema default and ceiling from maxResults", () => {
    vi.stubEnv("EXA_API_KEY", "k");
    const { definition } = setup({ maxResults: 3, providers: ["exa"] }, async () =>
      jsonResponse({ results: [] }),
    );

    expect(numberConstraint(definition.parameters, "max_results", "default")).toBe(3);
    expect(numberConstraint(definition.parameters, "max_results", "maximum")).toBe(3);
    expect(numberConstraint(definition.parameters, "max_results", "minimum")).toBe(1);
  });

  it("clamps an out-of-range value configured above the absolute ceiling", () => {
    vi.stubEnv("EXA_API_KEY", "k");
    const { definition } = setup({ maxResults: 999, providers: ["exa"] }, async () =>
      jsonResponse({ results: [] }),
    );

    expect(numberConstraint(definition.parameters, "max_results", "maximum")).toBe(20);
  });

  it("requires only the query and rejects a value above the ceiling", () => {
    vi.stubEnv("EXA_API_KEY", "k");
    const { definition } = setup({ providers: ["exa"] }, async () => jsonResponse({ results: [] }));

    expect(acceptsParams(definition.parameters, { query: "q" })).toBe(true);
    expect(acceptsParams(definition.parameters, {})).toBe(false);
    // The default ceiling is 10, so 11 is refused by the schema the model sees.
    expect(acceptsParams(definition.parameters, { query: "q", max_results: 11 })).toBe(false);
    expect(acceptsParams(definition.parameters, { query: "q", max_results: 10 })).toBe(true);
  });
});

describe("web_search execution", () => {
  it("formats results with numbering, title and url", async () => {
    vi.stubEnv("EXA_API_KEY", "k");
    const { transport } = fixedTransport({
      results: [
        { title: "First", url: "https://a.com", text: "alpha" },
        { title: "Second", url: "https://b.com", text: "beta" },
      ],
    });
    const { definition } = setup({ maxResults: 5, providers: ["exa"] }, transport);

    const output = await definition.execute("id", { query: "q" }, undefined, undefined);
    const text = textOf(output);

    expect(text).toContain('Results for "q"');
    expect(text).toContain("1. First");
    expect(text).toContain("https://a.com");
    expect(text).toContain("alpha");
    expect(text).toContain("2. Second");
  });

  it("reports what was asked for and what came back", async () => {
    vi.stubEnv("EXA_API_KEY", "k");
    const { transport } = fixedTransport({
      results: [{ title: "T", url: "https://a.com", text: "s" }],
    });
    const { definition } = setup({ maxResults: 4, providers: ["exa"] }, transport);

    const output = await definition.execute("id", { query: "q" }, undefined, undefined);

    expect(output.details["requestedResults"]).toBe(4);
    expect(output.details["returnedResults"]).toBe(1);
    expect(output.details["backend"]).toBe("exa");
    expect(output.details["attemptedProviders"]).toEqual(["exa"]);
  });

  it("clamps a request above the ceiling at runtime too", async () => {
    vi.stubEnv("EXA_API_KEY", "k");
    const { transport, urls } = fixedTransport({ results: [] });
    const { definition } = setup({ maxResults: 3, providers: ["exa"] }, transport);

    const output = await definition.execute(
      "id",
      { query: "q", max_results: 50 },
      undefined,
      undefined,
    );

    expect(output.details["requestedResults"]).toBe(3);
    expect(urls).toHaveLength(1);
  });

  it("says which provider answered when there are no results", async () => {
    vi.stubEnv("EXA_API_KEY", "k");
    const { transport } = fixedTransport({ results: [] });
    const { definition } = setup({ maxResults: 5, providers: ["exa"] }, transport);

    const output = await definition.execute("id", { query: "nothing" }, undefined, undefined);

    expect(textOf(output)).toBe('No results for "nothing" (provider: exa).');
    expect(output.details["returnedResults"]).toBe(0);
  });

  it("reports progress before the attempt", async () => {
    vi.stubEnv("EXA_API_KEY", "k");
    const { transport } = fixedTransport({ results: [] });
    const { definition } = setup({ providers: ["exa"] }, transport);
    const updates: unknown[] = [];

    await definition.execute("id", { query: "q" }, undefined, (update) => updates.push(update));

    expect(updates).toHaveLength(1);
    expect(JSON.stringify(updates[0])).toContain("Searching");
  });

  it("surfaces an exhausted chain as an error", async () => {
    vi.stubEnv("EXA_API_KEY", "k");
    const { definition } = setup({ providers: ["exa"] }, async () => jsonResponse({}, 401));

    await expect(
      definition.execute("id", { query: "q" }, undefined, undefined),
    ).rejects.toBeInstanceOf(ChainExhaustedError);
  });
});
