import { kindForStatus, WebSearchError } from "../../../orchestrator/errors.js";
import {
  MAX_SEARCH_RESPONSE_BODY_BYTES,
  readResponseJson,
  readResponseText,
} from "../../../transport/response-body.js";
import type { Transport } from "../../../transport/transport.js";
import type { SearchResult } from "../../types.js";
import type { SearchProvider } from "../types.js";

import { packageVersion } from "../../../version.js";

const MCP_URL = "https://mcp.exa.ai/mcp";
const PROTOCOL_VERSION = "2025-03-26";
const TOOL_NAME = "web_search_exa";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: unknown;
}

interface JsonRpcError {
  code: number;
  message: string;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number;
  result?: {
    content?: Array<{ type: string; text?: string }>;
    [key: string]: unknown;
  };
  error?: JsonRpcError;
}

/**
 * Exa's hosted MCP endpoint: keyless, rate limited per IP.
 *
 * Speaks only the three messages needed — `initialize`,
 * `notifications/initialized`, `tools/call` — over streamable HTTP. A session per
 * search costs three round trips, which is acceptable at agent search rates.
 */
export class ExaMcpFreeProvider implements SearchProvider {
  readonly name = "exa-free";
  readonly label = "Exa (free, no key)";

  private readonly transport: Transport;
  private nextId = 1;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  async search(query: string, maxResults: number, signal?: AbortSignal): Promise<SearchResult[]> {
    const initialized = await this.post(
      {
        jsonrpc: "2.0",
        id: this.nextId++,
        method: "initialize",
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "pi-web-access", version: packageVersion() },
        },
      },
      undefined,
      signal,
    );

    const sessionId = initialized.sessionId;
    if (sessionId === undefined || sessionId === "") {
      throw new WebSearchError("parse", this.name, "Exa MCP returned no session id");
    }

    await this.notify("notifications/initialized", {}, sessionId, signal);

    const called = await this.post(
      {
        jsonrpc: "2.0",
        id: this.nextId++,
        method: "tools/call",
        params: { name: TOOL_NAME, arguments: { query, numResults: maxResults } },
      },
      sessionId,
      signal,
    );

    const text = called.json.result?.content?.find((item) => item.type === "text")?.text ?? "";
    if (text === "") {
      throw new WebSearchError("parse", this.name, "Exa MCP returned no text content");
    }

    const results = parseSearchText(text).slice(0, maxResults);
    if (results.length === 0) {
      // Non-empty body that produced nothing means the response shape moved — not
      // that the web has no matches. Reported as a parse failure so the chain moves
      // on and the cause is visible.
      throw new WebSearchError("parse", this.name, "Exa MCP response had no parseable results");
    }
    return results;
  }

  private async post(
    body: JsonRpcRequest,
    sessionId: string | undefined,
    signal: AbortSignal | undefined,
  ): Promise<{ json: JsonRpcResponse; sessionId: string | undefined }> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (sessionId !== undefined) headers["Mcp-Session-Id"] = sessionId;

    const response = await this.transport(MCP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      ...(signal === undefined ? {} : { signal }),
    });

    if (!response.ok) {
      await readResponseText(response, MAX_SEARCH_RESPONSE_BODY_BYTES).catch(() => "");
      throw new WebSearchError(
        kindForStatus(response.status),
        this.name,
        `Exa MCP error (${response.status})`,
        response.status,
      );
    }

    const nextSessionId = response.headers.get("Mcp-Session-Id") ?? sessionId;
    const contentType = response.headers.get("content-type") ?? "";

    const json = contentType.includes("text/event-stream")
      ? parseSseResponse(await readResponseText(response, MAX_SEARCH_RESPONSE_BODY_BYTES))
      : await this.readJsonRpc(response);

    if (json.error !== undefined) {
      throw new WebSearchError("parse", this.name, `Exa MCP JSON-RPC error ${json.error.code}`);
    }
    return { json, sessionId: nextSessionId ?? undefined };
  }

  private async notify(
    method: string,
    params: unknown,
    sessionId: string,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const response = await this.transport(MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "Mcp-Session-Id": sessionId,
      },
      body: JSON.stringify({ jsonrpc: "2.0", method, params } satisfies JsonRpcRequest),
      ...(signal === undefined ? {} : { signal }),
    });
    if (!response.ok) {
      throw new WebSearchError(
        kindForStatus(response.status),
        this.name,
        `Exa MCP notification error (${response.status})`,
        response.status,
      );
    }
    // A notification carries no result; the body still has a hard size budget.
    await readResponseText(response, MAX_SEARCH_RESPONSE_BODY_BYTES).catch(() => "");
  }

  private async readJsonRpc(response: Response): Promise<JsonRpcResponse> {
    try {
      return await readResponseJson<JsonRpcResponse>(response, MAX_SEARCH_RESPONSE_BODY_BYTES);
    } catch {
      throw new WebSearchError("parse", this.name, "Exa MCP returned a non-JSON body");
    }
  }
}

/**
 * Pull the newest JSON-RPC message out of a server-sent-events body.
 *
 * Per the SSE spec an event ends at a blank line and its payload is *all* of its
 * `data:` lines joined by newlines, not just the first. Keep-alive comments carry
 * no data and are skipped by walking backwards.
 */
export function parseSseResponse(raw: string): JsonRpcResponse {
  const events = raw.split(/\r?\n\r?\n/);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event === undefined) continue;
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""));
    if (data.length === 0) continue;

    try {
      const parsed: unknown = JSON.parse(data.join("\n"));
      if (parsed !== null && typeof parsed === "object") return parsed as JsonRpcResponse;
    } catch {
      // Not a JSON event (a comment or a partial chunk); keep looking.
    }
  }
  throw new WebSearchError("parse", "exa-free", "Exa MCP response body is not valid JSON");
}

/**
 * Parse `web_search_exa`'s markdown answer into results.
 *
 * Injection guard: a page's own text ends up inside `Highlights:`, so
 * `Title:`/`URL:` lines are read only from the part of a block *before*
 * `Highlights:` and only in blocks that have one. Page content can therefore claim
 * a title, but it can never invent a result that the model then trusts.
 */
export function parseSearchText(text: string): SearchResult[] {
  const blocks = parseHighlightBlocks(text);
  if (blocks.length > 0) return blocks.slice(0, 10);
  return parseMarkdownLinks(text).slice(0, 10);
}

function parseHighlightBlocks(text: string): SearchResult[] {
  const results: SearchResult[] = [];

  for (const block of text.split(/\n---+\n/)) {
    const highlightsAt = block.search(/^Highlights:\s*/m);
    if (highlightsAt < 0) continue;

    const header = block.slice(0, highlightsAt);
    const title = /^Title:\s*(.+)$/m.exec(header)?.[1]?.trim();
    const url = /^URL:\s*(https?:\/\/\S+)$/m.exec(header)?.[1]?.trim();
    if (title === undefined || url === undefined || title === "") continue;

    const body = block
      .slice(highlightsAt)
      .replace(/^Highlights:\s*/m, "")
      .replace(/\s+/g, " ")
      .trim();
    results.push({ title, url, snippet: body.slice(0, 300) });
  }

  return results;
}

/** Fallback for a shape change: markdown links with their trailing text. */
function parseMarkdownLinks(text: string): SearchResult[] {
  const matches = [...text.matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g)];
  const results: SearchResult[] = [];

  matches.forEach((match, index) => {
    const title = (match[1] ?? "").trim();
    const url = (match[2] ?? "").trim();
    const start = (match.index ?? 0) + match[0].length;
    const next = matches[index + 1];
    const end = next?.index ?? text.length;
    const snippet = text
      .slice(start, end)
      .replace(/^[\s:|\-–—]+/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
    if (title !== "" && url !== "") results.push({ title, url, snippet });
  });

  return results;
}
