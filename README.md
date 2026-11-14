# @laboon85/pi-web-search

Web search and web fetch for the [pi](https://pi.dev) coding agent, built around a
**tiered provider fallback chain**.

Both tools share one orchestrator. A provider that fails — quota, auth, transport,
timeout, malformed response, or an unusable result — hands off to the next one in
line, and a provider that is known to be cooling down is demoted to the tail of
its own tier without ever being dropped from the chain.

## Tools

### `web_search`

| Argument      | Required | Meaning                            |
| ------------- | -------- | ---------------------------------- |
| `query`       | yes      | Search text                        |
| `max_results` | no       | Results to return; capped globally |

### `web_fetch`

| Argument | Required | Meaning                                   |
| -------- | -------- | ----------------------------------------- |
| `url`    | yes      | Public HTTP(S) URL                        |
| `raw`    | no       | Return raw HTML instead of extracted text |

Returns a text block for textual content, an image block for `image/png`,
`image/jpeg`, `image/gif` and `image/webp`, and a content-type error for anything
else. `raw = true` restricts the chain to the local provider, because remote
reader services cannot hand back original markup.

## Providers

| Provider    | Search | Fetch | Key                                        |
| ----------- | ------ | ----- | ------------------------------------------ |
| `local`     | —      | yes   | none                                       |
| `exa-free`  | yes    | —     | none (Exa hosted MCP, rate limited per IP) |
| `bing`      | yes    | —     | none (HTML results)                        |
| `searxng`   | yes    | —     | none (`SEARXNG_URL`)                       |
| `bocha`     | yes    | —     | `BOCHA_API_KEY`                            |
| `tavily`    | yes    | —     | `TAVILY_API_KEY`                           |
| `exa`       | yes    | —     | `EXA_API_KEY`                              |
| `brave`     | yes    | —     | `BRAVE_SEARCH_API_KEY`                     |
| `jina`      | yes    | —     | `JINA_API_KEY`                             |
| `firecrawl` | yes    | —     | `FIRECRAWL_API_KEY`                        |

Defaults with no configuration at all: search uses `exa-free`, fetch uses `local`.

## Configuration

One JSON file. `$PI_PKG_CFG_DIR` wins if set; otherwise
`<agent dir>/pi-pkg-cfg/laboon-web-search/config.json`, where `<agent dir>` is
`$PI_CODING_AGENT_DIR` or `~/.pi/agent`.

```jsonc
{
  // Results returned by web_search. Both the default and the ceiling: the model
  // may ask for fewer, never more. 1..20, default 10.
  "maxResults": 10,

  // Search chain, in preference order. Grouped by tier internally.
  "providers": ["tavily", "exa", "firecrawl", "exa-free", "bing"],

  // Fetch chain, in preference order.
  "fetchProviders": ["local"],

  "apiKeys": {
    "tavily": "tvly-...",
    "exa": "exa-...",
    "firecrawl": "fc-...",
  },

  // Optional per-capability tier overrides. Providers default to tier 1 except
  // the keyless search fallbacks (exa-free, bing), which default to tier 2.
  "tiers": {
    "search": { "bing": 3 },
    "fetch": { "jina": 1 },
  },

  // HTTP(S) proxy for every outbound request. Falls back to HTTPS_PROXY,
  // HTTP_PROXY, ALL_PROXY; honours NO_PROXY. SOCKS is not supported.
  "proxy": "http://127.0.0.1:7890",
}
```

Environment variables win over `apiKeys` for the keys listed above. Configuration
is re-read on every tool call; reload pi after editing.

## Notes

- `web_fetch` refuses private, loopback and otherwise non-public addresses, and
  re-checks every redirect hop (at most five).
- When a proxy is configured the DNS-level check is skipped for that transport:
  the proxy resolves names itself, so the local pre-resolution result would not
  describe the address actually contacted. Redirects are still re-checked.
- Only `http://` and `https://` proxies work.
- Every provider except `local` sends your URL or query to a third party.
  Adding one to a chain is an explicit opt-in.

## Development

```bash
npm install
npm run typecheck     # tsc --noEmit
npm run test          # vitest, no network access
npm run build         # tsc -p tsconfig.build.json -> dist/
npm run smoke         # import dist/ and assert the default export
npm run build -- --watch   # keep dist/ fresh while using a local install
```

The published artifact is compiled JavaScript plus `.d.ts`. `pi` loads
`dist/index.js`, so a local install needs a build first.

## Acknowledgements

Portions of this project are derived from
[pi-web-search](https://github.com/ByteTrue/pi-package-mono) by byte, licensed
under the MIT License. Copyright (c) 2026 byte. The full MIT text is reproduced in
[LICENSE](./LICENSE).
