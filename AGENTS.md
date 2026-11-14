# AGENTS.md — pi-web-search

## What this is

A pi extension exposing `web_search` and `web_fetch`. Both tools run a provider
chain through one orchestrator; the only domain difference is what "unusable"
means (an empty result array vs. a body too short to be real content).

## Commands

```bash
npm run typecheck   # must be clean, always
npm run test        # offline only, no network
npm run build       # tsc -> dist/
npm run smoke       # asserts dist/index.js default export is a function
```

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
4. **Tests are the spec.** Write the test before the implementation. If behaviour
   and a test disagree, one of them is a bug — decide which in the same commit.

## Architecture

```
index.ts                wiring only
config/                 schema, path resolution, chain/key/url/proxy resolution
transport/              the single network exit; proxy agent; bounded body reads
orchestrator/           runChain<T>, arrangeChain (pure), ChainHealth, errors
search/                 search chain construction + result normalisation
fetch/                  content-type classification, SSRF, HTML extraction, chain
providers/              registry metadata, factory, one module per transport style
tools/                  the two tool definitions
```

`transport` is injected, never imported by a provider. `arrangeChain` is a pure
function of (configured order, tier, cooled set). `runChain` receives attempts
already in final order and only records outcomes.

## Defensive inventory

Each item is load-bearing. Port them all, and add a test for each.

| #   | Item |
| --- | ---- |
| 1   | SSRF CIDR tables, including the deliberate `198.18.0.0/15` exemption (Clash/mihomo fake-ip DNS answers inside that range and routes it legitimately) |
| 2   | NAT-64 embedded IPv4 (`64:ff9b::10.0.0.1`) and IPv4-mapped IPv6 (`::ffff:127.0.0.1`) detection |
| 3   | DNS-level check through a custom `lookup` on the agent, not just URL literal inspection |
| 4   | `redirect: "manual"` with a per-hop re-check, max 5 hops |
| 5   | Proxy transport deliberately skips the DNS pre-check (documented; do not "fix" it into a duplicate check) |
| 6   | Content-type classification before any body consumption |
| 7   | Charset taken from the response content type — GBK pages must not be forced to UTF-8 |
| 8   | Body size caps before decoding: fetch 10 MiB, search 2 MiB |
| 9   | UTF-8-safe truncation — never split a multi-byte character |
| 10  | Bing: `200` + large body + zero parsed results means a verification page; throw so the chain advances |
| 11  | Exa MCP: `Title:`/`URL:` are read only before `Highlights:` and only in blocks that have one (injection guard) |
| 12  | Config writes are atomic, `0600`, and clean up the temp file on failure |
| 13  | Search results carry a 64 KiB total budget plus per-field caps (title 512 B, url 4 KiB, snippet 2 KiB) |
| 14  | User cancellation aborts the whole chain; it is not a provider failure |
| 15  | The proxy dispatcher is package-scoped; never touch undici's global dispatcher |

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
