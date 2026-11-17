import { describe, expect, it } from "vitest";

import { ChainExhaustedError } from "../../src/orchestrator/errors.js";
import type { WebConfig } from "../../src/config/schema.js";
import { registerWebFetchTool } from "../../src/fetch/tool.js";
import type { Transport } from "../../src/transport/transport.js";

import { captureApi, textOf, tool, type RegisteredTool } from "../harness.js";

function setup(transport: Transport, config: WebConfig = { fetchProviders: ["local"] }): {
  definition: RegisteredTool;
} {
  const { api, tools } = captureApi();
  registerWebFetchTool(api, { config, transport, loadConfig: () => config });
  return { definition: tool(tools, "web_fetch") };
}

const responding =
  (body: string | Uint8Array, contentType: string, status = 200): Transport =>
  async () =>
    new Response(body, { status, headers: { "content-type": contentType } });

const longParagraph = "x".repeat(400);

describe("web_fetch registration", () => {
  it("registers the expected name and a terse description", () => {
    const { definition } = setup(responding("", "text/plain"));

    expect(definition.name).toBe("web_fetch");
    expect(definition.description.length).toBeLessThan(120);
    expect(definition.description).toContain("raw");
  });
});

describe("web_fetch content routing", () => {
  it("returns extracted text with a header block", async () => {
    const { definition } = setup(
      responding(
        `<html><head><title>Doc Title</title></head><body><p>${longParagraph}</p></body></html>`,
        "text/html; charset=utf-8",
      ),
    );

    const output = await definition.execute(
      "id",
      { url: "https://example.com/page" },
      undefined,
      undefined,
    );
    const text = textOf(output);

    expect(text).toContain("**Fetched:** https://example.com/page");
    expect(text).toContain("**Title:** Doc Title");
    expect(text).toContain("**Content-Type:** text/html; charset=utf-8");
    expect(text).toContain(longParagraph);
    expect(output.details["kind"]).toBe("text");
    expect(output.details["backend"]).toBe("local");
  });

  it("returns untouched markup when the raw provider serves the chain", async () => {
    const markup = `<html><body><p>${longParagraph}</p></body></html>`;
    const { definition } = setup(responding(markup, "text/html"), { fetchProviders: ["raw"] });

    const output = await definition.execute(
      "id",
      { url: "https://example.com/page" },
      undefined,
      undefined,
    );

    expect(textOf(output)).toContain(markup);
    expect(output.details["backend"]).toBe("raw");
  });

  it("returns an image block with a one-line caption for a renderable image", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x01]);
    const { definition } = setup(responding(bytes, "image/png"));

    const output = await definition.execute(
      "id",
      { url: "https://example.com/a.png" },
      undefined,
      undefined,
    );

    const image = output.content.find((block) => block.type === "image");
    expect(image).toBeDefined();
    expect(image?.mimeType).toBe("image/png");
    expect(image?.data).toBe(Buffer.from(bytes).toString("base64"));
    expect(textOf(output)).toContain("image/png");
    expect(textOf(output)).toContain("https://example.com/a.png");
    expect(output.details["kind"]).toBe("image");
  });

  it("adds a truncation footer for a very long page", async () => {
    const lines = Array.from({ length: 2_100 }, (_, index) => `line-${index}`).join("\n");
    const { definition } = setup(responding(lines, "text/plain"));

    const output = await definition.execute(
      "id",
      { url: "https://example.com/big" },
      undefined,
      undefined,
    );
    const text = textOf(output);

    expect(text).toContain("[Truncated:");
    expect(text).toContain("line-0");
    expect(text).not.toContain("line-2099");
    expect(output.details["omission"]).toMatchObject({ shownLines: 2_000, totalLines: 2_100 });
  });
});

describe("web_fetch guards", () => {
  it("rejects a private address before contacting any provider", async () => {
    let contacted = false;
    const transport: Transport = async () => {
      contacted = true;
      return new Response("", { headers: { "content-type": "text/plain" } });
    };
    const { definition } = setup(transport);

    await expect(
      definition.execute("id", { url: "http://127.0.0.1:8080/" }, undefined, undefined),
    ).rejects.toThrow(/private\/loopback/);
    expect(contacted).toBe(false);
  });

  it("rejects a non-http protocol", async () => {
    const { definition } = setup(responding("", "text/plain"));

    await expect(
      definition.execute("id", { url: "file:///etc/passwd" }, undefined, undefined),
    ).rejects.toThrow(/Unsupported URL protocol/);
  });

  it("refuses an unsupported content type as an exhausted chain", async () => {
    const { definition } = setup(responding("%PDF", "application/pdf"));

    const error = await definition
      .execute("id", { url: "https://example.com/a.pdf" }, undefined, undefined)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ChainExhaustedError);
    expect((error as ChainExhaustedError).failures[0]?.kind).toBe("unsupported");
  });

  it("reports progress before fetching", async () => {
    const { definition } = setup(responding(longParagraph, "text/plain"));
    const updates: unknown[] = [];

    await definition.execute("id", { url: "https://example.com/" }, undefined, (update) =>
      updates.push(update),
    );

    expect(JSON.stringify(updates[0])).toContain("Fetching");
  });
});
