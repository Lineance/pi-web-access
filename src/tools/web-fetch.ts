import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type { WebConfig } from "../config/schema.js";
import { fetchWithChain } from "../fetch/chain.js";
import { parseAndAssertFetchUrl } from "../transport/address.js";
import type { ChainHealth } from "../orchestrator/health.js";
import type { ProviderCatalog } from "../providers/catalog.js";
import type { Transport } from "../transport/transport.js";

import { truncateForContext } from "./truncate.js";

export interface FetchToolDeps {
  config: WebConfig;
  transport: Transport;
  catalog?: ProviderCatalog;
  health?: ChainHealth;
}

export function registerWebFetchTool(pi: ExtensionAPI, deps: FetchToolDeps): void {
  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description: "Fetch one public HTTP(S) URL as text, raw HTML (raw=true), or an image.",
    parameters: Type.Object({
      url: Type.String(),
      raw: Type.Optional(Type.Boolean({ description: "Return raw HTML.", default: false })),
    }),

    async execute(_toolCallId, params, signal, onUpdate) {
      const raw = params.raw === true;
      // Fails fast on a non-http(s) or credential-bearing URL before any provider
      // is instantiated.
      parseAndAssertFetchUrl(params.url);

      onUpdate?.({
        content: [{ type: "text", text: `Fetching ${params.url}…` }],
        details: { url: params.url },
      });

      const outcome = await fetchWithChain(params.url, deps.config, {
        raw,
        transport: deps.transport,
        ...(deps.catalog ? { catalog: deps.catalog } : {}),
        ...(deps.health ? { health: deps.health } : {}),
        ...(signal ? { signal } : {}),
      });
      const content = outcome.value;

      if (content.kind === "image") {
        // A one-line caption keeps the block self-describing when it is later
        // collapsed in the transcript; the image itself carries the payload.
        return {
          content: [
            {
              type: "text" as const,
              text: `image: ${content.mimeType} · ${content.byteLength} bytes · ${params.url}`,
            },
            { type: "image" as const, data: content.data, mimeType: content.mimeType },
          ],
          details: {
            url: params.url,
            backend: outcome.backend,
            attemptedProviders: outcome.attempted,
            contentType: content.mimeType,
            contentLength: content.byteLength,
            kind: "image" as const,
          },
        };
      }

      const truncation = truncateForContext(content.text);
      const header = [
        `**Fetched:** ${params.url}`,
        content.title ? `**Title:** ${content.title}` : undefined,
        content.contentType ? `**Content-Type:** ${content.contentType}` : undefined,
      ]
        .filter((line): line is string => line !== undefined)
        .join("\n");
      const footer = !truncation.truncated
        ? ""
        : truncation.clippedMidLine
          ? "\n\n[Truncated: content cut at the byte limit.]"
          : `\n\n[Truncated: ${truncation.shownLines} of ${truncation.totalLines} lines shown.]`;

      return {
        content: [{ type: "text" as const, text: `${header}\n\n${truncation.text}${footer}` }],
        details: {
          url: params.url,
          backend: outcome.backend,
          attemptedProviders: outcome.attempted,
          title: content.title,
          contentType: content.contentType,
          contentLength: content.contentLength,
          kind: "text" as const,
          omission: truncation.truncated
            ? { shownLines: truncation.shownLines, totalLines: truncation.totalLines }
            : undefined,
        },
      };
    },
  });
}
