# @laboon85/pi-web-access

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

| Argument | Required | Meaning            |
| -------- | -------- | ------------------ |
| `url`    | yes      | Public HTTP(S) URL |

Returns a text block for textual content, an image block for `image/png`,
`image/jpeg`, `image/gif` and `image/webp`, and a content-type error for anything
else. What textual HTML becomes — GFM markdown or the untouched body — is decided
by the fetch provider chain, not by the call.

## Providers

| Provider      | Search | Fetch | Key                                                                                 |
| ------------- | ------ | ----- | ----------------------------------------------------------------------------------- |
| `local`       | —      | yes   | none (HTML → GFM markdown, in-process)                                              |
| `pandoc`      | —      | yes   | none (`pandoc` on PATH; fidelity upgrade)                                           |
| `raw`         | —      | yes   | none (body handed back untouched)                                                   |
| `firecrawl`   | —      | yes   | optional `FIRECRAWL_API_KEY`; keyless tier per IP, 1,000 credits/month after signup |
| `jina`        | yes    | yes   | optional `JINA_API_KEY`; keyless 20 RPM/IP, free key 10M tokens                     |
| `scrapfly`    | —      | yes   | `SCRAPFLY_API_KEY` (1,000 credits one-time)                                         |
| `tavily`      | yes    | yes   | `TAVILY_API_KEY`; fetch side is Extract, 1,000 credits/month                        |
| `scrapingant` | —      | yes   | `SCRAPINGANT_API_KEY` (10,000 credits/month)                                        |
| `scrapingbee` | —      | yes   | `SCRAPINGBEE_API_KEY` (1,000 credits one-time)                                      |
| `scraperapi`  | —      | yes   | `SCRAPERAPI_API_KEY` (5,000 credits, 7-day trial)                                   |
| `zenrows`     | —      | yes   | `ZENROWS_API_KEY` (5,000 credits/month)                                             |
| `exa-free`    | yes    | —     | none (Exa hosted MCP, rate limited per IP)                                          |
| `bing`        | yes    | —     | none (HTML results)                                                                 |
| `searxng`     | yes    | —     | none (`SEARXNG_URL`)                                                                |
| `bocha`       | yes    | —     | `BOCHA_API_KEY`                                                                     |
| `tavily`      | yes    | —     | `TAVILY_API_KEY`                                                                    |
| `exa`         | yes    | —     | `EXA_API_KEY`                                                                       |
| `brave`       | yes    | —     | `BRAVE_SEARCH_API_KEY`                                                              |
| `jina`        | yes    | —     | `JINA_API_KEY`                                                                      |
| `firecrawl`   | yes    | —     | `FIRECRAWL_API_KEY`                                                                 |

Defaults with no configuration at all: search uses `exa-free`, fetch uses `local`.

The three keyless fetch providers read the URL themselves — no third party sees
it — and differ only in what HTML becomes:

- `local` renders markdown in-process (DOM parse, GFM tables, headings, links
  resolved against the final URL). Always available; the floor of every chain.
- `pandoc` converts with the `pandoc` binary for fidelity the in-process
  converter cannot reach, complex tables especially. The binary must already be
  on PATH — this package never downloads or installs one — and a missing or
  failing binary is an ordinary provider failure the chain falls back from.
- `raw` hands back the body exactly as the server sent it. It replaces the old
  `raw` flag on the tool: original markup is a chain decision now.

A chain that prefers fidelity and keeps raw markup reachable looks like
`"fetchProviders": ["pandoc", "local", "raw"]`.

The remote readers come prewired — endpoint, auth header or query-parameter key,
and the response path that carries the markdown — so adding one to the chain is
a one-word edit. Firecrawl and Jina serve a keyless tier: they work with no
`FIRECRAWL_API_KEY` / `JINA_API_KEY` at all, and setting one raises the limits
(their keys are _optional_; every other reader needs its key). Reachability is
yours to judge — some networks block some of these hosts, and a reader that
cannot be reached fails like any other provider while the chain moves on.

## Configuration

One JSON file. `$PI_PKG_CFG_DIR` wins if set; otherwise
`<agent dir>/pi-pkg-cfg/pi-web-access/config.json`, where `<agent dir>` is
`$PI_CODING_AGENT_DIR` or `~/.pi/agent`.

```jsonc
{
  // Results returned by web_search. Both the default and the ceiling: the model
  // may ask for fewer, never more. 1..20, default 10.
  "maxResults": 10,

  // Search chain, in preference order. Grouped by tier internally.
  "searchProviders": ["tavily", "exa", "firecrawl", "exa-free", "bing"],

  // Fetch chain, in preference order. Default: ["local"]. "pandoc" needs the
  // binary on PATH and falls back when it is missing; "raw" skips conversion.
  "fetchProviders": ["pandoc", "local", "raw"],

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
is re-read on every call, so an edited chain takes effect immediately. Only
`maxResults` is fixed at load time, because it is part of the tool schema.

## Declaring your own provider

`customProviders` takes one entry per capability, so each side keeps its own rules.
A search entry describes a JSON API; a fetch entry points at a remote reader.

```jsonc
"customProviders": {
  "search": {
    "my-engine": {
      "url": "https://api.example.com/search",
      "method": "POST",
      "auth": { "header": "authorization", "prefix": "Bearer " },
      "keyEnv": "MY_SEARCH_KEY",
      "body": { "q": "{query}", "limit": "{maxResults}" },
      "resultsPath": "data.items",
      "fields": { "title": "name", "url": "link", "snippet": "summary" },
      "tier": 1,
      "maxResults": 10
    }
  },
  "fetch": {
    "my-reader": {
      "url": "https://reader.example.com/{url}",
      "auth": { "header": "x-api-key", "prefix": "" },
      "keyEnv": "MY_READER_KEY",
      "fetch": { "textPath": "data.markdown", "titlePath": "data.metadata.title" },
      "tier": 2
    }
  }
}
```

Placeholders: `{query}`, `{queryEncoded}` (for a path segment), `{maxResults}`,
`{url}` (percent-encoded), `{urlRaw}` (for a JSON body field, where encoding
would corrupt the target), `{apiKey}` (for vendors that take the key as a query
parameter; a missing key empties the slot), `{baseUrl}` (taken from `baseUrls`).

A worked reader, verified live: Firecrawl is reachable from most networks,
answers without a key on a per-IP daily tier, and after a free signup carries
1,000 credits a month on `FIRECRAWL_API_KEY`. Two entries cover both states:

```jsonc
"customProviders": {
  "fetch": {
    "firecrawl-reader": {
      "label": "Firecrawl (keyless)",
      "url": "https://api.firecrawl.dev/v2/scrape",
      "method": "POST",
      "body": { "url": "{urlRaw}", "formats": ["markdown"] },
      "fetch": { "textPath": "data.markdown", "titlePath": "data.metadata.title" },
      "tier": 2
    },
    "firecrawl-keyed": {
      "label": "Firecrawl (1000 credits/mo free)",
      "url": "https://api.firecrawl.dev/v2/scrape",
      "method": "POST",
      "auth": { "header": "authorization", "prefix": "Bearer " },
      "keyEnv": "FIRECRAWL_API_KEY",
      "body": { "url": "{urlRaw}", "formats": ["markdown"] },
      "fetch": { "textPath": "data.markdown", "titlePath": "data.metadata.title" },
      "tier": 2
    }
  }
}
```

Put both in `fetchProviders` (e.g. `["pandoc", "local", "firecrawl-reader",
"firecrawl-keyed", "raw"]`): the keyless entry serves until the IP cap, and the
keyed entry goes unused until `FIRECRAWL_API_KEY` exists in the environment, at
which point it takes the registered quota.

Rules, all enforced by name so one bad entry does not take the file down:

- a name may not shadow a built-in provider on either capability — the fetch
  side ships `firecrawl`, `jina`, `tavily`, `scrapfly`, `scrapingant`,
  `scrapingbee`, `scraperapi` and `zenrows` as built-ins, so those names are
  taken there too
- `auth` requires `keyEnv`; a custom provider reads the environment only, never
  `apiKeys`, so a key in this file can never be sent to an endpoint that did not
  ask for it
- a search entry requires `resultsPath`; a POST entry requires `body`
- `tier` is any positive integer; tiers need not be contiguous

Built-in vendors use exactly this shape in code rather than living in this file:
their field mappings follow the vendors' APIs, so a renamed field is fixed by a
release instead of silently rotting in every copy.

`/web-access-status` prints every provider, its tier, where its key comes from and
whether it is in the active chain — without printing the key itself.

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
npm run lint          # eslint
npm run format        # prettier --write
npm run test          # vitest, no network access
npm run build         # tsc -p tsconfig.build.json -> dist/
npm run smoke         # import dist/ and assert the default export
npm run pack:check    # assert the npm tarball contents
npm run build -- --watch   # keep dist/ fresh while using a local install
```

The published artifact is compiled JavaScript plus `.d.ts`. `pi` loads
`dist/index.js`, so a local install needs a build first.

## Releasing

Publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers):
the workflow exchanges a GitHub OIDC token for a short-lived credential, so no npm
token is stored in the repository, and provenance is attached automatically.

Once per package, on npmjs.com:

- `Release` workflow must be registered as a GitHub Actions trusted publisher with
  workflow filename `release.yml`, and **`npm publish` must be explicitly
  allowed** — new configurations default to staged publishing only.
- A new configuration has to complete its first publish within two days, and the
  package must already exist to be registered, so the very first release is
  published manually:

```bash
npm login
npm publish --access public
```

After that, releases are tagged and published by the workflow:

```bash
git tag v0.7.0
git push origin v0.7.0
# then publish a GitHub release for that tag
```

The workflow refuses to publish when the tag and `package.json` disagree, and
`prepublishOnly` re-runs the whole gate before the registry sees anything.

## Acknowledgements

Portions of this project are derived from
[pi-web-search](https://github.com/ByteTrue/pi-package-mono) by byte, licensed
under the MIT License. Copyright (c) 2026 byte. The full MIT text is reproduced
in [LICENSE](./LICENSE).

Thanks also to the pi project for an extension surface that makes a package like
this possible, and to the maintainers of every service listed under Providers for
keeping a usable free tier alive.
