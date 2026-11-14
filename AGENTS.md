# AGENTS.md — pi-web-access

## What this is

A pi extension exposing `web_search` and `web_fetch`. Both tools run a provider
chain through one orchestrator; the only domain difference is what "unusable"
means (an empty result array vs. a body too short to be real content).

## Commands

```bash
npm run typecheck   # tsc --noEmit, must be clean
npm run lint        # eslint
npm run format      # prettier --write
npm run test        # vitest, offline only
npm run build       # tsc -p tsconfig.build.json -> dist/
npm run smoke       # asserts dist/index.js default export is a function
```

Tests live in `test/`, mirroring the `src/` layout. They import from `../../src/...`.

`pi.extensions` points at `dist/index.js`. A local `pi install` loads the built
output, so run `npm run build` (or `npm run build -- --watch`) before testing
inside pi.

## Non-negotiables

1. **Every test runs offline.** Providers take an injected `Transport`; never
   reach the network from a test.
2. **No `any`.** Use `unknown` plus a type guard.
3. **Relative imports end in `.js`** (`from "./config.js"`). `module: nodenext`
   resolves to the compiled file; omitting the extension compiles but fails at
   runtime.
4. **Tests live in `test/`**, mirroring `src/`, and import from `../../src/...`.
5. **Tests are the spec.** Write the test before the implementation. If behaviour
   and a test disagree, one of them is a bug — decide which in the same commit.

## Architecture

```
index.ts                wiring only: config, catalog, transports, registrations
config/                 schema, path resolution, resolution of chain/key/url/proxy
transport/              the single network exit, proxy agent, address checks, bounded reads
orchestrator/           runChain<T>, arrangeChain (pure), ChainHealth, errors
search/                 web_search entry, chain construction, result normalisation
fetch/                  web_fetch entry, chain construction, context clipping
status/                 /web-access-status: snapshot, formatting, command
providers/              who does the work, split by capability
  search/               types, registry, factory, json/ bing/ exa-mcp/ custom/
  fetch/                types, registry, factory, local/ custom/
  catalog.ts            lookup over both sides, built-in plus config-declared
```

One folder per thing the user or the model can invoke (`search`, `fetch`,
`status`), one folder for who does the work (`providers`), and the rest is
infrastructure. A capability is expressed by which side of `providers` a module
lives on, not by a field.

`transport` is injected, never imported by a provider. `arrangeChain` is a pure
function of (configured order, tier, cooled set). `runChain` receives attempts
already in final order and only records outcomes. Each side owns its own context
budget: `search/normalize.ts` for result fields, `fetch/truncate.ts` for one page.

## Defensive inventory

Each item is load-bearing. Port them all, and add a test for each.

| #   | Item                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | SSRF CIDR tables, including the deliberate `198.18.0.0/15` exemption (Clash/mihomo fake-ip DNS answers inside that range and routes it legitimately) |
| 2   | NAT-64 embedded IPv4 (`64:ff9b::10.0.0.1`) and IPv4-mapped IPv6 (`::ffff:127.0.0.1`) detection                                                       |
| 3   | DNS-level check through a custom `lookup` on the agent, not just URL literal inspection                                                              |
| 4   | `redirect: "manual"` with a per-hop re-check, max 5 hops                                                                                             |
| 5   | Proxy transport deliberately skips the DNS pre-check (documented; do not "fix" it into a duplicate check)                                            |
| 6   | Content-type classification before any body consumption                                                                                              |
| 7   | Charset taken from the response content type — GBK pages must not be forced to UTF-8                                                                 |
| 8   | Body size caps before decoding: fetch 10 MiB, search 2 MiB                                                                                           |
| 9   | UTF-8-safe truncation — never split a multi-byte character                                                                                           |
| 10  | Bing: `200` + large body + zero parsed results means a verification page; throw so the chain advances                                                |
| 11  | Exa MCP: `Title:`/`URL:` are read only before `Highlights:` and only in blocks that have one (injection guard)                                       |
| 12  | Config writes are atomic, `0600`, and clean up the temp file on failure                                                                              |
| 13  | Search results carry a 64 KiB total budget plus per-field caps (title 512 B, url 4 KiB, snippet 2 KiB)                                               |
| 14  | User cancellation aborts the whole chain; it is not a provider failure                                                                               |
| 15  | The proxy dispatcher is package-scoped; never touch undici's global dispatcher                                                                       |

## Behaviour contract

- Failure kinds: `quota` (429/402), `auth` (401/403), `transport`, `timeout`,
  `parse`, `empty`, `config`.
- Every kind advances the chain.
- `empty` never marks a provider as cooling down — it is query-dependent.
- An unusable result on the **last** attempt is returned, not thrown: a short page
  is still the page.
- Cancellation by the user stops everything immediately.
- Chain state and demotion never appear in tool output text.
- `maxResults` is both the default and the ceiling for `web_search`.
